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
          ? `/api/video/stream?code=${code}&user_id=${userId || ""}`
          : null
      });
    }

    // =========================
    // API: VIDEO STREAM (AMAN)
    // =========================
    if (url.pathname === "/api/video/stream") {
      const code = url.searchParams.get("code");
      const userId = url.searchParams.get("user_id");

      if (!code) return new Response("Forbidden", { status: 403 });

      // ambil path video
      const videos = await supabase.query(
        `videos?deep_link_code=eq.${code}&select=video_path,category`
      );

      if (!videos.length)
        return new Response("Not Found", { status: 404 });

      const video = videos[0];

      // cek VIP ulang
      if (video.category === "vip") {
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const ok = await checkVip(userId);
        if (!ok) return new Response("Forbidden", { status: 403 });
      }

      // ambil object dari R2 (PRIVATE)
      const range = request.headers.get("Range");
      const object = await env.R2_BUCKET.get(video.video_path, {
        range: range ? parseRange(range) : undefined
      });

      if (!object) return new Response("Not Found", { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Accept-Ranges", "bytes");

      if (range) {
        headers.set(
          "Content-Range",
          `bytes ${object.range.offset}-${object.range.end}/${object.size}`
        );
      
        return new Response(object.body, {
          status: 206,
          headers
        });
      }      

      return new Response(object.body, { headers });
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
