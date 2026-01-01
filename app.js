// app.js - Video Player for Telegram Mini App (Fixed for tgWebAppStartParam)

class VideoPlayerApp {
    constructor() {
        // Security measures
        this.setupSecurityMeasures();
        
        // Initialize elements
        this.initializeElements();
        
        // Debug URL information
        this.debugUrlInfo();
        
        // Get video code from URL
        this.videoCode = this.extractVideoCode();
        
        // Update debug UI
        this.updateDebugInfo('code', this.videoCode || 'NO CODE');
        this.updateDebugInfo('telegram', 'TELEGRAM DIRECT');
        this.updateDebugInfo('status', 'Initializing...');
        
        // Log extracted code
        console.log('🎯 Final video code extracted:', this.videoCode);
        
        // Initialize player
        if (!this.videoCode || !this.isValidVideoCode(this.videoCode)) {
            const errorMsg = !this.videoCode ? 
                'No video code found. Please check your link.' : 
                `Invalid video code: ${this.videoCode}`;
            
            this.showError(errorMsg);
            this.updateDebugInfo('status', 'INVALID CODE');
            document.getElementById('loadingIndicator').style.display = 'none';
            
            // Show debug info
            this.showDebugParameters();
        } else {
            this.updateDebugInfo('status', 'Loading video...');
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
        this.videoMetadata = null;
        
        // Initialize with controls hidden
        this.hideControls();
    }
    
    // ========== URL DEBUGGING ==========
    
    debugUrlInfo() {
        console.log('=== URL DEBUG INFO ===');
        console.log('📍 Full URL:', window.location.href);
        console.log('🏠 Hostname:', window.location.hostname);
        console.log('📁 Pathname:', window.location.pathname);
        console.log('🔍 Search:', window.location.search);
        console.log('🔗 Hash:', window.location.hash ? window.location.hash.substring(0, 100) + '...' : '(empty)');
        
        // Parse query parameters
        const urlParams = new URLSearchParams(window.location.search);
        console.log('📋 Query Parameters:');
        
        let hasTelegramParam = false;
        for (const [key, value] of urlParams.entries()) {
            console.log(`   ${key}: ${value}`);
            if (key.includes('tgWebApp') || key.includes('start')) {
                hasTelegramParam = true;
            }
        }
        
        // Parse hash parameters
        if (window.location.hash) {
            const hash = window.location.hash.substring(1);
            console.log('🗝️ Hash Content (first 200 chars):', hash.substring(0, 200) + (hash.length > 200 ? '...' : ''));
            
            try {
                const hashParams = new URLSearchParams(hash);
                console.log('📋 Hash Parameters:');
                
                for (const [key, value] of hashParams.entries()) {
                    console.log(`   ${key}: ${value.length > 50 ? value.substring(0, 50) + '...' : value}`);
                    
                    if (key === 'tgWebAppData') {
                        hasTelegramParam = true;
                        console.log('   🔐 Parsing tgWebAppData...');
                        try {
                            const decoded = decodeURIComponent(value);
                            const tgParams = new URLSearchParams(decoded);
                            const startParam = tgParams.get('start_param');
                            if (startParam) {
                                console.log(`   🎯 Found start_param in tgWebAppData: ${startParam}`);
                            }
                        } catch (e) {
                            console.log('   ❌ Error parsing tgWebAppData:', e.message);
                        }
                    }
                }
            } catch (e) {
                console.log('   ❌ Cannot parse hash as query string');
            }
        }
        
        console.log(`📱 Telegram detected: ${hasTelegramParam ? 'YES' : 'NO'}`);
        console.log('=====================');
    }
    
    showDebugParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        let debugHTML = '<div style="font-size: 12px; color: #888; margin-top: 15px; text-align: left; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">';
        debugHTML += '<strong>🔍 Debug Info:</strong><br>';
        
        // Show tgWebAppStartParam if exists
        const tgStartParam = urlParams.get('tgWebAppStartParam');
        if (tgStartParam) {
            debugHTML += `tgWebAppStartParam: <code style="color: #4CAF50;">${tgStartParam}</code><br>`;
        }
        
        // Show other parameters
        for (const [key, value] of urlParams.entries()) {
            if (key !== 'tgWebAppStartParam') {
                debugHTML += `${key}: <code>${value.substring(0, 30)}${value.length > 30 ? '...' : ''}</code><br>`;
            }
        }
        
        debugHTML += '</div>';
        
        if (this.errorText) {
            this.errorText.innerHTML += debugHTML;
        }
    }
    
    // ========== VIDEO CODE EXTRACTION ==========
    
    extractVideoCode() {
        console.log('🔍 Extracting video code...');
        
        // Method 1: Direct tgWebAppStartParam parameter
        const tgStartParam = this.getTgWebAppStartParam();
        if (tgStartParam) {
            console.log('✅ Found tgWebAppStartParam:', tgStartParam);
            return tgStartParam;
        }
        
        // Method 2: Parse hash for start_param
        const hashStartParam = this.getStartParamFromHash();
        if (hashStartParam) {
            console.log('✅ Found start_param in hash:', hashStartParam);
            return hashStartParam;
        }
        
        // Method 3: Standard 'code' parameter
        const codeParam = this.getCodeParam();
        if (codeParam) {
            console.log('✅ Found code parameter:', codeParam);
            return codeParam;
        }
        
        // Method 4: From hash (simple)
        const hashParam = this.getSimpleHashCode();
        if (hashParam) {
            console.log('✅ Found code in hash:', hashParam);
            return hashParam;
        }
        
        // Method 5: From path
        const pathParam = this.getCodeFromPath();
        if (pathParam) {
            console.log('✅ Found code in path:', pathParam);
            return pathParam;
        }
        
        console.log('❌ No video code found');
        return null;
    }
    
    getTgWebAppStartParam() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const startParam = urlParams.get('tgWebAppStartParam');
            
            if (startParam) {
                console.log('📱 tgWebAppStartParam found:', startParam);
                return this.cleanCode(startParam);
            }
        } catch (e) {
            console.error('Error getting tgWebAppStartParam:', e);
        }
        
        return null;
    }
    
    getStartParamFromHash() {
        if (!window.location.hash) return null;
        
        try {
            const hash = window.location.hash.substring(1);
            const hashParams = new URLSearchParams(hash);
            
            // Get start_param directly from hash
            const startParam = hashParams.get('start_param');
            if (startParam) {
                console.log('🔗 start_param found in hash:', startParam);
                return this.cleanCode(startParam);
            }
            
            // Try parsing tgWebAppData from hash
            const tgWebAppData = hashParams.get('tgWebAppData');
            if (tgWebAppData) {
                console.log('🔐 tgWebAppData found in hash, parsing...');
                try {
                    const decodedData = decodeURIComponent(tgWebAppData);
                    const tgParams = new URLSearchParams(decodedData);
                    const startParamFromData = tgParams.get('start_param');
                    
                    if (startParamFromData) {
                        console.log('🎯 start_param found in tgWebAppData:', startParamFromData);
                        return this.cleanCode(startParamFromData);
                    }
                } catch (parseError) {
                    console.error('Error parsing tgWebAppData:', parseError);
                }
            }
            
        } catch (e) {
            console.error('Error getting start param from hash:', e);
        }
        
        return null;
    }
    
    getCodeParam() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code') || 
                        urlParams.get('v') || 
                        urlParams.get('id') || 
                        urlParams.get('video');
            
            return this.cleanCode(code);
        } catch (e) {
            console.error('Error getting code param:', e);
            return null;
        }
    }
    
    getSimpleHashCode() {
        if (!window.location.hash) return null;
        
        try {
            const hash = window.location.hash.substring(1);
            
            // If hash is simple (not a query string), it might be the code
            if (!hash.includes('=') && !hash.includes('&') && !hash.includes('?')) {
                const cleanHash = this.cleanCode(hash);
                if (cleanHash && this.isValidVideoCode(cleanHash)) {
                    return cleanHash;
                }
            }
        } catch (e) {
            console.error('Error getting simple hash code:', e);
        }
        
        return null;
    }
    
    getCodeFromPath() {
        try {
            const path = window.location.pathname;
            const segments = path.split('/').filter(s => s.trim());
            
            // Skip common segments
            const skipSegments = ['index.html', 'mini-app', 'worker', 'api', ''];
            
            for (const segment of segments.reverse()) {
                if (!skipSegments.includes(segment)) {
                    const cleaned = this.cleanCode(segment);
                    if (cleaned && this.isValidVideoCode(cleaned)) {
                        return cleaned;
                    }
                }
            }
        } catch (e) {
            console.error('Error getting code from path:', e);
        }
        
        return null;
    }
    
    cleanCode(code) {
        if (!code || typeof code !== 'string') return null;
        
        let cleaned = code.trim();
        
        // Remove URL fragments and query strings
        cleaned = cleaned.split(/[#?&]/)[0];
        
        // Remove any non-alphanumeric characters (keep dash and underscore)
        cleaned = cleaned.replace(/[^a-zA-Z0-9-_]/g, '');
        
        // Return null if empty after cleaning
        return cleaned || null;
    }
    
    isValidVideoCode(code) {
        if (!code || typeof code !== 'string') return false;
        
        // Length check: 3 to 50 characters
        if (code.length < 3 || code.length > 50) {
            console.log(`Code length invalid: ${code.length} characters`);
            return false;
        }
        
        // Character check: only alphanumeric, dash, underscore
        const regex = /^[a-zA-Z0-9-_]+$/;
        const isValid = regex.test(code);
        
        if (!isValid) {
            console.log(`Code contains invalid characters: ${code}`);
        }
        
        return isValid;
    }
    
    // ========== SECURITY MEASURES ==========
    
    setupSecurityMeasures() {
        // Disable right-click
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Disable selection
        document.addEventListener('selectstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Disable drag
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Set user-select
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
    
    // ========== ELEMENT INITIALIZATION ==========
    
    initializeElements() {
        this.videoPlayer = document.getElementById('videoPlayer');
        this.videoContainer = document.getElementById('videoContainer');
        this.overlayTitle = document.getElementById('overlayTitle');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
        this.controlsOverlay = document.getElementById('controlsOverlay');
        
        this.playPauseButton = document.getElementById('playPauseButton');
        this.playIcon = document.getElementById('playIcon');
        this.pauseIcon = document.getElementById('pauseIcon');
        this.fullscreenButton = document.getElementById('fullscreenButton');
        this.rewindButton = document.getElementById('rewindButton');
        this.forwardButton = document.getElementById('forwardButton');
        this.retryButton = document.getElementById('retryButton');
        
        this.progressBar = document.getElementById('progressBar');
        this.progressContainer = document.getElementById('progressContainer');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.durationDisplay = document.getElementById('duration');
        
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeContainer = document.getElementById('volumeContainer');
        
        this.addVideoSecurity();
    }
    
    addVideoSecurity() {
        if (!this.videoPlayer) return;
        
        // Prevent video context menu
        this.videoPlayer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Add controlsList to disable download
        this.videoPlayer.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
        this.videoPlayer.disableRemotePlayback = true;
    }
    
    // ========== PLAYER INITIALIZATION ==========
    
    async initializePlayer() {
        try {
            this.loadingIndicator.style.display = 'flex';
            this.errorMessage.style.display = 'none';
            
            if (!this.videoCode) {
                throw new Error('No video code provided');
            }
            
            console.log(`🚀 Initializing player with code: ${this.videoCode}`);
            
            // Direct API call to Worker
            const apiUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
            const fullUrl = `${apiUrl}?code=${encodeURIComponent(this.videoCode)}`;
            
            this.updateDebugInfo('api', 'Fetching...');
            this.updateDebugInfo('status', 'Loading video...');
            
            console.log(`📡 Fetching from: ${fullUrl}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            this.updateDebugInfo('api', `Status: ${response.status}`);
            console.log(`📊 API Response: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                let errorData = {};
                try {
                    const text = await response.text();
                    if (text) errorData = JSON.parse(text);
                } catch (e) {
                    errorData = { error: 'Failed to parse error response' };
                }
                
                console.error('❌ API error:', errorData);
                
                if (response.status === 404) {
                    throw new Error('Video not found. Please check your video code.');
                } else if (response.status === 403) {
                    if (errorData.error === 'VIP required') {
                        this.showVipRequiredError(errorData);
                        return;
                    }
                    throw new Error('Access denied. VIP subscription required.');
                } else if (response.status === 400) {
                    throw new Error(errorData.message || 'Invalid request.');
                } else if (response.status === 500) {
                    throw new Error('Server error. Please try again.');
                } else {
                    throw new Error(`Error ${response.status}: Failed to load video.`);
                }
            }
            
            const data = await response.json();
            console.log('✅ Video data received:', data);
            
            this.updateDebugInfo('api', 'SUCCESS');
            
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid response from server.');
            }
            
            if (data.error) {
                if (data.error === 'VIP required') {
                    this.showVipRequiredError(data);
                    return;
                }
                throw new Error(data.message || data.error);
            }
            
            if (!data.stream_url) {
                throw new Error('Stream URL not found.');
            }

            this.updateDebugInfo('status', 'Video loaded');
            
            // Store metadata
            this.videoMetadata = data;
            
            // Update UI
            this.updateVideoMetadata(data);
            
            // Set video source
            this.setVideoSource(data.stream_url);
            
            // Setup event listeners
            this.setupEventListeners();
            
            this.retryCount = 0;
            
        } catch (error) {
            console.error('❌ Error in initializePlayer:', error);
            
            this.updateDebugInfo('api', 'FAILED');
            this.updateDebugInfo('status', `Error: ${error.message}`);
            
            let errorMessage = 'Failed to load video. Please try again.';
            
            if (error.name === 'AbortError') {
                errorMessage = 'Request timeout. Please check your internet connection.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showError(errorMessage);
            this.loadingIndicator.style.display = 'none';
            
            // Show retry button
            if (this.retryButton) {
                this.retryButton.style.display = 'inline-block';
                this.retryButton.onclick = () => this.retryLoading();
            }
        }
    }
    
    updateVideoMetadata(data) {
        const title = data.title || 'Video Player';
        
        // Update title in overlay
        if (this.overlayTitle) {
            this.overlayTitle.textContent = title;
        }
        
        // Update page title
        document.title = title + ' - Harch Short';
        
        // Update debug info
        this.updateDebugInfo('video', title.substring(0, 30));
    }
    
    setVideoSource(videoUrl) {
        if (!this.videoPlayer) return;

        console.log(`🎬 Setting video source: ${videoUrl}`);
        
        // Set video source
        this.videoPlayer.src = videoUrl;

        // Security and playback attributes
        this.videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
        this.videoPlayer.disableRemotePlayback = true;
        this.videoPlayer.setAttribute('preload', 'metadata');
        this.videoPlayer.setAttribute('playsinline', 'true');
        this.videoPlayer.setAttribute('webkit-playsinline', 'true');

        // Hide native controls
        this.videoPlayer.controls = false;
        
        // Load the video
        this.videoPlayer.load();
        
        console.log('✅ Video source set successfully');
    }
    
    // ========== EVENT LISTENERS ==========
    
    setupEventListeners() {
        if (!this.videoPlayer) return;
        
        // Video event listeners
        this.videoPlayer.addEventListener('loadeddata', this.handleVideoLoaded.bind(this));
        this.videoPlayer.addEventListener('canplay', this.handleVideoCanPlay.bind(this));
        this.videoPlayer.addEventListener('playing', this.handleVideoPlaying.bind(this));
        this.videoPlayer.addEventListener('pause', this.handleVideoPause.bind(this));
        this.videoPlayer.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
        this.videoPlayer.addEventListener('ended', this.handleVideoEnded.bind(this));
        this.videoPlayer.addEventListener('error', this.handleVideoError.bind(this));
        this.videoPlayer.addEventListener('volumechange', this.handleVolumeChange.bind(this));
        this.videoPlayer.addEventListener('waiting', this.handleVideoWaiting.bind(this));
        
        // Control button listeners
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
        
        if (this.progressContainer) {
            this.progressContainer.addEventListener('click', this.seekToPosition.bind(this));
        }
        
        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', this.adjustVolume.bind(this));
        }
        
        // Video click to play/pause
        this.videoPlayer.addEventListener('click', () => {
            this.togglePlayPause();
            this.showControls();
        });
        
        // Video container interactions
        if (this.videoContainer) {
            this.videoContainer.addEventListener('mouseenter', () => {
                this.showControls();
            });
            
            this.videoContainer.addEventListener('mouseleave', () => {
                if (this.isVideoPlaying) {
                    this.hideControlsAfterDelay();
                }
            });
            
            this.videoContainer.addEventListener('touchstart', () => {
                this.showControls();
                this.hideControlsAfterDelay();
            });
        }
        
        // Prevent controls overlay from triggering video click
        if (this.controlsOverlay) {
            this.controlsOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        console.log('✅ Event listeners setup complete');
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            switch(e.key.toLowerCase()) {
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
                case 'arrowleft':
                    this.rewindVideo();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'arrowright':
                    this.forwardVideo();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'm':
                    this.toggleMute();
                    this.showControls();
                    e.preventDefault();
                    break;
            }
        });
    }
    
    // ========== VIDEO EVENT HANDLERS ==========
    
    handleVideoLoaded() {
        this.videoDuration = this.videoPlayer.duration || 0;
        this.updateDurationDisplay();
        console.log('📊 Video loaded, duration:', this.formatTime(this.videoDuration));
    }
    
    handleVideoCanPlay() {
        this.loadingIndicator.style.display = 'none';
        this.videoPlayer.volume = this.lastVolume;
        
        if (this.volumeSlider) {
            this.volumeSlider.value = this.lastVolume;
        }
        
        this.showControls();
        
        // Auto-hide controls after 2 seconds if playing
        setTimeout(() => {
            if (this.isVideoPlaying) {
                this.hideControls();
            }
        }, 2000);
        
        console.log('▶️ Video can play');
    }
    
    handleVideoPlaying() {
        this.isVideoPlaying = true;
        
        if (this.playIcon) this.playIcon.style.display = 'none';
        if (this.pauseIcon) this.pauseIcon.style.display = 'block';
        
        this.loadingIndicator.style.display = 'none';
        this.hideControlsAfterDelay();
        
        console.log('🎥 Video playing');
    }
    
    handleVideoPause() {
        this.isVideoPlaying = false;
        
        if (this.playIcon) this.playIcon.style.display = 'block';
        if (this.pauseIcon) this.pauseIcon.style.display = 'none';
        
        console.log('⏸️ Video paused');
    }
    
    handleTimeUpdate() {
        if (this.videoDuration && this.videoPlayer && this.progressBar) {
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
        
        console.log('🏁 Video ended');
    }
    
    handleVideoError() {
        this.loadingIndicator.style.display = 'none';
        const error = this.videoPlayer.error;
        let errorMessage = 'Video playback error.';
        
        if (error) {
            console.error('❌ Video error:', error.code, error.message);
            
            switch (error.code) {
                case 1: // MEDIA_ERR_ABORTED
                    errorMessage = 'Playback was aborted.';
                    break;
                case 2: // MEDIA_ERR_NETWORK
                    errorMessage = 'Network error. Please check your connection.';
                    break;
                case 3: // MEDIA_ERR_DECODE
                    errorMessage = 'Video decoding error.';
                    break;
                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                    errorMessage = 'Video format not supported.';
                    break;
            }
        }
        
        this.showError(errorMessage);
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
                    console.error('❌ Play error:', error);
                    this.showError('Cannot play video.');
                });
        } else {
            this.videoPlayer.pause();
            this.isVideoPlaying = false;
            if (this.playIcon) this.playIcon.style.display = 'block';
            if (this.pauseIcon) this.pauseIcon.style.display = 'none';
        }
        
        this.showControls();
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
            this.videoDuration || this.videoPlayer.duration || Infinity, 
            this.videoPlayer.currentTime + 10
        );
        this.showControls();
    }
    
    toggleMute() {
        if (!this.videoPlayer) return;
        this.videoPlayer.muted = !this.videoPlayer.muted;
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
        this.videoPlayer.volume = parseFloat(this.volumeSlider.value);
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
        console.log(`🔄 Retry attempt ${this.retryCount} of ${this.maxRetries}`);
        
        this.errorMessage.style.display = 'none';
        this.loadingIndicator.style.display = 'flex';
        
        this.initializePlayer();
    }
    
    seekToPosition(e) {
        if (!this.videoPlayer || !this.progressContainer || !this.videoDuration) return;
        
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const newTime = Math.max(0, Math.min(this.videoDuration, pos * this.videoDuration));
        
        this.videoPlayer.currentTime = newTime;
        this.showControls();
    }
    
    // ========== UI UPDATE FUNCTIONS ==========
    
    updateCurrentTimeDisplay() {
        if (!this.currentTimeDisplay || !this.videoPlayer) return;
        
        const currentTime = this.videoPlayer.currentTime;
        this.currentTimeDisplay.textContent = this.formatTime(currentTime);
    }
    
    updateDurationDisplay() {
        if (!this.durationDisplay || !this.videoDuration) return;
        
        this.durationDisplay.textContent = this.formatTime(this.videoDuration);
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showError(message) {
        if (this.errorText) {
            this.errorText.textContent = message;
        }
        
        if (this.errorMessage) {
            this.errorMessage.style.display = 'block';
        }
        
        this.loadingIndicator.style.display = 'none';
        
        console.error('❌ Error shown:', message);
    }
    
    showVipRequiredError(data) {
        this.loadingIndicator.style.display = 'none';
        
        const errorContainer = this.errorMessage;
        errorContainer.innerHTML = `
            <div style="margin-bottom: 15px;">
                <i class="fas fa-crown" style="font-size: 48px; color: #ffd700; margin-bottom: 15px;"></i>
            </div>
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #fff;">
                VIP Content
            </div>
            <div style="font-size: 14px; color: #ffb3b3; margin-bottom: 20px; line-height: 1.5;">
                ${data.message || 'This video is for VIP members only.'}
            </div>
            <button class="retry-btn" onclick="window.videoPlayerApp.openVipPurchase()" style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #000; font-weight: bold; padding: 12px 30px; font-size: 16px; margin-bottom: 10px;">
                <i class="fas fa-crown"></i> Buy VIP Access
            </button>
            <div style="font-size: 12px; color: #aaa; margin-top: 10px;">
                Get unlimited access to all VIP content.
            </div>
        `;
        
        errorContainer.style.display = 'block';
        
        this.updateDebugInfo('status', 'VIP Required');
    }
    
    openVipPurchase() {
        window.open('https://t.me/drachin_harch_bot?start=vip', '_blank');
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
        if (!this.controlsOverlay || !this.isVideoPlaying) return;
        
        this.controlsOverlay.classList.remove('show-controls');
        this.isControlsVisible = false;
    }
    
    hideControlsAfterDelay() {
        clearTimeout(this.controlsTimeout);
        
        if (this.isVideoPlaying) {
            this.controlsTimeout = setTimeout(() => {
                this.hideControls();
            }, 3000);
        }
    }
    
    // ========== DEBUG FUNCTIONS ==========
    
    updateDebugInfo(field, value) {
        const debugEl = document.getElementById('debug' + field.charAt(0).toUpperCase() + field.slice(1));
        if (debugEl) {
            debugEl.textContent = String(value);
        }
    }
    
    // ========== CLEANUP ==========
    
    destroy() {
        if (this.videoPlayer) {
            this.videoPlayer.pause();
            this.videoPlayer.src = '';
            this.videoPlayer.load();
        }
        
        clearTimeout(this.controlsTimeout);
        
        if (this.volumeContainer && this.volumeContainer.timeout) {
            clearTimeout(this.volumeContainer.timeout);
        }
        
        console.log('🧹 Player destroyed');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, initializing VideoPlayerApp...');
    
    // Create global instance
    window.videoPlayerApp = new VideoPlayerApp();
    
    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            document.body.style.height = '100vh';
            document.body.offsetHeight;
        }, 100);
    });
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.videoPlayerApp) {
            window.videoPlayerApp.destroy();
        }
    });
    
    // Log initialization complete
    setTimeout(() => {
        console.log('✅ VideoPlayerApp initialized');
        console.log('🎯 Video Code:', window.videoPlayerApp.videoCode);
    }, 100);
});

// Global helper for debugging
window.debugPlayer = function() {
    if (window.videoPlayerApp) {
        console.log('=== PLAYER DEBUG INFO ===');
        console.log('Video Code:', window.videoPlayerApp.videoCode);
        console.log('Is Playing:', window.videoPlayerApp.isVideoPlaying);
        console.log('Video Duration:', window.videoPlayerApp.videoDuration);
        console.log('Current Time:', window.videoPlayerApp.videoPlayer?.currentTime);
        console.log('Volume:', window.videoPlayerApp.videoPlayer?.volume);
        console.log('Metadata:', window.videoPlayerApp.videoMetadata);
        console.log('========================');
    }
};

// Emergency test function
window.testVideo = function(code = 'TEST123') {
    console.log('🧪 Testing with code:', code);
    window.location.search = `?code=${code}`;
};
