// app.js - Direct Video Player with R2 Access

class VideoPlayerApp {
    constructor() {
        // Security measures
        this.setupSecurityMeasures();
        
        // Initialize elements
        this.initializeElements();
        
        // Get video code from URL
        this.videoCode = this.extractVideoCode();
        
        // Update debug UI
        this.updateDebugInfo('code', this.videoCode || 'NO CODE');
        this.updateDebugInfo('telegram', 'NOT USED');
        this.updateDebugInfo('status', 'Initializing...');
        
        // Initialize player
        if (!this.videoCode || !this.isValidVideoCode(this.videoCode)) {
            this.showError('Invalid video code. Please check your link and try again.');
            this.updateDebugInfo('status', 'INVALID CODE');
            document.getElementById('loadingIndicator').style.display = 'none';
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
        
        // Setup dev tools detection (optional)
        this.setupDevToolsDetection();
    }
    
    // ========== VIDEO CODE EXTRACTION ==========
    
    extractVideoCode() {
        // Try multiple ways to extract video code
        const methods = [
            this.getCodeFromQueryParam,
            this.getCodeFromHash,
            this.getCodeFromPath
        ];
        
        for (const method of methods) {
            const code = method.call(this);
            if (code && this.isValidVideoCode(code)) {
                console.log(`Extracted code via ${method.name}: ${code}`);
                return code;
            }
        }
        
        console.log('No valid video code found');
        return null;
    }
    
    getCodeFromQueryParam() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code') || 
                        urlParams.get('v') || 
                        urlParams.get('id') || 
                        urlParams.get('video');
            
            return this.cleanCode(code);
        } catch (e) {
            return null;
        }
    }
    
    getCodeFromHash() {
        if (!window.location.hash) return null;
        
        try {
            const hash = window.location.hash.substring(1);
            
            // Try as direct code
            const directCode = this.cleanCode(hash.split('?')[0]);
            if (directCode) return directCode;
            
            // Try parsing hash as query string
            if (hash.includes('?')) {
                const hashParams = new URLSearchParams(hash.split('?')[1]);
                const code = hashParams.get('code') || 
                            hashParams.get('start_param') || 
                            hashParams.get('v');
                
                return this.cleanCode(code);
            }
        } catch (e) {
            // Silent fail
        }
        
        return null;
    }
    
    getCodeFromPath() {
        try {
            const path = window.location.pathname;
            const segments = path.split('/').filter(s => s.trim());
            
            // Look for a segment that looks like a video code
            for (const segment of segments) {
                const cleaned = this.cleanCode(segment);
                if (cleaned && this.isValidVideoCode(cleaned)) {
                    return cleaned;
                }
            }
        } catch (e) {
            // Silent fail
        }
        
        return null;
    }
    
    cleanCode(code) {
        if (!code) return null;
        
        // Remove any non-alphanumeric characters (except dashes and underscores)
        const cleaned = String(code)
            .replace(/[^a-zA-Z0-9-_]/g, '')
            .trim();
        
        return cleaned || null;
    }
    
    isValidVideoCode(code) {
        if (!code || typeof code !== 'string') return false;
        
        // Basic validation: alphanumeric with dashes/underscores, 3-50 characters
        const regex = /^[a-zA-Z0-9-_]{3,50}$/;
        
        if (!regex.test(code)) {
            console.log(`Code validation failed: ${code}`);
            return false;
        }
        
        return true;
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
        
        // Disable screenshot on some devices
        document.addEventListener('keyup', (e) => {
            if (e.key === 'PrintScreen') {
                navigator.clipboard.writeText('');
                alert('Screenshots are disabled for content protection.');
            }
        });
        
        // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F12' || 
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
                (e.ctrlKey && e.key === 'U')) {
                e.preventDefault();
                return false;
            }
        });
    }
    
    setupDevToolsDetection() {
        // Optional: Simple devtools detection
        const threshold = 160;
        
        const detectDevTools = () => {
            if (window.outerWidth - window.innerWidth > threshold || 
                window.outerHeight - window.innerHeight > threshold) {
                console.log('%c⚠️ DevTools detected', 'color: orange; font-size: 14px;');
            }
        };
        
        // Check every 5 seconds
        setInterval(detectDevTools, 5000);
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
        this.backButton = document.querySelector('.back-btn');
        
        this.progressBar = document.getElementById('progressBar');
        this.progressContainer = document.getElementById('progressContainer');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.durationDisplay = document.getElementById('duration');
        
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeContainer = document.getElementById('volumeContainer');
        
        // Setup back button if exists
        if (this.backButton) {
            this.backButton.addEventListener('click', () => {
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    window.close();
                }
            });
        }
        
        this.addVideoSecurity();
    }
    
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
        
        // Disable drag
        this.videoPlayer.addEventListener('dragstart', (e) => {
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
            
            // Direct API call to Worker
            const apiUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
            const fullUrl = `${apiUrl}?code=${encodeURIComponent(this.videoCode)}`;
            
            this.updateDebugInfo('api', 'Fetching...');
            this.updateDebugInfo('status', 'Loading video metadata...');
            
            console.log(`Fetching video data from: ${fullUrl}`);
            
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
            console.log(`API Response status: ${response.status}`);
            
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: await response.text() };
                }
                
                console.error('API error:', errorData);
                
                if (response.status === 404) {
                    throw new Error('Video not found. Please check your video code.');
                } else if (response.status === 403) {
                    if (errorData.error === 'VIP required' || errorData.error === 'VIP expired') {
                        this.showVipRequiredError(errorData);
                        return;
                    }
                    throw new Error('Access denied. You do not have permission to view this video.');
                } else if (response.status === 400) {
                    throw new Error(errorData.message || 'Invalid request.');
                } else if (response.status === 500) {
                    throw new Error('Server error. Please try again later.');
                } else {
                    throw new Error(`Error ${response.status}: ${errorData.message || 'Failed to load video.'}`);
                }
            }
            
            const data = await response.json();
            console.log('Video data received:', data);
            
            this.updateDebugInfo('api', 'SUCCESS');
            
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid response format from server.');
            }
            
            if (data.error) {
                if (data.error === 'VIP required') {
                    this.showVipRequiredError(data);
                    return;
                }
                throw new Error(data.message || data.error);
            }
            
            if (!data.stream_url) {
                throw new Error('Stream URL not found in response.');
            }

            this.updateDebugInfo('status', 'Video loaded successfully');
            
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
            console.error('Error initializing player:', error);
            
            this.updateDebugInfo('api', 'FAILED');
            this.updateDebugInfo('status', `Error: ${error.message.substring(0, 50)}...`);
            
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
            }
        }
    }
    
    updateVideoMetadata(data) {
        const title = data.title || 'Untitled Video';
        
        // Update title in overlay
        if (this.overlayTitle) {
            this.overlayTitle.textContent = title;
        }
        
        // Update page title
        document.title = title + ' - Harch Short';
        
        // Update debug info with video title
        this.updateDebugInfo('video', title.substring(0, 20) + '...');
    }
    
    setVideoSource(videoUrl) {
        if (!this.videoPlayer) return;

        console.log(`Setting video source: ${videoUrl}`);
        
        // Validate URL
        let finalUrl;
        try {
            // Handle relative URLs
            if (videoUrl.startsWith('http')) {
                finalUrl = videoUrl;
            } else if (videoUrl.startsWith('/')) {
                finalUrl = new URL(videoUrl, window.location.origin).href;
            } else {
                // Assume it's a full URL
                finalUrl = videoUrl;
            }
        } catch (e) {
            console.error('Invalid video URL:', videoUrl, e);
            this.showError('Invalid video stream URL.');
            return;
        }

        // Set video source
        this.videoPlayer.src = finalUrl;

        // Security attributes
        this.videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
        this.videoPlayer.disableRemotePlayback = true;
        this.videoPlayer.setAttribute('preload', 'metadata');
        this.videoPlayer.setAttribute('playsinline', 'true');
        this.videoPlayer.setAttribute('webkit-playsinline', 'true');

        // Hide native controls
        this.videoPlayer.controls = false;
        
        // Load the video
        this.videoPlayer.load();
        
        console.log('Video source set successfully');
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
        
        // Fullscreen change listeners
        document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('mozfullscreenchange', this.handleFullscreenChange.bind(this));
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        console.log('Event listeners setup complete');
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
                case 'arrowup':
                    this.increaseVolume();
                    this.showControls();
                    e.preventDefault();
                    break;
                case 'arrowdown':
                    this.decreaseVolume();
                    this.showControls();
                    e.preventDefault();
                    break;
                case '0':
                case 'home':
                    // Go to beginning
                    if (this.videoPlayer) {
                        this.videoPlayer.currentTime = 0;
                        this.showControls();
                    }
                    e.preventDefault();
                    break;
                case 'end':
                    // Go to end
                    if (this.videoPlayer && this.videoDuration) {
                        this.videoPlayer.currentTime = this.videoDuration;
                        this.showControls();
                    }
                    e.preventDefault();
                    break;
            }
        });
    }
    
    // ========== VIDEO EVENT HANDLERS ==========
    
    handleVideoLoaded() {
        this.videoDuration = this.videoPlayer.duration || 0;
        this.updateDurationDisplay();
        console.log('Video loaded, duration:', this.videoDuration);
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
        
        console.log('Video can play');
    }
    
    handleVideoPlaying() {
        this.isVideoPlaying = true;
        
        if (this.playIcon) {
            this.playIcon.style.display = 'none';
        }
        
        if (this.pauseIcon) {
            this.pauseIcon.style.display = 'block';
        }
        
        this.loadingIndicator.style.display = 'none';
        this.hideControlsAfterDelay();
        
        console.log('Video playing');
    }
    
    handleVideoPause() {
        this.isVideoPlaying = false;
        
        if (this.playIcon) {
            this.playIcon.style.display = 'block';
        }
        
        if (this.pauseIcon) {
            this.pauseIcon.style.display = 'none';
        }
        
        console.log('Video paused');
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
        
        if (this.playIcon) {
            this.playIcon.style.display = 'block';
        }
        
        if (this.pauseIcon) {
            this.pauseIcon.style.display = 'none';
        }
        
        this.showControls();
        
        console.log('Video ended');
    }
    
    handleVideoError() {
        this.loadingIndicator.style.display = 'none';
        const error = this.videoPlayer.error;
        let errorMessage = 'Failed to load video. Please try again.';
        
        if (error) {
            console.error('Video error code:', error.code, error.message);
            
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
                    errorMessage = 'Video format not supported by your browser.';
                    break;
                default:
                    errorMessage = `Video error: ${error.message || 'Unknown error'}`;
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
    
    handleFullscreenChange() {
        // Update UI if needed
        const isFullscreen = document.fullscreenElement || 
                            document.webkitFullscreenElement || 
                            document.mozFullScreenElement;
        
        console.log('Fullscreen changed:', isFullscreen ? 'Entered' : 'Exited');
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
                    console.error('Play error:', error);
                    this.showError('Cannot play video. Please check your connection.');
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
        console.log(`Retry attempt ${this.retryCount} of ${this.maxRetries}`);
        
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
        
        console.error('Error shown:', message);
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
            ${data.vip_expired_date ? `
                <div style="font-size: 13px; color: #ff8888; margin-bottom: 15px; padding: 10px; background: rgba(255,68,68,0.1); border-radius: 8px;">
                    <i class="fas fa-exclamation-circle"></i> VIP access expired on ${new Date(data.vip_expired_date).toLocaleDateString()}
                </div>
            ` : ''}
            <button class="retry-btn" onclick="window.videoPlayerApp.openVipPurchase()" style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #000; font-weight: bold; padding: 12px 30px; font-size: 16px; margin-bottom: 10px; width: 80%; max-width: 250px;">
                <i class="fas fa-crown"></i> Buy VIP Access
            </button>
            <div style="font-size: 12px; color: #aaa; margin-top: 10px;">
                Get unlimited access to all VIP content.
            </div>
        `;
        
        errorContainer.style.display = 'block';
        
        // Update title if available
        if (data.title) {
            this.overlayTitle.textContent = data.title + ' 👑';
        }
        
        this.updateDebugInfo('status', 'VIP Required');
    }
    
    openVipPurchase() {
        // Redirect to VIP purchase page
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
            debugEl.textContent = String(value).substring(0, 100);
        }
    }
    
    // ========== CLEANUP ==========
    
    destroy() {
        // Cleanup video source
        if (this.videoPlayer) {
            this.videoPlayer.pause();
            this.videoPlayer.src = '';
            this.videoPlayer.load();
        }
        
        // Clear timeouts
        clearTimeout(this.controlsTimeout);
        
        if (this.volumeContainer && this.volumeContainer.timeout) {
            clearTimeout(this.volumeContainer.timeout);
        }
        
        console.log('Player destroyed');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing VideoPlayerApp...');
    
    // Create global instance
    window.videoPlayerApp = new VideoPlayerApp();
    
    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            document.body.style.height = '100vh';
            // Trigger reflow
            document.body.offsetHeight;
        }, 100);
    });
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.videoPlayerApp) {
            window.videoPlayerApp.destroy();
        }
    });
    
    // Prevent video URL extraction via network tab
    if (window.performance && window.performance.getEntries) {
        // Clear performance entries periodically
        setInterval(() => {
            if (window.performance.clearResourceTimings) {
                window.performance.clearResourceTimings();
            }
        }, 10000);
    }
    
    // Watermark protection (optional)
    const watermark = document.querySelector('.watermark');
    if (watermark) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.removedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('watermark')) {
                        console.warn('Watermark removed, reloading page...');
                        setTimeout(() => location.reload(), 1000);
                    }
                });
            });
        });
        
        observer.observe(watermark.parentNode, { childList: true });
    }
    
    // Log initialization complete
    setTimeout(() => {
        console.log('VideoPlayerApp initialized successfully');
        console.log('Video code:', window.videoPlayerApp.videoCode);
    }, 1000);
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
    } else {
        console.log('Player not initialized');
    }
};
