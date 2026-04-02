import http from "https";

export default function handler(req, res) {
    const tweetUrl = req.query.url || req.query.id;
    if (!tweetUrl) return res.status(400).json({ error: "No URL provided" });

    const tweetId = tweetUrl.match(/\d+($|(?=\?|\/))/)?.[0];
    if (!tweetId) return res.status(400).json({ error: "Invalid ID" });

    const apiKey = process.env.SCRAPER_ANT_API_KEY;
    const targetUrl = encodeURIComponent(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`);

    const options = {
        "method": "GET",
        "hostname": "api.scrapingant.com",
        "path": `/v2/general?url=${targetUrl}&x-api-key=${apiKey}&browser=false`,
        "headers": {
            "useQueryString": true
        }
    };

    const externalReq = http.request(options, function (externalRes) {
        let chunks = [];

        externalRes.on("data", function (chunk) {
            chunks.push(chunk);
        });

        externalRes.on("end", function () {
            try {
                const body = Buffer.concat(chunks).toString();
                const d = JSON.parse(body);

                // Map the data for Postic Studio
                const result = {
                    success: true,
                    data: {
                        id: d?.id_str,
                        text: d?.text || "",
                        user: {
                            name: d?.user?.name || "User",
                            username: d?.user?.screen_name || "user",
                            avatar: d?.user?.profile_image_url_https?.replace('_normal', '_400x400'),
                            isVerified: !!(d?.user?.verified || d?.user?.is_blue_verified)
                        },
                        media: d?.mediaDetails?.map(m => ({ url: m.media_url_https, type: m.type })) || [],
                        stats: { likes: d?.favorite_count || 0, retweets: d?.retweet_count || 0 }
                    }
                };

                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).json(result);
            } catch (err) {
                return res.status(500).json({ error: "Parsing Error: " + err.message });
            }
        });
    });

    externalReq.on("error", function (e) {
        return res.status(500).json({ error: "Request Error: " + e.message });
    });

    externalReq.end();
}
