export default async function handler(req, res) {
    const tweetId = req.query.id;

    if (!tweetId) {
        return res.status(400).json({ error: "No ID provided" });
    }

    try {
        const cookies = JSON.parse(process.env.X_COOKIE_JSON || "[]");
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
        const ct0 = cookies.find(c => c.name === "ct0")?.value;

        const response = await fetch(
            `https://twitter.com/i/api/graphql/QH3PZk8zqQzQWz1yQ8p4ZQ/TweetDetail?variables=${encodeURIComponent(JSON.stringify({
                focalTweetId: tweetId
            }))}`,
            {
                headers: {
                    "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAA...",
                    "x-csrf-token": ct0,
                    "cookie": cookieHeader,
                    "user-agent": "Mozilla/5.0"
                }
            }
        );

        const data = await response.json();

        const tweets = [];

        const instructions =
            data?.data?.threaded_conversation_with_injections_v2?.instructions || [];

        for (const inst of instructions) {
            if (inst.type !== "TimelineAddEntries") continue;

            for (const entry of inst.entries) {
                const t = entry?.content?.itemContent?.tweet_results?.result;
                if (!t?.legacy) continue;

                tweets.push({
                    id: t.legacy.id_str,
                    text: t.legacy.full_text
                });
            }
        }

        return res.status(200).json({
            success: true,
            thread: tweets
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
