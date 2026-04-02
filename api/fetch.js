export default async function handler(req, res) {
    // 1. Set CORS headers immediately so your frontend can talk to it
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    // 2. Grab the ID
    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid Tweet ID" });

    // 3. SANITY CHECK: Check for the API Key
    const apiKey = process.env.SCRAPER_ANT_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ 
            success: false, 
            error: "SERVER ERROR: SCRAPER_ANT_API_KEY is missing in Vercel settings." 
        });
    }

    try {
        const targetUrl = encodeURIComponent(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`);
        const antUrl = `https://api.scraperant.com/v2/general?url=${targetUrl}&x-api-key=${apiKey}&browser=false`;

        // 4. Using the built-in fetch
        const response = await fetch(antUrl);
        
        if (!response.ok) {
            const errorData = await response.text();
            return res.status(response.status).json({ 
                success: false, 
                error: `ScraperAnt Error ${response.status}: ${errorData}` 
            });
        }

        const d = await response.json();

        // 5. Final Data Structure
        const result = {
            id: d?.id_str,
            text: d?.text || "",
            user: {
                name: d?.user?.name || "User",
                username: d?.user?.screen_name || "user",
                avatar: d?.user?.profile_image_url_https?.replace('_normal', '_400x400') || "",
                isVerified: !!(d?.user?.verified || d?.user?.is_blue_verified)
            },
            media: d?.mediaDetails?.map(m => ({
                type: m.type,
                url: m.media_url_https
            })) || [],
            stats: {
                likes: d?.favorite_count || 0,
                retweets: d?.retweet_count || 0
            }
        };

        return res.status(200).json({ success: true, data: result });

    } catch (err) {
        return res.status(500).json({ 
            success: false, 
            error: "Internal Server Error: " + err.message 
        });
    }
}
