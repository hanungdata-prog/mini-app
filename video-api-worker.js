export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Accept, X-Requested-With, User-Agent",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag, Last-Modified"
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
      const url = `${env.SUPABASE_URL}/rest/v1/${path}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }
      });

      const text = await res.text();

      if (!res.ok) {
        console.error("Supabase URL:", url);
        console.error("Supabase status:", res.status);
        console.error("Supabase response:", text);
        throw new Error("Supabase error");
      }

      return JSON.parse(text);
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
          `videos?deep_link_code=eq.${encodeURIComponent(code)}&select=video_url,category,title,description`
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

        // 🔧 FIX: Perpanjang token menjadi 10 menit (600 detik)
        // Untuk video besar, 30 detik terlalu pendek
        const token = await signToken({
          path: video.video_url,
          exp: Date.now() + 600_000  // 10 menit
        });

        // 🔧 FIX: Return ABSOLUTE URL, bukan relative
        const streamUrl = `${url.origin}/api/video/stream?token=${encodeURIComponent(token)}`;

        return json({
          title: video.title,
          description: video.description,
          stream_url: streamUrl
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

        // 🔧 FIX: Parse range request dengan benar
        const rangeHeader = request.headers.get("Range");
        let range = undefined;
        
        if (rangeHeader) {
          range = parseRange(rangeHeader);
        }

        // 🔧 FIX: Fetch dari R2 dengan proper range
        const object = await env.R2_BUCKET.get(payload.path, 
          range ? { range } : undefined
        );

        if (!object) {
          return new Response("Not Found", { status: 404, headers: cors });
        }

        const headers = new Headers(cors);

        // 🔧 FIX: Selalu set Content-Type sebagai video/mp4
        headers.set("Content-Type", "video/mp4");
        
        // 🔧 FIX: Headers penting untuk streaming
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=31536000"); // Cache 1 tahun
        headers.set("X-Content-Type-Options", "nosniff");

        // ETag untuk caching
        if (object.httpEtag) {
          headers.set("ETag", object.httpEtag);
        }

        if (object.uploaded) {
          headers.set("Last-Modified", new Date(object.uploaded).toUTCString());
        }

        // 🔧 FIX: Handle range request dengan benar
        if (range && object.range) {
          const { offset, end } = object.range;
          headers.set("Content-Length", (end - offset + 1).toString());
          headers.set("Content-Range", `bytes ${offset}-${end}/${object.size}`);
          
          return new Response(object.body, { 
            status: 206,  // Partial Content
            headers 
          });
        }

        // Full content
        headers.set("Content-Length", object.size.toString());
        return new Response(object.body, { 
          status: 200, 
          headers 
        });

      } catch (e) {
        console.error("Stream error:", e);
        return new Response("Stream error", { status: 500, headers: cors });
      }
    }

    return json({ error: "Not Found" }, 404);
  }
};

// =========================
// RANGE HELPER (IMPROVED)
// =========================
function parseRange(rangeHeader) {
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return undefined;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : undefined;

  return {
    offset: start,
    length: end !== undefined ? (end - start + 1) : undefined
  };
}
