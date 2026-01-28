const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const config = require('./config');

puppeteer.use(StealthPlugin());

async function getCookies() {
    console.log('--- Manual Login Helper ---');
    console.log('1. A Chrome window will open.');
    console.log('2. Log in to asksurf.ai (Google Login, etc).');
    console.log('3. Once you are logged in and see the chat page, press [Enter] here in the terminal.');
    console.log('---------------------------');

    const browser = await puppeteer.launch({
        headless: false, // Must be visible for manual login
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-features=IsolateOrigins,site-per-process']
    });

    const page = await browser.newPage();

    // 1. Sync User-Agent (MUST match bot.js)
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log(`Navigating to ${config.TARGET_URL}...`);
        await page.goto(config.TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Please Login in the browser window.');
        console.log('Waiting for you to press Enter...');

        // Wait for user input in terminal
        await new Promise(resolve => process.stdin.once('data', resolve));

        console.log('Saving session data...');

        // 2. Capture Cookies
        const cookies = await page.cookies();
        fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));

        // 3. Capture LocalStorage (Critical for some sites)
        const localStorageData = await page.evaluate(() => {
            return JSON.stringify(localStorage);
        });
        fs.writeFileSync('localstorage.json', localStorageData);

        console.log('Success! Saved cookies.json AND localstorage.json');
        console.log('Please run the bot again.');

    } catch (err) {
        console.error('Error during cookie capture:', err);
    } finally {
        await browser.close();
        process.exit();
    }
}

getCookies();
