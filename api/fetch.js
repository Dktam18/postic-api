export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "Missing URL" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid Tweet ID" });

    try {
        // 1. Parse the Cookie JSON from your Environment Variables
        const cookieData = JSON.parse(process.env.X_COOKIE_JSON || "[]");
        
        // 2. Convert JSON array to a standard Cookie Header string
        // Format: "name=value; name2=value2;"
        const cookieString = cookieData
            .map(c => `${c.name}=${c.value}`)
            .join('; ');

        // 3. Fetch with the "Rest Assured" Identity
        const response = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Cookie': cookieString, 
                'Origin': 'https://platform.twitter.com',
                'Referer': 'https://platform.twitter.com/'
            }
        });

        if (!response.ok) throw new Error(`X Error: ${response.status}`);

        const d = await response.json();
        if (!d || !d.user) throw new Error("Data restricted or empty even with cookies.");

        // 4. Detailed Data Mapping
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
            }
        };

        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json({ success: true, data: result });

    } catch (err) {
        return res.status(500).json({ 
            success: false, 
            error: "Postic Fetch Error: " + err.message 
        });
    }
}
