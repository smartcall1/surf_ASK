const moment = require('moment-timezone');
const { runBot } = require('./bot');
const config = require('./config');

async function main() {
    const now = moment().tz("Asia/Seoul");
    console.log(`[Action] 20-min Trigger at (KST): ${now.format('YYYY-MM-DD HH:mm:ss')}`);

    // CONFIG: Probability
    // Run every 20 mins.
    // Target: Avg gap of ~26 mins (if we run 3 times an hour, 0.75 means ~2.25 runs/hour)
    // 20 mins * (1 / 0.75) approx 27 mins avg interval.
    const PROBABILITY = 0.75;

    // 1. Simple Probability Check
    const randomVal = Math.random();
    console.log(`[Action] Random Roll: ${randomVal.toFixed(2)} (Threshold: ${PROBABILITY})`);

    if (randomVal > PROBABILITY) {
        console.log('[Action] Skipped this slot (Randomness). Checking again in 20 mins.');
        return; // Exit efficiently (Cost: ~1 min)
    }

    // 2. Execute
    try {
        console.log('[Action] Decided to run! Starting Bot...');
        await runBot(true); // Headless mandatory
        console.log('[Action] Done.');
    } catch (error) {
        console.error('[Action] execution failed:', error);
        process.exit(1);
    }
}

main();
