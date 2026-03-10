const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

// CoinGecko 트렌딩 코인 (무료, API 키 불필요)
async function fetchTrendingCoins() {
    return new Promise((resolve) => {
        https.get(
            'https://api.coingecko.com/api/v3/search/trending',
            { headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0' } },
            (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const coins = (json.coins || []).slice(0, 7).map(c => ({
                            name:   c.item.name,
                            symbol: c.item.symbol,
                            rank:   c.item.market_cap_rank,
                        }));
                        resolve(coins);
                    } catch (_) {
                        resolve([]);
                    }
                });
            }
        ).on('error', () => resolve([]));
    });
}

// CryptoPanic 최신 뉴스 헤드라인 (public, API 키 불필요)
async function fetchCryptoNews() {
    return new Promise((resolve) => {
        const token = process.env.CRYPTOPANIC_TOKEN || '';
        const url = token
            ? `https://cryptopanic.com/api/v1/posts/?auth_token=${token}&public=true&filter=hot&kind=news`
            : 'https://cryptopanic.com/api/v1/posts/?public=true&filter=hot&kind=news';

        https.get(url, { headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const headlines = (json.results || []).slice(0, 8).map(p => p.title);
                    resolve(headlines);
                } catch (_) {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}

// 오늘의 맥락(뉴스+트렌딩)으로 실전 크립토 질문 생성
async function generateQuestion(conversationHistory = []) {
    const [news, trending] = await Promise.all([fetchCryptoNews(), fetchTrendingCoins()]);

    const newsText    = news.length    ? news.join('\n- ')       : '(뉴스 없음)';
    const trendText   = trending.length ? trending.map(c => `${c.name}(${c.symbol})`).join(', ') : '(트렌딩 없음)';
    const isFollowup  = conversationHistory.length > 0;

    let prompt;

    if (isFollowup) {
        const lastQ = conversationHistory.at(-2)?.content?.[0]?.text ?? '';
        const lastA = conversationHistory.at(-1)?.content?.[0]?.text ?? '';
        prompt = `
당신은 크립토 투자자입니다. AI 답변을 읽고 부족하거나 더 알고 싶은 부분을 자연스럽게 물어보세요.

내 질문: "${lastQ}"
AI 답변: "${lastA.slice(0, 500)}..."

말투: 한국 코인판 반말 구어체, 짧고 직관적
좋은 예시:
- "근데 그거 수치로 보면 얼마나 돼?"
- "그러면 지금 들어가는 게 맞아 아니야"
- "방금 말한 리스크 중에 지금 제일 위험한 거 뭐야"
- "좀 더 구체적으로 말해줘, 실제 사례 있으면"
- "이미 반영된 거야 아니면 아직 안 터진 거야"

20~50자, 번호/따옴표 없이 질문만 출력
`;
    } else {
        // BTC/ETH 제외한 알트코인 우선 선택, 없으면 전체에서 선택
        const SKIP = new Set(['bitcoin','ethereum','btc','eth','usdt','usdc','dai','bnb']);
        const alts = trending.filter(c => !SKIP.has(c.symbol.toLowerCase()) && !SKIP.has(c.name.toLowerCase()));
        const pool = alts.length >= 2 ? alts : (trending.length ? trending : [{ name:'Hyperliquid' }, { name:'Sui' }]);
        const picked = pool.sort(() => Math.random() - 0.5).slice(0, 2).map(c => c.name);

        // 질문 스타일 랜덤 선택
        const styles = [
            // 스타일 A: 직접적인 데이터 요청
            { tone: '직접적', template: `${picked[0]} 관련 구체적 수치/지표 기반 분석 요청` },
            // 스타일 B: 시장 해석/의견
            { tone: '의견형', template: `${picked[0]} 최근 움직임에 대한 해석 요청` },
            // 스타일 C: 비교 분석
            { tone: '비교형', template: `${picked[0]}와 경쟁 프로젝트 비교` },
            // 스타일 D: 리스크 점검
            { tone: '리스크형', template: `${picked[0]} 투자 리스크 요인 점검` },
            // 스타일 E: 타이밍/전략
            { tone: '전략형', template: `지금 시점에서 ${picked[0]} 어떻게 볼지` },
            // 스타일 F: 뉴스 반응
            { tone: '뉴스반응형', template: `최신 뉴스/이벤트가 ${picked[0]}에 미치는 영향` },
        ];
        const style = styles[Math.floor(Math.random() * styles.length)];

        const angles = [
            `FDV 대비 시총, 언락 일정`,
            `온체인 고래 움직임, 거래소 유입/유출`,
            `실제 프로토콜 수익(fee revenue), 토큰 소각`,
            `VC 구성, 초기 투자자 락업 만료 시기`,
            `TVL 변화, 실사용자 수 추이`,
            `마켓메이커 패턴, 호가창 유동성`,
            `경쟁 프로젝트 대비 기술·생태계 차별점`,
            `최근 개발 업데이트, 파트너십, 로드맵 진행상황`,
        ];
        const angle = angles[Math.floor(Math.random() * angles.length)];

        prompt = `
당신은 크립토에 진심인 투자자입니다. 아래 시장 상황을 보고 궁금한 것을 자연스럽게 질문하세요.

지금 트렌딩: ${trendText}
최신 뉴스: ${newsText}

이번에 집중할 것:
- 대상: ${picked[0]} (트렌딩 코인)
- 분석 포인트: ${angle}
- 질문 방식: ${style.tone} 스타일

말투 기준 — 한국 코인판에서 실제로 쓰는 구어체:
- 반말, 짧고 직관적, 영어 크립토 용어 자연스럽게 섞기
- "ㄹㅇ", "진짜", "근데", "이거", "왜이렇게", "솔직히" 같은 표현
- 문어체/정중체 절대 금지 ("~해주세요", "~해주실 수 있나요", "~해줄 수 있을까요" 금지)
- 나열식 분석 요청 금지 ("A, B, C를 분석해줘" 틀 금지)

좋은 예시:
- "TAO 언락 언제야? 물량 부담 얼마나 되는지 모르겠어서 못 들어가고 있음"
- "HYPE 고래들 거래소로 보내는 거 맞아? 이거 덤핑 전조 아니야"
- "Flow MM이 어디야 진짜.. 호가창 보면 누가 계속 조이는 것 같은데"
- "Sui TVL 갑자기 빠진 거 이유가 뭐임"
- "PENGU FDV 대비 시총 너무 낮은 거 아니야? 언락 고려하면"
- "TAO 이거 펀더멘털 변화 있는 건지 아니면 그냥 모멘텀 펌핑인지"
- "HYPE VC 초기 투자자들 락업 언제 풀려? 그때 맞춰서 털고 나올 것 같아서"
- "Sui 요즘 실사용자 늘긴 한 거야? 온체인 보면 그냥 봇 아닌가 싶어서"

30~70자, 번호/따옴표 없이 질문만 출력
`;
    }

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim().replace(/^["']|["']$/g, '');
        console.log(`[QuestionGen] ${isFollowup ? '[후속]' : '[신규]'} 생성: ${text}`);
        return text;
    } catch (e) {
        console.error('[QuestionGen] Gemini API 오류:', e.message);
        // 폴백: 하드코딩된 실전 질문 풀
        const fallback = [
            '이더리움 스테이킹 보상률이 낮아지는 이유가 뭐야?',
            'BTC ETF 자금 유입이 계속되면 알트코인에 어떤 영향이 있어?',
            'Aave에서 USDC 공급할 때 현재 APY가 Compound보다 낮은 이유는?',
            '온체인 데이터 기준으로 고래들이 지금 어떤 자산을 축적하고 있어?',
            'DeFi TVL이 감소하는 구간에서 안전한 수익 전략이 있어?',
            'Solana 생태계 DEX 거래량이 급증하는 원인이 뭐야?',
        ];
        return fallback[Math.floor(Math.random() * fallback.length)];
    }
}

// messages 배열 포맷으로 변환
function buildMessage(questionText) {
    return {
        role:    'user',
        content: [{ type: 'text', text: questionText }],
    };
}

// AI 응답을 messages 배열에 추가할 포맷으로 변환
function buildAssistantMessage(responseText) {
    return {
        role:    'assistant',
        content: [{ type: 'text', text: responseText }],
    };
}

module.exports = { generateQuestion, buildMessage, buildAssistantMessage };
