export default {
  async fetch(request, env) {
    console.log('🚀 Worker called');
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range, apikey, Authorization",
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

        const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '').trim();
        
        if (cleanCode.length < 3) {
          return jsonResponse({ 
            error: "Invalid video code",
            message: "Video code is too short"
          }, 400, corsHeaders);
        }

        // VERIFY: Cek environment variables
        console.log('🔧 Env check - SUPABASE_URL:', env.SUPABASE_URL ? 'SET' : 'NOT SET');
        console.log('🔧 Env check - SUPABASE_ANON_KEY:', env.SUPABASE_ANON_KEY ? 'SET (first 20): ' + env.SUPABASE_ANON_KEY.substring(0, 20) + '...' : 'NOT SET');
        
        if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
          console.error('❌ Missing Supabase credentials');
          return jsonResponse({ 
            error: "Configuration error",
            message: "Server credentials missing"
          }, 500, corsHeaders);
        }

        // Query Supabase dengan headers yang benar
        const dbUrl = `${env.SUPABASE_URL}/rest/v1/videos?deep_link_code=eq.${cleanCode}&select=*`;
        
        console.log('📡 Querying Supabase:', dbUrl);
        console.log('🔑 Using API Key:', env.SUPABASE_ANON_KEY.substring(0, 10) + '...');
        
        const dbResponse = await fetch(dbUrl, {
          headers: {
            "apikey": env.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
          }
        });

        console.log('📊 Database response status:', dbResponse.status);
        console.log('📊 Database response headers:', Object.fromEntries(dbResponse.headers.entries()));
        
        if (!dbResponse.ok) {
          const errorText = await dbResponse.text();
          console.error('❌ Database error:', errorText);
          
          // Test connection tanpa filter
          const testUrl = `${env.SUPABASE_URL}/rest/v1/videos?select=count`;
          console.log('🧪 Testing connection to:', testUrl);
          
          try {
            const testResponse = await fetch(testUrl, {
              headers: {
                "apikey": env.SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`
              }
            });
            console.log('🧪 Test connection status:', testResponse.status);
            console.log('🧪 Test response:', await testResponse.text());
          } catch (testError) {
            console.error('🧪 Test failed:', testError);
          }
          
          return jsonResponse({ 
            error: "Database error",
            message: "Cannot fetch video data",
            debug: {
              status: dbResponse.status,
              error: errorText.substring(0, 200)
            }
          }, 500, corsHeaders);
        }

        const videos = await dbResponse.json();
        console.log('📊 Videos found:', videos.length);
        console.log('📊 Videos data:', JSON.stringify(videos, null, 2));
        
        if (!videos || videos.length === 0) {
          return jsonResponse({ 
            error: "Video not found",
            message: "No video found with code: " + cleanCode
          }, 404, corsHeaders);
        }

        const video = videos[0];
        console.log('✅ Video found:', video);
        
        // Generate streaming URL
        const streamUrl = `https://${url.hostname}/api/stream/${encodeURIComponent(video.video_url)}`;
        
        return jsonResponse({
          success: true,
          title: video.title || "Video",
          description: video.description || "",
          stream_url: streamUrl
        }, 200, corsHeaders);
        
      } catch (error) {
        console.error("❌ API Error:", error);
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
        const videoPath = decodeURIComponent(url.pathname.replace("/api/stream/", ""));
        
        if (!env.R2_BUCKET) {
          return new Response("Storage not configured", { 
            status: 500, 
            headers: corsHeaders 
          });
        }
        
        const object = await env.R2_BUCKET.get(videoPath);
        
        if (!object) {
          // Fallback to public video
          console.log('Video not in R2, using public fallback');
          const fallbackUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
          return Response.redirect(fallbackUrl, 302);
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
        console.error("❌ Stream Error:", error);
        return new Response("Stream error", { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // ==================== TEST ENDPOINT ====================
    if (url.pathname === "/api/test") {
      // Bypass database, langsung return test video
      return jsonResponse({
        success: true,
        title: "Test Video (No DB)",
        description: "Testing without database",
        stream_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
      }, 200, corsHeaders);
    }

    // Health check
    return jsonResponse({ 
      message: "Video Streaming API",
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
