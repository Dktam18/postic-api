export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ success: false, error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ success: false, error: "Invalid Tweet ID" });

    try {
        const cookies = JSON.parse(process.env.X_COOKIE_JSON || "[]");
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
        const ct0 = cookies.find(c => c.name === "ct0")?.value;

        if (!ct0) throw new Error("Missing ct0 in cookies.");

        // 🛠️ UPDATED HANDSHAKE (Standard for April 2026)
        const queryId = "QH3PZk8zqQzQWz1yQ8p4ZQ"; 
        const bearer = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
        
        const variables = {
            focalTweetId: tweetId,
            withCommunity: true,
            includePromotedContent: false,
            withVoice: true
        };

        const features = {
            responsive_web_graphql_timeline_navigation_enabled: true,
            verified_phone_label_enabled: true,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_tweet_property_web_tweet_constant_bold_enabled: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            communities_web_enable_tweet_community_results_fetch: true,
            responsive_web_media_download_video_share_menu_enabled: true,
            responsive_web_enhance_cards_enabled: false
        };

        const apiUrl = `https://x.com/i/api/graphql/${queryId}/TweetDetail?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;

        const response = await fetch(apiUrl, {
            headers: {
                "authorization": `Bearer ${bearer}`,
                "x-csrf-token": ct0,
                "cookie": cookieHeader,
                "content-type": "application/json",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "x-twitter-active-user": "yes",
                "x-twitter-auth-type": "OAuth2Session",
                "x-twitter-client-language": "en"
            }
        });

        const json = await response.json();

        // 🕵️‍♂️ RECURSIVE SEARCH: This finds the tweet anywhere in the massive JSON response
        const findTweetInJson = (obj, id) => {
            if (obj?.rest_id === id && obj?.legacy) return obj;
            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    const found = findTweetInJson(obj[key], id);
                    if (found) return found;
                }
            }
            return null;
        };

        const result = findTweetInJson(json.data, tweetId);

        if (!result) {
            return res.status(404).json({ 
                success: false, 
                error: "Tweet data missing. Try refreshing X_COOKIE_JSON in Vercel.",
                debug_hint: json.errors?.[0]?.message || "Structure mismatch"
            });
        }

        const legacy = result.legacy;
        const user = result.core?.user_results?.result?.legacy;
        const isVerified = user?.verified || result.core?.user_results?.result?.is_blue_verified;

        return res.status(200).json({
            success: true,
            data: {
                text: legacy?.full_text || "",
                user: {
                    name: user?.name,
                    username: user?.screen_name,
                    avatar: user?.profile_image_url_https?.replace("_normal", "_400x400"),
                    isVerified: !!isVerified,
                    verifiedType: result.core?.user_results?.result?.is_blue_verified ? "Blue" : user?.verified_type
                },
                media: legacy?.extended_entities?.media?.map(m => ({
                    url: m.media_url_https,
                    type: m.type,
                    aspect: m.sizes?.large ? m.sizes.large.w / m.sizes.large.h : 1
                })) || [],
                stats: {
                    likes: legacy?.favorite_count || 0,
                    reposts: legacy?.retweet_count || 0,
                    replies: legacy?.reply_count || 0,
                    bookmarks: legacy?.bookmark_count || 0
                }
            }
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: "Postic Logic Error: " + err.message });
    }
}
