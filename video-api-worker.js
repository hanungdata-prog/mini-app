export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ==================== API: GET VIDEO METADATA ====================
    if (url.pathname === "/api/video") {
      const code = url.searchParams.get("code");
      
      if (!code) {
        return jsonResponse({ error: "Video code required" }, 400, corsHeaders);
      }

      try {
        // 1. Validasi format code
        const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
        
        // 2. Query database
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${cleanCode}&select=id,video_url,title,description,category,is_active`;
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`
          }
        });

        const videos = await dbResponse.json();
        
        if (!videos || videos.length === 0) {
          return jsonResponse({ error: "Video not found" }, 404, corsHeaders);
        }

        const video = videos[0];
        
        // 3. Check if video is active
        if (video.is_active === false) {
          return jsonResponse({ error: "Video is not available" }, 403, corsHeaders);
        }
        
        // 4. Generate signed URL (valid 1 hour)
        const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const signature = await generateSignature(
          `${video.id}-${expires}`,
          env.STREAM_SECRET
        );
        
        // 5. Return stream URL with signature
        const streamUrl = `https://${url.hostname}/api/stream/${video.id}?exp=${expires}&sig=${signature}`;
        
        return jsonResponse({
          title: video.title,
          description: video.description,
          stream_url: streamUrl
        }, 200, corsHeaders);
        
      } catch (error) {
        console.error("API Error:", error);
        return jsonResponse({ error: "Server error" }, 500, corsHeaders);
      }
    }

    // ==================== API: STREAM VIDEO ====================
    if (url.pathname.startsWith("/api/stream/")) {
      try {
        const videoId = url.pathname.replace("/api/stream/", "");
        const expires = url.searchParams.get("exp");
        const signature = url.searchParams.get("sig");
        
        // 1. Validate signature
        if (!videoId || !expires || !signature) {
          return new Response("Invalid request", { status: 400 });
        }
        
        const expectedSig = await generateSignature(
          `${videoId}-${expires}`,
          env.STREAM_SECRET
        );
        
        if (signature !== expectedSig) {
          return new Response("Invalid signature", { status: 403 });
        }
        
        // 2. Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (parseInt(expires) < now) {
          return new Response("URL expired", { status: 403 });
        }
        
        // 3. Get video path from database
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?id=eq.${videoId}&select=video_url`;
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`
          }
        });

        const videos = await dbResponse.json();
        
        if (!videos || videos.length === 0) {
          return new Response("Video not found", { status: 404 });
        }

        const videoPath = videos[0].video_url;
        
        // 4. Get video from R2 (private bucket)
        const range = request.headers.get("Range");
        const object = await env.R2_BUCKET.get(videoPath, {
          range: range ? parseRange(range) : undefined
        });

        if (!object) {
          return new Response("Video file not found", { status: 404 });
        }

        // 5. Stream video with proper headers
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", getVideoContentType(videoPath));
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "private, max-age=3600"); // Cache 1 hour
        
        // Optional: Add download prevention
        headers.set("X-Content-Type-Options", "nosniff");
        
        if (range && object.range) {
          headers.set("Content-Range", 
            `bytes ${object.range.offset}-${object.range.end}/${object.size}`
          );
          return new Response(object.body, { 
            status: 206, 
            headers 
          });
        }

        headers.set("Content-Length", object.size);
        return new Response(object.body, { 
          status: 200, 
          headers 
        });
        
      } catch (error) {
        console.error("Stream Error:", error);
        return new Response("Stream error", { status: 500, headers: corsHeaders });
      }
    }

    // Default response
    return new Response("Video Streaming API", { status: 200 });
  }
};

// ==================== HELPER FUNCTIONS ====================

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}

async function generateSignature(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );
  
  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseRange(range) {
  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) return undefined;
  
  const start = parseInt(match[1]);
  const end = match[2] ? parseInt(match[2]) : undefined;
  
  return {
    offset: start,
    length: end ? end - start + 1 : undefined
  };
}

function getVideoContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'ogg': return 'video/ogg';
    case 'mov': return 'video/quicktime';
    case 'm3u8': return 'application/x-mpegURL';
    default: return 'video/mp4';
  }
}
