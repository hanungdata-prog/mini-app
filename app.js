// app.js - Enhanced Secure Video Player for Harch Short

class VideoPlayerApp {
    constructor() {
        // Security initialization
        this.setupSecurityMeasures();
        
        // Initialize elements
        this.initializeElements();
        
        // Get and validate deep link code
        let rawCode = this.getUrlParameter('code') || this.getTelegramStartParam();
        this.deepLinkCode = this.validateVideoCode(rawCode);
        
        // Get user ID from Telegram
        this.userId = this.getTelegramUserId();
        
        // Security monitoring
        this.security = {
            attempts: 0,
            maxAttempts: 5,
            lastAccess: Date.now(),
            devToolsDetected: false
        };
        
        // Update debug UI
        this.updateDebugInfo('code', this.deepLinkCode || 'INVALID');
        this.updateDebugInfo('telegram', window.Telegram ? 'YES' : 'NO');
        
        // Initialize player
        if (!this.deepLinkCode) {
            this.showError('Invalid video code. Please check your link and try again.');
            this.updateDebugInfo('status', 'INVALID CODE');
            document.getElementById('loadingIndicator').style.display = 'none';
        } else {
            this.updateDebugInfo('status', 'Initializing...');
            this.initializePlayer();
        }
        
        // State variables
        this.isVideoPlaying = false;
        this.isControlsVisible = false;
        this.controlsTimeout = null;
        this.videoDuration = 0;
        this.lastVolume = 0.7;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // Security token for video access
        this.videoToken = null;
        
        // Initialize with controls hidden
        this.hideControls();
        
        // Start security monitoring
        this.startSecurityMonitoring();
    }
    
    // ========== SECURITY FUNCTIONS ==========
    
    setupSecurityMeasures() {
        // Disable right-click context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.security.attempts++;
            if (this.security.attempts > 3) {
                this.handleSecurityViolation('Multiple context menu attempts');
            }
            return false;
        });
        
        // Disable selection and text highlighting
        document.addEventListener('selectstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Disable drag and drop
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Set user-select on body
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.mozUserSelect = 'none';
        document.body.style.msUserSelect = 'none';
        
        // Disable copy/paste
        document.addEventListener('copy', (e) => {
            e.preventDefault();
            return false;
        });
        
        document.addEventListener('paste', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Block keyboard shortcuts
        this.setupKeyboardProtection();
        
        // Protect against iframe embedding
        if (window.self !== window.top) {
            window.top.location = window.self.location;
        }
    }
    
    setupKeyboardProtection() {
        document.addEventListener('keydown', (e) => {
            // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
                (e.ctrlKey && e.key === 'U')
            ) {
                e.preventDefault();
                e.stopPropagation();
                this.security.attempts++;
                if (this.security.attempts > 2) {
                    this.handleSecurityViolation('DevTools shortcut detected');
                }
                return false;
            }
            
            // Block save page (Ctrl+S)
            if (e.ctrlKey && e.key === 'S') {
                e.preventDefault();
                return false;
            }
        });
    }
    
    startSecurityMonitoring() {
        // Monitor for devtools
        setInterval(() => {
            this.checkDevTools();
        }, 1000);
        
        // Monitor for tab/window switch
        window.addEventListener('blur', () => {
            if (this.isVideoPlaying) {
                // Auto-pause when switching tabs
                this.videoPlayer.pause();
            }
        });
        
        // Monitor network requests
        this.monitorNetworkRequests();
    }
    
    checkDevTools() {
        // Method 1: Check console
        const check = () => {
            const start = performance.now();
            console.log('security_check');
            console.clear();
            const diff = performance.now() - start;
            return diff > 100; // DevTools open slows down console
        };
        
        // Method 2: Check window size
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;
        
        if (check() || widthThreshold || heightThreshold) {
            if (!this.security.devToolsDetected) {
                this.security.devToolsDetected = true;
                this.handleSecurityViolation('DevTools detected');
            }
        }
    }
    
    monitorNetworkRequests() {
        // Override fetch to monitor video requests
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const [resource, options] = args;
            
            // Block direct R2 access attempts
            if (typeof resource === 'string' && 
                resource.includes('r2.dev') && 
                !resource.includes('token=')) {
                console.warn('Blocked direct R2 access attempt:', resource);
                throw new Error('Direct media access not allowed');
            }
            
            // Add security headers to video requests
            if (typeof resource === 'string' && 
                (resource.includes('.mp4') || resource.includes('.m3u8'))) {
                const modifiedOptions = {
                    ...options,
                    headers: {
                        ...options?.headers,
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-Content-Type-Options': 'nosniff',
                        'X-Frame-Options': 'DENY'
                    }
                };
                
                return originalFetch(resource, modifiedOptions);
            }
            
            return originalFetch(resource, options);
        };
        
        // Override XMLHttpRequest
        const originalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            
            xhr.open = function(method, url, async, user, password) {
                // Block direct media access
                if (url && url.includes('r2.dev') && !url.includes('token=')) {
                    throw new Error('Direct media access not permitted');
                }
                return originalOpen.call(this, method, url, async, user, password);
            };
            
            return xhr;
        };
    }
    
    handleSecurityViolation(reason) {
        console.warn('Security violation:', reason);
        
        // Clear sensitive data
        sessionStorage.clear();
        localStorage.removeItem('video_data');
        
        // Stop video
        if (this.videoPlayer) {
            this.videoPlayer.src = '';
            this.videoPlayer.load();
        }
        
        // Show security message
        this.showSecurityError();
        
        // Log the attempt (in production, send to server)
        if (this.userId) {
            this.logSecurityEvent(reason);
        }
    }
    
    showSecurityError() {
        const errorHtml = `
            <div style="text-align: center; padding: 30px;">
                <i class="fas fa-shield-alt" style="font-size: 48px; color: #ff4444; margin-bottom: 20px;"></i>
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">
                    Security Restriction
                </div>
                <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">
                    Unauthorized access attempt detected
                </div>
                <button onclick="window.location.reload()" style="background: #444; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                    Reload Page
                </button>
            </div>
        `;
        
        if (this.errorMessage) {
            this.errorMessage.innerHTML = errorHtml;
            this.errorMessage.style.display = 'block';
        }
    }
    
    logSecurityEvent(event) {
        // In production, send this to your security logging endpoint
        const logData = {
            event: event,
            userId: this.userId,
            code: this.deepLinkCode,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ip: 'unknown' // Would need server-side logging
        };
        
        // Store locally for debugging
        console.log('Security Event:', logData);
    }
    
    // ========== URL VALIDATION & PARSING ==========
    
    getUrlParameter(name) {
        try {
            // Try URL search params first
            const urlParams = new URLSearchParams(window.location.search);
            let param = urlParams.get(name);
            
            if (param) {
                return param;
            }
            
            // Try tgWebAppStartParam
            param = urlParams.get('tgWebAppStartParam');
            if (param) {
                return param;
            }
            
            // Try from hash
            if (window.location.hash) {
                const hashPart = window.location.hash.substring(1);
                const match = hashPart.match(/start_param=([^&]+)/);
                if (match) {
                    return match[1];
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error getting URL parameter:', error);
            return null;
        }
    }

    getTelegramStartParam() {
        try {
            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;
                tg.ready();
                
                const startParam = tg.initDataUnsafe?.start_param || 
                                  tg.startParam || 
                                  null;
                
                return startParam;
            }
        } catch (error) {
            console.error('Error getting Telegram start param:', error);
        }
        return null;
    }
    
    getTelegramUserId() {
        try {
            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;
                const userId = tg.initDataUnsafe?.user?.id || null;
                
                // Validate user ID format
                if (userId && /^\d+$/.test(userId)) {
                    return userId;
                }
            }
        } catch (error) {
            console.error('Error getting Telegram user ID:', error);
        }
        return null;
    }
    
    validateVideoCode(rawCode) {
        if (!rawCode) {
            console.warn('validateVideoCode: No code provided');
            return null;
        }
        
        let code = String(rawCode);
        
        // Remove any fragments, parameters, or encoding
        const steps = [
            (c) => c.split('#')[0],           // Remove hash fragment
            (c) => c.split('?')[0],           // Remove query string
            (c) => c.split('&')[0],           // Remove parameter separator
            (c) => decodeURIComponent(c),     // Decode URL
            (c) => c.replace(/[^a-zA-Z0-9]/g, ''), // Remove non-alphanumeric
            (c) => c.trim(),                  // Trim whitespace
            (c) => c.substring(0, 10)         // Limit length
        ];
        
        steps.forEach(step => {
            try {
                code = step(code);
            } catch (e) {
                // Continue if a step fails
            }
        });
        
        // Final validation
        const regex = /^[a-zA-Z0-9]{6,10}$/;
        if (!regex.test(code)) {
            console.error('Invalid video code format:', code);
            return null;
        }

        return code;
    }
    
    // ========== ELEMENT INITIALIZATION ==========
    
    initializeElements() {
        // Video elements
        this.videoPlayer = document.getElementById('videoPlayer');
        this.videoContainer = document.getElementById('videoContainer');
        this.videoTitle = document.getElementById('videoTitle');
        this.overlayTitle = document.getElementById('overlayTitle');
        this.videoDescription = document.getElementById('videoDescription');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
        this.controlsOverlay = document.getElementById('controlsOverlay');
        
        // Control elements
        this.playPauseButton = document.getElementById('playPauseButton');
        this.playIcon = document.getElementById('playIcon');
        this.pauseIcon = document.getElementById('pauseIcon');
        this.fullscreenButton = document.getElementById('fullscreenButton');
        this.rewindButton = document.getElementById('rewindButton');
        this.forwardButton = document.getElementById('forwardButton');
        this.retryButton = document.getElementById('retryButton');
        this.backButton = document.getElementById('backButton');
        
        // Progress and time elements
        this.progressBar = document.getElementById('progressBar');
        this.progressContainer = document.getElementById('progressContainer');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.durationDisplay = document.getElementById('duration');
        
        // Volume elements
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeContainer = document.getElementById('volumeContainer');
        
        // Add enhanced security to video player
        this.addVideoSecurity();
    }
    
    addVideoSecurity() {
        if (!this.videoPlayer) return;
        
        // Prevent video context menu
        this.videoPlayer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.security.attempts++;
            return false;
        });
        
        // Prevent video selection
        this.videoPlayer.addEventListener('selectstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Disable drag and drop on video
        this.videoPlayer.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Prevent picture-in-picture
        this.videoPlayer.addEventListener('enterpictureinpicture', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Add security attributes
        this.videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen');
        this.videoPlayer.disablePictureInPicture = true;
        this.videoPlayer.disableRemotePlayback = true;
    }
    
    // ========== PLAYER INITIALIZATION ==========
    
    async initializePlayer() {
        try {
            this.loadingIndicator.style.display = 'flex';
            this.errorMessage.style.display = 'none';
            
            // Validate code format
            if (!this.deepLinkCode || !/^[a-zA-Z0-9]{6,10}$/.test(this.deepLinkCode)) {
                throw new Error('Invalid video code format');
            }
            
            // Fetch video data from secure API
            const apiUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
            const fullUrl = `${apiUrl}?code=${encodeURIComponent(this.deepLinkCode)}${this.userId ? '&user_id=' + this.userId : ''}`;
            
            this.updateDebugInfo('api', 'Fetching...');
            this.updateDebugInfo('status', 'Loading API...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Content-Type-Options': 'nosniff'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            this.updateDebugInfo('api', `Status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                
                if (response.status === 404) {
                    throw new Error('Video not found. Please check your video code.');
                } else if (response.status === 403) {
                    throw new Error('Access denied. You do not have permission to view this video.');
                } else if (response.status === 500) {
                    throw new Error('Server error. Please try again later.');
                } else {
                    throw new Error(`Error ${response.status}: Failed to load video data.`);
                }
            }
            
            const data = await response.json();
            this.updateDebugInfo('api', 'SUCCESS');
            
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid response format from server.');
            }
            
            // Check VIP access
            if (data.access && !data.access.has_access) {
                this.showVipRequiredError(data);
                return;
            }
            
            if (!data.video_url) {
                throw new Error('Video URL not found in response.');
            }
            
            this.updateDebugInfo('status', 'Video loaded');
            
            // Update UI with video metadata
            this.updateVideoMetadata(data);
            
            // Secure video source loading
            await this.setVideoSourceSecurely(data.video_url);
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Reset retry count on success
            this.retryCount = 0;
            
        } catch (error) {
            console.error('Error fetching video data:', error);
            
            this.updateDebugInfo('api', 'FAILED');
            this.updateDebugInfo('status', 'Error: ' + error.message);
            
            let errorMessage = 'Failed to load video. Please try again.';
            
            if (error.name === 'AbortError') {
                errorMessage = 'Request timeout. Please check your internet connection.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showError(errorMessage);
            this.loadingIndicator.style.display = 'none';
            
            if (this.retryButton) {
                this.retryButton.style.display = 'inline-block';
            }
        }
    }
    
    // ========== SECURE VIDEO SOURCE HANDLING ==========
    
    async setVideoSourceSecurely(videoUrl) {
        if (!this.videoPlayer) {
            throw new Error('Video player element not found');
        }
        
        // Generate secure token
        this.videoToken = this.generateVideoToken();
        
        // Encrypt or obfuscate the URL
        const secureUrl = this.obfuscateVideoUrl(videoUrl);
        
        // Validate URL
        try {
            new URL(secureUrl);
        } catch (error) {
            throw new Error('Invalid video URL format.');
        }
        
        // Set source with additional security
        this.videoPlayer.src = secureUrl;
        
        // Security attributes
        this.videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen');
        this.videoPlayer.disablePictureInPicture = true;
        this.videoPlayer.disableRemotePlayback = true;
        this.videoPlayer.setAttribute('crossorigin', 'anonymous');
        this.videoPlayer.setAttribute('preload', 'metadata');
        this.videoPlayer.setAttribute('playsinline', 'true');
        this.videoPlayer.setAttribute('webkit-playsinline', 'true');
        this.videoPlayer.controls = false;
        
        // Add security event listeners
        this.videoPlayer.addEventListener('loadedmetadata', () => {
            this.protectVideoElement();
        });
        
        // Load the video
        this.videoPlayer.load();
        
        // Store token for verification
        sessionStorage.setItem('video_token', this.videoToken);
    }
    
    generateVideoToken() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return btoa(`${timestamp}:${random}:${this.deepLinkCode}`).replace(/=/g, '');
    }
    
    obfuscateVideoUrl(url) {
        // Add security parameters to URL
        const separator = url.includes('?') ? '&' : '?';
        const token = this.videoToken;
        const timestamp = Date.now();
        const signature = btoa(`${token}:${timestamp}`).replace(/=/g, '');
        
        return `${url}${separator}_t=${timestamp}&_s=${signature}&_v=2`;
    }
    
    protectVideoElement() {
        // Make video element properties non-enumerable
        const video = this.videoPlayer;
        
        // Protect src property
        Object.defineProperty(video, 'src', {
            get: () => '',
            set: (value) => {
                // Only allow setting from our secure method
                if (!value.includes('_s=') || !value.includes('_t=')) {
                    console.warn('Blocked direct src assignment');
                    return;
                }
                video.setAttribute('src', value);
            },
            configurable: false
        });
        
        // Protect currentSrc
        Object.defineProperty(video, 'currentSrc', {
            get: () => 'secure://video',
            configurable: false
        });
        
        // Add additional protection layers
        this.addVideoStreamProtection();
    }
    
    addVideoStreamProtection() {
        // Override media element methods
        const video = this.videoPlayer;
        const originalPlay = video.play;
        const originalPause = video.pause;
        
        video.play = function() {
            // Verify token before allowing play
            const storedToken = sessionStorage.getItem('video_token');
            if (!storedToken || storedToken !== window.videoPlayerApp.videoToken) {
                console.warn('Play blocked: Invalid token');
                return Promise.reject(new Error('Playback not authorized'));
            }
            return originalPlay.call(this);
        };
        
        video.pause = function() {
            return originalPause.call(this);
        };
    }
    
    // ========== UI UPDATE FUNCTIONS ==========
    
    updateVideoMetadata(data) {
        const title = data.title || 'Untitled Video';
        const description = data.description || '';
        
        if (this.videoTitle) {
            this.videoTitle.textContent = title;
        }
        if (this.overlayTitle) {
            this.overlayTitle.textContent = title;
        }
        
        if (this.videoDescription) {
            this.videoDescription.textContent = description;
            this.videoDescription.style.display = description ? 'block' : 'none';
        }
        
        document.title = title + ' - Harch Short';
    }
    
    // ========== EVENT LISTENERS ==========
    
    setupEventListeners() {
        if (!this.videoPlayer) return;
        
        // Video events
        this.videoPlayer.addEventListener('loadeddata', this.handleVideoLoaded.bind(this));
        this.videoPlayer.addEventListener('canplay', this.handleVideoCanPlay.bind(this));
        this.videoPlayer.addEventListener('playing', this.handleVideoPlaying.bind(this));
        this.videoPlayer.addEventListener('pause', this.handleVideoPause.bind(this));
        this.videoPlayer.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
        this.videoPlayer.addEventListener('ended', this.handleVideoEnded.bind(this));
        this.videoPlayer.addEventListener('error', this.handleVideoError.bind(this));
        this.videoPlayer.addEventListener('volumechange', this.handleVolumeChange.bind(this));
        this.videoPlayer.addEventListener('waiting', this.handleVideoWaiting.bind(this));
        this.videoPlayer.addEventListener('loadstart', () => {
            this.loadingIndicator.style.display = 'flex';
        });
        
        // Control button events
        this.addControlEventListeners();
        
        // Touch and mouse events
        this.addInteractionEventListeners();
        
        // Fullscreen events
        this.addFullscreenEventListeners();
        
        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
    }
    
    addControlEventListeners() {
        if (this.playPauseButton) {
            this.playPauseButton.addEventListener('click', this.togglePlayPause.bind(this));
        }
        if (this.fullscreenButton) {
            this.fullscreenButton.addEventListener('click', this.toggleFullscreen.bind(this));
        }
        if (this.rewindButton) {
            this.rewindButton.addEventListener('click', this.rewindVideo.bind(this));
        }
        if (this.forwardButton) {
            this.forwardButton.addEventListener('click', this.forwardVideo.bind(this));
        }
        if (this.retryButton) {
            this.retryButton.addEventListener('click', this.retryLoading.bind(this));
        }
        if (this.backButton) {
            this.backButton.addEventListener('click', this.goBack.bind(this));
        }
        
        // Progress bar
        if (this.progressContainer) {
            this.progressContainer.addEventListener('click', this.seekToPosition.bind(this));
        }
        
        // Volume control
        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', this.adjustVolume.bind(this));
        }
    }
    
    addInteractionEventListeners() {
        // Video player click
        this.videoPlayer.addEventListener('click', () => {
            this.togglePlayPause();
            this.showControls();
        });
        
        // Video container events
        if (this.videoContainer) {
            this.videoContainer.addEventListener('mouseenter', () => {
                this.showControls();
            });
            
            this.videoContainer.addEventListener('mouseleave', () => {
                if (this.isVideoPlaying) {
                    this.hideControlsAfterDelay();
                }
            });
            
            // Touch events
            this.videoContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    this.showControls();
                    this.hideControlsAfterDelay();
                }
            });
        }
        
        // Control overlay click
        if (this.controlsOverlay) {
            this.controlsOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }
    
    addFullscreenEventListeners() {
        document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('mozfullscreenchange', this.handleFullscreenChange.bind(this));
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only allow shortcuts when controls are visible
            if (!this.isControlsVisible && !this.videoPlayer.paused) {
                return;
            }
            
            switch(e.key) {
                case ' ':
                case 'k':
                    this.togglePlayPause();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'f':
                    this.toggleFullscreen();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'ArrowLeft':
                    this.rewindVideo();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    this.forwardVideo();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'm':
                    this.toggleMute();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'ArrowUp':
                    this.increaseVolume();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                    this.decreaseVolume();
                    this.showControls();
                    e.preventDefault();
                    break;
            }
        });
    }
    
    // ========== VIDEO EVENT HANDLERS ==========
    
    handleVideoLoaded() {
        this.videoDuration = this.videoPlayer.duration;
        this.updateDurationDisplay();
    }
    
    handleVideoCanPlay() {
        this.loadingIndicator.style.display = 'none';
        
        // Set initial volume
        this.videoPlayer.volume = this.lastVolume;
        if (this.volumeSlider) {
            this.volumeSlider.value = this.lastVolume;
        }
        
        // Show controls briefly
        this.showControls();
        setTimeout(() => {
            if (this.isVideoPlaying) {
                this.hideControls();
            }
        }, 2000);
    }
    
    handleVideoPlaying() {
        this.isVideoPlaying = true;
        if (this.playIcon) this.playIcon.style.display = 'none';
        if (this.pauseIcon) this.pauseIcon.style.display = 'block';
        this.loadingIndicator.style.display = 'none';
        this.hideControlsAfterDelay();
    }
    
    handleVideoPause() {
        this.isVideoPlaying = false;
        if (this.playIcon) this.playIcon.style.display = 'block';
        if (this.pauseIcon) this.pauseIcon.style.display = 'none';
    }
    
    handleTimeUpdate() {
        if (this.videoDuration && this.progressBar) {
            const progressPercent = (this.videoPlayer.currentTime / this.videoDuration) * 100;
            this.progressBar.style.width = `${progressPercent}%`;
            this.updateCurrentTimeDisplay();
        }
    }
    
    handleVideoEnded() {
        this.isVideoPlaying = false;
        if (this.playIcon) this.playIcon.style.display = 'block';
        if (this.pauseIcon) this.pauseIcon.style.display = 'none';
        this.showControls();
    }
    
    handleVideoError() {
        this.loadingIndicator.style.display = 'none';
        const error = this.videoPlayer.error;
        let errorMessage = 'Failed to load video. Please try again.';
        
        if (error) {
            switch (error.code) {
                case error.MEDIA_ERR_ABORTED:
                    errorMessage = 'Video playback was aborted.';
                    break;
                case error.MEDIA_ERR_NETWORK:
                    errorMessage = 'Network error occurred while loading video.';
                    break;
                case error.MEDIA_ERR_DECODE:
                    errorMessage = 'Video decoding error. The video format may not be supported.';
                    break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = 'Video format not supported or video not found.';
                    break;
            }
        }
        
        this.showError(errorMessage);
        console.error('Video error:', error);
    }
    
    handleVideoWaiting() {
        if (this.isVideoPlaying) {
            this.loadingIndicator.style.display = 'flex';
        }
    }
    
    handleVolumeChange() {
        if (this.volumeSlider) {
            this.volumeSlider.value = this.videoPlayer.volume;
        }
        this.lastVolume = this.videoPlayer.volume;
    }
    
    handleFullscreenChange() {
        // Update fullscreen button state if needed
    }
    
    // ========== CONTROL FUNCTIONS ==========
    
    togglePlayPause() {
        if (!this.videoPlayer) return;
        
        if (this.videoPlayer.paused || this.videoPlayer.ended) {
            this.videoPlayer.play()
                .then(() => {
                    this.isVideoPlaying = true;
                    if (this.playIcon) this.playIcon.style.display = 'none';
                    if (this.pauseIcon) this.pauseIcon.style.display = 'block';
                })
                .catch(error => {
                    console.error('Error playing video:', error);
                    this.showError('Cannot play video. Please check your connection.');
                });
        } else {
            this.videoPlayer.pause();
            this.isVideoPlaying = false;
            if (this.playIcon) this.playIcon.style.display = 'block';
            if (this.pauseIcon) this.pauseIcon.style.display = 'none';
        }
    }
    
    toggleFullscreen() {
        if (!this.videoContainer) return;
        
        if (!document.fullscreenElement && 
            !document.webkitFullscreenElement && 
            !document.mozFullScreenElement) {
            // Enter fullscreen
            if (this.videoContainer.requestFullscreen) {
                this.videoContainer.requestFullscreen();
            } else if (this.videoContainer.webkitRequestFullscreen) {
                this.videoContainer.webkitRequestFullscreen();
            } else if (this.videoContainer.mozRequestFullScreen) {
                this.videoContainer.mozRequestFullScreen();
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            }
        }
        this.showControls();
    }
    
    rewindVideo() {
        if (!this.videoPlayer) return;
        this.videoPlayer.currentTime = Math.max(0, this.videoPlayer.currentTime - 10);
        this.showControls();
    }
    
    forwardVideo() {
        if (!this.videoPlayer) return;
        this.videoPlayer.currentTime = Math.min(
            this.videoDuration, 
            this.videoPlayer.currentTime + 10
        );
        this.showControls();
    }
    
    toggleMute() {
        if (!this.videoPlayer) return;
        this.videoPlayer.muted = !this.videoPlayer.muted;
        if (this.videoPlayer.muted) {
            this.lastVolume = this.videoPlayer.volume;
            this.videoPlayer.volume = 0;
        } else {
            this.videoPlayer.volume = this.lastVolume;
        }
        this.showControls();
    }
    
    increaseVolume() {
        if (!this.videoPlayer) return;
        this.videoPlayer.volume = Math.min(1, this.videoPlayer.volume + 0.1);
        this.showVolumeControl();
    }
    
    decreaseVolume() {
        if (!this.videoPlayer) return;
        this.videoPlayer.volume = Math.max(0, this.videoPlayer.volume - 0.1);
        this.showVolumeControl();
    }
    
    adjustVolume() {
        if (!this.videoPlayer || !this.volumeSlider) return;
        this.videoPlayer.volume = this.volumeSlider.value;
        this.showVolumeControl();
    }
    
    showVolumeControl() {
        if (!this.volumeContainer) return;
        this.volumeContainer.style.display = 'block';
        clearTimeout(this.volumeContainer.timeout);
        this.volumeContainer.timeout = setTimeout(() => {
            this.volumeContainer.style.display = 'none';
        }, 2000);
    }
    
    retryLoading() {
        if (this.retryCount >= this.maxRetries) {
            this.showError('Maximum retry attempts reached. Please refresh the page.');
            return;
        }
        
        this.retryCount++;
        this.errorMessage.style.display = 'none';
        this.loadingIndicator.style.display = 'flex';
        
        this.initializePlayer();
    }
    
    goBack() {
        if (document.referrer && document.referrer !== '') {
            window.history.back();
        } else if (window.history.length > 1) {
            window.history.back();
        }
    }
    
    seekToPosition(e) {
        if (!this.videoPlayer || !this.progressContainer) return;
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        this.videoPlayer.currentTime = pos * this.videoDuration;
        this.showControls();
    }
    
    // ========== UI FUNCTIONS ==========
    
    updateCurrentTimeDisplay() {
        if (!this.currentTimeDisplay || !this.videoPlayer) return;
        const currentTime = this.videoPlayer.currentTime;
        const minutes = Math.floor(currentTime / 60);
        const seconds = Math.floor(currentTime % 60);
        this.currentTimeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateDurationDisplay() {
        if (!this.durationDisplay) return;
        const minutes = Math.floor(this.videoDuration / 60);
        const seconds = Math.floor(this.videoDuration % 60);
        this.durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    showError(message) {
        if (this.errorText) {
            this.errorText.textContent = message;
        }
        if (this.errorMessage) {
            this.errorMessage.style.display = 'block';
        }
        this.loadingIndicator.style.display = 'none';
    }
    
    updateDebugInfo(field, value) {
        const debugEl = document.getElementById('debug' + field.charAt(0).toUpperCase() + field.slice(1));
        if (debugEl) {
            debugEl.textContent = value;
        }
    }
    
    showVipRequiredError(data) {
        this.loadingIndicator.style.display = 'none';
        
        const errorContainer = this.errorMessage;
        errorContainer.innerHTML = `
            <div style="margin-bottom: 15px;">
                <i class="fas fa-crown" style="font-size: 48px; color: #ffd700; margin-bottom: 15px;"></i>
            </div>
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #fff;">
                Konten VIP
            </div>
            <div style="font-size: 14px; color: #ffb3b3; margin-bottom: 20px; line-height: 1.5;">
                ${data.access.message || 'Video ini kusus member VIP'}
            </div>
            ${data.access.vip_expired ? `
                <div style="font-size: 13px; color: #ff8888; margin-bottom: 15px; padding: 10px; background: rgba(255,68,68,0.1); border-radius: 8px;">
                    <i class="fas fa-exclamation-circle"></i> Akses VIP Anda telah berakhir.
                    ${data.access.vip_expired_date ? `<br>Expired: ${new Date(data.access.vip_expired_date).toLocaleDateString()}` : ''}
                </div>
            ` : ''}
            <button class="retry-btn" onclick="window.videoPlayerApp.openVipPurchase()" style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #000; font-weight: bold; padding: 12px 30px; font-size: 16px; margin-bottom: 10px; width: 80%; max-width: 250px;">
                <i class="fas fa-crown"></i> Beli Akses VIP
            </button>
            <div style="font-size: 12px; color: #aaa; margin-top: 10px;">
                Dapatkan akses tak terbatas ke semua konten VIP.
            </div>
        `;
        
        errorContainer.style.display = 'block';
        
        // Update video info
        if (data.title) {
            this.videoTitle.textContent = data.title + ' 👑';
            this.overlayTitle.textContent = data.title + ' 👑';
        }
        if (data.description) {
            this.videoDescription.textContent = data.description;
        }
        
        this.updateDebugInfo('status', 'VIP Dibutuhkan');
    }
    
    openVipPurchase() {
        if (window.Telegram && window.Telegram.WebApp) {
            try {
                const tg = window.Telegram.WebApp;
                tg.close();
            } catch (error) {
                console.error('Error opening bot:', error);
                alert('Silakan kembali ke bot untuk membeli VIP.');
            }
        } else {
            window.open('https://t.me/drachin_harch_bot?start=vip', '_blank');
        }
    }
    
    // ========== CONTROLS VISIBILITY ==========
    
    showControls() {
        if (!this.controlsOverlay) return;
        this.controlsOverlay.classList.add('show-controls');
        this.isControlsVisible = true;
        
        clearTimeout(this.controlsTimeout);
        if (this.isVideoPlaying) {
            this.controlsTimeout = setTimeout(() => {
                this.hideControls();
            }, 3000);
        }
    }
    
    hideControls() {
        if (!this.controlsOverlay) return;
        if (this.isVideoPlaying) {
            this.controlsOverlay.classList.remove('show-controls');
            this.isControlsVisible = false;
        }
    }
    
    hideControlsAfterDelay() {
        clearTimeout(this.controlsTimeout);
        if (this.isVideoPlaying) {
            this.controlsTimeout = setTimeout(() => {
                this.hideControls();
            }, 3000);
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Add security check before initialization
    if (window.self !== window.top) {
        window.top.location = window.self.location;
        return;
    }
    
    window.videoPlayerApp = new VideoPlayerApp();
    
    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            document.body.style.height = '100vh';
            document.body.offsetHeight;
        }, 100);
    });
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        sessionStorage.removeItem('video_token');
    });
});
