const https  = require('https');
const crypto = require('crypto');
require('dotenv').config();

const API_HOST = 'api.asksurf.ai';
const ORIGIN   = 'https://asksurf.ai';

// 캡처된 실제 브라우저 헤더와 동일하게 맞춤
function buildHeaders(jwt, bodyLength) {
    return {
        'authorization':      `Bearer ${jwt}`,
        'content-type':       'application/json',
        'x-device-id':        process.env.DEVICE_ID,
        'user-agent':         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'origin':             ORIGIN,
        'referer':            `${ORIGIN}/`,
        'accept':             'text/event-stream',
        'accept-language':    'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'sec-ch-ua':          '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        'sec-ch-ua-mobile':   '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest':     'empty',
        'sec-fetch-mode':     'cors',
        'sec-fetch-site':     'same-site',
        'content-length':     String(bodyLength),
    };
}

// 앱에서 쓰는 nanoid 형식과 동일한 21자리 랜덤 ID
function generateRequestId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 21 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// 세션 목록 조회
async function getSessions(jwt) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_HOST,
            path:     '/muninn/v1/chat/sessions?limit=20&offset=0',
            method:   'GET',
            headers:  buildHeaders(jwt, 0),
        };
        delete options.headers['content-type'];
        delete options.headers['content-length'];
        delete options.headers['accept-encoding'];
        options.headers['accept'] = 'application/json';

        https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.data?.chat_sessions || json.data || []);
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', reject).end();
    });
}

// 새 세션 생성
async function createSession(jwt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ session_type: 'V2', platform: 'MOBILEWEB', lang: 'kr' });
        const options = {
            hostname: API_HOST,
            path:     '/muninn/v4/chat/sessions',
            method:   'POST',
            headers:  buildHeaders(jwt, Buffer.byteLength(body)),
        };
        delete options.headers['accept-encoding'];
        options.headers['accept'] = 'application/json';

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.data?.id || json.id || null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// 매번 새 세션 UUID 생성 (SSE 첫 호출 시 자동 생성됨)
function getOrCreateSessionId() {
    const id = crypto.randomUUID();
    console.log(`[Surf] 새 세션: ${id}`);
    return id;
}

// SSE 스트림 파싱 및 질문 전송 — 응답 전체 텍스트 반환
async function sendChat(jwt, sessionId, messages) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            request_id: generateRequestId(),
            type:       'chat_request',
            messages,
        });

        const path = `/muninn/v4/chat/sessions/${sessionId}/sse` +
            `?session_type=V2&platform=MOBILEWEB&lang=kr&is_offline_question=true`;

        const options = {
            hostname: API_HOST,
            path,
            method:  'POST',
            headers: buildHeaders(jwt, Buffer.byteLength(body)),
        };

        let buffer   = '';
        let fullText = '';
        let resolved = false;
        let timer;

        const done = (result) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            resolve(result);
        };

        const req = https.request(options, (res) => {
            // 90초 응답 타임아웃
            timer = setTimeout(() => reject(new Error('SSE 응답 타임아웃')), 90_000);

            res.on('data', (chunk) => {
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
                                // FINAL 이벤트: ai_text 전체 포함
                                done({ text: ev.data.event_data.ai_text || fullText });

                            } else if (ev.event_type === 'end') {
                                done({ text: fullText });
                            }
                        } catch (_) { /* JSON 파싱 실패 무시 */ }
                    }
                }
            });

            res.on('end',   () => done({ text: fullText }));
            res.on('error', reject);
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

module.exports = { getOrCreateSessionId, sendChat };
