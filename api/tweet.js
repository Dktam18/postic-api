export default async function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;

    if (!tweetUrl) {
        return res.status(400).json({ success: false, error: "No URL provided" });
    }

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) {
        return res.status(400).json({ success: false, error: "Invalid Tweet ID" });
    }

    try {
        const cookies = JSON.parse(process.env.X_COOKIE_JSON || "[]");
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
        const ct0 = cookies.find(c => c.name === "ct0")?.value;

        if (!ct0) throw new Error("Missing ct0 token");

        const url = "https://twitter.com/i/api/graphql/QH3PZk8zqQzQWz1yQ8p4ZQ/TweetDetail";

        const variables = {
            focalTweetId: tweetId,
            with_rux_injections: false,
            includePromotedContent: false,
            withCommunity: true,
            withVoice: true
        };

        const features = {
            responsive_web_graphql_timeline_navigation_enabled: true,
            verified_phone_label_enabled: false
        };

        const response = await fetch(
            `${url}?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`,
            {
                headers: {
                    "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAA...",
                    "x-csrf-token": ct0,
                    "cookie": cookieHeader,
                    "x-twitter-active-user": "yes",
                    "user-agent": "Mozilla/5.0"
                }
            }
        );

        const data = await response.json();

        const instructions =
            data?.data?.threaded_conversation_with_injections_v2?.instructions || [];

        let mainTweet = null;
        let quotedTweet = null;

        for (const inst of instructions) {
            if (inst.type !== "TimelineAddEntries") continue;

            for (const entry of inst.entries) {
                const tweetResult =
                    entry?.content?.itemContent?.tweet_results?.result;

                if (!tweetResult?.legacy) continue;

                const legacy = tweetResult.legacy;
                const user = tweetResult.core?.user_results?.result?.legacy;

                const formatted = {
                    id: legacy.id_str,
                    text: legacy.full_text,

                    user: {
                        name: user?.name,
                        username: user?.screen_name,
                        avatar: user?.profile_image_url_https?.replace("_normal", "_400x400"),
                        verified: user?.verified || user?.is_blue_verified
                    },

                    stats: {
                        likes: legacy.favorite_count,
                        reposts: legacy.retweet_count,
                        replies: legacy.reply_count,
                        quotes: legacy.quote_count
                    },

                    media: legacy.entities?.media || []
                };

                // First tweet = main
                if (!mainTweet) {
                    mainTweet = formatted;

                    // 🔥 Handle quoted tweet
                    if (tweetResult.quoted_status_result?.result?.legacy) {
                        const q = tweetResult.quoted_status_result.result;
                        const qLegacy = q.legacy;
                        const qUser = q.core?.user_results?.result?.legacy;

                        quotedTweet = {
                            id: qLegacy.id_str,
                            text: qLegacy.full_text,
                            user: {
                                name: qUser?.name,
                                username: qUser?.screen_name,
                                avatar: qUser?.profile_image_url_https?.replace("_normal", "_400x400"),
                                verified: qUser?.verified || qUser?.is_blue_verified
                            },
                            stats: {
                                likes: qLegacy.favorite_count,
                                reposts: qLegacy.retweet_count
                            }
                        };
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                main: mainTweet,
                quoted: quotedTweet
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
}
