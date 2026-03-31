const express = require('express');
const { chromium } = require('playwright');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Cookie Sanitizer
const rawCookies = process.env.X_COOKIE_JSON;
let cleanCookies = [];
if (rawCookies) {
    try {
        const parsed = JSON.parse(rawCookies);
        const cookiesArray = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
        cleanCookies = cookiesArray.map(c => ({
            name: c.name, value: c.value,
            domain: typeof c.domain === 'object' ? (c.domain.domain || ".x.com") : (c.domain || ".x.com"),
            path: c.path || "/", expires: c.expirationDate || c.expires || -1,
            httpOnly: c.httpOnly || false, secure: c.secure || true,
            sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax'
        }));
    } catch (e) { console.error("Cookie Parse Error:", e.message); }
}

// Main Fetch Endpoint
app.get('/fetch', async (req, res) => {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "Missing URL" });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ 
        storageState: { cookies: cleanCookies },
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    // Data Saver: Don't download images, just get the links
    await page.route('**/*.{png,jpg,jpeg,svg}', route => route.abort());

    try {
        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000); 

        const result = await page.evaluate(() => {
            const tweets = Array.from(document.querySelectorAll('article'));
            return tweets.map(tweet => ({
                text: tweet.querySelector('div[data-testid="tweetText"]')?.innerText,
                author: tweet.querySelector('div[data-testid="User-Name"]')?.innerText.split('\n')[0],
                handle: tweet.querySelector('div[data-testid="User-Name"] span')?.innerText,
                avatar: tweet.querySelector('div[data-testid="Tweet-User-Avatar"] img')?.src,
                media: Array.from(tweet.querySelectorAll('div[data-testid="tweetPhoto"] img')).map(img => img.src),
                metrics: {
                    views: document.querySelector('a[href*="/analytics"]')?.innerText || "0",
                    likes: document.querySelector('div[data-testid="like"]')?.innerText || "0",
                    bookmarks: document.querySelector('div[data-testid="bookmark"]')?.innerText || "0"
                }
            }));
        });

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        await browser.close();
    }
});

app.get('/health', (req, res) => res.send("Alive"));

app.listen(PORT, () => {
    console.log(`Server on ${PORT}`);
    // Self-ping every 10 mins
    setInterval(() => {
        const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/health`;
        if (process.env.RENDER_EXTERNAL_HOSTNAME) axios.get(url).catch(() => {});
    }, 600000);
});
