export default {
  async fetch(request, env) {
    console.log('=== WORKER START ===');
    console.log('Request URL:', request.url);
    console.log('SUPABASE_URL:', env.SUPABASE_URL);
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, Authorization",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    
    // ==================== API: GET VIDEO METADATA ====================
    if (url.pathname === "/api/video") {
      try {
        const code = url.searchParams.get("code");
        console.log('API Video called with code:', code);
        
        if (!code || code.trim() === '') {
          return jsonResponse({ 
            error: "Video code is required",
            message: "Please provide a valid video code"
          }, 400, corsHeaders);
        }

        // Clean the code
        const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '').trim();
        console.log('Cleaned code:', cleanCode);
        
        if (cleanCode.length < 3) {
          return jsonResponse({ 
            error: "Invalid video code",
            message: "Video code is too short"
          }, 400, corsHeaders);
        }

        // Query Supabase dengan Anon Key
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${cleanCode}&select=id,video_url,title,description,category,is_active`;
        
        console.log('Querying database:', dbUrl);
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
          }
        });

        console.log('Database response status:', dbResponse.status);
        
        if (!dbResponse.ok) {
          const errorText = await dbResponse.text();
          console.error('Database error response:', errorText);
          
          return jsonResponse({ 
            error: "Database error",
            message: "Cannot fetch video data",
            debug: {
              status: dbResponse.status,
              statusText: dbResponse.statusText
            }
          }, 500, corsHeaders);
        }

        const videos = await dbResponse.json();
        console.log('Videos found:', videos.length);
        console.log('Videos data:', JSON.stringify(videos, null, 2));
        
        if (!videos || videos.length === 0) {
          return jsonResponse({ 
            error: "Video not found",
            message: "No video found with the provided code"
          }, 404, corsHeaders);
        }

        const video = videos[0];
        console.log('Video found:', video);
        
        // Check if video is active
        if (video.is_active === false) {
          return jsonResponse({ 
            error: "Video unavailable",
            message: "This video is currently not available"
          }, 403, corsHeaders);
        }
        
        // Generate streaming URL (simple version)
        const streamUrl = `https://${url.hostname}/api/stream/${video.id}`;
        
        return jsonResponse({
          success: true,
          title: video.title || "Untitled Video",
          description: video.description || "",
          stream_url: streamUrl
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
        console.log('Stream request for video ID:', videoId);
        
        // Get video path from database
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?id=eq.${videoId}&select=video_url`;
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`
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
        console.log('Video path from DB:', videoPath);
        
        // Get from R2
        const object = await env.R2_BUCKET.get(videoPath);
        
        if (!object) {
          console.log('Video not found in R2:', videoPath);
          return new Response("Video file not found", { 
            status: 404, 
            headers: corsHeaders 
          });
        }

        // Stream video
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", "video/mp4");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=3600");
        
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
    return jsonResponse({ 
      message: "Video Streaming API",
      endpoints: {
        get_video: "/api/video?code=VIDEO_CODE",
        stream: "/api/stream/VIDEO_ID"
      }
    }, 200, corsHeaders);
  }
};

// Helper function
function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}
