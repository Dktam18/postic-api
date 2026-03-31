const express = require('express');
const { chromium } = require('playwright');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

const rawCookies = process.env.X_COOKIE_JSON;
let cleanCookies = [];
if (rawCookies) {
    try {
        const parsed = JSON.parse(rawCookies);
        const cookiesArray = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
        cleanCookies = cookiesArray.map(c => ({
            name: c.name, value: c.value,
            domain: ".x.com", path: "/", 
            secure: true, httpOnly: false, sameSite: 'Lax'
        }));
    } catch (e) { console.error("Cookie Error:", e.message); }
}

app.get('/fetch', async (req, res) => {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "Missing URL" });

    let browser;
    try {
        // Optimized for Render Free Tier (Low RAM)
        browser = await chromium.launch({ 
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--single-process',
                '--no-zygote'
            ]
        });

        const context = await browser.newContext({ 
            storageState: cleanCookies.length > 0 ? { cookies: cleanCookies } : undefined,
            viewport: { width: 800, height: 600 }, // Smaller viewport = less RAM
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        
        // BLOCK EVERYTHING EXCEPT TEXT AND ESSENTIALS
        await page.route('**/*.{png,jpg,jpeg,svg,gif,webp,woff,woff2,css}', route => route.abort());

        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('article', { timeout: 15000 });

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

        res.json({ success: true, data });
    } catch (err) {
        console.error("Fetch Error:", err.message);
        res.status(500).json({ success: false, error: "X is taking too long to respond. Try again." });
    } finally {
        if (browser) await browser.close();
    }
});

app.get('/health', (req, res) => res.send("Alive"));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API on ${PORT}`);
});
