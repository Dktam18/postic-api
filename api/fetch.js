export default async function handler(req, res) {
    const tweetUrl = req.query.url;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    // Extract ID from URL (handles x.com, twitter.com, and query strings)
    const tweetId = tweetUrl.split('status/')[1]?.split('?')[0];

    try {
        const response = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`);
        
        if (!response.ok) throw new Error("Tweet not found or private");

        const d = await response.json();

        // 📊 THE "PRO" DATA MAP
        const result = {
            id: d.id_str,
            text: d.text,
            created_at: d.created_at,
            lang: d.lang,
            user: {
                name: d.user.name,
                username: d.user.screen_name,
                avatar: d.user.profile_image_url_https.replace('_normal', '_400x400'), // Gets the HD avatar
                isVerified: d.user.verified || d.user.is_blue_verified,
                verifiedType: d.user.verified_type || (d.user.is_blue_verified ? "Blue" : null), // "Business" (Gold), "Government" (Grey), or "Blue"
            },
            media: d.mediaDetails?.map(m => ({
                type: m.type, // 'photo', 'video', or 'animated_gif'
                url: m.media_url_https,
                aspectRatio: m.sizes.large.w / m.sizes.large.h
            })) || [],
            stats: {
                likes: d.favorite_count,
                retweets: d.retweet_count,
                quotes: d.quote_count,
                replies: d.conversation_count
            },
            // 🛡️ PREPARING FOR QUOTES: We catch the basic quote data here
            quote: d.quoted_tweet ? {
                id: d.quoted_tweet.id_str,
                text: d.quoted_tweet.text,
                user: {
                    name: d.quoted_tweet.user.name,
                    username: d.quoted_tweet.user.screen_name,
                    avatar: d.quoted_tweet.user.profile_image_url_https
                }
            } : null
        };

        return res.status(200).json({ success: true, data: result });

    } catch (err) {
        return res.status(500).json({ success: false, error: "Postic Syndication Error: " + err.message });
    }
}
