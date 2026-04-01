export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    
    if (!tweetUrl) {
        return res.status(400).json({ success: false, error: "No URL or ID provided" });
    }

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];

    if (!tweetId) {
        return res.status(400).json({ success: false, error: "Invalid Tweet ID" });
    }

    try {
        // 🚀 THE FIX: Adding Headers to pretend we are a real browser
        const response = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Origin': 'https://platform.twitter.com',
                'Referer': 'https://platform.twitter.com/'
            }
        });
        
        if (!response.ok) {
            throw new Error(`X responded with ${response.status}`);
        }

        const d = await response.json();

        // If the API returns an empty object or error inside the JSON
        if (!d || !d.user) {
            throw new Error("Tweet data is restricted or empty");
        }

        const result = {
            id: d.id_str,
            text: d.text || "",
            created_at: d.created_at,
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
        return res.status(500).json({ 
            success: false, 
            error: "Postic Fetch Error: " + err.message 
        });
    }
}
