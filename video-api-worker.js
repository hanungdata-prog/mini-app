export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Accept, X-Requested-With, Authorization",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
      "Access-Control-Allow-Credentials": "true"
    };

    // =========================
    // PREFLIGHT & HEAD
    // =========================
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

    // =========================
    // BASE64URL UTILS (ANTI ERROR)
    // =========================
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

    // =========================
    // TOKEN UTILS (FIXED)
    // =========================
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

    // =========================
    // API: VIDEO METADATA
    // =========================
    if (url.pathname === "/api/video") {
      try {
        const code = url.searchParams.get("code");
        if (!code) return json({ error: "invalid code" }, 400);

        // === AMBIL VIDEO DARI DATABASE (SINGKATKAN) ===
        // video.video_url HARUS path R2 (contoh: videos/film1.mp4)
        const video = {
          title: "Sample Video",
          description: "Streaming test",
          video_url: "videos/sample.mp4"
        };

        const token = await signToken({
          path: video.video_url,
          exp: Date.now() + 5 * 60 * 1000 // 5 menit
        });

        return json({
          title: video.title,
          description: video.description,
          stream_url: `/api/video/stream?token=${token}` // ⬅️ TANPA encodeURIComponent
        });

      } catch (e) {
        console.error(e);
        return json({ error: "server error" }, 500);
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
        if (!payload || !payload.path) {
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
        headers.set("Content-Type", object.httpMetadata?.contentType || "video/mp4");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Disposition", "inline");
        headers.set("Cache-Control", "public, max-age=3600");
        headers.set("X-Content-Type-Options", "nosniff");

        // === RANGE RESPONSE (WAJIB 206) ===
        if (range) {
          if (!object.range) {
            return new Response("Range Not Satisfiable", { status: 416, headers });
          }

          const { offset, end } = object.range;
          headers.set(
            "Content-Range",
            `bytes ${offset}-${end}/${object.size}`
          );
          headers.set("Content-Length", String(end - offset + 1));

          return new Response(object.body, { status: 206, headers });
        }

        // === FULL RESPONSE ===
        headers.set("Content-Length", String(object.size));
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
