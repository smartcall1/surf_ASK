const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('./config');

puppeteer.use(StealthPlugin());

function getRandomQuestion() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'questions.txt'), 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return "What is the price of BTC?";
        return lines[Math.floor(Math.random() * lines.length)].trim();
    } catch (err) {
        console.error('Error reading questions.txt:', err);
        return "What is the current crypto trend?";
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeHumanLike(page, selector, text) {
    await page.click(selector);
    for (const char of text) {
        await page.keyboard.type(char, { delay: Math.random() * 100 + 50 }); // 50-150ms delay per key
    }
}

async function runBot(headless = true) {
    console.log(`[Bot] Starting... (Headless: ${headless})`);
    const browser = await puppeteer.launch({
        headless: headless ? "new" : false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Anti-detection measures
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Load Cookies if available
        const cookiePath = path.join(__dirname, 'cookies.json');
        if (fs.existsSync(cookiePath)) {
            try {
                const cookiesString = fs.readFileSync(cookiePath, 'utf8');
                const cookies = JSON.parse(cookiesString);
                if (cookies && cookies.length > 0) {
                    console.log(`[Bot] Loading ${cookies.length} cookies...`);
                    await page.setCookie(...cookies);
                }
            } catch (e) {
                console.error('[Bot Error] Failed to load cookies:', e);
            }
        } else if (process.env.COOKIES_JSON) {
            try {
                const cookies = JSON.parse(process.env.COOKIES_JSON);
                console.log(`[Bot] Loading ${cookies.length} cookies from ENV...`);
                await page.setCookie(...cookies);
            } catch (e) {
                console.error('[Bot Error] Failed to load cookies from ENV:', e);
            }
        }

        console.log(`[Bot] Navigating to ${config.TARGET_URL}...`);
        await page.goto(config.TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Inject LocalStorage (If available)
        const lsPath = path.join(__dirname, 'localstorage.json');
        if (fs.existsSync(lsPath)) {
            try {
                const lsData = fs.readFileSync(lsPath, 'utf8');
                const lsJSON = JSON.parse(lsData);

                console.log('[Bot] Injecting LocalStorage...');
                await page.evaluate((data) => {
                    for (const key in data) {
                        localStorage.setItem(key, data[key]);
                    }
                }, lsJSON);

                // Reload to apply LocalStorage
                console.log('[Bot] Reloading page to apply session...');
                await page.reload({ waitUntil: 'networkidle2' });
                await page.screenshot({ path: 'debug_1_after_login_reload.png' });

            } catch (e) {
                console.error('[Bot Error] Failed to inject LocalStorage:', e);
            }
        } else if (process.env.LOCALSTORAGE_JSON) {
            try {
                lsJSON = JSON.parse(process.env.LOCALSTORAGE_JSON);
                console.log('[Bot] Loaded LocalStorage from ENV.');
            } catch (e) { console.error('[Bot Error] Failed to load LS from ENV:', e); }
        }

        if (lsJSON) {
            try {
                console.log('[Bot] Injecting LocalStorage...');
                await page.evaluate((data) => {
                    for (const key in data) {
                        localStorage.setItem(key, data[key]);
                    }
                }, lsJSON);

                // Reload to apply LocalStorage
                console.log('[Bot] Reloading page to apply session...');
                await page.reload({ waitUntil: 'networkidle2' });
                // await page.screenshot({ path: 'debug_1_after_login_reload.png' }); // Disabled for clean run

            } catch (e) {
                console.error('[Bot Error] Failed to inject LocalStorage:', e);
            }
        } else {
            // await page.screenshot({ path: 'debug_1_after_nav.png' });
        }

        // TODO: Handle Login if generic Input selector is not found immediately
        // For now, we assume public access or handle this later.

        const inputSelector = config.SELECTORS.INPUT_BOX;
        const sendButtonSelector = config.SELECTORS.SEND_BUTTON;

        // Check if input exists
        const inputExists = await page.$(inputSelector);
        if (!inputExists) {
            console.error(`[Error] Input selector "${inputSelector}" not found. Taking screenshot.`);
            await page.screenshot({ path: 'error_no_input.png' });
            throw new Error('Input field not found');
        }

        const question = getRandomQuestion();
        console.log(`[Bot] Asking: "${question}"`);

        await typeHumanLike(page, inputSelector, question);
        await page.screenshot({ path: 'debug_2_typed.png' });
        await sleep(1000); // Wait a bit before sending

        // Click Send
        // Check if button exists, if not maybe Enter key works?
        // STRATEGY 1: Press Enter (Most reliable for chat)
        console.log('[Bot] Strategy 1: Pressing Enter...');
        await page.keyboard.press('Enter');
        await sleep(2000);

        // STRATEGY 2: Javascript Click (If button exists)
        const buttonExists = await page.$(sendButtonSelector);
        if (buttonExists) {
            console.log(`[Bot] Strategy 2: Clicking Send Button (via JS)...`);
            await page.evaluate((selector) => {
                const btn = document.querySelector(selector);
                if (btn) btn.click();
            }, sendButtonSelector);
            await sleep(2000);
        }

        // Verify: Did the text disappear? (Success means input is empty)
        try {
            const inputValue = await page.$eval(inputSelector, el => el.value);
            if (inputValue.trim() !== '') {
                console.error(`[Error] Text "${inputValue}" is still in input! Send failed.`);
                // Don't throw, just log. Maybe we can try clicking again?
                // For now, let's capture the failure state.
                await page.screenshot({ path: 'error_send_failed.png' });
            } else {
                console.log('[Bot] Input cleared. Message likely sent.');
            }
        } catch (e) {
            console.log('[Bot Warning] Input box not found after sending. Maybe page redirected? Assuming success.');
            // This is actually common if the UI changes (e.g. to a "Thinking..." state without an input box)
        }

        await sleep(3000); // Wait for submission animation
        await page.screenshot({ path: 'debug_3_after_enter.png' });

        console.log('[Bot] Question sent! Waiting 10s for stability before closing...');
        await sleep(10000); // Wait 10s only
        console.log('[Bot] Done.');

    } catch (error) {
        console.error('[Bot Error]', error);
        throw error;
    } finally {
        await browser.close();
        console.log('[Bot] Browser closed.');
    }
}

module.exports = { runBot };
