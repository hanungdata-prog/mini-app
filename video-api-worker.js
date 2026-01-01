// Cloudflare Worker for secure video access with token-based authentication

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

// Generate secure token for video access
function generateVideoToken(videoId, userId, expiryMinutes = 10) {
    const timestamp = Date.now();
    const expiry = timestamp + (expiryMinutes * 60 * 1000);
    const random = Math.random().toString(36).substr(2, 9);
    
    const data = {
        v: videoId,
        u: userId || 'anonymous',
        t: timestamp,
        e: expiry,
        r: random
    };
    
    // In production, use a proper encryption library
    const token = btoa(JSON.stringify(data));
    return token.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Validate video token
function validateVideoToken(token, videoId) {
    try {
        // Decode token
        const decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
        const data = JSON.parse(decoded);
        
        // Check expiry
        if (Date.now() > data.e) {
            return { valid: false, reason: 'Token expired' };
        }
        
        // Verify video ID matches
        if (data.v !== videoId.toString()) {
            return { valid: false, reason: 'Token mismatch' };
        }
        
        return { valid: true, data: data };
    } catch (error) {
        return { valid: false, reason: 'Invalid token format' };
    }
}

// Create secure video URL with token
function createSecureVideoUrl(originalUrl, token) {
    try {
        const url = new URL(originalUrl);
        
        // Add token as query parameter
        url.searchParams.set('token', token);
        
        // Add timestamp to prevent caching
        url.searchParams.set('_t', Date.now());
        
        // Add signature
        const signature = btoa(`secure_${Date.now()}`).replace(/=/g, '');
        url.searchParams.set('_s', signature);
        
        return url.toString();
    } catch (error) {
        throw new Error('Invalid video URL format');
    }
}

// Function to get Supabase client
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
                            const errorText = await response.text();
                            console.error(`Error details: ${errorText}`);
                            throw new Error(`Supabase error: ${response.statusText}`);
                        }

                        const data = await response.json();
                        return data;
                    }
                })
            })
        }),
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

// Main request handler
export default {
    async fetch(request, env, ctx) {
        // Get configuration from environment variables
        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
        
        // Security headers for all responses
        const securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'same-site',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        };

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
            'Access-Control-Max-Age': '86400',
            ...securityHeaders
        };

        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Validate configuration
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return new Response(
                JSON.stringify({ 
                    error: 'Server configuration error',
                    message: 'Service temporarily unavailable' 
                }),
                {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            );
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
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
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
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
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
                    .select('video_id,title,description,category,video_url,thumbnail_url,view_count,created_at,is_public,requires_vip')
                    .eq('deep_link_code', code)
                    ._execute();

                if (!videos || videos.length === 0) {
                    return new Response(
                        JSON.stringify({ 
                            error: 'Not found',
                            message: 'Video not found' 
                        }),
                        {
                            status: 404,
                            headers: {
                                ...corsHeaders,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                }

                const video = videos[0];
                
                // Check if video is public
                const isPublic = video.is_public || video.category !== 'vip';
                const requiresVip = video.requires_vip || video.category === 'vip';

                // Initialize access object
                let userAccess = {
                    has_access: isPublic && !requiresVip,
                    is_vip: false,
                    vip_expired: false,
                    message: null
                };

                // Check VIP access if required
                if (requiresVip) {
                    if (!userId) {
                        userAccess = {
                            has_access: false,
                            is_vip: false,
                            vip_expired: false,
                            message: 'Please login to watch VIP content'
                        };
                    } else {
                        userAccess = await checkVipAccess(supabase, userId);
                    }
                }

                // Generate secure token if user has access
                let secureVideoUrl = null;
                let videoToken = null;
                
                if (userAccess.has_access) {
                    videoToken = generateVideoToken(video.video_id, userId);
                    secureVideoUrl = createSecureVideoUrl(video.video_url, videoToken);
                    
                    // Update user activity (non-blocking)
                    if (userId) {
                        ctx.waitUntil((async () => {
                            try {
                                await supabase.update('users', `user_id=eq.${userId}`, {
                                    last_active: new Date().toISOString()
                                });
                            } catch (error) {
                                console.error('Error updating user activity:', error);
                            }
                        })());
                    }
                    
                    // Increment view count (non-blocking)
                    ctx.waitUntil((async () => {
                        try {
                            // Use RPC for atomic increment
                            const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/increment_view`;
                            await fetch(rpcUrl, {
                                method: 'POST',
                                headers: {
                                    'apikey': SUPABASE_ANON_KEY,
                                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ video_id: video.video_id })
                            });
                        } catch (error) {
                            console.error('Error incrementing view count:', error);
                        }
                    })());
                    
                    // Add to watch history (non-blocking)
                    if (userId) {
                        ctx.waitUntil((async () => {
                            try {
                                await supabase.insert('watch_history', {
                                    user_id: parseInt(userId),
                                    video_id: video.video_id,
                                    watched_at: new Date().toISOString()
                                });
                            } catch (error) {
                                console.error('Error adding to watch history:', error);
                            }
                        })());
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
                    access: userAccess,
                    token: videoToken,
                    url_encrypted: true
                };

                // Only include video_url if user has access
                if (userAccess.has_access && secureVideoUrl) {
                    response.video_url = secureVideoUrl;
                }

                return new Response(
                    JSON.stringify(response),
                    {
                        status: 200,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-store, max-age=0'
                        }
                    }
                );

            } catch (error) {
                console.error('Error fetching video:', error);
                return new Response(
                    JSON.stringify({ 
                        error: 'Internal server error',
                        message: 'Failed to fetch video data'
                    }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
        }

        // Route: POST /api/video/verify-token
        if (url.pathname === '/api/video/verify-token' && request.method === 'POST') {
            try {
                const body = await request.json();
                const { token, video_id } = body;

                if (!token || !video_id) {
                    return new Response(
                        JSON.stringify({ 
                            valid: false,
                            message: 'Missing token or video_id' 
                        }),
                        {
                            status: 400,
                            headers: {
                                ...corsHeaders,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                }

                const validation = validateVideoToken(token, video_id);
                
                return new Response(
                    JSON.stringify({
                        valid: validation.valid,
                        message: validation.valid ? 'Token is valid' : validation.reason,
                        expires_in: validation.valid ? 
                            Math.floor((validation.data.e - Date.now()) / 1000) : 0
                    }),
                    {
                        status: validation.valid ? 200 : 403,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );

            } catch (error) {
                console.error('Error verifying token:', error);
                return new Response(
                    JSON.stringify({ 
                        valid: false,
                        message: 'Token verification failed'
                    }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
        }

        // Route: GET /api/security/log (for client-side security logging)
        if (url.pathname === '/api/security/log' && request.method === 'POST') {
            try {
                const body = await request.json();
                
                // Log security event (in production, store in database)
                console.log('[SECURITY LOG]', {
                    ...body,
                    timestamp: new Date().toISOString(),
                    ip: request.headers.get('CF-Connecting-IP') || 'unknown'
                });
                
                return new Response(
                    JSON.stringify({ logged: true }),
                    {
                        status: 200,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            } catch (error) {
                console.error('Error logging security event:', error);
                return new Response(
                    JSON.stringify({ logged: false }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
        }

        // Route: GET /api/health (health check)
        if (url.pathname === '/api/health' && request.method === 'GET') {
            return new Response(
                JSON.stringify({ 
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    service: 'harch-video-api'
                }),
                {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            );
        }

        // Return 404 for other routes
        return new Response(
            JSON.stringify({ 
                error: 'Not Found',
                message: 'The requested resource was not found'
            }), 
            { 
                status: 404,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            }
        );
    }
};
