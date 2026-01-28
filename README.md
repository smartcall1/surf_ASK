# AskSurf.ai Automation Bot

**구글 로그인**을 위해 쿠키를 사용하며, 로컬과 GitHub Actions 양쪽에서 모두 실행 가능

## 📁 파일 구조
- `get_cookies.js`: **최초 1회 실행용**. 수동 로그인 후 쿠키와 로컬스토리지 데이터를 추출함
- `index.js`: **로컬 실행용**. 10분마다 루프를 돌며 실행됨
- `action_runner.js`: **GitHub Actions용**. 매 시간 실행 여부(80%)를 결정.
- `bot.js`: 브라우저 자동화 핵심 로직.
- `config.js`: 시간 설정 및 **선택자(Selector)** 설정.
- `cookies.json` & `localstorage.json`: 로그인 정보가 담긴 파일 (gitignore 처리)
- `questions.txt` : 질문이 담긴파일

## 🚀 1. 설치 및 필수 설정

### 1) 패키지 설치
```bash
npm install
```

### 2) 선택자(Selector) 수정 (필수!)
`config.js`를 열어 `INPUT_BOX`, `SEND_BUTTON` 값을 실제 사이트에 맞춰 수정.

### 3) 로그인 세션 추출 (필수!)
구글 로그인을 통과하기 위해, 먼저 내 컴퓨터에서 로그인 진행.
```bash
node get_cookies.js
```
1. 크롬 창이 뜨면 `asksurf.ai`에 로그인.
2. 채팅 화면이 나오면, 터미널로 돌아와서 `Enter` 키 입력.
3. `cookies.json`과 `localstorage.json` 파일이 생성됨.

## 💻 2. 로컬에서 실행하기
```bash
node index.js
```
이제 저장된 로그인 정보를 사용하여 봇이 자동으로 질문을 수행함.

## ☁️ 3. GitHub Actions에서 실행하기 (무료 티어 최적화)

이 봇은 GitHub Actions 무료 티어(**월 2,000분**) 내에서 동작하도록 설계됨.

- **스케줄**: 08:00 ~ 23:00 (KST) 사이에 **20분마다** 체크 (총 48회 트리거)
- **비용 계산**: 48회 × 30일 = **월 1,440분 소모** (무료 한도 2,000분의 약 72% 사용)
- **동작 방식**: 20분마다 깨어나서 약 75% 확률로 질문. (불규칙한 시간대 형성)
- **설정 방법**:
    1. 로컬에 생성된 `cookies.json`과 `localstorage.json`은 보안상 repo에 올리지 마세요 (`.gitignore` 처리됨).
    2. GitHub 저장소 -> `Settings` -> `Secrets and variables` -> `Actions`로 이동.
    3. `New repository secret` 클릭하여 아래 두 개 추가.
       - **Name**: `COOKIES_JSON` / **Value**: (`cookies.json` 내용 전체)
       - **Name**: `LOCALSTORAGE_JSON` / **Value**: (`localstorage.json` 내용 전체)
    4. 코드를 Push 하면 자동으로 스케줄러가 동작함.