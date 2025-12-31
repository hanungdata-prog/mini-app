// Cloudflare Worker for secure video access
// This worker acts as an API layer between the frontend and Supabase

// Configuration - Using environment variables from Cloudflare
// These should be set in the Cloudflare dashboard
// SUPABASE_URL, SUPABASE_ANON_KEY should be configured as secrets in Cloudflare

// Helper function to validate deep link code format
function isValidDeepLinkCode(code) {
    // Deep link codes are typically alphanumeric, 6-10 characters
    const regex = /^[a-zA-Z0-9]{6,10}$/;
    return regex.test(code);
}

// Function to get Supabase client
async function getSupabaseClient(supabaseUrl, supabaseAnonKey) {
    // Using Supabase JavaScript client via fetch
    const headers = {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    return {
        from: (table) => ({
            select: (columns) => ({
                eq: (column, value) => {
                    return {
                        _execute: async () => {
                            const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`, {
                                headers: headers
                            });

                            if (!response.ok) {
                                // Log the error for debugging
                                console.error(`Supabase request failed: ${response.status} ${response.statusText}`);
                                console.error(`URL: ${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`);
                                throw new Error(`Supabase error: ${response.statusText}`);
                            }

                            const data = await response.json();
                            console.log(`Supabase response: ${JSON.stringify(data)}`);
                            return data;
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
        // Get configuration from environment variables
        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

        // Validate configuration
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return new Response(
                JSON.stringify({ error: 'Server configuration error: Missing SUPABASE_URL or SUPABASE_ANON_KEY' }),
                {
                    status: 500,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Content-Type': 'application/json'
                    }
                }
            );
        }

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
                // Initialize Supabase client with environment variables
                const supabase = await getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

                // Query the video by deep_link_code
                const result = await supabase
                    .from('videos')
                    .select('title, description, category, video_url')
                    .eq('deep_link_code', code)
                    ._execute();

                console.log(`Query result for code ${code}:`, result);

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