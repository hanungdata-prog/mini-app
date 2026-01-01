export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    // =========================
    // HELPER
    // =========================
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" }
      });

    const supabase = {
      async query(path) {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
          }
        });
        if (!res.ok) throw new Error("Supabase error");
        return res.json();
      }
    };

    const checkVip = async (userId) => {
      const u = await supabase.query(
        `users?user_id=eq.${userId}&select=vip_status,vip_expired_date`
      );
      if (!u.length) return false;
      if (!u[0].vip_status) return false;
      return new Date(u[0].vip_expired_date) > new Date();
    };

    // =========================
    // API: VIDEO METADATA
    // =========================
    if (url.pathname === "/api/video") {
      const code = url.searchParams.get("code");
      const userId = url.searchParams.get("user_id");

      if (!code) return json({ error: "invalid code" }, 400);

      const videos = await supabase.query(
        `videos?deep_link_code=eq.${code}&select=video_id,title,description,category,thumbnail_url,created_at`
      );

      if (!videos.length) return json({ error: "not found" }, 404);

      const video = videos[0];
      let hasAccess = true;

      if (video.category === "vip") {
        if (!userId) hasAccess = false;
        else hasAccess = await checkVip(userId);
      }

      return json({
        ...video,
        has_access: hasAccess,
        stream_url: hasAccess
          ? `https://mini-app.dramachinaharch.workers.dev/api/video/stream?code=${code}&user_id=${userId || ""}`
          : null
      });
    }

    // =========================
    // API: VIDEO STREAM (AMAN)
    // =========================
if (url.pathname === "/api/video/stream") {
  try {
    const code = url.searchParams.get("code");
    const userId = url.searchParams.get("user_id");

    if (!code) {
      return new Response("Forbidden", {
        status: 403,
        headers: cors
      });
    }

    let videos;
    try {
      videos = await supabase.query(
        `videos?deep_link_code=eq.${code}&select=video_path,category`
      );
    } catch (e) {
      console.error("Supabase query failed:", e);
      return new Response("Metadata error", {
        status: 500,
        headers: cors
      });
    }

    if (!videos || !videos.length) {
      return new Response("Not Found", {
        status: 404,
        headers: cors
      });
    }

    const video = videos[0];

    if (video.category === "vip") {
      if (!userId) {
        return new Response("Unauthorized", {
          status: 401,
          headers: cors
        });
      }

      let ok = false;
      try {
        ok = await checkVip(userId);
      } catch (e) {
        console.error("VIP check failed:", e);
        return new Response("VIP check failed", {
          status: 500,
          headers: cors
        });
      }

      if (!ok) {
        return new Response("Forbidden", {
          status: 403,
          headers: cors
        });
      }
    }

    const rangeHeader = request.headers.get("Range");

    if (!env.R2_BUCKET) {
      console.error("R2_BUCKET binding missing");
      return new Response("Storage not configured", {
        status: 500,
        headers: cors
      });
    }

    const object = await env.R2_BUCKET.get(video.video_path, {
      range: rangeHeader ? parseRange(rangeHeader) : undefined
    });

    if (!object) {
      return new Response("Video not found", {
        status: 404,
        headers: cors
      });
    }

    const headers = new Headers(cors);
    object.writeHttpMetadata(headers);
    headers.set("Accept-Ranges", "bytes");

    if (rangeHeader && object.range) {
      headers.set(
        "Content-Range",
        `bytes ${object.range.offset}-${object.range.end}/${object.size}`
      );

      return new Response(object.body, {
        status: 206,
        headers
      });
    }

    return new Response(object.body, {
      status: 200,
      headers
    });

  } catch (err) {
    // ⛑️ LAST RESORT: never crash Worker
    console.error("Fatal stream error:", err);
    return new Response("Internal Stream Error", {
      status: 500,
      headers: cors
    });
  }
}

    return json({ error: "Not Found" }, 404);
  }
};

// =========================
// RANGE HELPERS
// =========================
function parseRange(range) {
  const [start, end] = range.replace(/bytes=/, "").split("-");
  return {
    offset: Number(start),
    length: end ? Number(end) - Number(start) + 1 : undefined
  };
}
