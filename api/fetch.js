export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ success: false, error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ success: false, error: "Invalid ID" });

    const apiKey = process.env.SCRAPER_ANT_API_KEY;
    
    try {
        const targetUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`;
        
        // 🚀 THE FIX: Use ScraperAnt's API and set a 15-second timeout
        const antUrl = `https://api.scraperant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${apiKey}&browser=false`;

        const response = await fetch(antUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ScraperAnt rejected request (${response.status}): ${errorText}`);
        }

        const d = await response.json();

        // 📊 The Data Map for Postic
        const result = {
            id: d?.id_str,
            text: d?.text || "",
            user: {
                name: d?.user?.name || "User",
                username: d?.user?.screen_name || "user",
                avatar: d?.user?.profile_image_url_https?.replace('_normal', '_400x400'),
                isVerified: !!(d?.user?.verified || d?.user?.is_blue_verified)
            },
            media: d?.mediaDetails?.map(m => ({
                type: m.type,
                url: m.media_url_https
            })) || [],
            stats: {
                likes: d?.favorite_count || 0,
                retweets: d?.retweet_count || 0
            },
            quote: d?.quoted_tweet ? {
                text: d.quoted_tweet.text,
                user: d.quoted_tweet.user?.name
            } : null
        };

        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({ success: true, data: result });

    } catch (err) {
        // Detailed log to help us see exactly where it's failing
        console.error("Postic Internal Error:", err.message);
        return res.status(500).json({ 
            success: false, 
            error: "Fetch failed: " + err.message 
        });
    }
}
