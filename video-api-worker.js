export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    // =========================
    // HELPERS
    // =========================
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" }
      });

    const supabaseQuery = async (path) => {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
headers: {
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  Accept: "application/json"
}
      });
      if (!res.ok) throw new Error("Supabase error");
      return res.json();
    };

    // =========================
    // TOKEN UTILS
    // =========================
    const signToken = async (payload) => {
      const data = JSON.stringify(payload);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.STREAM_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(data)
      );
      return btoa(data) + "." + btoa(String.fromCharCode(...new Uint8Array(sig)));
    };

    const verifyToken = async (token) => {
      const [payloadB64, sigB64] = token.split(".");
      if (!payloadB64 || !sigB64) return null;

      const payload = JSON.parse(atob(payloadB64));
      if (payload.exp < Date.now()) return null;

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

      return valid ? payload : null;
    };

    // =========================
    // API: VIDEO METADATA
    // =========================
    if (url.pathname === "/api/video") {
      try {
        const code = url.searchParams.get("code");
        const userId = url.searchParams.get("user_id");

        if (!code) return json({ error: "invalid code" }, 400);

        const videos = await supabaseQuery(
          `videos?deep_link_code=eq.${encodeURIComponent(code)}&select=video_path,category,title,description`
        );


        if (!videos.length) return json({ error: "not found" }, 404);

        const video = videos[0];

        if (video.category === "vip") {
          if (!userId) return json({ error: "VIP required" }, 403);

          const users = await supabaseQuery(
            `users?user_id=eq.${encodeURIComponent(userId)}&select=vip_status,vip_expired_date`
          );
          

          if (
            !users.length ||
            !users[0].vip_status ||
            new Date(users[0].vip_expired_date) <= new Date()
          ) {
            return json({ error: "VIP expired" }, 403);
          }
        }

        // 🔐 token 30 detik
        const token = await signToken({
          path: video.video_path,
          exp: Date.now() + 30_000
        });

        return json({
          title: video.title,
          description: video.description,
          stream_url: `https://mini-app.dramachinaharch.workers.dev/api/video/stream?token=${encodeURIComponent(token)}`
        });

      } catch (e) {
        console.error(e);
        return json({ error: "server error" }, 500);
      }
    }

    // =========================
    // API: VIDEO STREAM (NO DB)
    // =========================
    if (url.pathname === "/api/video/stream") {
      try {
        const token = url.searchParams.get("token");
        if (!token) {
          return new Response("Forbidden", { status: 403, headers: cors });
        }

        const payload = await verifyToken(token);
        if (!payload) {
          return new Response("Token invalid/expired", {
            status: 403,
            headers: cors
          });
        }

        const range = request.headers.get("Range");
        const object = await env.R2_BUCKET.get(payload.path, {
          range: range ? parseRange(range) : undefined
        });

        if (!object) {
          return new Response("Not Found", { status: 404, headers: cors });
        }

        const headers = new Headers(cors);
        object.writeHttpMetadata(headers);
        headers.set("Accept-Ranges", "bytes");
        headers.set(
          "Content-Type",
          headers.get("Content-Type") || "video/mp4"
        );

        if (range && object.range) {
          headers.set(
            "Content-Range",
            `bytes ${object.range.offset}-${object.range.end}/${object.size}`
          );
          return new Response(object.body, { status: 206, headers });
        }

        return new Response(object.body, { status: 200, headers });

      } catch (e) {
        console.error("Stream error:", e);
        return new Response("Stream error", { status: 500, headers: cors });
      }
    }

    return json({ error: "Not Found" }, 404);
  }
};

// =========================
// RANGE HELPER
// =========================
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
