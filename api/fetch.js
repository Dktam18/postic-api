export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "Missing URL" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid ID" });

    try {
        const apiKey = process.env.SCRAPER_API_KEY;
        const targetUrl = encodeURIComponent(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`);
        
        // 🚀 THE PROXY HANDSHAKE: Routing through a clean IP
        // Using ScraperAPI format (you can swap for ScraperAnt)
        const proxyUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}`;

        const response = await fetch(proxyUrl);
        
        if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);

        const d = await response.json();
        if (!d || !d.user) throw new Error("X still blocking. Try rotating the API key.");

        const result = {
            id: d.id_str,
            text: d.text,
            user: {
                name: d.user.name,
                username: d.user.screen_name,
                avatar: d.user.profile_image_url_https?.replace('_normal', '_400x400'),
                isVerified: !!(d.user.verified || d.user.is_blue_verified),
                verifiedType: d.user.verified_type || (d.user.is_blue_verified ? "Blue" : null)
            },
            media: d.mediaDetails?.map(m => ({
                type: m.type,
                url: m.media_url_https,
                aspectRatio: m.sizes?.large ? m.sizes.large.w / m.sizes.large.h : 1
            })) || [],
            stats: {
                likes: d.favorite_count || 0,
                retweets: d.retweet_count || 0,
                quotes: d.quote_count || 0,
                replies: d.conversation_count || 0
            },
            quote: d.quoted_tweet ? {
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
        return res.status(500).json({ success: false, error: "Postic Proxy Error: " + err.message });
    }
}
