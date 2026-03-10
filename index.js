/**
 * Surf AI Bot — Termux/PC 직접 실행 버전
 * Puppeteer 없이 REST API 직접 호출
 *
 * 실행: node index.js
 * 중지: Ctrl+C
 */

require('dotenv').config();
const { getValidToken, getExpiryInfo, isExpired, readTokens } = require('./auth');
const { getOrCreateSessionId, sendChat }   = require('./surf_client');
const { generateQuestion, buildMessage, buildAssistantMessage } = require('./question_gen');

// ── 설정 ──────────────────────────────────────────────────
const CFG = {
    ACTIVE_START_HOUR:  9,    // KST 활동 시작
    ACTIVE_END_HOUR:    23,   // KST 활동 종료
    DAILY_Q_MIN:        2,    // 하루 최소 질문 수
    DAILY_Q_MAX:        6,    // 하루 최대 질문 수
    INTERVAL_MIN_MIN:   15,   // 질문 간 최소 간격(분)
    INTERVAL_MAX_MIN:   55,   // 질문 간 최대 간격(분)
    FOLLOWUP_PROB:      0.35, // 후속 질문 확률
    READING_WPM:        230,  // 읽기 속도(단어/분)
};

// ── 유틸 ──────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function nowKST() {
    return new Date(Date.now() + 9 * 3600_000);
}

function log(msg) {
    const t = nowKST().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${t} KST] ${msg}`);
}

// 응답 텍스트 기준 읽기 대기 시간(ms) 계산
function readingDelay(text) {
    const words   = (text || '').split(/\s+/).length;
    const minutes = words / CFG.READING_WPM;
    const base    = minutes * 60_000;
    const jitter  = base * (0.8 + Math.random() * 0.4); // ±20% 자연 변동
    return Math.max(8_000, Math.min(jitter, 120_000));   // 최소 8초, 최대 2분
}

// 오늘의 스케줄 생성
function makeDailyPlan() {
    const count = rand(CFG.DAILY_Q_MIN, CFG.DAILY_Q_MAX);
    const startOffsetMin = rand(0, 90); // 시작 시각에 ±90분 내 랜덤
    const startHour = CFG.ACTIVE_START_HOUR + Math.floor(startOffsetMin / 60);
    const startMin  = startOffsetMin % 60;
    const intervals = Array.from({ length: count - 1 }, () =>
        rand(CFG.INTERVAL_MIN_MIN, CFG.INTERVAL_MAX_MIN)
    );
    log(`📅 오늘 플랜: 질문 ${count}개 | 시작 ${String(startHour).padStart(2,'0')}:${String(startMin).padStart(2,'0')} KST | 간격 [${intervals.join(', ')}]분`);
    return { count, startHour, startMin, intervals };
}

// KST 기준 다음 자정까지 ms
function msUntilMidnightKST() {
    const kst      = nowKST();
    const midnight = new Date(kst);
    midnight.setUTCHours(24, 0, 0, 0);
    return midnight - kst;
}

// JWT 자동 갱신 (surf_tokens.json의 refreshToken 사용)
async function getFreshToken() {
    try {
        return await getValidToken();
    } catch (e) {
        log(`❌ 토큰 갱신 실패: ${e.message}`);
        log('   surf_tokens.json을 브라우저 LocalStorage의 SURF_TOKENS 값으로 업데이트하시오.');
        // 갱신 실패 시 5분 대기 후 재시도
        await sleep(5 * 60_000);
        return await getValidToken();
    }
}

// ── 단일 대화 실행 (질문 1개 + 선택적 후속 질문) ─────────
async function runConversation(jwt, sessionId) {
    const messages = [];

    // 1. 신규 질문 생성 및 전송
    const q1 = await generateQuestion([]);
    log(`💬 질문: ${q1}`);
    messages.push(buildMessage(q1));

    const res1 = await sendChat(jwt, sessionId, messages);
    log(`✅ 응답 수신 (${res1.text.length}자)`);

    // 2. 읽기 시뮬레이션 (응답 길이 비례)
    const delay1 = readingDelay(res1.text);
    log(`📖 읽는 중... (${Math.round(delay1 / 1000)}초)`);
    await sleep(delay1);

    messages.push(buildAssistantMessage(res1.text));

    // 3. 후속 질문 여부 랜덤 결정
    if (Math.random() < CFG.FOLLOWUP_PROB) {
        const q2 = await generateQuestion(messages);
        log(`💬 후속 질문: ${q2}`);
        messages.push(buildMessage(q2));

        const res2 = await sendChat(jwt, sessionId, messages);
        log(`✅ 후속 응답 수신 (${res2.text.length}자)`);

        const delay2 = readingDelay(res2.text);
        log(`📖 읽는 중... (${Math.round(delay2 / 1000)}초)`);
        await sleep(delay2);
    }
}

// ── 메인 루프 ────────────────────────────────────────────
async function main() {
    log('🚀 Surf AI Bot 시작 (API 직접 방식 / Termux 최적화)');

    while (true) {
        const plan = makeDailyPlan();

        // 오늘 활동 시작 시각까지 대기
        const kst = nowKST();
        const currentTotalMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
        const startTotalMin   = plan.startHour * 60 + plan.startMin;
        const waitMs = Math.max(0, (startTotalMin - currentTotalMin) * 60_000);
        if (waitMs > 0) {
            log(`⏳ 활동 시작까지 ${Math.round(waitMs / 60_000)}분 대기`);
            await sleep(waitMs);
        }

        // 오늘 질문 순차 실행
        for (let i = 0; i < plan.count; i++) {
            if (nowKST().getUTCHours() >= CFG.ACTIVE_END_HOUR) {
                log(`🌙 활동 종료 시각(${CFG.ACTIVE_END_HOUR}시) 도달. 내일 재개.`);
                break;
            }

            const jwt = await getFreshToken();
            const { token } = readTokens();
            log(`🔑 JWT 유효 (${getExpiryInfo(token)})`);

            const sessionId = getOrCreateSessionId();

            try {
                await runConversation(jwt, sessionId);
                log(`✅ [${i + 1}/${plan.count}] 완료`);
            } catch (e) {
                log(`❌ 질문 실패: ${e.message}`);
            }

            // 다음 질문까지 인터벌 (마지막은 생략)
            if (i < plan.count - 1) {
                const jitter  = rand(-5, 5) * 60_000;
                const finalMs = Math.max(plan.intervals[i] * 60_000 + jitter, 5 * 60_000);
                log(`⏳ 다음 질문까지 ${Math.round(finalMs / 60_000)}분 대기`);
                await sleep(finalMs);
            }
        }

        // 자정 + 0~5분 랜덤 후 내일 플랜 시작
        const tillMidnight = msUntilMidnightKST() + rand(0, 5) * 60_000;
        log(`🌙 오늘 완료. ${Math.round(tillMidnight / 60_000)}분 후 내일 플랜 시작.`);
        await sleep(tillMidnight);
    }
}

main().catch(e => {
    console.error('[Fatal]', e);
    process.exit(1);
});
