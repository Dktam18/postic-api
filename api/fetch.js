const { chromium } = require('playwright-core');
const chromiumPack = require('@sparticuz/chromium-min');
const path = require('path');

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const tweetUrl = req.query.url;
    if (!tweetUrl) {
        return res.status(400).json({ error: "Missing URL parameter" });
    }

    // Validate URL
    if (!tweetUrl.includes('twitter.com') && !tweetUrl.includes('x.com')) {
        return res.status(400).json({ error: "Invalid Twitter/X URL" });
    }

    let browser;
    try {
        // Get Chromium executable path
        const executablePath = await chromiumPack.executablePath();
        
        // Set library path for dependencies
        const execDir = path.dirname(executablePath);
        process.env.LD_LIBRARY_PATH = `${execDir}:${process.env.LD_LIBRARY_PATH || ''}`;
        
        // Launch browser with proper arguments
        browser = await chromium.launch({
            args: [
                ...chromiumPack.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-web-security',
                '--window-size=1280,720'
            ],
            executablePath: executablePath,
            headless: chromiumPack.headless,
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        const page = await context.newPage();
        
        // Block unnecessary resources for better performance
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // Navigate to tweet
        await page.goto(tweetUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        // Wait for tweet content
        await page.waitForSelector('article', { timeout: 15000 });
        
        // Extract tweet data
        const data = await page.evaluate(() => {
            const article = document.querySelector('article');
            if (!article) return null;
            
            const getText = (selector) => {
                const element = article.querySelector(selector);
                return element ? element.innerText.trim() : null;
            };
            
            const getAttribute = (selector, attribute) => {
                const element = article.querySelector(selector);
                return element ? element.getAttribute(attribute) : null;
            };
            
            // Extract user info
            const userNameElement = article.querySelector('div[data-testid="User-Name"]');
            let userName = null;
            let userHandle = null;
            
            if (userNameElement) {
                const textParts = userNameElement.innerText.split('\n');
                if (textParts.length >= 2) {
                    userName = textParts[0];
                    userHandle = textParts[1];
                }
            }
            
            return {
                text: getText('div[data-testid="tweetText"]'),
                user: {
                    name: userName,
                    handle: userHandle,
                    avatar: getAttribute('div[data-testid="Tweet-User-Avatar"] img', 'src')
                },
                timestamp: getText('time'),
                likes: getText('button[data-testid="like"]') || getText('div[data-testid="like"]'),
                retweets: getText('button[data-testid="retweet"]') || getText('div[data-testid="retweet"]'),
                replies: getText('button[data-testid="reply"]') || getText('div[data-testid="reply"]')
            };
        });
        
        if (!data || !data.text) {
            return res.status(404).json({ 
                success: false, 
                error: "Could not extract tweet content. The tweet might be private or deleted." 
            });
        }
        
        return res.status(200).json({ 
            success: true, 
            data,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('Scraping error:', err);
        
        // Handle specific error types
        if (err.message.includes('Timeout')) {
            return res.status(504).json({ 
                success: false, 
                error: "Request timeout. The page took too long to load." 
            });
        }
        
        if (err.message.includes('protocol error') || err.message.includes('Target page')) {
            return res.status(503).json({ 
                success: false, 
                error: "Browser failed to launch. Please try again." 
            });
        }
        
        return res.status(500).json({ 
            success: false, 
            error: "Failed to fetch tweet: " + err.message 
        });
        
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
