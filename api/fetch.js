const { chromium } = require('playwright-core');
const chromiumPack = require('@sparticuz/chromium-min');
const path = require('path');

export default async function handler(req, res) {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "Missing URL" });

    let browser;
    try {
        // 1. Extract the browser to the /tmp folder
        const executablePath = await chromiumPack.executablePath(
            'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
        );

        // 🚀 THE MAGIC LINE: Tells Linux where to find libnspr4.so
        const execDir = path.dirname(executablePath);
        process.env.LD_LIBRARY_PATH = `${execDir}:${process.env.LD_LIBRARY_PATH || ''}`;

        browser = await chromium.launch({
            args: [...chromiumPack.args, '--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
            executablePath: executablePath,
            headless: true,
        });

        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Speed boost: block images/css
        await page.route('**/*.{png,jpg,jpeg,svg,css,woff,video}', r => r.abort());

        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForSelector('article', { timeout: 15000 });

        const data = await page.evaluate(() => {
            const t = document.querySelector('article');
            return {
                text: t?.querySelector('div[data-testid="tweetText"]')?.innerText,
                user: {
                    name: t?.querySelector('div[data-testid="User-Name"]')?.innerText.split('\n')[0],
                    handle: t?.querySelector('div[data-testid="User-Name"] span')?.innerText,
                    avatar: t?.querySelector('div[data-testid="Tweet-User-Avatar"] img')?.src
                }
            };
        });

        return res.status(200).json({ success: true, data });

    } catch (err) {
        return res.status(500).json({ success: false, error: "Postic Error: " + err.message });
    } finally {
        if (browser) await browser.close();
    }
}
