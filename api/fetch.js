import http from "https";

export default function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid ID" });

    const apiKey = process.env.SCRAPER_ANT_API_KEY;
    
    // We point to the main tweet page now to get that __INITIAL_STATE__
    const targetUrl = encodeURIComponent(`https://x.com/i/status/${tweetId}`);

    const options = {
        "method": "GET",
        "hostname": "api.scrapingant.com",
        "path": `/v2/general?url=${targetUrl}&x-api-key=${apiKey}&browser=false&return_page_source=true`,
        "headers": { "useQueryString": true }
    };

    const externalReq = http.request(options, function (externalRes) {
        let chunks = [];
        externalRes.on("data", (chunk) => chunks.push(chunk));

        externalRes.on("end", () => {
            try {
                const html = Buffer.concat(chunks).toString();
                
                // 🕵️‍♂️ THE SURGERY: Find the JSON inside the script tag
                const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
                
                if (!stateMatch) {
                    // Fallback: If it's not in INITIAL_STATE, maybe it's raw JSON
                    const d = JSON.parse(html);
                    return res.status(200).json({ success: true, data: formatData(d) });
                }

                const state = JSON.parse(stateMatch[1]);
                
                // 📊 Digging into the structure you shared
                const userData = state.entities?.users?.entities?.[Object.keys(state.entities.users.entities)[0]];
                const tweetData = state.entities?.tweets?.entities?.[tweetId];

                const result = {
                    success: true,
                    data: {
                        text: tweetData?.full_text || tweetData?.text || "",
                        user: {
                            name: userData?.name || "User",
                            username: userData?.screen_name || "user",
                            avatar: userData?.profile_image_url_https?.replace('_normal', '_400x400'),
                            isVerified: userData?.verified || userData?.is_blue_verified,
                            verifiedType: userData?.verified_type || (userData?.is_blue_verified ? "Blue" : null)
                        },
                        media: tweetData?.extended_entities?.media?.map(m => ({
                            url: m.media_url_https,
                            type: m.type
                        })) || [],
                        stats: {
                            likes: tweetData?.favorite_count || 0,
                            retweets: tweetData?.retweet_count || 0,
                            replies: tweetData?.reply_count || 0
                        }
                    }
                };

                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(result);

            } catch (err) {
                return res.status(500).json({ error: "Extraction Failed", details: err.message });
            }
        });
    });

    externalReq.on("error", (e) => res.status(500).json({ error: e.message }));
    externalReq.end();
}

// Helper to handle raw JSON if the state match fails
function formatData(d) {
    return {
        text: d.text,
        user: { name: d.user?.name, username: d.user?.screen_name, avatar: d.user?.profile_image_url_https }
    };
}
