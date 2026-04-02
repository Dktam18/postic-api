export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid Tweet ID" });

    const apiKey = process.env.SCRAPER_ANT_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ success: false, error: "Vercel is missing the SCRAPER_ANT_API_KEY" });
    }

    try {
        const targetUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`;
        
        // 🚀 SCAPERANT SPECIFIC: 
        // We use their general API endpoint and pass the target URL
        const antUrl = `https://api.scraperant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${apiKey}`;

        const response = await fetch(antUrl);
        
        if (response.status === 401) {
            throw new Error("Invalid ScraperAnt API Key. Check your dashboard.");
        }

        if (!response.ok) throw new Error(`ScraperAnt Error: ${response.status}`);

        const d = await response.json();
        
        // 📊 Map the "Thorough" data for Postic
        const result = {
            id: d?.id_str,
            text: d?.text || "",
            created_at: d?.created_at,
            user: {
                name: d?.user?.name || "User",
                username: d?.user?.screen_name || "user",
                avatar: d?.user?.profile_image_url_https?.replace('_normal', '_400x400'),
                isVerified: !!(d?.user?.verified || d?.user?.is_blue_verified),
                verifiedType: d?.user?.verified_type || (d?.user?.is_blue_verified ? "Blue" : null)
            },
            media: d?.mediaDetails?.map(m => ({
                type: m.type,
                url: m.media_url_https,
                aspectRatio: m.sizes?.large ? m.sizes.large.w / m.sizes.large.h : 1
            })) || [],
            stats: {
                likes: d?.favorite_count || 0,
                retweets: d?.retweet_count || 0,
                quotes: d?.quote_count || 0,
                replies: d?.conversation_count || 0
            },
            quote: d?.quoted_tweet ? {
                id: d.quoted_tweet.id_str,
                text: d.quoted_tweet.text,
                user: {
                    name: d.quoted_tweet.user?.name,
                    username: d.quoted_tweet.user?.screen_name,
                    avatar: d.quoted_tweet.user?.profile_image_url_https?.replace('_normal', '_200x200')
                }
            } : null
        };

        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({ success: true, data: result });

    } catch (err) {
        return res.status(500).json({ success: false, error: "Postic Error: " + err.message });
    }
}
