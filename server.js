const express = require('express');
const { chromium } = require('playwright');
const axios = require('axios');
const app = express();

// Use Render's PORT or default to 10000
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
            domain: typeof c.domain === 'object' ? (c.domain.domain || ".x.com") : (c.domain || ".x.com"),
            path: c.path || "/", expires: c.expirationDate || c.expires || -1,
            httpOnly: c.httpOnly || false, secure: c.secure || true,
            sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax'
        }));
    } catch (e) { console.error("Cookie Parse Error:", e.message); }
}

// --- MAIN FETCH ENDPOINT ---
app.get('/fetch', async (req, res) => {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "Missing URL" });

    // CRITICAL: Launch arguments for Linux environments (Render)
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process' // Helps with low-memory environments like Free Tier
        ]
    });

    const context = await browser.newContext({ 
        storageState: cleanCookies.length > 0 ? { cookies: cleanCookies } : undefined,
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // Data Saver: Abort images to save bandwidth & speed up load
    await page.route('**/*.{png,jpg,jpeg,svg}', route => route.abort());

    try {
        console.log(`📡 Fetching: ${tweetUrl}`);
        // Increased timeout to 90s because Free Tier is slow
        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        
        await page.waitForSelector('article', { timeout: 30000 });
        await page.waitForTimeout(3000); 

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
        console.error("Scrape Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        await browser.close();
    }
});

app.get('/health', (req, res) => res.send("Alive"));

// --- BINDING TO 0.0.0.0 ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Postic API strictly running on port ${PORT}`);
});

// Increase timeouts to prevent "Connection Reset" 502s
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

// Self-ping to stay awake
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_HOSTNAME) {
        const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/health`;
        axios.get(url).catch(() => {});
    }
}, 600000);
