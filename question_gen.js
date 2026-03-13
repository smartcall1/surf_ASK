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
                            name: c.item.name,
                            symbol: c.item.symbol,
                            rank: c.item.market_cap_rank,
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

    const newsText = news.length ? news.join('\n- ') : '(뉴스 없음)';
    const trendText = trending.length ? trending.map(c => `${c.name}(${c.symbol})`).join(', ') : '(트렌딩 없음)';
    const isFollowup = conversationHistory.length > 0;

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
        const SKIP = new Set(['bitcoin', 'ethereum', 'btc', 'eth', 'usdt', 'usdc', 'dai', 'bnb']);
        const alts = trending.filter(c => !SKIP.has(c.symbol.toLowerCase()) && !SKIP.has(c.name.toLowerCase()));
        const pool = alts.length >= 2 ? alts : (trending.length ? trending : [{ name: 'Hyperliquid' }, { name: 'Sui' }]);
        const picked = pool.sort(() => Math.random() - 0.5).slice(0, 2).map(c => c.name);

        // 질문 룰 (Surf 포인트 획득 기준)
        const rules = [
            { tone: '문제해결', template: `${picked[0]} 관련 실제 투자/분석 문제를 해결하기 위한 심도 있는 데이터/인사이트 요청` },
            { tone: '리포트공유', template: `${picked[0]}에 대해 팀이나 동료들과 뷰를 공유하기 위한 심층 리포트 베이스의 질문` },
            { tone: '피드백제공', template: `${picked[0]} 기존 분석에서 놓친 부분이나 더 깊이 들어가야 할 온체인/매크로 피드백 요청` },
            { tone: '전문가추천', template: `${picked[0]}의 난해한 움직임에 대해 정확한 해석을 해줄 수 있는 전문가(활발한 Surfer)의 의견 구하기` },
        ];
        const rule = rules[Math.floor(Math.random() * rules.length)];

        const angles = [
            // 1. 펀더멘털 & 밸류에이션
            { topic: "수익성(Fee)/소각 메커니즘", desc: "실제 프로토콜 수익과 토큰 소각에 따른 디플레이션 펀더멘털 분석" },
            { topic: "경쟁사 비교 밸류에이션", desc: "경쟁 프로젝트 대비 기술 생태계 차별점 및 현재 시총/FDV의 적정성" },
            { topic: "Mcap/TVL 비율", desc: "시가총액 대비 예치 자산(TVL) 비중을 통한 저평가/고평가 여부 판단" },
            
            // 2. 온체인 & 고래 지갑
            { topic: "스마트머니/고래 온체인 동향", desc: "최근 온체인 스마트머니 매집 추적 및 거래소 입출금 흐름의 해석" },
            { topic: "거래소 보유량(Exchange Reserve)", desc: "거래소 내 공급량 변화를 통한 잠재적 매도 압력 및 공급 쇼크 가능성" },
            
            // 3. 공급량 & 락업
            { topic: "VC 언락 및 오버행 리스크", desc: "VC 포트폴리오 평단가 추정과 대형 언락 스케줄에 따른 매도 압력" },
            { topic: "스테이킹 비율 및 유동화 물량", desc: "전체 공급량 대비 스테이킹 비중과 언스테이킹 시 발생하는 유동성 충격 리스크" },
            
            // 4. 모멘텀 & 내러티브
            { topic: "섹터 내러티브 주도력", desc: "현재 시장 트렌드(AI, RWA, 밈 등) 내에서 해당 코인의 주도력 및 단일 모멘텀 지속 가능성" },
            { topic: "소셜 센티먼트 및 포모(FOMO)", desc: "커뮤니티 활성도 및 소셜 미디어 언급량 급증에 따른 단기 고점 징후 분석" },
            
            // 5. 거시경제 & 매크로
            { topic: "매크로/유동성 환경 영향", desc: "금리 인하 예측, 비트코인 도미넌스 등 매크로/유동성 장세가 해당 코인에 미치는 민감도" },
            { topic: "기관 자금 유입(ETF/Fund)", desc: "현물 ETF 승인 여부나 그레이스케일 등 기관들의 포트폴리오 편입 동향" },
            
            // 6. 커뮤니티 & 개발자 활동
            { topic: "개발자 활동 및 생태계 펀드", desc: "최근 깃허브 커밋 활성도, 재단 보조금(Grant) 자금 집행의 실제 온체인 효과 유무" },
            { topic: "생태계 DApp 활성 사용자(UAW)", desc: "프로젝트 내 주요 DApp들의 실질 사용자 수 변화와 생태계 확장성" },

            // 7. 보안 & 기술적 리스크
            { topic: "보안 감사(Audit) 및 중앙화", desc: "멀티시그 권한 집중도, 최근 보안 감사 결과 및 과거 해킹/익스플로잇 이력 리스크" },
            { topic: "네트워크 성능 및 가스비", desc: "TPS(초당 거래수) 처리 능력, 네트워크 병목 현상 및 가스비 변동에 따른 사용자 경험" },

            // 8. 거버넌스 & DAO
            { topic: "DAO 거버넌스 및 투표권 집중", desc: "주요 제안(Proposal) 통과 현황 및 특정 고래에 의한 투표권 독점 등 거버넌스 건강도" },
            { topic: "재단(Treasury) 자금 관리", desc: "재단 보유 자금의 자산 구성(스테이블코인 비중 등) 및 자금 집행의 투명성" },

            // 9. 실생활 채택 & 파트너십
            { topic: "실물 자산 결합(RWA/Payment)", desc: "실제 결제 수단 활용 예시나 전통 금융권과의 파트너십을 통한 실질적 채택 사례" },
            { topic: "규제 순응성(Compliance)", desc: "각국 규제 당국의 가이드라인 준수 여부 및 MiCA 등 법적 프레임워크 대응 현황" }
        ];
        const angle = angles[Math.floor(Math.random() * angles.length)];

        prompt = `
당신은 한국 코인 시장에서 매매하는 30대 전문 트레이더입니다. 
당신은 'Surfer'라는 아주 똑똑한 AI 분석가에게 딥한 질문을 던지려고 합니다. 
'Surfer'를 전문가 동료나 전담 분석가 대하듯 자연스럽게 부르며 분석을 요청하세요.

지금 트렌딩: ${trendText}
최신 뉴스: ${newsText}

이번 질문의 핵심 소재 (이 주제를 반드시 포함할 것):
- 대상 프로젝트: ${picked[0]}
- 분석 포인트: [${angle.topic}] ${angle.desc}
- 질문 룰(방향성): ${rule.tone} (${rule.template})

말투 가이드 — 실전 30대 트레이더 톤:
- 'Surfer'를 직접 언급하거나 부르며 질문을 시작하세요. (예: "Surfer, 이거 좀 봐주라", "서퍼야, 이거 분석 좀 해줘")
- 구어체 존댓말('요', '죠')이나 친근한 반말을 자연스럽게 섞으세요.
- 단순히 데이터를 묻는 게 아니라, 본인의 매매 관점을 살짝 섞어서 Surfer에게 '의견'이나 '분석'을 요구하는 방식이 좋습니다.
- "궁금해서 그런데", "이거 좀 쎄하네", "너의 냉철한 피드백이 필요해" 같은 표현 사용.

좋은 예시 (말투의 느낌만 참고, OOO에는 해당 분석 포인트를 사용하세요):
- [문제해결] "Surfer, ${picked[0]} 트렌딩 찍혔네. 근데 요즘 OOO 쪽 지표가 좀 이상하네. 이거 기반으로 리스크랑 진입 타점 좀 정밀하게 분석해 줄 수 있어? 지금 들어가는 게 맞는지 궁금해."
- [리포트공유] "서퍼야, ${picked[0]} 관련해서 OOO 이슈 빡세게 정리된 온체인 데이터나 리포트 있으면 좀 보여줘. 전략 좀 짜보려고 하니까 제일 딥한 걸로 부탁해."
- [피드백제공] "Surfer, ${picked[0]} OOO 움직임 보니까 시장 돌아가는 판세랑은 좀 딴판인 것 같은데.. 토크노믹스나 매크로 쪽에서 우리가 놓치고 있는 하방 리스크 포인트 없어? 너의 냉철한 피드백 좀 줘봐."
- [전문가추천] "서퍼야, 오늘 ${picked[0]} OOO 흐름 진짜 난해하다.. 이게 단순히 페이크인지 아니면 대세 하락 시그널인지 너라면 어떻게 해석할 거야? 찐 전문가인 네 인사이트가 궁금해."

100~150자 내외로, 전문적이면서도 인간미 넘치는 30대 트레이더가 AI 'Surfer'에게 묻는 말투로 질문 1개만 출력하세요. (번호/따옴표 금지)
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
        role: 'user',
        content: [{ type: 'text', text: questionText }],
    };
}

// AI 응답을 messages 배열에 추가할 포맷으로 변환
function buildAssistantMessage(responseText) {
    return {
        role: 'assistant',
        content: [{ type: 'text', text: responseText }],
    };
}

module.exports = { generateQuestion, buildMessage, buildAssistantMessage };
