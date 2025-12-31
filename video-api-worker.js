// Cloudflare Worker for secure video access
// This worker acts as an API layer between the frontend and Supabase

// Configuration
const SUPABASE_URL = 'https://wpjfojsfkcgppprvzwoh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwamZvanNma2NncHBwcnZ6d29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3NTUwNDIsImV4cCI6MjA3MTMzMTA0Mn0.P877Kg2muBOMiqV7YxolL821gNKRo1vrgUPag_tdzwM
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwamZvanNma2NncHBwcnZ6d29oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTc1NTA0MiwiZXhwIjoyMDcxMzMxMDQyfQ.rIJPgs_yIsjXZzeVyHbe6N2nk2MLDc5wJO1UumKVGwE';
const R2_BUCKET_NAME = 'drama-videos';

// Helper function to validate deep link code format
function isValidDeepLinkCode(code) {
    // Deep link codes are typically alphanumeric, 6-10 characters
    const regex = /^[a-zA-Z0-9]{6,10}$/;
    return regex.test(code);
}

// Function to get Supabase client
async function getSupabaseClient() {
    // Using Supabase JavaScript client via fetch
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };
    
    return {
        from: (table) => ({
            select: (columns) => ({
                eq: (column, value) => {
                    return {
                        _execute: async () => {
                            const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`, {
                                headers: headers
                            });
                            
                            if (!response.ok) {
                                throw new Error(`Supabase error: ${response.statusText}`);
                            }
                            
                            return await response.json();
                        }
                    };
                }
            })
        })
    };
}

// Function to validate and potentially transform R2 URLs
function validateAndSecureVideoUrl(videoUrl) {
    // Check if the URL is a valid R2 URL
    if (videoUrl.includes('r2.dev')) {
        // For R2 URLs, we can return the URL as is, but in production
        // you would want to generate a signed URL with short expiration
        return videoUrl;
    }
    
    // For other URL types, validate they are from trusted domains
    try {
        const url = new URL(videoUrl);
        const trustedDomains = [
            'r2.dev',
            'cloudflarestream.com',
            'your-trusted-domain.com'
        ];
        
        if (!trustedDomains.some(domain => url.hostname.includes(domain))) {
            throw new Error('Untrusted video URL domain');
        }
        
        return videoUrl;
    } catch (e) {
        throw new Error('Invalid video URL format');
    }
}

// Main request handler
export default {
    async fetch(request, env, ctx) {
        // Set CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        
        // Check if request is for the video API endpoint
        if (url.pathname === '/api/video') {
            const code = url.searchParams.get('code');
            
            // Validate the deep link code
            if (!code || !isValidDeepLinkCode(code)) {
                return new Response(
                    JSON.stringify({ error: 'Invalid or missing deep link code' }),
                    { 
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            }

            try {
                // Initialize Supabase client
                const supabase = await getSupabaseClient();
                
                // Query the video by deep_link_code
                const result = await supabase
                    .from('videos')
                    .select('title, description, category, video_url')
                    .eq('deep_link_code', code)
                    ._execute();

                if (!result || result.length === 0) {
                    return new Response(
                        JSON.stringify({ error: 'Video not found' }),
                        { 
                            status: 404,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        }
                    );
                }

                const videoData = result[0];
                
                // Optional: Check if the video is VIP content and validate user access
                // This would require additional user authentication logic
                if (videoData.category === 'vip') {
                    // In a real implementation, you'd validate user subscription here
                    // For now, we'll allow access for demo purposes
                }

                // Validate and secure the video URL
                const secureVideoUrl = validateAndSecureVideoUrl(videoData.video_url);

                // Return video data
                const response = {
                    title: videoData.title,
                    description: videoData.description,
                    category: videoData.category,
                    video_url: secureVideoUrl
                };

                return new Response(
                    JSON.stringify(response),
                    { 
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            } catch (error) {
                console.error('Error fetching video:', error);
                return new Response(
                    JSON.stringify({ error: error.message || 'Internal server error' }),
                    { 
                        status: 500,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            }
        }

        // Return 404 for other routes
        return new Response('Not Found', { status: 404 });
    }
};
