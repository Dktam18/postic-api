import http from "https";

export default function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid ID" });

    const apiKey = process.env.SCRAPER_ANT_API_KEY;
    const targetUrl = encodeURIComponent(`https://x.com/i/status/${tweetId}`);

    // 🚀 THE BROWSER FIX: browser=true + wait_for_selector=article
    // This tells ScrapingAnt: "Actually open Chrome and wait for the tweet to appear"
    const antUrl = `https://api.scraperant.com/v2/general?url=${targetUrl}&x-api-key=${apiKey}&browser=true&wait_for_selector=article&return_page_source=true`;

    const options = {
        "method": "GET",
        "hostname": "api.scrapingant.com",
        "path": antUrl.replace('https://api.scrapingant.com', ''),
        "headers": { "useQueryString": true }
    };

    const externalReq = http.request(options, function (externalRes) {
        let chunks = [];
        externalRes.on("data", (chunk) => chunks.push(chunk));

        externalRes.on("end", () => {
            try {
                const html = Buffer.concat(chunks).toString();
                
                // Search for the data in the rendered HTML
                const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
                
                if (!stateMatch) {
                    throw new Error("X is still hiding data. The browser didn't load in time.");
                }

                const state = JSON.parse(stateMatch[1]);
                const users = state.entities?.users?.entities || {};
                const tweets = state.entities?.tweets?.entities || {};
                
                const userId = Object.keys(users)[0];
                const u = users[userId];
                const t = tweets[tweetId];

                const result = {
                    success: true,
                    data: {
                        id: tweetId,
                        text: t?.full_text || t?.text || "",
                        user: {
                            name: u?.name || "User",
                            username: u?.screen_name || "user",
                            avatar: u?.profile_image_url_https?.replace('_normal', '_400x400'),
                            isVerified: !!(u?.verified || u?.is_blue_verified)
                        },
                        media: t?.extended_entities?.media?.map(m => ({
                            url: m.media_url_https,
                            type: m.type
                        })) || [],
                        stats: {
                            likes: t?.favorite_count || 0,
                            retweets: t?.retweet_count || 0
                        }
                    }
                };

                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(result);

            } catch (err) {
                return res.status(500).json({ success: false, error: "Extraction Failed: " + err.message });
            }
        });
    });

    externalReq.on("error", (e) => res.status(500).json({ error: e.message }));
    externalReq.end();
}
