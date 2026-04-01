const { chromium } = require('playwright-core');
const chromiumPack = require('@sparticuz/chromium-min');

export default async function handler(req, res) {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    let browser;
    try {
        // We use the local version since we don't want external bills
        const executablePath = await chromiumPack.executablePath();

        browser = await chromium.launch({
            args: [
                ...chromiumPack.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--single-process',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
            executablePath: executablePath,
            headless: true,
        });

        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Block heavy assets to save memory and time
        await page.route('**/*.{png,jpg,jpeg,svg,css,woff,video}', r => r.abort());

        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForSelector('div[data-testid="tweetText"]', { timeout: 10000 });

        const data = await page.evaluate(() => {
            const tweet = document.querySelector('article');
            return {
                text: tweet?.querySelector('div[data-testid="tweetText"]')?.innerText,
                user: {
                    name: tweet?.querySelector('div[data-testid="User-Name"]')?.innerText.split('\n')[0],
                    handle: tweet?.querySelector('div[data-testid="User-Name"] span')?.innerText,
                    avatar: tweet?.querySelector('div[data-testid="Tweet-User-Avatar"] img')?.src
                }
            };
        });

        return res.status(200).json({ success: true, data });

    } catch (err) {
        // This gives us the exact error if it fails again
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        if (browser) await browser.close();
    }
}
