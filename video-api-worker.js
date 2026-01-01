export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" }
      });

    // =========================
    // API: VIDEO METADATA
    // =========================
    if (url.pathname === "/api/video") {
      try {
        const code = url.searchParams.get("code");

        if (!code) return json({ error: "Missing video code" }, 400);

        // Query Supabase for video metadata
        const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${encodeURIComponent(code)}&select=video_url,title,description,category`;
        
        const response = await fetch(supabaseUrl, {
          method: "GET",
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          return json({ error: "Database error" }, 500);
        }

        const videos = await response.json();

        if (!videos || !videos.length) {
          return json({ error: "Video not found" }, 404);
        }

        const video = videos[0];

        // Check VIP status
        if (video.category === "vip") {
          // For VIP content, return VIP required error
          return json({ 
            error: "VIP required",
            title: video.title,
            description: video.description 
          }, 403);
        }

        // For non-VIP content, generate signed token
        const payload = {
          path: video.video_url,
          exp: Date.now() + 30000 // 30 seconds
        };

        // Sign token
        const data = JSON.stringify(payload);
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(env.STREAM_SECRET),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        
        const signature = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(data)
        );
        
        const token = btoa(data) + "." + btoa(String.fromCharCode(...new Uint8Array(signature)));

        return json({
          title: video.title,
          description: video.description,
          stream_url: `https://mini-app.dramachinaharch.workers.dev/api/video/stream?token=${encodeURIComponent(token)}`
        });

      } catch (error) {
        console.error("Video metadata error:", error);
        return json({ error: "Server error" }, 500);
      }
    }

    // =========================
    // API: VIDEO STREAM
    // =========================
    if (url.pathname === "/api/video/stream") {
      try {
        const token = url.searchParams.get("token");
        
        if (!token) {
          return new Response("Forbidden", { status: 403, headers: cors });
        }

        // Verify token
        const [payloadB64, sigB64] = token.split(".");
        if (!payloadB64 || !sigB64) {
          return new Response("Invalid token", { status: 403, headers: cors });
        }

        const payload = JSON.parse(atob(payloadB64));
        
        if (payload.exp < Date.now()) {
          return new Response("Token expired", { status: 403, headers: cors });
        }

        // Verify signature
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(env.STREAM_SECRET),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        );

        const valid = await crypto.subtle.verify(
          "HMAC",
          key,
          Uint8Array.from(atob(sigB64), c => c.charCodeAt(0)),
          new TextEncoder().encode(JSON.stringify(payload))
        );

        if (!valid) {
          return new Response("Invalid signature", { status: 403, headers: cors });
        }

        // Get video from R2
        const range = request.headers.get("Range");
        const object = await env.R2_BUCKET.get(payload.path, {
          range: range ? parseRange(range) : undefined
        });

        if (!object) {
          return new Response("Video not found", { status: 404, headers: cors });
        }

        const headers = new Headers(cors);
        headers.set("Content-Type", "video/mp4");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "no-store");
        headers.set("X-Content-Type-Options", "nosniff");

        if (range && object.range) {
          headers.set(
            "Content-Range",
            `bytes ${object.range.offset}-${object.range.end}/${object.size}`
          );
          return new Response(object.body, { status: 206, headers });
        }

        return new Response(object.body, { status: 200, headers });

      } catch (error) {
        console.error("Stream error:", error);
        return new Response("Stream error", { status: 500, headers: cors });
      }
    }

    return json({ error: "Not Found" }, 404);
  }
};

function parseRange(range) {
  const m = range.match(/bytes=(\d+)-(\d*)/);
  if (!m) return undefined;

  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : undefined;

  return {
    offset: start,
    length: end ? end - start + 1 : undefined
  };
}
