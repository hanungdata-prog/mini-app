export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Accept, X-Requested-With, Authorization",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
      "Access-Control-Allow-Credentials": "true"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes"
        }
      });
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
    // LIST R2 OBJECTS (DEBUG)
    // =========================
    if (url.pathname === "/api/r2/list") {
      try {
        const prefix = url.searchParams.get("prefix") || "";
        const list = await env.R2_BUCKET.list({ prefix, limit: 100 });
        
        return json({
          prefix,
          count: list.objects.length,
          truncated: list.truncated,
          objects: list.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded
          }))
        });
      } catch (e) {
        console.error("R2 list error:", e);
        return json({ error: "Failed to list R2 objects", message: e.message }, 500);
      }
    }

    // =========================
    // API: VIDEO METADATA
    // =========================
    if (url.pathname === "/api/video") {
      try {
        const code = url.searchParams.get("code");
        const userId = url.searchParams.get("user_id");

        if (!code) return json({ error: "invalid code" }, 400);

        console.log("Fetching video with code:", code);
        console.log("User ID:", userId);

        const videos = await supabaseQuery(
          `videos?deep_link_code=eq.${encodeURIComponent(code)}&select=*`
        );

        console.log("Videos query result:", videos);

        if (!videos.length) return json({ error: "not found" }, 404);

        const video = videos[0];
        console.log("Selected video:", JSON.stringify(video));

        // Check VIP access
        if (video.category === "vip") {
          if (!userId) return json({ error: "VIP required" }, 403);

          const users = await supabaseQuery(
            `users?user_id=eq.${encodeURIComponent(userId)}&select=vip_status,vip_expired_date`
          );

          console.log("Users query result:", users);

          if (
            !users.length ||
            !users[0].vip_status ||
            new Date(users[0].vip_expired_date) <= new Date()
          ) {
            return json({ error: "VIP expired" }, 403);
          }
        }

        // Use video_url from database
        const pathForToken = video.video_url;

        console.log("Video record from Supabase:", JSON.stringify(video));
        console.log("video_url from database:", pathForToken);

        // Validate path
        if (!pathForToken || typeof pathForToken !== 'string' || pathForToken.trim() === '') {
          console.error("Invalid or missing video_url:", pathForToken);
          return json({ error: "Video URL not configured in database" }, 500);
        }

        // Sign token with longer expiry for Telegram (5 minutes)
        const token = await signToken({
          path: pathForToken,
          exp: Date.now() + 300_000 // 5 minutes
        });

        return json({
          title: video.title,
          description: video.description,
          stream_url: `/api/video/stream?token=${token}`
        });

      } catch (e) {
        console.error("Error in /api/video endpoint:", e);
        return json({ error: "server error", message: e.message }, 500);
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

        const payload = await verifyToken(token);
        if (!payload) {
          return new Response("Token invalid/expired", {
            status: 403,
            headers: cors
          });
        }

        // Validate payload path
        if (!payload.path || typeof payload.path !== 'string') {
          console.error("Invalid payload path:", payload.path);
          return new Response("Invalid path in token", { status: 400, headers: cors });
        }

        const range = request.headers.get("Range");
        console.log("Attempting to access R2 object at path:", payload.path);
        console.log("Range header:", range);

        // Try to get the object
        let object = await env.R2_BUCKET.get(payload.path, {
          range: range ? parseRange(range) : undefined
        });

        // If not found, try to find the file
        if (!object) {
          console.log("Primary path not found, searching for file...");
          
          // List all objects and try to find matching file
          const list = await env.R2_BUCKET.list({ limit: 1000 });
          const fileName = payload.path.split('/').pop();
          
          console.log(`Searching for file: ${fileName}`);
          console.log(`Total objects in bucket: ${list.objects.length}`);
          
          // Try exact match first
          const exactMatch = list.objects.find(obj => obj.key === payload.path);
          if (exactMatch) {
            console.log("Found exact match:", exactMatch.key);
            object = await env.R2_BUCKET.get(exactMatch.key, {
              range: range ? parseRange(range) : undefined
            });
          }
          
          // Try filename match
          if (!object) {
            const filenameMatch = list.objects.find(obj => 
              obj.key.endsWith(`/${fileName}`) || obj.key === fileName
            );
            if (filenameMatch) {
              console.log("Found filename match:", filenameMatch.key);
              object = await env.R2_BUCKET.get(filenameMatch.key, {
                range: range ? parseRange(range) : undefined
              });
            }
          }
          
          // List available files for debugging
          if (!object && list.objects.length > 0) {
            console.log("Available files in R2:");
            list.objects.slice(0, 20).forEach(obj => {
              console.log(`  - ${obj.key}`);
            });
          }
        }

        if (!object) {
          console.log("R2 object not found at any path");
          return new Response("Video not found in storage", { status: 404, headers: cors });
        }

        console.log("Successfully accessed R2 object");
        console.log("Object metadata:", {
          size: object.size,
          uploaded: object.uploaded,
          httpEtag: object.httpEtag,
          contentType: object.httpMetadata?.contentType
        });

        const headers = new Headers(cors);

        // Set content type
        const contentType = object.httpMetadata?.contentType || "video/mp4";
        headers.set("Content-Type", contentType);
        
        // Essential headers for video streaming
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=31536000");
        headers.set("Content-Disposition", "inline");
        
        // Telegram-specific headers
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Cross-Origin-Resource-Policy", "cross-origin");
        headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");
        
        // Set ETag and Last-Modified
        if (object.httpEtag) {
          headers.set("ETag", object.httpEtag);
        }
        if (object.uploaded) {
          headers.set("Last-Modified", new Date(object.uploaded).toUTCString());
        }

if (range) {
  if (!object.range) {
    return new Response("Range Not Satisfiable", { status: 416, headers });
  }

  const { offset, end } = object.range;
  headers.set("Content-Range", `bytes ${offset}-${end}/${object.size}`);
  headers.set("Content-Length", String(end - offset + 1));
  return new Response(object.body, { status: 206, headers });
}


      } catch (e) {
        console.error("Stream error:", e);
        return new Response("Stream error: " + e.message, { status: 500, headers: cors });
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
