import http from "https";

export default function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid ID" });

    const apiKey = process.env.SCRAPER_ANT_API_KEY;
    
    // 🛡️ THE COOKIE PARSER: Taking the full JSON and making it a String
    let cookieString = "";
    try {
        const cookieData = JSON.parse(process.env.X_COOKIE_JSON || "[]");
        cookieString = cookieData.map(c => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
        console.error("Cookie JSON Parse Error");
    }

    const targetUrl = encodeURIComponent(`https://x.com/i/status/${tweetId}`);

    const options = {
        "method": "GET",
        "hostname": "api.scrapingant.com",
        "path": `/v2/general?url=${targetUrl}&x-api-key=${apiKey}&browser=false&return_page_source=true`,
        "headers": {
            "useQueryString": true,
            "ant-cookies": cookieString // This sends EVERYTHING in your JSON
        }
    };

    const externalReq = http.request(options, function (externalRes) {
        let chunks = [];
        externalRes.on("data", (chunk) => chunks.push(chunk));

        externalRes.on("end", () => {
            try {
                const html = Buffer.concat(chunks).toString();
                const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
                
                if (!stateMatch) {
                    throw new Error("X Blocked the request. Check if cookies are still valid.");
                }

                const state = JSON.parse(stateMatch[1]);
                
                // 🕵️‍♂️ THOROUGH SEARCH: Check multiple places for User and Tweet data
                const userEntities = state.entities?.users?.entities || {};
                const tweetEntities = state.entities?.tweets?.entities || {};
                
                // Get the first user found in the entities
                const userId = Object.keys(userEntities)[0];
                const u = userEntities[userId];
                const t = tweetEntities[tweetId];

                const result = {
                    success: true,
                    data: {
                        id: tweetId,
                        text: t?.full_text || t?.text || "",
                        user: {
                            name: u?.name || "User",
                            username: u?.screen_name || "user",
                            avatar: u?.profile_image_url_https?.replace('_normal', '_400x400'),
                            isVerified: !!(u?.verified || u?.is_blue_verified),
                            verifiedType: u?.verified_type || (u?.is_blue_verified ? "Blue" : null)
                        },
                        media: t?.extended_entities?.media?.map(m => ({
                            url: m.media_url_https,
                            type: m.type,
                            video_url: m.video_info?.variants?.find(v => v.content_type === 'video/mp4')?.url
                        })) || [],
                        stats: {
                            likes: t?.favorite_count || 0,
                            retweets: t?.retweet_count || 0,
                            replies: t?.reply_count || 0,
                            quotes: t?.quote_count || 0
                        }
                    }
                };

                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(result);

            } catch (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
        });
    });

    externalReq.on("error", (e) => res.status(500).json({ error: e.message }));
    externalReq.end();
}
