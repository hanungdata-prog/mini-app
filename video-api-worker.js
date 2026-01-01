// Cloudflare Worker for secure video access with URL obfuscation and proxy

// Helper function to validate deep link code format
function isValidDeepLinkCode(code) {
    // Deep link codes are typically alphanumeric, 6-10 characters
    const regex = /^[a-zA-Z0-9]{6,10}$/;
    return regex.test(code);
}

// Helper function to validate user ID
function isValidUserId(userId) {
    // User IDs should be numeric
    return /^\d+$/.test(userId);
}

// Function to get Supabase client with enhanced error handling
async function getSupabaseClient(supabaseUrl, supabaseAnonKey) {
    const headers = {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    return {
        from: (table) => ({
            select: (columns) => ({
                eq: (column, value) => ({
                    _execute: async () => {
                        const encodedValue = encodeURIComponent(value);
                        const queryUrl = `${supabaseUrl}/rest/v1/${table}?${column}=eq.${encodedValue}&select=${columns}`;
                        
                        const response = await fetch(queryUrl, {
                            headers: headers
                        });

                        if (!response.ok) {
                            console.error(`Supabase request failed: ${response.status} ${response.statusText}`);
                            console.error(`URL: ${queryUrl}`);
                            const errorText = await response.text();
                            console.error(`Error details: ${errorText}`);
                            throw new Error(`Supabase error: ${response.statusText}`);
                        }

                        const data = await response.json();
                        console.log(`Supabase response for ${table}:`, JSON.stringify(data).substring(0, 200));
                        return data;
                    }
                }),
                _execute: async () => {
                    const queryUrl = `${supabaseUrl}/rest/v1/${table}?select=${columns}`;
                    
                    const response = await fetch(queryUrl, {
                        headers: headers
                    });

                    if (!response.ok) {
                        throw new Error(`Supabase error: ${response.statusText}`);
                    }

                    return await response.json();
                }
            })
        }),
        // Method for updating records
        update: async (table, filter, data) => {
            const queryUrl = `${supabaseUrl}/rest/v1/${table}?${filter}`;
            
            const response = await fetch(queryUrl, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Supabase update error: ${response.statusText}`);
            }

            return await response.json();
        },
        // Method for inserting records
        insert: async (table, data) => {
            const queryUrl = `${supabaseUrl}/rest/v1/${table}`;
            
            const response = await fetch(queryUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Supabase insert error: ${response.statusText}`);
            }

            return await response.json();
        }
    };
}

// Function to validate and potentially transform R2 URLs
function validateAndSecureVideoUrl(videoUrl) {
    // Check if the URL is a valid R2 URL
    if (videoUrl.includes('r2.dev')) {
        return videoUrl;
    }
    
    // For other URL types, validate they are from trusted domains
    try {
        const url = new URL(videoUrl);
        const trustedDomains = [
            'r2.dev',
            'cloudflarestream.com',
            'cdn.cloudflare.com',
            'storage.googleapis.com',
            'your-trusted-domain.com'
        ];
        
        if (!trustedDomains.some(domain => url.hostname.includes(domain))) {
            console.warn(`Untrusted video URL domain: ${url.hostname}`);
            // Return the URL anyway but log the warning
            return videoUrl;
        }
        
        return videoUrl;
    } catch (e) {
        throw new Error('Invalid video URL format');
    }
}

// Function to check VIP access
async function checkVipAccess(supabase, userId) {
    try {
        const users = await supabase
            .from('users')
            .select('user_id,username,vip_status,vip_expired_date,vip_package')
            .eq('user_id', userId)
            ._execute();

        if (!users || users.length === 0) {
            return {
                has_access: false,
                is_vip: false,
                vip_expired: false,
                message: 'User not found. Please register first.'
            };
        }

        const user = users[0];
        const now = new Date();
        const vipExpired = user.vip_expired_date ? new Date(user.vip_expired_date) : null;

        // Check if user is VIP and not expired
        const isValidVip = user.vip_status && vipExpired && vipExpired > now;

        return {
            has_access: isValidVip,
            is_vip: user.vip_status,
            vip_expired: user.vip_status && (!vipExpired || vipExpired <= now),
            vip_expired_date: user.vip_expired_date,
            vip_package: user.vip_package,
            message: isValidVip ? null : 'Diperlukan VIP untuk menonton video ini.'
        };
    } catch (error) {
        console.error('Error checking VIP access:', error);
        throw error;
    }
}

// Function to update user last active
async function updateUserActivity(supabase, supabaseUrl, supabaseKey, userId) {
    try {
        const now = new Date().toISOString();
        await supabase.update('users', `user_id=eq.${userId}`, {
            last_active: now
        });
    } catch (error) {
        console.error('Error updating user activity:', error);
        // Don't throw, just log - this is not critical
    }
}

// Function to increment view count
async function incrementViewCount(supabase, videoId) {
    try {
        // Note: This is a simplified increment. In production, use atomic operations
        await supabase.update('videos', `video_id=eq.${videoId}`, {
            view_count: 'view_count + 1' // This won't work with current setup, needs RPC
        });
    } catch (error) {
        console.error('Error incrementing view count:', error);
        // Don't throw, just log
    }
}

// Function to add to watch history
async function addToWatchHistory(supabase, userId, videoId) {
    try {
        await supabase.insert('watch_history', {
            user_id: parseInt(userId),
            video_id: videoId,
            watched_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error adding to watch history:', error);
        // Don't throw, just log
    }
}

// Function to generate encrypted URL token
function generateVideoToken(videoUrl, expiresIn = 3600) {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const data = {
        url: videoUrl,
        expires: expires,
        timestamp: Date.now()
    };
    
    // Simple base64 encoding (in production, use proper encryption)
    const token = btoa(JSON.stringify(data));
    return token;
}

// Function to decode video token
function decodeVideoToken(token) {
    try {
        const decoded = atob(token);
        const data = JSON.parse(decoded);
        
        // Check if token is expired
        if (data.expires && data.expires < Math.floor(Date.now() / 1000)) {
            throw new Error('Token expired');
        }
        
        return data.url;
    } catch (error) {
        console.error('Token decode error:', error);
        throw error;
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
                JSON.stringify({ 
                    error: 'Server configuration error',
                    message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' 
                }),
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

        // Route: GET /api/video?code=XXX&user_id=XXX
        if (url.pathname === '/api/video' && request.method === 'GET') {
            const code = url.searchParams.get('code');
            const userId = url.searchParams.get('user_id');

            // Validate the deep link code
            if (!code || !isValidDeepLinkCode(code)) {
                return new Response(
                    JSON.stringify({ 
                        error: 'Invalid parameter',
                        message: 'Invalid or missing deep link code' 
                    }),
                    {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            }

            // Validate user_id if provided
            if (userId && !isValidUserId(userId)) {
                return new Response(
                    JSON.stringify({ 
                        error: 'Invalid parameter',
                        message: 'Invalid user ID format' 
                    }),
                    {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            }

            try {
                console.log(`Processing request for code: ${code}, user_id: ${userId || 'none'}`);

                // Initialize Supabase client
                const supabase = await getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

                // Query the video by deep_link_code
                const videos = await supabase
                    .from('videos')
                    .select('video_id,title,description,category,video_url,thumbnail_url,view_count,created_at')
                    .eq('deep_link_code', code)
                    ._execute();

                console.log(`Query result for code ${code}:`, videos.length, 'videos found');

                if (!videos || videos.length === 0) {
                    return new Response(
                        JSON.stringify({ 
                            error: 'Not found',
                            message: 'Video not found' 
                        }),
                        {
                            status: 404,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        }
                    );
                }

                const video = videos[0];
                const isVipVideo = video.category === 'vip';

                // Initialize access object
                let userAccess = {
                    has_access: true,
                    is_vip: false,
                    vip_expired: false,
                    message: null
                };

                // Check VIP access if needed
                if (isVipVideo) {
                    if (!userId) {
                        // VIP video but no user_id provided
                        userAccess = {
                            has_access: false,
                            is_vip: false,
                            vip_expired: false,
                            message: 'Please login to watch VIP content'
                        };
                    } else {
                        // Check user's VIP status
                        userAccess = await checkVipAccess(supabase, userId);
                    }
                }

                // Update user activity if user_id provided and has access
                if (userId && userAccess.has_access) {
                    await updateUserActivity(supabase, SUPABASE_URL, SUPABASE_ANON_KEY, userId);
                }

                // Track view and history only if user has access
                if (userAccess.has_access) {
                    // Increment view count (background, non-blocking)
                    ctx.waitUntil(incrementViewCount(supabase, video.video_id));
                    
                    // Add to watch history if user_id provided
                    if (userId) {
                        ctx.waitUntil(addToWatchHistory(supabase, userId, video.video_id));
                    }
                }

                // Prepare response
                const response = {
                    video_id: video.video_id,
                    title: video.title,
                    description: video.description,
                    category: video.category,
                    thumbnail_url: video.thumbnail_url,
                    view_count: video.view_count || 0,
                    created_at: video.created_at,
                    access: userAccess
                };

                // Only include video_url if user has access
                if (userAccess.has_access && video.video_url) {
                    // Generate encrypted token for video URL
                    const videoToken = generateVideoToken(video.video_url);
                    
                    // Return token instead of direct URL
                    response.video_token = videoToken;
                    response.video_proxy_url = `/api/proxy/video?token=${videoToken}`;
                    
                    // Also include direct URL for fallback (obfuscated)
                    response.video_url = video.video_url;
                }

                return new Response(
                    JSON.stringify(response),
                    {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );

            } catch (error) {
                console.error('Error fetching video:', error);
                return new Response(
                    JSON.stringify({ 
                        error: 'Internal server error',
                        message: error.message || 'Failed to fetch video data'
                    }),
                    {
                        status: 500,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            }
        }

        // Route: GET /api/proxy/video?token=XXX or ?url=XXX
        if (url.pathname === '/api/proxy/video' && request.method === 'GET') {
            try {
                const token = url.searchParams.get('token');
                const directUrl = url.searchParams.get('url');
                
                let targetUrl;
                
                if (token) {
                    // Decode token to get actual URL
                    targetUrl = decodeVideoToken(token);
                } else if (directUrl) {
                    targetUrl = decodeURIComponent(directUrl);
                } else {
                    return new Response(
                        JSON.stringify({ error: 'Missing token or url parameter' }),
                        { status: 400, headers: corsHeaders }
                    );
                }
                
                // Validate URL is allowed (only from trusted domains)
                const trustedDomains = [
                    'r2.dev',
                    'pub-c5c15df1eaff4bf38ede1257da3751b1.r2.dev',
                    'cloudflarestream.com',
                    'cdn.cloudflare.com'
                ];
                
                const urlObj = new URL(targetUrl);
                const isAllowed = trustedDomains.some(domain => urlObj.hostname.includes(domain));
                
                if (!isAllowed) {
                    return new Response(
                        JSON.stringify({ error: 'Domain not allowed' }),
                        { status: 403, headers: corsHeaders }
                    );
                }
                
                console.log(`Proxying video request to: ${urlObj.hostname}`);
                
                // Forward range headers for seeking support
                const headers = new Headers();
                const rangeHeader = request.headers.get('Range');
                if (rangeHeader) {
                    headers.set('Range', rangeHeader);
                }
                
                // Fetch the video with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                
                const videoResponse = await fetch(targetUrl, {
                    headers: headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!videoResponse.ok) {
                    return new Response(
                        JSON.stringify({ 
                            error: 'Failed to fetch video', 
                            status: videoResponse.status 
                        }),
                        { status: videoResponse.status, headers: corsHeaders }
                    );
                }
                
                // Create response with video data
                const responseHeaders = new Headers(corsHeaders);
                responseHeaders.set('Content-Type', videoResponse.headers.get('Content-Type') || 'video/mp4');
                responseHeaders.set('Accept-Ranges', 'bytes');
                responseHeaders.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
                responseHeaders.set('Pragma', 'no-cache');
                responseHeaders.set('Expires', '0');
                
                // Copy content headers
                const contentLength = videoResponse.headers.get('Content-Length');
                const contentRange = videoResponse.headers.get('Content-Range');
                
                if (contentLength) {
                    responseHeaders.set('Content-Length', contentLength);
                }
                if (contentRange) {
                    responseHeaders.set('Content-Range', contentRange);
                }
                
                return new Response(videoResponse.body, {
                    status: videoResponse.status,
                    headers: responseHeaders
                });
                
            } catch (error) {
                console.error('Proxy error:', error);
                
                if (error.name === 'AbortError') {
                    return new Response(
                        JSON.stringify({ error: 'Request timeout' }),
                        { status: 504, headers: corsHeaders }
                    );
                }
                
                return new Response(
                    JSON.stringify({ 
                        error: 'Proxy failed',
                        message: error.message 
                    }),
                    { status: 500, headers: corsHeaders }
                );
            }
        }

        // Route: POST /api/video/access-check
        if (url.pathname === '/api/video/access-check' && request.method === 'POST') {
            try {
                const body = await request.json();
                const { user_id, video_code } = body;

                if (!user_id || !video_code) {
                    return new Response(
                        JSON.stringify({ 
                            error: 'Missing parameters',
                            message: 'user_id and video_code are required' 
                        }),
                        {
                            status: 400,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        }
                    );
                }

                const supabase = await getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

                // Get video
                const videos = await supabase
                    .from('videos')
                    .select('category')
                    .eq('deep_link_code', video_code)
                    ._execute();

                if (!videos || videos.length === 0) {
                    return new Response(
                        JSON.stringify({ 
                            has_access: false,
                            message: 'Video not found' 
                        }),
                        {
                            status: 404,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        }
                    );
                }

                const video = videos[0];

                // If free video, grant access
                if (video.category !== 'vip') {
                    return new Response(
                        JSON.stringify({ 
                            has_access: true,
                            is_vip_video: false
                        }),
                        {
                            status: 200,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        }
                    );
                }

                // Check VIP access
                const access = await checkVipAccess(supabase, user_id);

                return new Response(
                    JSON.stringify({ 
                        ...access,
                        is_vip_video: true
                    }),
                    {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );

            } catch (error) {
                console.error('Error checking access:', error);
                return new Response(
                    JSON.stringify({ 
                        error: 'Internal error',
                        message: error.message 
                    }),
                    {
                        status: 500,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            }
        }

        // Return 404 for other routes
        return new Response(
            JSON.stringify({ error: 'Not Found' }), 
            { 
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
};
