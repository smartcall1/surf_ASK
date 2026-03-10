# Surf AI Bot 설치 가이드

Puppeteer(브라우저 자동화) 없이 REST API 직접 호출 방식으로 동작하는 봇.
Termux(Android) 또는 PC에서 실행 가능.

---

## 동작 방식 요약

```
매일 아침 → 오늘 질문 수 랜덤 결정 (2~6개)
         → 활동 시간 내 (09:00~23:00 KST) 랜덤 간격으로 질문
         → CoinGecko 트렌딩 + CryptoPanic 뉴스 기반으로 Gemini가 실전 질문 생성
         → Surf AI API에 직접 전송 + 응답 읽기 시뮬레이션
         → 35% 확률로 후속 질문 자동 생성
         → JWT 만료(1시간)되면 refreshToken으로 자동 갱신 → 계속 실행
```

**봇 탐지 위험 거의 없음**: 모바일/WiFi IP 사용, 실제 세션 토큰, AI 생성 실전 질문, 읽기 시뮬레이션 포함.

---

## 준비물

| 항목 | 설명 |
|---|---|
| Android 폰 | Termux 실행용 (또는 PC) |
| Surf AI 계정 | asksurf.ai 로그인 상태 |
| Gemini API 키 | 무료 발급 가능 |
| 브라우저 (PC) | 초기 토큰 추출용 (딱 1번) |

---

## STEP 1 — 브라우저에서 토큰 추출 (딱 1번)

> PC 브라우저에서 진행. Chrome 권장.

### 1-1. asksurf.ai 접속 후 로그인

### 1-2. F12 → Application 탭

```
왼쪽 사이드바: Storage → Local Storage → https://asksurf.ai 클릭
```

### 1-3. SURF_TOKENS 값 복사

키 목록에서 `SURF_TOKENS` 찾기 → 값(Value) 전체 복사

값 형태:
```json
{"token":"eyJhbGci...긴JWT...","refreshToken":"SswoUCUD...짧은값..."}
```

### 1-4. surf_tokens.json 파일 생성

프로젝트 폴더에 `surf_tokens.json` 파일 만들고 복사한 값 그대로 붙여넣기.

```json
{"token":"eyJhbGci...","refreshToken":"SswoUCUDHl1lCNx8iw8GNBaMqL_AdE-pQQ3AmjEjonQ"}
```

### 1-5. DEVICE_ID 확인

같은 Local Storage에서 `deviceId` 키 값 복사해두기.
예: `0915959b-8945-46e3-bf0a-dfeeec441575`

---

## STEP 2 — Gemini API 키 발급 (무료)

1. https://aistudio.google.com/app/apikey 접속
2. **Create API Key** 클릭
3. 키 복사해두기 (`AIza...` 형태)

---

## STEP 3 — .env 파일 생성

프로젝트 폴더에 `.env` 파일 생성:

```env
DEVICE_ID=0915959b-8945-46e3-bf0a-dfeeec441575
GEMINI_API_KEY=AIza...여기에_Gemini_키_입력...
CRYPTOPANIC_TOKEN=
```

> `DEVICE_ID`는 STEP 1-5에서 복사한 값.
> `CRYPTOPANIC_TOKEN`은 비워도 동작함 (있으면 뉴스 품질 향상).

---

## STEP 4 — Termux 설치 및 실행

### 4-1. Termux 설치

Google Play가 아닌 **F-Droid**에서 설치 권장.
- https://f-droid.org 에서 Termux 검색 후 설치

### 4-2. Termux 기본 설정

```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
```

### 4-3. 프로젝트 파일 옮기기

**방법 A — Git 사용 (권장)**
```bash
# PC에서 먼저 GitHub에 push (surf_tokens.json, .env는 .gitignore에 추가)
# Termux에서:
git clone https://github.com/너의계정/ask_surf_bot.git
cd ask_surf_bot
```

**방법 B — 직접 복사**
```bash
# PC에서 Termux로 파일 전송 (같은 WiFi 연결 상태에서)
# Termux에서 IP 확인:
ifconfig | grep inet

# PC에서 (PowerShell):
scp -r D:\Codes\ask_surf_bot user@[Termux_IP]:~/ask_surf_bot
```

**방법 C — Termux에서 직접 파일 생성**
```bash
mkdir ~/ask_surf_bot && cd ~/ask_surf_bot
# 각 파일을 nano로 직접 붙여넣기
nano surf_tokens.json   # STEP 1-4 내용 붙여넣기
nano .env               # STEP 3 내용 붙여넣기
```

### 4-4. 의존성 설치

```bash
cd ~/ask_surf_bot
npm install
```

### 4-5. 실행

```bash
node index.js
```

정상 실행 시 출력 예시:
```
[2026-03-10 09:00:00 KST] 🚀 Surf AI Bot 시작 (API 직접 방식 / Termux 최적화)
[2026-03-10 09:00:00 KST] 📅 오늘 플랜: 질문 4개 | 시작 09:23 KST | 간격 [28, 41, 19]분
[2026-03-10 09:23:00 KST] 🔑 JWT 유효 (47분 후 만료)
[2026-03-10 09:23:01 KST] 💬 질문: BTC ETF 순유입이 3일 연속 줄고 있는데 이게 알트시즌 지연 신호야?
[2026-03-10 09:23:08 KST] ✅ 응답 수신 (1243자)
[2026-03-10 09:23:08 KST] 📖 읽는 중... (18초)
[2026-03-10 09:23:26 KST] ✅ [1/4] 완료
[2026-03-10 09:23:26 KST] ⏳ 다음 질문까지 28분 대기
```

### 4-6. 백그라운드 실행 (폰 화면 꺼져도 계속 실행)

```bash
# nohup으로 백그라운드 실행
nohup node index.js > bot.log 2>&1 &

# 로그 실시간 확인
tail -f bot.log

# 실행 중인 봇 확인
ps aux | grep node

# 봇 종료
kill [PID번호]
```

---

## STEP 5 — PC에서 실행하는 경우

```bash
cd D:\Codes\ask_surf_bot
npm install
node index.js
```

백그라운드 실행 (PowerShell):
```powershell
Start-Process node -ArgumentList "index.js" -WindowStyle Hidden
```

---

## 유지보수

### JWT 자동 갱신

- JWT(1시간)는 **자동으로 갱신**됨. 아무것도 안 해도 됨.
- Refresh Token(수주~수개월)이 만료되면 봇이 다음 메시지 출력:
  ```
  ❌ 토큰 갱신 실패
     surf_tokens.json을 브라우저 LocalStorage의 SURF_TOKENS 값으로 업데이트하시오.
  ```
  → 이때 STEP 1 다시 반복해서 `surf_tokens.json` 업데이트하면 됨.
  → 수개월에 한 번 정도.

### 설정 변경

`index.js` 상단 `CFG` 블록에서 조정:

```javascript
const CFG = {
    ACTIVE_START_HOUR:  9,    // 활동 시작 (KST)
    ACTIVE_END_HOUR:    23,   // 활동 종료 (KST)
    DAILY_Q_MIN:        2,    // 하루 최소 질문 수
    DAILY_Q_MAX:        6,    // 하루 최대 질문 수
    INTERVAL_MIN_MIN:   15,   // 질문 간 최소 간격 (분)
    INTERVAL_MAX_MIN:   55,   // 질문 간 최대 간격 (분)
    FOLLOWUP_PROB:      0.35, // 후속 질문 확률 (0.0~1.0)
};
```

---

## 파일 구조

```
ask_surf_bot/
├── index.js            ← 메인 스케줄러 (여기서 실행)
├── auth.js             ← JWT 자동 갱신 모듈
├── surf_client.js      ← Surf AI API 클라이언트
├── question_gen.js     ← Gemini 기반 질문 생성기
├── surf_tokens.json    ← 토큰 저장 (직접 생성, git 제외)
├── .env                ← 환경변수 (직접 생성, git 제외)
├── .env.example        ← .env 템플릿
└── package.json
```

---

## 주의사항

- `surf_tokens.json`과 `.env`는 절대 GitHub에 올리지 마시오. (개인정보 포함)
- `.gitignore`에 반드시 추가:
  ```
  surf_tokens.json
  .env
  jwt.txt
  *.log
  node_modules/
  ```
- Termux 실행 시 배터리 최적화에서 Termux 앱 제외 설정 권장 (설정 → 배터리 → Termux → 최적화 안함)
