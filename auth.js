const fs    = require('fs');
const path  = require('path');
const https = require('https');

const TOKENS_FILE = path.join(__dirname, 'surf_tokens.json');

// ── 파일 입출력 ───────────────────────────────────────────
function readTokens() {
    try {
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (e) {
        throw new Error(
            '[Auth] surf_tokens.json 없음.\n' +
            '브라우저 F12 → Application → Local Storage → https://asksurf.ai\n' +
            '→ SURF_TOKENS 값 복사 → surf_tokens.json 으로 저장하시오.'
        );
    }
}

function saveTokens(tokens) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
}

// ── JWT 파싱 ──────────────────────────────────────────────
function decodePayload(jwt) {
    try {
        return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    } catch (_) { return null; }
}

function isExpired(token) {
    const p = decodePayload(token);
    if (!p?.exp) return true;
    return (Date.now() / 1000) > (p.exp - 60); // 만료 1분 전부터 갱신
}

function getExpiryInfo(token) {
    const p = decodePayload(token);
    if (!p?.exp) return '만료 정보 없음';
    const secs = p.exp - Math.floor(Date.now() / 1000);
    if (secs < 0) return '만료됨';
    return `${Math.floor(secs / 60)}분 후 만료`;
}

// ── Refresh Token으로 새 JWT 발급 ─────────────────────────
async function callRefresh(refreshToken) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ refresh_token: refreshToken });
        const options = {
            hostname: 'api.asksurf.ai',
            path:     '/muninn/v1/auth/refresh',
            method:   'POST',
            headers:  {
                'content-type':   'application/json',
                'content-length': Buffer.byteLength(body),
                'origin':         'https://asksurf.ai',
                'referer':        'https://asksurf.ai/',
                'user-agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                'accept':         'application/json, text/plain, */*',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // 응답 구조: { success, data: { token, refreshToken } }
                    const newToken   = json.data?.access_token  || json.data?.token  || json.token;
                    const newRefresh = json.data?.refresh_token || json.data?.refreshToken || json.refreshToken || refreshToken;
                    if (newToken) {
                        resolve({ token: newToken, refreshToken: newRefresh });
                    } else {
                        reject(new Error(`갱신 실패 (HTTP ${res.statusCode}): ${data.slice(0, 200)}`));
                    }
                } catch (e) {
                    reject(new Error(`응답 파싱 오류: ${e.message} | 원본: ${data.slice(0, 100)}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── 메인: 유효한 JWT 반환 (필요 시 자동 갱신) ─────────────
async function getValidToken() {
    const tokens = readTokens();

    if (!isExpired(tokens.token)) {
        return tokens.token;
    }

    console.log('[Auth] JWT 만료 → refresh token으로 자동 갱신 중...');
    const newTokens = await callRefresh(tokens.refreshToken);
    saveTokens(newTokens);
    console.log('[Auth] ✅ 갱신 완료.');
    return newTokens.token;
}

module.exports = { getValidToken, readTokens, saveTokens, getExpiryInfo, isExpired };
