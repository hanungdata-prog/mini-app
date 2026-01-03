export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Accept, X-Requested-With, Authorization",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
      "Access-Control-Allow-Credentials": "true"
    };

    // PREFLIGHT & HEAD
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

    // HELPERS
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" }
      });

    // BASE64URL UTILS
    const base64urlEncode = (uint8) =>
      btoa(String.fromCharCode(...uint8))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const base64urlDecode = (str) => {
      str = str.replace(/-/g, "+").replace(/_/g, "/");
      while (str.length % 4) str += "=";
      return Uint8Array.from(atob(str), c => c.charCodeAt(0));
    };

    // TOKEN UTILS
    const signToken = async (payload) => {
      const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.STREAM_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const sig = await crypto.subtle.sign("HMAC", key, payloadBytes);

      return (
        base64urlEncode(payloadBytes) +
        "." +
        base64urlEncode(new Uint8Array(sig))
      );
    };

    const verifyToken = async (token) => {
      const parts = token.split(".");
      if (parts.length !== 2) return null;

      let payload;
      try {
        payload = JSON.parse(
          new TextDecoder().decode(base64urlDecode(parts[0]))
        );
      } catch {
        return null;
      }

      if (!payload.exp || payload.exp < Date.now()) return null;

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
        base64urlDecode(parts[1]),
        new TextEncoder().encode(JSON.stringify(payload))
      );

      return valid ? payload : null;
    };

    // SUPABASE HELPER
    const querySupabase = async (code) => {
      try {
        const response = await fetch(
          `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${code}&select=*`,
          {
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          console.error('Supabase error:', response.status, await response.text());
          return null;
        }

        const data = await response.json();
        return data && data.length > 0 ? data[0] : null;
      } catch (e) {
        console.error('Supabase query error:', e);
        return null;
      }
    };

    // =========================
    // API: VIDEO METADATA
    // =========================
    if (url.pathname === "/api/video") {
      try {
        const code = url.searchParams.get("code");
        if (!code) {
          return json({ error: "Missing video code" }, 400);
        }

        console.log('Fetching video with code:', code);

        // Query database untuk mendapatkan video berdasarkan deep_link_code
        const video = await querySupabase(code);

        if (!video) {
          console.error('Video not found for code:', code);
          return json({ 
            error: "Video not found",
            message: "Video dengan code tersebut tidak ditemukan di database"
          }, 404);
        }

        console.log('Video found:', {
          id: video.video_id,
          title: video.title,
          path: video.video_url
        });

        // Validasi video_url ada
        if (!video.video_url) {
          console.error('Video URL is empty for code:', code);
          return json({ 
            error: "Invalid video data",
            message: "Video tidak memiliki URL yang valid"
          }, 500);
        }

        // Generate token untuk streaming
        const token = await signToken({
          path: video.video_url,
          video_id: video.video_id,
          exp: Date.now() + 60 * 60 * 1000 // 1 jam
        });

        return json({
          title: video.title || "Untitled Video",
          description: video.description || "",
          video_id: video.video_id,
          stream_url: `/api/video/stream?token=${token}`,
          thumbnail_url: video.thumbnail_url,
          category: video.category,
          access: {
            has_access: true
          }
        });

      } catch (e) {
        console.error('API error:', e);
        return json({ 
          error: "Server error",
          message: e.message 
        }, 500);
      }
    }

    // =========================
    // API: VIDEO STREAM
    // =========================
    if (url.pathname === "/api/video/stream") {
      try {
        const token = url.searchParams.get("token");
        if (!token) {
          console.error('Missing token');
          return new Response("Forbidden: Missing token", { 
            status: 403, 
            headers: cors 
          });
        }

        const payload = await verifyToken(token);
        if (!payload || !payload.path) {
          console.error('Invalid token or missing path');
          return new Response("Token invalid or expired", {
            status: 403,
            headers: cors
          });
        }

        console.log('Streaming from R2 path:', payload.path);

        const range = request.headers.get("Range");

        // Fetch dari R2
        let object = await env.R2_BUCKET.get(payload.path, {
          range: range ? parseRange(range) : undefined
        });

        // Jika tidak ketemu, coba path alternatif
        if (!object) {
          console.error('Object not found in R2:', payload.path);
          
          // Coba dengan underscore jika gagal (Bagian_001 -> Bagian001)
          const altPath = payload.path.replace(/Bagian_(\d+)/g, 'Bagian$1');
          console.log('Trying alternative path:', altPath);
          
          object = await env.R2_BUCKET.get(altPath, {
            range: range ? parseRange(range) : undefined
          });
          
          if (!object) {
            return new Response("Video file not found in storage", { 
              status: 404, 
              headers: cors 
            });
          }
        }

        console.log('R2 object found, size:', object.size);

        const headers = new Headers(cors);
        headers.set("Content-Type", object.httpMetadata?.contentType || "video/mp4");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Disposition", "inline");
        headers.set("Cache-Control", "public, max-age=3600");
        headers.set("X-Content-Type-Options", "nosniff");

        // RANGE RESPONSE (206)
        if (range) {
          if (!object.range) {
            return new Response("Range Not Satisfiable", { 
              status: 416, 
              headers 
            });
          }

          const { offset, end } = object.range;
          headers.set(
            "Content-Range",
            `bytes ${offset}-${end}/${object.size}`
          );
          headers.set("Content-Length", String(end - offset + 1));

          return new Response(object.body, { status: 206, headers });
        }

        // FULL RESPONSE (200)
        headers.set("Content-Length", String(object.size));
        return new Response(object.body, { status: 200, headers });

      } catch (e) {
        console.error("Stream error:", e);
        return new Response(`Stream error: ${e.message}`, { 
          status: 500, 
          headers: cors 
        });
      }
    }

    // Fallback 404 dengan info path
    console.log('404 - Path not found:', url.pathname);
    return json({ 
      error: "Not Found",
      path: url.pathname,
      available_endpoints: [
        "/api/video?code=<CODE>",
        "/api/video/stream?token=<TOKEN>"
      ]
    }, 404);
  }
};

// RANGE HELPER
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
