export default {
  async fetch(request, env) {
    console.log('🚀 Worker started');
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
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
        console.log('🎯 Request for code:', code);
        
        if (!code || code.trim() === '') {
          return jsonResponse({ 
            error: "Video code is required"
          }, 400, corsHeaders);
        }

        const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '').trim();
        
        if (cleanCode.length < 3) {
          return jsonResponse({ 
            error: "Invalid video code"
          }, 400, corsHeaders);
        }

        // VERIFY credentials
        console.log('🔑 Using Supabase URL:', env.SUPABASE_URL);
        console.log('🔑 API Key starts with:', env.SUPABASE_ANON_KEY?.substring(0, 20) + '...');
        
        if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
          console.error('❌ Missing credentials');
          return jsonResponse({ 
            error: "Server configuration error"
          }, 500, corsHeaders);
        }

        // Query Supabase - PERBAIKAN: Gunakan header yang benar
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${cleanCode}`;
        
        console.log('📡 Querying:', dbUrl);
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
            "Accept": "application/json"
          }
        });

        console.log('📊 Response status:', dbResponse.status);
        
        if (!dbResponse.ok) {
          let errorText = await dbResponse.text();
          console.error('❌ Database error:', errorText);
          
          // Coba test connection
          try {
            const testUrl = `${env.SUPABASE_URL}/rest/v1/videos?select=count`;
            const testResp = await fetch(testUrl, {
              headers: {
                "apikey": env.SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`
              }
            });
            console.log('🧪 Test connection status:', testResp.status);
          } catch (e) {
            console.error('🧪 Test failed:', e.message);
          }
          
          return jsonResponse({ 
            error: "Database error",
            debug: `Status: ${dbResponse.status}`
          }, 500, corsHeaders);
        }

        const videos = await dbResponse.json();
        console.log('📊 Found videos:', videos.length);
        
        if (!videos || videos.length === 0) {
          return jsonResponse({ 
            error: "Video not found",
            message: `No video with code: ${cleanCode}`
          }, 404, corsHeaders);
        }

        const video = videos[0];
        console.log('✅ Video data:', {
          id: video.id,
          title: video.title,
          video_url: video.video_url
        });
        
        // Generate streaming URL
        const streamUrl = `https://${url.hostname}/api/stream/${encodeURIComponent(video.video_url)}`;
        
        return jsonResponse({
          success: true,
          title: video.title || "Video",
          description: video.description || "",
          stream_url: streamUrl
        }, 200, corsHeaders);
        
      } catch (error) {
        console.error("❌ Unexpected error:", error);
        return jsonResponse({ 
          error: "Server error",
          message: error.message
        }, 500, corsHeaders);
      }
    }

    // ==================== API: STREAM VIDEO ====================
    if (url.pathname.startsWith("/api/stream/")) {
      try {
        const videoPath = decodeURIComponent(url.pathname.replace("/api/stream/", ""));
        console.log('🎬 Streaming:', videoPath);
        
        if (!env.R2_BUCKET) {
          return new Response("Storage not available", { 
            status: 500, 
            headers: corsHeaders 
          });
        }
        
        const object = await env.R2_BUCKET.get(videoPath);
        
        if (!object) {
          console.log('❌ Video not in R2:', videoPath);
          // Fallback to public video
          const publicUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
          return Response.redirect(publicUrl, 302);
        }
        
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", "video/mp4");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=3600");
        
        return new Response(object.body, { 
          status: 200, 
          headers 
        });
        
      } catch (error) {
        console.error("❌ Stream error:", error);
        return new Response("Stream error", { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // ==================== TEST ENDPOINT ====================
    if (url.pathname === "/api/test") {
      console.log('🧪 Test endpoint called');
      return jsonResponse({
        success: true,
        title: "Test Video",
        description: "This is a test video",
        stream_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
      }, 200, corsHeaders);
    }

    // Health check
    return jsonResponse({ 
      service: "Video Streaming API",
      status: "online",
      time: new Date().toISOString(),
      endpoints: {
        get_video: "/api/video?code=VIDEO_CODE",
        test: "/api/test"
      }
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
