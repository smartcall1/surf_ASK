const crypto = require('crypto');
require('dotenv').config();

const API_HOST = 'https://api.asksurf.ai';
const ORIGIN   = 'https://asksurf.ai';

// 캡처된 실제 브라우저 헤더와 동일하게 맞춤
function buildHeaders(jwt) {
    return {
        'authorization':      `Bearer ${jwt}`,
        'content-type':       'application/json',
        'x-device-id':        process.env.DEVICE_ID || 'web',
        'origin':             ORIGIN,
        'referer':            `${ORIGIN}/`,
        'accept':             'application/json, text/plain, */*',
        'accept-language':    'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        // 브라우저 Fetch 메타데이터
        'sec-ch-ua':          '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        'sec-ch-ua-mobile':   '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest':     'empty',
        'sec-fetch-mode':     'cors',
        'sec-fetch-site':     'same-site',
        // Accept-Encoding은 got-scraping이 자동으로 안전하게 처리하므로 명시하지 않음
    };
}

// 앱에서 쓰는 nanoid 형식과 동일한 21자리 랜덤 ID
function generateRequestId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 21 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// 세션 목록 조회
async function getSessions(jwt) {
    try {
        const { gotScraping } = await import('got-scraping');
        const headers = buildHeaders(jwt);
        delete headers['content-type']; // GET 요청에는 불필요

        const res = await gotScraping({
            url: `${API_HOST}/muninn/v1/chat/sessions?limit=20&offset=0`,
            method: 'GET',
            headers,
            responseType: 'json',
            // got-scraping은 기본적으로 최신 브라우저의 TLS 지문을 모방함
        });
        return res.body.data?.chat_sessions || res.body.data || [];
    } catch (e) {
        return [];
    }
}

// 새 세션 생성
async function createSession(jwt) {
    try {
        const { gotScraping } = await import('got-scraping');
        const body = { session_type: 'V2', platform: 'MOBILEWEB', lang: 'kr' };
        
        const res = await gotScraping({
            url: `${API_HOST}/muninn/v4/chat/sessions`,
            method: 'POST',
            headers: buildHeaders(jwt),
            json: body,
            responseType: 'json',
        });
        
        return res.body.data?.id || res.body.id || null;
    } catch (e) {
        return null;
    }
}

// 매번 새 세션 UUID 생성 (SSE 첫 호출 시 자동 생성됨)
function getOrCreateSessionId() {
    const id = crypto.randomUUID();
    console.log(`[Surf] 새 세션: ${id}`);
    return id;
}

// SSE 스트림 파싱 및 질문 전송 — 응답 전체 텍스트 반환
async function sendChat(jwt, sessionId, messages) {
    const { gotScraping } = await import('got-scraping');
    return new Promise((resolve, reject) => {
        const body = {
            request_id: generateRequestId(),
            type:       'chat_request',
            messages,
        };

        const url = `${API_HOST}/muninn/v4/chat/sessions/${sessionId}/sse?session_type=V2&platform=MOBILEWEB&lang=kr&is_offline_question=true`;
        
        const headers = buildHeaders(jwt);
        headers['accept'] = 'text/event-stream'; // SSE 스펙 명시 (got-scraping이 덮어쓰지 않도록 함)

        let buffer   = '';
        let fullText = '';
        let resolved = false;

        const done = (result) => {
            if (resolved) return;
            resolved = true;
            resolve(result);
        };

        // gotScraping.stream을 사용해 SSE 스트림을 처리
        const stream = gotScraping.stream({
            url,
            method: 'POST',
            headers,
            json: body,
            timeout: {
                request: 90_000 // 90초 타임아웃
            }
        });

        stream.on('data', (chunk) => {
            buffer += chunk.toString();

            // SSE 이벤트는 \n\n 으로 구분
            const events = buffer.split('\n\n');
            buffer = events.pop(); // 마지막 미완성 이벤트 보관

            for (const block of events) {
                for (const line of block.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const ev = JSON.parse(line.slice(6));

                        if (ev.event_type === 'message_chunk') {
                            fullText += ev.data?.content ?? '';
                        } else if (ev.event_type === 'custom' &&
                                   ev.data?.event_data?.type === 'FINAL') {
                            done({ text: ev.data.event_data.ai_text || fullText });
                        } else if (ev.event_type === 'end') {
                            done({ text: fullText });
                        }
                    } catch (_) { /* JSON 파싱 실패 무시 */ }
                }
            }
        });

        stream.on('end', () => done({ text: fullText }));
        stream.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        });
    });
}

module.exports = { buildHeaders, getOrCreateSessionId, sendChat, getSessions, createSession };
