// Cloudflare Worker for secure video access - FIXED VERSION

// Helper function to validate deep link code format
function isValidDeepLinkCode(code) {
    // Deep link codes are typically alphanumeric, 8-10 characters
    const regex = /^[A-Z0-9]{8,10}$/;
    return regex.test(code);
}

// Helper function to validate user ID
function isValidUserId(userId) {
    // User IDs should be numeric
    return /^\d+$/.test(userId);
}

// Function to get Supabase client with better error handling
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
                        try {
                            console.log(`Querying ${table} where ${column} = ${value}`);
                            
                            const encodedValue = encodeURIComponent(value);
                            const queryUrl = `${supabaseUrl}/rest/v1/${table}?${column}=eq.${encodedValue}&select=${columns}`;
                            
                            console.log(`Supabase URL: ${queryUrl}`);
                            
                            const response = await fetch(queryUrl, {
                                headers: headers
                            });

                            console.log(`Supabase response status: ${response.status}`);
                            
                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error(`Supabase error ${response.status}: ${errorText}`);
                                throw new Error(`Supabase error: ${response.status} ${response.statusText}`);
                            }

                            const data = await response.json();
                            console.log(`Supabase data received: ${JSON.stringify(data).substring(0, 200)}`);
                            return data;
                        } catch (error) {
                            console.error('Error in Supabase query:', error);
                            throw error;
                        }
                    }
                })
            })
        }),
        // Method for updating records
        update: async (table, filter, data) => {
            try {
                const queryUrl = `${supabaseUrl}/rest/v1/${table}?${filter}`;
                
                console.log(`Updating ${table} with filter ${filter}`);
                
                const response = await fetch(queryUrl, {
                    method: 'PATCH',
                    headers: headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Supabase update error: ${response.status} ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                console.error('Error updating Supabase:', error);
                throw error;
            }
        },
        // Method for inserting records
        insert: async (table, data) => {
            try {
                const queryUrl = `${supabaseUrl}/rest/v1/${table}`;
                
                console.log(`Inserting into ${table}`);
                
                const response = await fetch(queryUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Supabase insert error: ${response.status} ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                console.error('Error inserting to Supabase:', error);
                throw error;
            }
        }
    };
}

// Function to check VIP access
async function checkVipAccess(supabase, userId) {
    try {
        console.log(`Checking VIP access for user ${userId}`);
        
        const users = await supabase
            .from('users')
            .select('user_id,username,vip_status,vip_expired_date,vip_package')
            .eq('user_id', userId)
            ._execute();

        console.log(`VIP check result: ${users ? users.length : 0} users found`);
        
        if (!users || users.length === 0) {
            return {
                has_access: false,
                is_vip: false,
                vip_expired: false,
                message: 'User not found. Please register first.'
            };
        }

        const user = users[0];
        console.log(`User data: ${JSON.stringify(user)}`);
        
        const now = new Date();
        const vipExpired = user.vip_expired_date ? new Date(user.vip_expired_date) : null;

        // Check if user is VIP and not expired
        const isValidVip = user.vip_status && vipExpired && vipExpired > now;

        console.log(`VIP status: valid=${isValidVip}, expired=${vipExpired}, now=${now}`);
        
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

// Function to validate video URL
function validateVideoUrl(videoUrl) {
    try {
        if (!videoUrl) {
            throw new Error('Video URL is empty');
        }
        
        // Basic URL validation
        const url = new URL(videoUrl);
        
        // Check if it's a valid R2 URL or trusted domain
        const trustedDomains = [
            'r2.dev',
            'cloudflare.com',
            'cloudflarestream.com',
            'storage.googleapis.com'
        ];
        
        const isTrusted = trustedDomains.some(domain => url.hostname.includes(domain));
        
        if (!isTrusted) {
            console.warn(`Video URL from untrusted domain: ${url.hostname}`);
        }
        
        return videoUrl;
    } catch (error) {
        console.error('Invalid video URL:', error);
        throw new Error('Invalid video URL format');
    }
}

// Main request handler
export default {
    async fetch(request, env, ctx) {
        // Enable detailed logging
        console.log('=== WORKER START ===');
        console.log('Request URL:', request.url);
        console.log('Request method:', request.method);
        console.log('Request headers:', Object.fromEntries(request.headers.entries()));
        
        try {
            // Get configuration from environment variables
            const SUPABASE_URL = env.SUPABASE_URL;
            const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

            console.log('Supabase URL configured:', !!SUPABASE_URL);
            console.log('Supabase Key configured:', !!SUPABASE_ANON_KEY);

            // Validate configuration
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                console.error('Missing Supabase configuration');
                return new Response(
                    JSON.stringify({ 
                        error: 'Server configuration error',
                        message: 'Service is not properly configured' 
                    }),
                    {
                        status: 500,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    }
                );
            }

            // Set CORS headers
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
                'Access-Control-Max-Age': '86400'
            };

            // Handle preflight requests
            if (request.method === 'OPTIONS') {
                console.log('Handling OPTIONS preflight');
                return new Response(null, { 
                    headers: corsHeaders 
                });
            }

            const url = new URL(request.url);
            console.log('Pathname:', url.pathname);
            console.log('Search params:', url.searchParams.toString());

            // Route: GET /api/video?code=XXX&user_id=XXX
            if (url.pathname === '/api/video' && request.method === 'GET') {
                const code = url.searchParams.get('code');
                const userId = url.searchParams.get('user_id');

                console.log(`Processing request - Code: ${code}, User ID: ${userId}`);

                // Validate the deep link code
                if (!code) {
                    console.error('No code provided');
                    return new Response(
                        JSON.stringify({ 
                            error: 'Invalid parameter',
                            message: 'Missing video code parameter' 
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

                if (!isValidDeepLinkCode(code)) {
                    console.error(`Invalid code format: ${code}`);
                    return new Response(
                        JSON.stringify({ 
                            error: 'Invalid parameter',
                            message: 'Invalid video code format' 
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
                    console.error(`Invalid user ID format: ${userId}`);
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
                    console.log('Initializing Supabase client...');
                    
                    // Initialize Supabase client
                    const supabase = await getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

                    console.log(`Querying video with code: ${code}`);
                    
                    // Query the video by deep_link_code
                    const videos = await supabase
                        .from('videos')
                        .select('video_id,title,description,category,video_url,thumbnail_url,view_count,created_at,is_public,requires_vip,deep_link_code')
                        .eq('deep_link_code', code)
                        ._execute();

                    console.log(`Query completed. Found ${videos ? videos.length : 0} videos`);

                    if (!videos || videos.length === 0) {
                        console.log(`No video found with code: ${code}`);
                        return new Response(
                            JSON.stringify({ 
                                error: 'Not found',
                                message: 'Video not found with the provided code' 
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
                    console.log(`Video found: ${video.title} (ID: ${video.video_id})`);
                    
                    // Check if video is public
                    const isPublic = video.is_public || video.category !== 'vip';
                    const requiresVip = video.requires_vip || video.category === 'vip';

                    console.log(`Video access - Public: ${isPublic}, Requires VIP: ${requiresVip}`);

                    // Initialize access object
                    let userAccess = {
                        has_access: isPublic && !requiresVip,
                        is_vip: false,
                        vip_expired: false,
                        message: null
                    };

                    // Check VIP access if required
                    if (requiresVip) {
                        console.log('Video requires VIP access');
                        
                        if (!userId) {
                            console.log('No user ID provided for VIP video');
                            userAccess = {
                                has_access: false,
                                is_vip: false,
                                vip_expired: false,
                                message: 'Please login to watch VIP content'
                            };
                        } else {
                            console.log(`Checking VIP status for user ${userId}`);
                            userAccess = await checkVipAccess(supabase, userId);
                            console.log(`VIP access result: ${JSON.stringify(userAccess)}`);
                        }
                    }

                    // Validate and secure video URL if user has access
                    let secureVideoUrl = null;
                    
                    if (userAccess.has_access) {
                        try {
                            console.log('Validating video URL...');
                            secureVideoUrl = validateVideoUrl(video.video_url);
                            console.log('Video URL validated successfully');
                        } catch (urlError) {
                            console.error('Video URL validation failed:', urlError);
                            throw new Error('Invalid video URL in database');
                        }
                        
                        // Update user activity (background task)
                        if (userId) {
                            ctx.waitUntil((async () => {
                                try {
                                    console.log(`Updating last_active for user ${userId}`);
                                    await supabase.update('users', `user_id=eq.${userId}`, {
                                        last_active: new Date().toISOString()
                                    });
                                } catch (error) {
                                    console.error('Error updating user activity:', error);
                                }
                            })());
                        }
                        
                        // Increment view count (background task)
                        ctx.waitUntil((async () => {
                            try {
                                console.log(`Incrementing view count for video ${video.video_id}`);
                                await supabase.update('videos', `video_id=eq.${video.video_id}`, {
                                    view_count: (video.view_count || 0) + 1
                                });
                            } catch (error) {
                                console.error('Error incrementing view count:', error);
                            }
                        })());
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
                    if (userAccess.has_access && secureVideoUrl) {
                        response.video_url = secureVideoUrl;
                        console.log('Video URL included in response');
                    } else {
                        console.log('Video URL NOT included (no access or invalid URL)');
                    }

                    console.log('Sending successful response');
                    
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
                    console.error('Error in video processing:', error);
                    
                    let errorMessage = 'Failed to fetch video data';
                    let statusCode = 500;
                    
                    if (error.message.includes('Supabase error')) {
                        errorMessage = 'Database error occurred';
                        statusCode = 503;
                    } else if (error.message.includes('Invalid video URL')) {
                        errorMessage = 'Invalid video URL configuration';
                        statusCode = 500;
                    }
                    
                    return new Response(
                        JSON.stringify({ 
                            error: 'Internal server error',
                            message: errorMessage,
                            details: error.message
                        }),
                        {
                            status: statusCode,
                            headers: { 
                                ...corsHeaders, 
                                'Content-Type': 'application/json' 
                            }
                        }
                    );
                }
            }

            // Route: GET /api/test (for debugging)
            if (url.pathname === '/api/test' && request.method === 'GET') {
                console.log('Test endpoint called');
                
                return new Response(
                    JSON.stringify({ 
                        status: 'ok',
                        timestamp: new Date().toISOString(),
                        worker: 'harch-video-api',
                        version: '1.0.0',
                        environment: 'production'
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

            // Route: GET /api/debug (for debugging Supabase connection)
            if (url.pathname === '/api/debug' && request.method === 'GET') {
                try {
                    console.log('Debug endpoint called');
                    
                    const SUPABASE_URL = env.SUPABASE_URL;
                    const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
                    
                    const supabase = await getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    
                    // Try to query a test table or check connection
                    const testResult = await supabase
                        .from('videos')
                        .select('count')
                        .eq('deep_link_code', 'TEST123')
                        ._execute();
                    
                    return new Response(
                        JSON.stringify({ 
                            status: 'connected',
                            supabase_connected: true,
                            test_query: testResult,
                            config: {
                                supabase_url: SUPABASE_URL ? 'configured' : 'missing',
                                supabase_key: SUPABASE_ANON_KEY ? 'configured' : 'missing'
                            }
                        }),
                        {
                            status: 200,
                            headers: { 
                                ...corsHeaders, 
                                'Content-Type': 'application/json' 
                            }
                        }
                    );
                } catch (error) {
                    console.error('Debug endpoint error:', error);
                    
                    return new Response(
                        JSON.stringify({ 
                            status: 'error',
                            supabase_connected: false,
                            error: error.message,
                            stack: error.stack
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

            // Return 404 for other routes
            console.log(`Route not found: ${url.pathname}`);
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

        } catch (globalError) {
            console.error('Unhandled error in worker:', globalError);
            
            return new Response(
                JSON.stringify({ 
                    error: 'Internal Server Error',
                    message: 'An unexpected error occurred',
                    reference: 'GLOBAL_ERROR'
                }),
                {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            );
        } finally {
            console.log('=== WORKER END ===');
        }
    }
};
