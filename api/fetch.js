export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ success: false, error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ success: false, error: "Invalid Tweet ID" });

    try {
        // 1. Parse your cookies
        const cookies = JSON.parse(process.env.X_COOKIE_JSON || "[]");
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
        const ct0 = cookies.find(c => c.name === "ct0")?.value;

        if (!ct0) throw new Error("Cookies are invalid or expired (missing ct0).");

        // 2. The Real X API Configuration
        const queryId = "QH3PZk8zqQzQWz1yQ8p4ZQ"; // This is the public TweetDetail ID
        const bearer = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"; // Official Web Bearer
        
        const variables = {
            focalTweetId: tweetId,
            withCommunity: true,
            includePromotedContent: false,
            withVoice: true
        };

        const features = {
            responsive_web_graphql_timeline_navigation_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_tweet_property_web_tweet_constant_bold_enabled: true
        };

        const apiUrl = `https://x.com/i/api/graphql/${queryId}/TweetDetail?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;

        // 3. The "Human" Request
        const response = await fetch(apiUrl, {
            headers: {
                "authorization": `Bearer ${bearer}`,
                "x-csrf-token": ct0,
                "cookie": cookieHeader,
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "x-twitter-active-user": "yes",
                "x-twitter-client-language": "en"
            }
        });

        const json = await response.json();
        
        // 4. Surgical Extraction of the Tweet
        const instructions = json?.data?.threaded_conversation_with_injections_v2?.instructions || [];
        const mainEntry = instructions.find(i => i.type === "TimelineAddEntries")?.entries?.find(e => e.entryId === `tweet-${tweetId}`);
        const result = mainEntry?.content?.itemContent?.tweet_results?.result || mainEntry?.content?.items?.[0]?.item?.itemContent?.tweet_results?.result;

        if (!result) throw new Error("Tweet not found in API response. Cookies might be dead.");

        const legacy = result.legacy || result.tweet?.legacy;
        const core = result.core || result.tweet?.core;
        const user = core?.user_results?.result?.legacy;

        // 5. Success! The thorough data Postic needs
        return res.status(200).json({
            success: true,
            data: {
                id: tweetId,
                text: legacy?.full_text || "",
                user: {
                    name: user?.name,
                    username: user?.screen_name,
                    avatar: user?.profile_image_url_https?.replace("_normal", "_400x400"),
                    isVerified: user?.verified || user?.is_blue_verified,
                    verifiedType: result.core?.user_results?.result?.is_blue_verified ? "Blue" : user?.verified_type
                },
                media: legacy?.entities?.media?.map(m => ({ url: m.media_url_https, type: m.type })) || [],
                stats: {
                    likes: legacy?.favorite_count || 0,
                    reposts: legacy?.retweet_count || 0,
                    replies: legacy?.reply_count || 0,
                    quotes: legacy?.quote_count || 0
                }
            }
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}
