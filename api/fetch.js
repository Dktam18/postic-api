const { chromium } = require('playwright-core');
const chromiumPack = require('@sparticuz/chromium');

export default async function handler(req, res) {
    // 1. Check for the URL
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    // 2. Cookie Setup (Pulls from Vercel Env Variables)
    const rawCookies = process.env.X_COOKIE_JSON;
    let cleanCookies = [];
    if (rawCookies) {
        const parsed = JSON.parse(rawCookies);
        const cookiesArray = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
        cleanCookies = cookiesArray.map(c => ({
            name: c.name, value: c.value,
            domain: ".x.com", path: "/", 
            secure: true, httpOnly: false, sameSite: 'Lax'
        }));
    }

    let browser;
    try {
        // 3. Launch the "Serverless" Browser
        browser = await chromium.launch({
            args: chromiumPack.args,
            executablePath: await chromiumPack.executablePath(),
            headless: true,
        });

        const context = await browser.newContext({
            storageState: cleanCookies.length > 0 ? { cookies: cleanCookies } : undefined,
            viewport: { width: 800, height: 600 }
        });

        const page = await context.newPage();

        // 4. SPEED BOOST: Block heavy assets
        await page.route('**/*.{png,jpg,jpeg,svg,css,woff,video}', route => route.abort());

        // 5. Navigate & Scrape
        await page.goto(tweetUrl, { waitUntil: 'commit', timeout: 30000 });
        await page.waitForSelector('div[data-testid="tweetText"]', { timeout: 15000 });

        const data = await page.evaluate(() => {
            const tweets = Array.from(document.querySelectorAll('article'));
            return tweets.map(tweet => ({
                text: tweet.querySelector('div[data-testid="tweetText"]')?.innerText,
                user: {
                    name: tweet.querySelector('div[data-testid="User-Name"]')?.innerText.split('\n')[0],
                    handle: tweet.querySelector('div[data-testid="User-Name"] span')?.innerText,
                    avatar: tweet.querySelector('div[data-testid="Tweet-User-Avatar"] img')?.src
                },
                metrics: {
                    likes: document.querySelector('div[data-testid="like"]')?.innerText || "0",
                    views: document.querySelector('a[href*="/analytics"]')?.innerText || "0"
                }
            }));
        });

        return res.status(200).json({ success: true, data });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        if (browser) await browser.close();
    }
}
