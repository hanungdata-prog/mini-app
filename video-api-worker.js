// Tambahkan logging untuk debugging
export default {
  async fetch(request, env) {
    console.log(`Request URL: ${request.url}`);
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    
    // ==================== API: GET VIDEO METADATA ====================
    if (url.pathname === "/api/video") {
      try {
        const code = url.searchParams.get("code");
        
        console.log(`API Video called with code: ${code}`);
        
        if (!code || code.trim() === '') {
          console.log('No code provided');
          return jsonResponse({ 
            error: "Video code is required",
            message: "Please provide a valid video code"
          }, 400, corsHeaders);
        }

        // Clean the code
        const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '').trim();
        
        if (cleanCode.length < 3) {
          console.log('Code too short:', cleanCode);
          return jsonResponse({ 
            error: "Invalid video code",
            message: "Video code is too short"
          }, 400, corsHeaders);
        }

        console.log(`Querying database for code: ${cleanCode}`);
        
        // Query Supabase
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${cleanCode}&select=id,video_url,title,description,category,is_active`;
        
        console.log(`Database URL: ${dbUrl}`);
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            "Accept": "application/json"
          }
        });

        console.log(`Database response status: ${dbResponse.status}`);
        
        if (!dbResponse.ok) {
          const errorText = await dbResponse.text();
          console.error(`Database error: ${errorText}`);
          
          return jsonResponse({ 
            error: "Database error",
            message: "Cannot connect to video database"
          }, 500, corsHeaders);
        }

        const videos = await dbResponse.json();
        console.log(`Found ${videos.length} videos`);
        
        if (!videos || videos.length === 0) {
          return jsonResponse({ 
            error: "Video not found",
            message: "No video found with the provided code"
          }, 404, corsHeaders);
        }

        const video = videos[0];
        console.log(`Video found: ${video.title}`);
        
        // Check if video is active
        if (video.is_active === false) {
          return jsonResponse({ 
            error: "Video unavailable",
            message: "This video is currently not available"
          }, 403, corsHeaders);
        }
        
        // Generate streaming URL
        const streamUrl = `https://${url.hostname}/api/stream/${video.id}`;
        
        console.log(`Returning stream URL: ${streamUrl}`);
        
        return jsonResponse({
          success: true,
          title: video.title || "Untitled Video",
          description: video.description || "",
          stream_url: streamUrl,
          debug: {
            video_id: video.id,
            code_received: code,
            code_cleaned: cleanCode
          }
        }, 200, corsHeaders);
        
      } catch (error) {
        console.error("API Error:", error);
        return jsonResponse({ 
          error: "Server error",
          message: "An unexpected error occurred",
          debug: error.message
        }, 500, corsHeaders);
      }
    }

    // ==================== API: STREAM VIDEO ====================
    if (url.pathname.startsWith("/api/stream/")) {
      try {
        const videoId = url.pathname.replace("/api/stream/", "");
        
        console.log(`Stream request for video ID: ${videoId}`);
        
        if (!videoId || isNaN(videoId)) {
          return new Response("Invalid video ID", { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        // Get video path from database
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?id=eq.${videoId}&select=video_url,title`;
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`
          }
        });

        if (!dbResponse.ok) {
          return new Response("Database error", { 
            status: 500, 
            headers: corsHeaders 
          });
        }

        const videos = await dbResponse.json();
        
        if (!videos || videos.length === 0) {
          return new Response("Video not found", { 
            status: 404, 
            headers: corsHeaders 
          });
        }

        const videoPath = videos[0].video_url;
        console.log(`Video path: ${videoPath}`);
        
        // Get from R2
        const range = request.headers.get("Range");
        console.log(`Range header: ${range}`);
        
        const object = await env.R2_BUCKET.get(videoPath, {
          range: range ? parseRange(range) : undefined
        });

        if (!object) {
          console.log(`Video file not found in R2: ${videoPath}`);
          return new Response("Video file not found", { 
            status: 404, 
            headers: corsHeaders 
          });
        }

        console.log(`Video found, size: ${object.size} bytes`);
        
        // Set headers
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", getVideoContentType(videoPath));
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=3600");
        
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
        return new Response("Stream error", { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // Default response
    return new Response("Video Streaming API v1.0", { 
      status: 200, 
      headers: { "Content-Type": "text/plain" } 
    });
  }
};

// Helper functions tetap sama
function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
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
