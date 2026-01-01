export default {
  async fetch(request, env) {
    console.log('🚀 Worker called:', request.url);
    
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
        console.log('🎯 API Video called with code:', code);
        
        if (!code || code.trim() === '') {
          return jsonResponse({ 
            error: "Video code is required",
            message: "Please provide a valid video code"
          }, 400, corsHeaders);
        }

        // Clean the code
        const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '').trim();
        console.log('🧹 Cleaned code:', cleanCode);
        
        if (cleanCode.length < 3) {
          return jsonResponse({ 
            error: "Invalid video code",
            message: "Video code is too short"
          }, 400, corsHeaders);
        }

        // Query Supabase
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${cleanCode}&select=id,video_url,title,description,category,is_active`;
        
        console.log('📡 Querying Supabase:', dbUrl);
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
            "Accept": "application/json"
          }
        });

        console.log('📊 Database response status:', dbResponse.status);
        
        if (!dbResponse.ok) {
          const errorText = await dbResponse.text();
          console.error('❌ Database error response:', errorText);
          
          return jsonResponse({ 
            error: "Database error",
            message: "Cannot fetch video data"
          }, 500, corsHeaders);
        }

        const videos = await dbResponse.json();
        console.log('📊 Videos found:', videos.length);
        
        if (!videos || videos.length === 0) {
          return jsonResponse({ 
            error: "Video not found",
            message: "No video found with the provided code"
          }, 404, corsHeaders);
        }

        const video = videos[0];
        console.log('✅ Video found:', { 
          id: video.id, 
          title: video.title
        });
        
        // Check if video is active
        if (video.is_active === false) {
          return jsonResponse({ 
            error: "Video unavailable",
            message: "This video is currently not available"
          }, 403, corsHeaders);
        }
        
        // Check VIP status
        if (video.category === "vip") {
          return jsonResponse({ 
            error: "VIP required",
            message: "This video is for VIP members only",
            title: video.title,
            description: video.description
          }, 403, corsHeaders);
        }
        
        // Generate streaming URL
        const streamUrl = `https://${url.hostname}/api/stream/${encodeURIComponent(video.video_url)}`;
        
        console.log('🔗 Generated stream URL:', streamUrl);
        
        return jsonResponse({
          success: true,
          title: video.title || "Untitled Video",
          description: video.description || "",
          stream_url: streamUrl
        }, 200, corsHeaders);
        
      } catch (error) {
        console.error("❌ API Error:", error);
        
        return jsonResponse({ 
          error: "Server error",
          message: "An unexpected error occurred"
        }, 500, corsHeaders);
      }
    }

    // ==================== API: STREAM VIDEO (DIRECT PATH) ====================
    if (url.pathname.startsWith("/api/stream/")) {
      try {
        // Get video path from URL (not ID)
        const videoPath = decodeURIComponent(url.pathname.replace("/api/stream/", ""));
        console.log('🎬 Stream request for video path:', videoPath);
        
        if (!videoPath) {
          return new Response("Video path required", { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        // Get from R2 directly using path
        const object = await env.R2_BUCKET.get(videoPath);
        
        if (!object) {
          console.log('❌ Video not found in R2:', videoPath);
          return new Response("Video file not found", { 
            status: 404, 
            headers: corsHeaders 
          });
        }

        console.log('✅ Video found in R2, size:', object.size, 'bytes');
        
        // Stream video
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", getVideoContentType(videoPath));
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=3600");
        
        return new Response(object.body, { 
          status: 200, 
          headers 
        });
        
      } catch (error) {
        console.error("❌ Stream Error:", error);
        return new Response("Stream error", { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // ==================== FALLBACK: TEST VIDEO ====================
    if (url.pathname === "/api/test") {
      return jsonResponse({
        success: true,
        title: "Test Video (Public)",
        description: "This is a public test video",
        stream_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
      }, 200, corsHeaders);
    }

    // Default response
    return jsonResponse({ 
      message: "Video Streaming API v2.0",
      endpoints: {
        get_video: "/api/video?code=VIDEO_CODE",
        test: "/api/test",
        stream: "/api/stream/VIDEO_PATH"
      },
      status: "online",
      time: new Date().toISOString()
    }, 200, corsHeaders);
  }
};

// Helper function
function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}

function getVideoContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'ogg': return 'video/ogg';
    case 'mov': return 'video/quicktime';
    default: return 'video/mp4';
  }
}
