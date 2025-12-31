// Cloudflare Worker for secure video access
// This worker acts as an API layer between the frontend and Supabase

// Configuration
const SUPABASE_URL = 'https://wpjfojsfkcgppprvzwoh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwamZvanNma2NncHBwcnZ6d29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3NTUwNDIsImV4cCI6MjA3MTMzMTA0Mn0.P877Kg2muBOMiqV7YxolL821gNKRo1vrgUPag_tdzwM';
// Note: SUPABASE_SERVICE_KEY should be stored in Worker environment variables for security
// Not hardcoded in the script
const R2_BUCKET_NAME = 'drama-videos';

// Helper function to validate deep link code format
function isValidDeepLinkCode(code) {
    // Deep link codes are 9 characters alphanumeric (based on your Python script)
    const regex = /^[A-Z0-9]{9}$/;
    return regex.test(code);
}

// Function to query Supabase using REST API
async function querySupabase(table, column, value, selectColumns = '*') {
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
    };
    
    // Build query URL with proper encoding
    const queryUrl = `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}&select=${selectColumns}`;
    
    const response = await fetch(queryUrl, {
        method: 'GET',
        headers: headers
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
}

// Function to validate and potentially transform R2 URLs
function validateAndSecureVideoUrl(videoUrl) {
    if (!videoUrl) {
        throw new Error('Video URL is missing');
    }
    
    // Check if the URL is a valid R2 URL
    try {
        const url = new URL(videoUrl);
        
        // List of trusted domains
        const trustedDomains = [
            'r2.dev',
            'pub-c5c15df1eaff4bf38ede1257da3751b1.r2.dev', // Your specific R2 domain
            'cloudflarestream.com'
        ];
        
        // Check if hostname matches any trusted domain
        const isTrusted = trustedDomains.some(domain => 
            url.hostname === domain || url.hostname.endsWith('.' + domain)
        );
        
        if (!isTrusted) {
            throw new Error('Untrusted video URL domain');
        }
        
        // For R2 public URLs, return as is
        // In production, consider generating signed URLs with expiration
        return videoUrl;
        
    } catch (e) {
        throw new Error(`Invalid video URL format: ${e.message}`);
    }
}

// Helper function to create JSON response
function jsonResponse(data, status = 200, additionalHeaders = {}) {
    return new Response(
        JSON.stringify(data),
        {
            status: status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                ...additionalHeaders
            }
        }
    );
}

// Main request handler
export default {
    async fetch(request, env, ctx) {
        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                }
            });
        }

        const url = new URL(request.url);
        
        // API endpoint: /api/video?code=XXXXX
        if (url.pathname === '/api/video') {
            const code = url.searchParams.get('code');
            
            // Validate the deep link code
            if (!code) {
                return jsonResponse(
                    { error: 'Missing deep link code parameter' },
                    400
                );
            }
            
            if (!isValidDeepLinkCode(code)) {
                return jsonResponse(
                    { error: 'Invalid deep link code format' },
                    400
                );
            }

            try {
                // Query the video by deep_link_code
                const results = await querySupabase(
                    'videos',
                    'deep_link_code',
                    code,
                    'title,description,category,video_url,video_id'
                );

                // Check if video was found
                if (!results || results.length === 0) {
                    return jsonResponse(
                        { 
                            error: 'Video not found',
                            message: 'No video exists with this deep link code'
                        },
                        404
                    );
                }

                const videoData = results[0];
                
                // Optional: Check if the video is VIP content
                if (videoData.category === 'vip') {
                    // In production, validate user subscription here
                    // For now, we'll return VIP indicator
                    // You can add authentication logic later
                }

                // Validate and secure the video URL
                let secureVideoUrl;
                try {
                    secureVideoUrl = validateAndSecureVideoUrl(videoData.video_url);
                } catch (urlError) {
                    console.error('URL validation error:', urlError);
                    return jsonResponse(
                        { error: 'Invalid video URL configuration' },
                        500
                    );
                }

                // Return video data
                const response = {
                    success: true,
                    data: {
                        video_id: videoData.video_id,
                        title: videoData.title,
                        description: videoData.description,
                        category: videoData.category,
                        video_url: secureVideoUrl,
                        is_vip: videoData.category === 'vip'
                    }
                };

                return jsonResponse(response, 200);
                
            } catch (error) {
                console.error('Error fetching video:', error);
                return jsonResponse(
                    { 
                        error: 'Internal server error',
                        message: error.message 
                    },
                    500
                );
            }
        }
        
        // Health check endpoint
        if (url.pathname === '/health' || url.pathname === '/') {
            return jsonResponse({
                status: 'ok',
                service: 'Drama Video API',
                timestamp: new Date().toISOString()
            });
        }

        // Return 404 for other routes
        return jsonResponse(
            { error: 'Not Found', message: 'Endpoint not found' },
            404
        );
    }
};
