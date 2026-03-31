const { chromium } = require('playwright-core');
const chromiumPack = require('@sparticuz/chromium-min');

export default async function handler(req, res) {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    // --- COOKIE LOGIC ---
    const rawCookies = process.env.X_COOKIE_JSON;
    let cleanCookies = [];
    if (rawCookies) {
        try {
            const parsed = JSON.parse(rawCookies);
            const cookiesArray = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
            cleanCookies = cookiesArray.map(c => ({
                name: c.name, value: c.value, domain: ".x.com", path: "/", 
                secure: true, httpOnly: false, sameSite: 'Lax'
            }));
        } catch (e) { console.error("Cookie Error"); }
    }

    let browser;
    try {
        // 🚀 THE FIX: Point to the remote executable pack (contains libnspr4, libnss3, etc.)
        const executablePath = await chromiumPack.executablePath(
            'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
        );

        browser = await chromium.launch({
            args: [...chromiumPack.args, '--no-sandbox', '--disable-setuid-sandbox'],
            executablePath: executablePath,
            headless: true,
        });

        const context = await browser.newContext({ 
            storageState: cleanCookies.length > 0 ? { cookies: cleanCookies } : undefined,
            viewport: { width: 800, height: 600 } 
        });

        const page = await context.newPage();
        
        // Speed boost: block images/css
        await page.route('**/*.{png,jpg,jpeg,svg,css,woff,video}', route => route.abort());

        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('div[data-testid="tweetText"]', { timeout: 15000 });

        const data = await page.evaluate(() => {
            const t = document.querySelector('article');
            return {
                text: t?.querySelector('div[data-testid="tweetText"]')?.innerText,
                author: t?.querySelector('div[data-testid="User-Name"]')?.innerText.split('\n')[0],
                handle: t?.querySelector('div[data-testid="User-Name"] span')?.innerText,
                avatar: t?.querySelector('div[data-testid="Tweet-User-Avatar"] img')?.src,
                metrics: {
                    likes: document.querySelector('div[data-testid="like"]')?.innerText || "0",
                    views: document.querySelector('a[href*="/analytics"]')?.innerText || "0"
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
