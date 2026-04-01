const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

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

    let browser = null;
    
    try {
        // Use @sparticuz/chromium to get the executable path
        const executablePath = await chromium.executablePath();
        
        console.log('Executable path:', executablePath);
        
        // Launch browser with optimized settings for Vercel
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1280x720',
                '--single-process',
                '--no-zygote'
            ],
            executablePath: executablePath,
            headless: 'new',
            defaultViewport: {
                width: 1280,
                height: 720
            }
        });

        const page = await browser.newPage();
        
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Navigate to the tweet
        await page.goto(tweetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 20000
        });
        
        // Wait for the tweet to load
        await page.waitForSelector('article', { timeout: 10000 });
        
        // Extract tweet data
        const data = await page.evaluate(() => {
            const article = document.querySelector('article');
            if (!article) return null;
            
            // Get user info
            const userSection = article.querySelector('div[data-testid="User-Name"]');
            let userName = null;
            let userHandle = null;
            
            if (userSection) {
                const text = userSection.innerText;
                const lines = text.split('\n');
                if (lines.length >= 2) {
                    userName = lines[0];
                    userHandle = lines[1];
                }
            }
            
            // Get tweet text
            const tweetText = article.querySelector('div[data-testid="tweetText"]');
            const text = tweetText ? tweetText.innerText : null;
            
            // Get avatar
            const avatar = article.querySelector('div[data-testid="Tweet-User-Avatar"] img');
            const avatarUrl = avatar ? avatar.src : null;
            
            // Get timestamp
            const timeElement = article.querySelector('time');
            const timestamp = timeElement ? timeElement.getAttribute('datetime') : null;
            
            return {
                text: text,
                user: {
                    name: userName,
                    handle: userHandle,
                    avatar: avatarUrl
                },
                timestamp: timestamp,
                url: window.location.href
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
            data: data
        });
        
    } catch (error) {
        console.error('Error:', error);
        
        return res.status(500).json({
            success: false,
            error: "Failed to fetch tweet: " + error.message
        });
        
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
