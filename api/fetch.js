const { chromium } = require('playwright-core');
const chromiumPack = require('@sparticuz/chromium-min');

export default async function handler(req, res) {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "No URL" });

    let browser;
    try {
        // This link is the 'secret sauce'—it has all the missing .so files built-in
        const executablePath = await chromiumPack.executablePath(
            'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
        );

        browser = await chromium.launch({
            args: chromiumPack.args,
            executablePath: executablePath,
            headless: true,
        });

        const context = await browser.newContext();
        const page = await context.newPage();
        await page.route('**/*.{png,jpg,jpeg,svg,css,woff,video}', r => r.abort());

        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('div[data-testid="tweetText"]', { timeout: 15000 });

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
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        if (browser) await browser.close();
    }
}
