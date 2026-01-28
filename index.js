const { runBot } = require('./bot');
const config = require('./config');
const moment = require('moment-timezone');

function getKoreaTime() {
    return moment().tz("Asia/Seoul");
}

function getNextSleepTimeMs() {
    const min = config.MIN_INTERVAL_MINUTES * 60 * 1000;
    const max = config.MAX_INTERVAL_MINUTES * 60 * 1000;
    return Math.floor(Math.random() * (max - min + 1) + min);
}

async function loop() {
    while (true) {
        const now = getKoreaTime();
        const currentHour = now.hour();

        // 1. Check Time Range
        if (currentHour >= config.START_HOUR && currentHour < config.END_HOUR) {
            console.log(`[Loop] It is ${now.format('HH:mm')}. Running bot...`);

            try {
                // Use headless: false for local observation if desired, currently using default (true)
                // To observe: change to runBot(false)
                await runBot(true);
            } catch (e) {
                console.error('[Loop] Bot run failed:', e);
            }

            const sleepMs = getNextSleepTimeMs();
            const sleepMinutes = Math.round(sleepMs / 60000);
            console.log(`[Loop] Sleeping for ${sleepMinutes} minutes...`);
            await new Promise(r => setTimeout(r, sleepMs));

        } else {
            // OUTSIDE HOURS
            console.log(`[Loop] It is ${now.format('HH:mm')}. Outside working hours (${config.START_HOUR}~${config.END_HOUR}).`);

            // Calculate time until next start hour (tomorrow 08:00)
            let nextStart = moment().tz("Asia/Seoul").hour(config.START_HOUR).minute(0).second(0);
            if (currentHour >= config.END_HOUR) {
                nextStart.add(1, 'days');
            }
            // If currently < StartHour (e.g. 05:00), nextStart is today 08:00, which is correct.

            const diffMs = nextStart.diff(now);
            console.log(`[Loop] Waiting until ${nextStart.format('YYYY-MM-DD HH:mm')} (${Math.round(diffMs / 60000 / 60)} hours)...`);
            await new Promise(r => setTimeout(r, diffMs));
        }
    }
}

console.log('Starting Local Bot Loop...');
loop();
