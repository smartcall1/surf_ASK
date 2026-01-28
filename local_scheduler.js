const moment = require('moment-timezone');
const { spawn } = require('child_process');

// 설정: 20분마다 체크
const INTERVAL_MINUTES = 20;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

console.log(`[Local Scheduler] 시작됨. 매 ${INTERVAL_MINUTES}분마다 실행됩니다. (06:00 ~ 23:00 KST)`);

function runBot() {
    const now = moment().tz("Asia/Seoul");
    const hour = now.hour();
    const timeStr = now.format('YYYY-MM-DD HH:mm:ss');

    // 스케줄 체크: 06:00 ~ 23:00 (GitHub Cron: 21-23, 0-14 UTC -> 06-23 KST)
    if (hour >= 6 && hour <= 23) {
        console.log(`\n[${timeStr}] ✅ 활동 시간입니다. Bot을 실행합니다...`);
        
        // node action_runner.js 를 별도 프로세스로 실행
        const child = spawn('node', ['action_runner.js'], { stdio: 'inherit', shell: true });

        child.on('close', (code) => {
            console.log(`[${timeStr}] Bot 실행 완료 (Exit Code: ${code}). ${INTERVAL_MINUTES}분 대기...`);
        });
    } else {
        console.log(`\n[${timeStr}] 💤 수면 시간입니다 (06~23시 아님). 실행하지 않음.`);
    }
}

// 1. 즉시 한 번 실행 시도
runBot();

// 2. 주기적으로 실행
setInterval(runBot, INTERVAL_MS);
