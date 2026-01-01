// app.js - Enhanced Video Player for Harch Short

class VideoPlayerApp {
    constructor() {
        // Security measures
        this.setupSecurityMeasures();
        
        // Initialize elements
        this.initializeElements();
        
        // Get deep link code (URL ?code= OR Telegram startapp)
        let rawCode = this.getUrlParameter('code') || this.getTelegramStartParam();
        
        // Validate and clean the code IMMEDIATELY
        this.deepLinkCode = this.validateVideoCode(rawCode);
        
        // Get user ID from Telegram
        this.userId = this.getTelegramUserId();
        
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
        
        // Initialize with controls hidden
        this.hideControls();
    }
    
    // Get URL parameter - FIXED for Telegram WebApp
    getUrlParameter(name) {
        try {
            // Try URL search params first
            const urlParams = new URLSearchParams(window.location.search);
            let param = urlParams.get(name);
            
            // If found, return immediately (will be cleaned by validateVideoCode)
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
                // Look for start_param in hash
                const match = hashPart.match(/start_param=([^&]+)/);
                if (match) {
                    return match[1];
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    getTelegramStartParam() {
        try {
            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;
                tg.ready();
                
                // Get start param from Telegram WebApp
                const startParam = tg.initDataUnsafe?.start_param || 
                                  tg.startParam || 
                                  null;
                
                return startParam;
            } else {
            }
        } catch (error) {
        }
        return null;
    }
    
    getTelegramUserId() {
        try {
            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;
                const userId = tg.initDataUnsafe?.user?.id || null;
                return userId;
            }
        } catch (error) {
            console.error('Error getting Telegram user ID:', error);
        }
        return null;
    }
    
    // ========== UTILITY FUNCTIONS ==========
    
    // Validate and clean video code - CRITICAL FUNCTION
    validateVideoCode(rawCode) {
        if (!rawCode) {
            console.warn('validateVideoCode: No code provided');
            return null;
        }
        
        let code = String(rawCode);
        
        // Step 1: Remove everything after # (hash fragment)
        if (code.includes('#')) {
            code = code.split('#')[0];
        }
        
        // Step 2: Remove everything after ? (query string)
        if (code.includes('?')) {
            code = code.split('?')[0];
        }
        
        // Step 3: Remove everything after & (parameter separator)
        if (code.includes('&')) {
            code = code.split('&')[0];
        }
        
        // Step 4: Decode URL encoding if present
        try {
            if (code.includes('%')) {
                code = decodeURIComponent(code.split('%')[0]);
            }
        } catch (e) {
            console.warn('validateVideoCode: URL decode failed, using as-is');
        }
        
        // Step 5: Remove all non-alphanumeric characters
        code = code.replace(/[^a-zA-Z0-9]/g, '');
        
        // Step 6: Trim whitespace
        code = code.trim();
        
        // Step 7: Validate format (6-10 alphanumeric characters)
        const regex = /^[a-zA-Z0-9]{6,10}$/;
        if (!regex.test(code)) {
            console.error('validateVideoCode: Invalid format. Must be 6-10 alphanumeric characters. Got:', code);
            return null;
        }

        return code;
    }
    
    // ========== SETUP FUNCTIONS ==========
    setupSecurityMeasures() {
        // Disable right-click context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
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
    }
    
    // Initialize DOM elements
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
        
        // Add security to video player
        this.addVideoSecurity();
    }
    
    // Add security to video player
    addVideoSecurity() {
        if (!this.videoPlayer) return;
        
        // Prevent video context menu
        this.videoPlayer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
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
    }
    
    // Initialize player with API call - IMPROVED WITH VIP CHECK
    async initializePlayer() {
        try {
            this.loadingIndicator.style.display = 'flex';
            this.errorMessage.style.display = 'none';
            
            // DOUBLE CHECK: Ensure code is clean before API call
            if (!this.deepLinkCode || !/^[a-zA-Z0-9]{6,10}$/.test(this.deepLinkCode)) {
                throw new Error('Invalid video code format: ' + this.deepLinkCode);
            }
            
            // Fetch video data from backend API with timeout
            const apiUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
            const fullUrl = `${apiUrl}?code=${encodeURIComponent(this.deepLinkCode)}${this.userId ? '&user_id=' + this.userId : ''}`;
            
            this.updateDebugInfo('api', 'Fetching...');
            this.updateDebugInfo('status', 'Loading API...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            this.updateDebugInfo('api', `Status: ${response.status}`);
            
            // Handle HTTP errors
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
            
            // Parse JSON response
            const data = await response.json();
            this.updateDebugInfo('api', 'SUCCESS');
            
            // Validate response data
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
            
            // Set video source
            this.setVideoSource(data.video_url);
            
            // Setup event listeners for enhanced UI
            this.setupEventListeners();
            
            // Reset retry count on success
            this.retryCount = 0;
            
        } catch (error) {
            console.error('Error fetching video data:', error);
            
            this.updateDebugInfo('api', 'FAILED');
            this.updateDebugInfo('status', 'Error: ' + error.message);
            
            // Handle specific error types
            let errorMessage = 'Failed to load video. Please try again.';
            
            if (error.name === 'AbortError') {
                errorMessage = 'Request timeout. Please check your internet connection.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showError(errorMessage + (this.userId ? '' : ' (User ID: Not logged in)'));
            this.loadingIndicator.style.display = 'none';
            
            // Show retry button
            if (this.retryButton) {
                this.retryButton.style.display = 'inline-block';
            }
        }
    }
    
    // Update video metadata - IMPROVED
    updateVideoMetadata(data) {
        // Update title
        const title = data.title || 'Untitled Video';
        if (this.videoTitle) {
            this.videoTitle.textContent = title;
        }
        if (this.overlayTitle) {
            this.overlayTitle.textContent = title;
        }
        
        // Update description
        const description = data.description || '';
        if (this.videoDescription) {
            this.videoDescription.textContent = description;
            // Hide description container if empty
            if (!description) {
                this.videoDescription.style.display = 'none';
            }
        }
        
        // Update page title
        document.title = title + ' - Harch Short';
    }
    
    // Set video source with security - IMPROVED
    setVideoSource(videoUrl) {
        if (!this.videoPlayer) {
            console.error('Video player element not found');
            return;
        }
        
        // Validate video URL
        try {
            new URL(videoUrl);
        } catch (error) {
            console.error('Invalid video URL:', videoUrl);
            this.showError('Invalid video URL. Please contact support.');
            return;
        }
        
        this.videoPlayer.src = videoUrl;
        
        // Set security attributes
        this.videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
        this.videoPlayer.disableRemotePlayback = true;
        this.videoPlayer.setAttribute('crossorigin', 'anonymous');
        this.videoPlayer.setAttribute('preload', 'metadata');
        this.videoPlayer.setAttribute('playsinline', 'true');
        this.videoPlayer.setAttribute('webkit-playsinline', 'true');
        
        // Ensure video player is not using native controls
        this.videoPlayer.controls = false;
        
        // Load the video
        this.videoPlayer.load();
    }
    
    // Setup event listeners for enhanced UI
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
        
        // Progress bar events
        if (this.progressContainer) {
            this.progressContainer.addEventListener('click', this.seekToPosition.bind(this));
        }
        
        // Volume control events
        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', this.adjustVolume.bind(this));
        }
        
        // Video player click events
        this.videoPlayer.addEventListener('click', () => {
            this.togglePlayPause();
            this.showControls();
        });
        
        // Video container hover events
        if (this.videoContainer) {
            this.videoContainer.addEventListener('mouseenter', () => {
                this.showControls();
            });
            
            this.videoContainer.addEventListener('mouseleave', () => {
                if (this.isVideoPlaying) {
                    this.hideControlsAfterDelay();
                }
            });
            
            // Touch events for mobile
            this.videoContainer.addEventListener('touchstart', () => {
                this.showControls();
                this.hideControlsAfterDelay();
            });
        }
        
        // Control overlay click - prevent video click
        if (this.controlsOverlay) {
            this.controlsOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
        
        // Fullscreen events
        document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('mozfullscreenchange', this.handleFullscreenChange.bind(this));
        
        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
    }
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
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
    
    // ========== DEBUG FUNCTIONS ==========
    
    updateDebugInfo(field, value) {
        const debugEl = document.getElementById('debug' + field.charAt(0).toUpperCase() + field.slice(1));
        if (debugEl) {
            debugEl.textContent = value;
        }
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
        
        // Show controls briefly when video is ready
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
        // Update UI for fullscreen if needed
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
        // Show volume control temporarily
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
        
        // Retry initialization
        this.initializePlayer();
    }
    
    goBack() {
        if (document.referrer && document.referrer !== '') {
            window.history.back();
        } else if (window.history.length > 1) {
            window.history.back();
        } else {
            // Optional: redirect to home page
            // window.location.href = '/';
        }
    }
    
    seekToPosition(e) {
        if (!this.videoPlayer || !this.progressContainer) return;
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        this.videoPlayer.currentTime = pos * this.videoDuration;
        this.showControls();
    }
    
    // ========== UI UPDATE FUNCTIONS ==========
    
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
    
    showVipRequiredError(data) {
        this.loadingIndicator.style.display = 'none';
        
        // Create VIP required message with styled UI
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
        
        this.updateDebugInfo('status', 'VIP Required');
    }
    
    openVipPurchase() {
        // Open Telegram bot to purchase VIP
        if (window.Telegram && window.Telegram.WebApp) {
            try {
                const tg = window.Telegram.WebApp;
                // Close the WebApp and return to bot
                tg.close();
                // Or you can use deep link to specific command
                // window.open('https://t.me/drachin_harch_bot?start=vip', '_blank');
            } catch (error) {
                console.error('Error opening bot:', error);
                alert('Please return to the bot to purchase VIP membership');
            }
        } else {
            // Fallback: open bot link
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

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.videoPlayerApp = new VideoPlayerApp();
    
    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            document.body.style.height = '100vh';
            document.body.offsetHeight; // Trigger reflow
        }, 100);
    });
});
