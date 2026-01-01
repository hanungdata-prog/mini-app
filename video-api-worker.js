export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Accept, X-Requested-With",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type"
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
          `videos?deep_link_code=eq.${encodeURIComponent(code)}&select=video_url,file_id,category,title,description`
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
        // Use file_id if available, otherwise fall back to video_url
        // file_id should contain the R2 object path, while video_url is the public URL
        const r2Path = video.file_id || video.video_url;

        console.log("Video record from Supabase:", JSON.stringify(video));
        console.log("R2 path from database:", r2Path);

        // Extract the R2 object path from the public URL if needed
        // If video_url is a public URL, extract the path part after the domain
        let pathForToken = r2Path;
        if (r2Path.startsWith('http')) {
          // Extract path from URL - remove the base URL part to get just the R2 object key
          try {
            const urlObj = new URL(r2Path);
            pathForToken = urlObj.pathname.substring(1); // Remove leading slash
            console.log("Extracted path from URL:", pathForToken);
          } catch (e) {
            console.error("Error parsing video URL:", r2Path, e);
            // Fallback to original r2Path if parsing fails
            pathForToken = r2Path;
          }
        }

        console.log("Final path for token:", pathForToken);
        const token = await signToken({
          path: pathForToken,
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
        // Log the path being accessed for debugging
        console.log("Attempting to access R2 object at path:", payload.path);
        console.log("Request headers:", JSON.stringify([...request.headers]));

        const object = await env.R2_BUCKET.get(payload.path, {
          range: range ? parseRange(range) : undefined
        });

        if (!object) {
          console.log("R2 object not found at path:", payload.path);
          // List some objects in the bucket to help debug
          try {
            const list = await env.R2_BUCKET.list({ prefix: payload.path.split('/')[0] + '/' });
            console.log("Objects in the same folder:", list.objects.map(obj => obj.key));
          } catch (e) {
            console.log("Could not list objects in bucket:", e);
          }
          return new Response("Not Found", { status: 404, headers: cors });
        }

        console.log("Successfully accessed R2 object at path:", payload.path);
        console.log("Object metadata:", {
          size: object.size,
          uploaded: object.uploaded,
          httpEtag: object.httpEtag,
          httpMetadata: object.httpMetadata
        });

        const headers = new Headers(cors);

        // Use the content type from R2 object if available, otherwise default to video/mp4
        const contentType = object.httpMetadata?.contentType || "video/mp4";
        headers.set("Content-Type", contentType);

        // Also set other useful metadata from R2 object
        if (object.httpMetadata?.contentDisposition) {
          headers.set("Content-Disposition", object.httpMetadata.contentDisposition);
        }
        if (object.httpMetadata?.cacheControl) {
          headers.set("Cache-Control", object.httpMetadata.cacheControl);
        } else {
          headers.set("Cache-Control", "no-store");
        }
        if (object.httpMetadata?.contentEncoding) {
          headers.set("Content-Encoding", object.httpMetadata.contentEncoding);
        }
        if (object.httpMetadata?.contentLanguage) {
          headers.set("Content-Language", object.httpMetadata.contentLanguage);
        }

        // Add Content-Length header for accurate file size
        if (object.size) {
          headers.set("Content-Length", object.size.toString());
        }

        // Additional headers for better compatibility with Telegram and other platforms
        headers.set("Accept-Ranges", "bytes");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("X-Frame-Options", "SAMEORIGIN");
        headers.set("X-XSS-Protection", "1; mode=block");

        // Preserve all important metadata from R2 object
        if (object.httpEtag) {
          headers.set("ETag", object.httpEtag);
        }
        if (object.uploaded) {
          headers.set("Last-Modified", new Date(object.uploaded).toUTCString());
        }

        // Check if request is coming from Telegram and add specific headers if needed
        const userAgent = request.headers.get('User-Agent') || '';
        if (userAgent.toLowerCase().includes('telegram')) {
          // Additional headers for Telegram compatibility
          headers.set("Connection", "keep-alive");
        }

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
