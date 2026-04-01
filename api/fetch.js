export default async function handler(req, res) {
    // 1. Support both ?url= and ?id=
    const tweetUrl = req.query.url || req.query.id;
    
    if (!tweetUrl) {
        return res.status(400).json({ success: false, error: "No URL or ID provided" });
    }

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];

    if (!tweetId) {
        return res.status(400).json({ success: false, error: "Invalid Tweet ID" });
    }

    try {
        const response = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`);
        
        if (!response.ok) {
            throw new Error("Tweet not found or private");
        }

        const d = await response.json();

        // 🛡️ THE FIX: Using ?. (Optional Chaining) to prevent "undefined" crashes
        const result = {
            id: d?.id_str,
            text: d?.text || "",
            created_at: d?.created_at,
            user: {
                name: d?.user?.name || "Twitter User",
                username: d?.user?.screen_name || "user",
                avatar: d?.user?.profile_image_url_https?.replace('_normal', '_400x400') || "",
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
                    name: d.quoted_tweet.user?.name || "Twitter User",
                    username: d.quoted_tweet.user?.screen_name || "user",
                    avatar: d.quoted_tweet.user?.profile_image_url_https?.replace('_normal', '_200x200')
                }
            } : null
        };

        // Enable CORS for your studio.html
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');

        return res.status(200).json({ success: true, data: result });

    } catch (err) {
        return res.status(500).json({ 
            success: false, 
            error: "Postic Engine Error: " + err.message 
        });
    }
}
