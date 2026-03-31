const express = require('express');
const { chromium } = require('playwright');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// --- COOKIE SANITIZER ---
const rawCookies = process.env.X_COOKIE_JSON;
let cleanCookies = [];
if (rawCookies) {
    try {
        const parsed = JSON.parse(rawCookies);
        const cookiesArray = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
        cleanCookies = cookiesArray.map(c => ({
            name: c.name, value: c.value,
            domain: ".x.com", path: "/", 
            expires: c.expirationDate || c.expires || -1,
            secure: true, httpOnly: false, sameSite: 'Lax'
        }));
    } catch (e) { console.error("Cookie Error:", e.message); }
}

app.get('/fetch', async (req, res) => {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "Missing URL" });

    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--disable-gpu']
    });

    const context = await browser.newContext({ 
        storageState: { cookies: cleanCookies },
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    await page.route('**/*.{png,jpg,jpeg,svg}', route => route.abort());

    try {
        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('article', { timeout: 20000 });
        await page.waitForTimeout(3000);

        const data = await page.evaluate(() => {
            const tweets = Array.from(document.querySelectorAll('article'));
            return tweets.map(t => ({
                text: t.querySelector('div[data-testid="tweetText"]')?.innerText,
                author: t.querySelector('div[data-testid="User-Name"]')?.innerText.split('\n')[0],
                handle: t.querySelector('div[data-testid="User-Name"] span')?.innerText,
                avatar: t.querySelector('div[data-testid="Tweet-User-Avatar"] img')?.src,
                media: Array.from(t.querySelectorAll('div[data-testid="tweetPhoto"] img')).map(img => img.src),
                metrics: {
                    views: document.querySelector('a[href*="/analytics"]')?.innerText || "0",
                    likes: document.querySelector('div[data-testid="like"]')?.innerText || "0"
                }
            }));
        });

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        await browser.close();
    }
});

app.get('/health', (req, res) => res.send("Alive"));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Live on ${PORT}`);
});
