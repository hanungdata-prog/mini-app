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

        console.log("Fetching video with code:", code);
        console.log("User ID:", userId);

        const videos = await supabaseQuery(
          `videos?deep_link_code=eq.${encodeURIComponent(code)}&select=category,title,description,deep_link_code`
        );

        console.log("Videos query result:", videos);

        if (!videos.length) return json({ error: "not found" }, 404);

        const video = videos[0];
        console.log("Selected video:", JSON.stringify(video));

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

        // 🔐 token 30 detik
        // Construct the R2 path directly based on the video information
        // This assumes a consistent naming convention in R2
        // Format: drama-folder-name/Bagian_XXX_marked.mp4
        const folderName = video.title.replace(/\s+/g, '_').replace(/[^\w\-\.]/g, '_');

        // Determine the part number from the deep link code or other metadata
        // For now, we'll use a simple approach - in practice you might need to store this in DB
        // or have a more sophisticated way to determine the part
        const partNumber = "001"; // This would need to be determined based on your specific logic

        const pathForToken = `${folderName}/Bagian_${partNumber}_marked.mp4`;

        console.log("Video record from Supabase:", JSON.stringify(video));
        console.log("Constructed R2 path for token:", pathForToken);

        // Ensure pathForToken is valid before creating token
        if (!pathForToken || typeof pathForToken !== 'string' || pathForToken.trim() === '') {
          console.error("Invalid path for token:", pathForToken);
          return json({ error: "Invalid video path configuration" }, 500);
        }

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
        console.error("Error in /api/video endpoint:", e);
        return json({ error: "server error", message: e.message }, 500);
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

        // Validate payload path
        if (!payload.path || typeof payload.path !== 'string') {
          console.error("Invalid payload path:", payload.path);
          return new Response("Invalid path in token", { status: 400, headers: cors });
        }

        const range = request.headers.get("Range");
        // Log the path being accessed for debugging
        console.log("Attempting to access R2 object at path:", payload.path);
        console.log("Request headers:", JSON.stringify([...request.headers]));

        // Try to get the object with the provided path
        let object = await env.R2_BUCKET.get(payload.path, {
          range: range ? parseRange(range) : undefined
        });

        // If not found, try alternative path formats to handle potential inconsistencies
        if (!object) {
          console.log("R2 object not found at primary path:", payload.path);

          // Try different variations of the path
          const pathParts = payload.path.split('/');
          if (pathParts.length >= 2) {
            const fileName = pathParts[pathParts.length - 1];
            const folderName = pathParts.slice(0, -1).join('/');

            // Try with different folder names that might have been stored differently
            const alternativePaths = [
              // Try with common variations
              `${folderName.replace(/ /g, '_')}/${fileName}`,  // Replace spaces with underscores
              `${folderName.replace(/_/g, ' ')}/${fileName}`,  // Replace underscores with spaces
              `${folderName.replace(/ /g, '')}/${fileName}`,   // Remove all spaces
              `${folderName.replace(/_/g, '')}/${fileName}`,   // Remove all underscores
            ];

            for (const altPath of alternativePaths) {
              if (altPath !== payload.path) {
                console.log("Trying alternative path:", altPath);
                object = await env.R2_BUCKET.get(altPath, {
                  range: range ? parseRange(range) : undefined
                });

                if (object) {
                  console.log("Found object at alternative path:", altPath);
                  break;
                }
              }
            }

            // If still not found, try a more comprehensive search by listing objects in the bucket
            if (!object) {
              console.log("Object not found with alternative paths, trying to find by filename...");
              try {
                // First, try to list objects in the main video folder to find the file
                const list = await env.R2_BUCKET.list({ prefix: 'drama-videos/' });
                const matchingObjects = list.objects.filter(obj =>
                  obj.key.endsWith(`/${fileName}`) || obj.key === fileName
                );

                if (matchingObjects.length > 0) {
                  // Use the first matching object
                  const foundPath = matchingObjects[0].key;
                  console.log("Found matching file at path:", foundPath);
                  object = await env.R2_BUCKET.get(foundPath, {
                    range: range ? parseRange(range) : undefined
                  });
                }
              } catch (e) {
                console.error("Error during comprehensive search:", e);
              }
            }
          }
        }

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

        // Additional headers specifically for video streaming compatibility
        headers.set("Content-Disposition", "inline");
        headers.set("X-Permitted-Cross-Domain-Policies", "none");

        // Essential headers for video compatibility
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Transfer-Encoding", "binary");

        // Check if request is coming from Telegram and add specific headers if needed
        const userAgent = request.headers.get('User-Agent') || '';
        if (userAgent.toLowerCase().includes('telegram')) {
          // Additional headers for Telegram compatibility
          headers.set("Connection", "keep-alive");
          headers.set("X-Content-Type-Options", "nosniff");
          // Some Telegram clients might need specific headers
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Timing-Allow-Origin", "*");
          headers.set("X-Frame-Options", "SAMEORIGIN");
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
