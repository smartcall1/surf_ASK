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
당신은 크립토 텔레그램 채널 운영자입니다. 방금 AI한테서 답변을 받았는데 채널 구독자들에게 공유하기엔 내용이 부족하거나 더 구체적인 부분이 필요합니다.

내가 한 질문: "${lastQ}"
AI 답변: "${lastA.slice(0, 600)}..."

피드백성 후속 질문을 1개 만드세요.
- "답변에서 ~~가 빠진 것 같은데, ~~도 설명해줄 수 있어?" 스타일
- 또는 "~~라고 했는데, 구체적으로 어떤 프로젝트/수치/시점 기준인지 알 수 있어?" 스타일
- 채널 구독자에게 실제로 도움이 되는 실행 가능한 인사이트 요청
- 트렌딩 코인(${trendText}) 연결 가능하면 더 좋음
- 20~70자 이내, 번호/따옴표 없이 질문만 출력
`;
    } else {
        // BTC/ETH 제외한 알트코인 우선 선택, 없으면 전체에서 선택
        const SKIP = new Set(['bitcoin','ethereum','btc','eth','usdt','usdc','dai','bnb']);
        const alts = trending.filter(c => !SKIP.has(c.symbol.toLowerCase()) && !SKIP.has(c.name.toLowerCase()));
        const pool = alts.length >= 2 ? alts : (trending.length ? trending : [{ name:'Hyperliquid' }, { name:'Sui' }]);
        const picked = pool.sort(() => Math.random() - 0.5).slice(0, 2).map(c => c.name);

        // 질문 각도 랜덤 선택
        const angles = [
            `FDV 대비 시총 비율과 토큰 언락 스케줄`,
            `마켓메이커(MM)가 누구인지, 그리고 최근 유동성 공급 패턴`,
            `VC 투자자 구성과 벨류에이션, 다음 TGE/IDO 일정`,
            `온체인 활성 지갑 수와 실제 TVL 변화 추이`,
            `최근 고래 누적 vs 분산 패턴과 거래소 유입/유출량`,
            `프로토콜 실수익(fee revenue)과 토큰 바이백·소각 구조`,
            `경쟁 프로젝트 대비 차별점과 현재 시장 포지셔닝`,
            `팀 백그라운드, 감사(audit) 현황, 락업 만료 리스크`,
        ];
        const angle = angles[Math.floor(Math.random() * angles.length)];

        prompt = `
당신은 크립토 텔레그램 채널 운영자입니다. 구독자들에게 공유할 리서치 질문 1개를 만드세요.

지금 트렌딩 코인: ${trendText}
오늘 뉴스: ${newsText}

이번 질문에서 반드시 포함할 것:
- 코인/프로젝트: ${picked.join(' 또는 ')} (트렌딩이면 직접 명시)
- 분석 각도: ${angle}

좋은 질문 예시 (이런 스타일):
- "${picked[0]}의 현재 FDV 대비 시총 비율이 어느 정도인지, 앞으로 예정된 언락 물량이 가격에 미칠 영향을 채널 구독자용으로 정리해줘"
- "${picked[0]} 마켓메이커가 어디인지 알 수 있어? 최근 호가창 패턴 보면 MM이 물량 조절하는 것 같아서 구독자한테 공유하려고"
- "지금 ${picked[0]} 온체인 데이터 보면 고래들이 누적하는 건지 분산하는 건지, 거래소 유입량이랑 같이 분석해줄 수 있어?"

작성 기준:
- 프로젝트명 반드시 명시 (추상적인 "RWA 프로젝트", "DeFi 프로토콜" 금지)
- FDV, 언락, MM, TVL, 실수익, VC, 온체인 지표 중 1~2개 구체적으로 언급
- "채널 구독자용", "공유하려고", "리포트에 쓸" 맥락 자연스럽게 포함
- 가격 예측 금지
- 30~90자 이내, 번호/따옴표 없이 질문만 출력
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
