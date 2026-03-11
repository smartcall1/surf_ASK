const fs    = require('fs');
const path  = require('path');

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
    try {
        const { gotScraping } = await import('got-scraping');
        // surf_client.js에서 buildHeaders를 가져오려면 순환 참조나 중복 코드를 피하기 위해 여기에 직접 구현하거나 
        // 외부 모듈에서 필요한 부분만 사용할 수 있습니다. 여기서는 gotScraping의 기본 헤더 처리를 활용합니다.
        const res = await gotScraping({
            url: 'https://api.asksurf.ai/muninn/v1/auth/refresh',
            method: 'POST',
            json: { refresh_token: refreshToken },
            responseType: 'json',
            headers: {
                'origin':         'https://asksurf.ai',
                'referer':        'https://asksurf.ai/',
                'accept':         'application/json, text/plain, */*',
                'x-device-id':    process.env.DEVICE_ID || 'web',
                'sec-ch-ua':          '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
                'sec-ch-ua-mobile':   '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest':     'empty',
                'sec-fetch-mode':     'cors',
                'sec-fetch-site':     'same-site',
            }
        });

        const json = res.body;
        const newToken   = json.data?.access_token  || json.data?.token  || json.token;
        const newRefresh = json.data?.refresh_token || json.data?.refreshToken || json.refreshToken || refreshToken;
        
        if (newToken) {
            return { token: newToken, refreshToken: newRefresh };
        } else {
            throw new Error(`갱신 실패 (HTTP ${res.statusCode}): ${JSON.stringify(json).slice(0, 200)}`);
        }
    } catch (e) {
        throw new Error(`토큰 갱신 오류: ${e.message}`);
    }
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
