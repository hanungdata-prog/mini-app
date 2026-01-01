// app.js - Enhanced Video Player with Advanced Security

class VideoPlayerApp {
    constructor() {
        // Security measures
        this.setupSecurityMeasures();
        
        // Initialize elements
        this.initializeElements();
        
        // Security: Encrypt video URL in memory
        this.encryptedVideoUrl = null;
        this.videoBlob = null;
        
        // Get deep link code
        let rawCode = this.getUrlParameter('code') || this.getTelegramStartParam();
        this.deepLinkCode = this.validateVideoCode(rawCode);
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
        
        // Advanced security: Monitor DevTools
        this.setupDevToolsDetection();
    }
    
    // ========== ADVANCED SECURITY FUNCTIONS ==========
    
    setupDevToolsDetection() {
        // Detect if DevTools is open (simplified - less aggressive)
        let devtoolsOpen = false;
        const threshold = 160;
        
        const detectDevTools = () => {
            if (window.outerWidth - window.innerWidth > threshold || 
                window.outerHeight - window.innerHeight > threshold) {
                if (!devtoolsOpen) {
                    devtoolsOpen = true;
                    // Only log, don't pause video
                    console.log('%c⚠️ DevTools detected', 'color: orange; font-size: 14px;');
                }
            } else {
                devtoolsOpen = false;
            }
        };
        
        // Check every 3 seconds (less aggressive)
        setInterval(detectDevTools, 3000);
    }
    
    onDevToolsOpen() {
        // Disabled for now - too aggressive
    }
    
    protectConsole() {
        // Simplified - don't override console completely
        const originalLog = console.log;
        console.log = function(...args) {
            const filtered = args.map(arg => {
                if (typeof arg === 'string' && arg.includes('r2.dev')) {
                    return arg.replace(/https:\/\/[^\s]+r2\.dev[^\s]*/g, '[PROTECTED_URL]');
                }
                return arg;
            });
            return originalLog.apply(console, filtered);
        };
    }
    
    // Simple XOR encryption for URL obfuscation
    encryptUrl(url) {
        const key = 'HarchSecureKey2025';
        let encrypted = '';
        for (let i = 0; i < url.length; i++) {
            encrypted += String.fromCharCode(url.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(encrypted);
    }
    
    decryptUrl(encrypted) {
        const key = 'HarchSecureKey2025';
        const decoded = atob(encrypted);
        let decrypted = '';
        for (let i = 0; i < decoded.length; i++) {
            decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }
    
    // Fetch video as blob to hide source URL
    async fetchVideoAsBlob(videoUrl) {
        try {
            this.updateDebugInfo('status', 'Securing video...');
            
            // For large videos, we'll use direct URL but obfuscate it
            // Fetching entire video as blob is too slow and memory intensive
            
            // Instead, just return the URL but we'll hide it in the player
            return videoUrl;
            
        } catch (error) {
            console.error('Error fetching video blob:', error);
            // Fallback to direct URL
            return videoUrl;
        }
    }
    
    // ========== UTILITY FUNCTIONS ==========
    
    getUrlParameter(name) {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            let param = urlParams.get(name);
            
            if (param) return param;
            
            param = urlParams.get('tgWebAppStartParam');
            if (param) return param;
            
            if (window.location.hash) {
                const hashPart = window.location.hash.substring(1);
                const match = hashPart.match(/start_param=([^&]+)/);
                if (match) return match[1];
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
                
                const startParam = tg.initDataUnsafe?.start_param || 
                                  tg.startParam || 
                                  null;
                
                return startParam;
            }
        } catch (error) {
            // Silent fail
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
    
    validateVideoCode(rawCode) {
        if (!rawCode) return null;
        
        let code = String(rawCode);
        
        if (code.includes('#')) code = code.split('#')[0];
        if (code.includes('?')) code = code.split('?')[0];
        if (code.includes('&')) code = code.split('&')[0];
        
        try {
            if (code.includes('%')) {
                code = decodeURIComponent(code.split('%')[0]);
            }
        } catch (e) {
            // Silent fail
        }
        
        code = code.replace(/[^a-zA-Z0-9]/g, '');
        code = code.trim();
        
        const regex = /^[a-zA-Z0-9]{6,10}$/;
        if (!regex.test(code)) return null;

        return code;
    }
    
    // ========== SETUP FUNCTIONS ==========
    
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
    
    initializeElements() {
        this.videoContainer = document.getElementById('videoContainer');
        this.videoTitle = document.getElementById('videoTitle');
        this.overlayTitle = document.getElementById('overlayTitle');
        this.videoDescription = document.getElementById('videoDescription');
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
        this.backButton = document.getElementById('backButton');

        this.progressBar = document.getElementById('progressBar');
        this.progressContainer = document.getElementById('progressContainer');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.durationDisplay = document.getElementById('duration');

        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeContainer = document.getElementById('volumeContainer');

        // Initialize Video.js player
        this.videoPlayer = null;
        
        this.addVideoSecurity();
    }
    
    addVideoSecurity() {
        const videoElement = document.getElementById('videoPlayer');
        if (!videoElement) return;

        // Prevent video context menu
        videoElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });

        // Prevent video selection
        videoElement.addEventListener('selectstart', (e) => {
            e.preventDefault();
            return false;
        });

        // Disable drag
        videoElement.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });

        // Note: We keep the src attribute accessible for video to work
        // but hide it from easy inspection via obfuscation
    }
    
    // ========== PLAYER INITIALIZATION ==========
    
    async initializePlayer() {
        try {
            this.loadingIndicator.style.display = 'flex';
            this.errorMessage.style.display = 'none';
            
            if (!this.deepLinkCode || !/^[a-zA-Z0-9]{6,10}$/.test(this.deepLinkCode)) {
                throw new Error('Invalid video code format');
            }
            
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
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            this.updateDebugInfo('api', `Status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                
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
            
            if (!data.stream_url) {
                throw new Error('Stream URL not found in response.');
            }

            this.updateDebugInfo('status', 'Video loaded');
            
            // Update UI
            this.updateVideoMetadata(data);
            
            this.encryptedVideoUrl = this.encryptUrl(data.stream_url);
            this.setVideoSource(data.stream_url);
            
            // Setup event listeners
            this.setupEventListeners();
            
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
    
    updateVideoMetadata(data) {
        const title = data.title || 'Untitled Video';
        if (this.videoTitle) {
            this.videoTitle.textContent = title;
        }
        if (this.overlayTitle) {
            this.overlayTitle.textContent = title;
        }
        
        const description = data.description || '';
        if (this.videoDescription) {
            this.videoDescription.textContent = description;
            if (!description) {
                this.videoDescription.style.display = 'none';
            }
        }
        
        document.title = title + ' - Harch Short';
    }
    
    setVideoSource(videoUrl) {
      if (!document.getElementById('videoPlayer')) return;

      // ✅ FIX: support relative URL
      let finalUrl;
      try {
        finalUrl = videoUrl.startsWith('http')
          ? videoUrl
          : new URL(videoUrl, window.location.origin).href;
      } catch (e) {
        console.error('Invalid video URL:', videoUrl);
        this.showError('Invalid video stream URL.');
        return;
      }

      // Destroy existing Video.js player if it exists
      if (this.videoPlayer) {
        this.videoPlayer.dispose();
      }

      // Set the source on the video element
      const videoElement = document.getElementById('videoPlayer');
      videoElement.src = finalUrl;

      // Initialize Video.js player with enhanced options
      this.videoPlayer = videojs(videoElement, {
        controls: false, // We'll use custom controls
        autoplay: false,
        preload: 'metadata',
        playbackRates: [0.5, 1, 1.25, 1.5, 2],
        responsive: true,
        fluid: true,
        html5: {
          vhs: {
            overrideNative: true
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false
        },
        plugins: {
          // Add any additional plugins if needed
        }
      });

      // Disable download and other features
      videoElement.setAttribute('controlsList', 'nodownload noplaybackrate');
      videoElement.disableRemotePlayback = true;
      videoElement.setAttribute('playsinline', 'true');
      videoElement.setAttribute('webkit-playsinline', 'true');
    }  
    // ========== EVENT LISTENERS (abbreviated for space) ==========
    
    setupEventListeners() {
        if (!this.videoPlayer) return;

        // Video.js event listeners
        this.videoPlayer.on('loadeddata', this.handleVideoLoaded.bind(this));
        this.videoPlayer.on('canplay', this.handleVideoCanPlay.bind(this));
        this.videoPlayer.on('playing', this.handleVideoPlaying.bind(this));
        this.videoPlayer.on('pause', this.handleVideoPause.bind(this));
        this.videoPlayer.on('timeupdate', this.handleTimeUpdate.bind(this));
        this.videoPlayer.on('ended', this.handleVideoEnded.bind(this));
        this.videoPlayer.on('error', this.handleVideoError.bind(this));
        this.videoPlayer.on('volumechange', this.handleVolumeChange.bind(this));
        this.videoPlayer.on('waiting', this.handleVideoWaiting.bind(this));

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

        this.videoPlayer.on('click', () => {
            this.togglePlayPause();
            this.showControls();
        });

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

        if (this.controlsOverlay) {
            this.controlsOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('mozfullscreenchange', this.handleFullscreenChange.bind(this));

        this.setupKeyboardShortcuts();
    }
    
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
    
    updateDebugInfo(field, value) {
        const debugEl = document.getElementById('debug' + field.charAt(0).toUpperCase() + field.slice(1));
        if (debugEl) {
            debugEl.textContent = value;
        }
    }
    
    // ========== VIDEO EVENT HANDLERS ==========
    
    handleVideoLoaded() {
        this.videoDuration = this.videoPlayer.duration();
        this.updateDurationDisplay();
    }

    handleVideoCanPlay() {
        this.loadingIndicator.style.display = 'none';
        this.videoPlayer.volume(this.lastVolume);
        if (this.volumeSlider) {
            this.volumeSlider.value = this.lastVolume;
        }
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
            const progressPercent = (this.videoPlayer.currentTime() / this.videoDuration) * 100;
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
        const error = this.videoPlayer.error();
        let errorMessage = 'Failed to load video. Please try again.';

        if (error) {
            switch (error.code) {
                case 1: // MEDIA_ERR_ABORTED
                    errorMessage = 'Video playback was aborted.';
                    break;
                case 2: // MEDIA_ERR_NETWORK
                    errorMessage = 'Network error occurred while loading video.';
                    break;
                case 3: // MEDIA_ERR_DECODE
                    errorMessage = 'Video decoding error.';
                    break;
                case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                    errorMessage = 'Video format not supported.';
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
            this.volumeSlider.value = this.videoPlayer.volume();
        }
        this.lastVolume = this.videoPlayer.volume();
    }
    
    handleFullscreenChange() {
        // Update UI for fullscreen
    }
    
    // ========== CONTROL FUNCTIONS ==========
    
    togglePlayPause() {
        if (!this.videoPlayer) return;

        if (this.videoPlayer.paused()) {
            this.videoPlayer.play()
                .then(() => {
                    this.isVideoPlaying = true;
                    if (this.playIcon) this.playIcon.style.display = 'none';
                    if (this.pauseIcon) this.pauseIcon.style.display = 'block';
                })
                .catch(error => {
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
            if (this.videoContainer.requestFullscreen) {
                this.videoContainer.requestFullscreen();
            } else if (this.videoContainer.webkitRequestFullscreen) {
                this.videoContainer.webkitRequestFullscreen();
            } else if (this.videoContainer.mozRequestFullScreen) {
                this.videoContainer.mozRequestFullScreen();
            }
        } else {
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
        const currentTime = this.videoPlayer.currentTime();
        this.videoPlayer.currentTime(Math.max(0, currentTime - 10));
        this.showControls();
    }

    forwardVideo() {
        if (!this.videoPlayer) return;
        const currentTime = this.videoPlayer.currentTime();
        this.videoPlayer.currentTime(Math.min(
            this.videoDuration,
            currentTime + 10
        ));
        this.showControls();
    }
    
    toggleMute() {
        if (!this.videoPlayer) return;
        const isMuted = this.videoPlayer.muted();
        this.videoPlayer.muted(!isMuted);
        if (!isMuted) {
            this.lastVolume = this.videoPlayer.volume();
            this.videoPlayer.volume(0);
        } else {
            this.videoPlayer.volume(this.lastVolume);
        }
        this.showControls();
    }

    increaseVolume() {
        if (!this.videoPlayer) return;
        const currentVolume = this.videoPlayer.volume();
        this.videoPlayer.volume(Math.min(1, currentVolume + 0.1));
        this.showVolumeControl();
    }

    decreaseVolume() {
        if (!this.videoPlayer) return;
        const currentVolume = this.videoPlayer.volume();
        this.videoPlayer.volume(Math.max(0, currentVolume - 0.1));
        this.showVolumeControl();
    }
    
    adjustVolume() {
        if (!this.videoPlayer || !this.volumeSlider) return;
        this.videoPlayer.volume(this.volumeSlider.value);
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
    
    seekToPosition(e) {
        if (!this.videoPlayer || !this.progressContainer) return;
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        this.videoPlayer.currentTime(pos * this.videoDuration);
        this.showControls();
    }
    
    // ========== UI UPDATE FUNCTIONS ==========
    
    updateCurrentTimeDisplay() {
        if (!this.currentTimeDisplay || !this.videoPlayer) return;
        const currentTime = this.videoPlayer.currentTime();
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
        
        const errorContainer = this.errorMessage;
        errorContainer.innerHTML = `
            <div style="margin-bottom: 15px;">
                <i class="fas fa-crown" style="font-size: 48px; color: #ffd700; margin-bottom: 15px;"></i>
            </div>
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #fff;">
                Konten VIP
            </div>
            <div style="font-size: 14px; color: #ffb3b3; margin-bottom: 20px; line-height: 1.5;">
                ${data.access.message || 'Video ini khusus member VIP'}
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
    
    // ========== CLEANUP ==========

    destroy() {
        // Cleanup blob URLs to prevent memory leaks
        if (this.videoBlob) {
            URL.revokeObjectURL(this.videoBlob);
            this.videoBlob = null;
        }

        // Clear encrypted URL
        this.encryptedVideoUrl = null;

        // Dispose of Video.js player to prevent memory leaks
        if (this.videoPlayer) {
            this.videoPlayer.dispose();
            this.videoPlayer = null;
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
        }, 5000);
    }
    
    // // Additional security: Prevent iframe embedding
    // if (window.self !== window.top) {
    //     window.top.location = window.self.location;
    // }
    
    // Watermark protection
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (node.classList && node.classList.contains('watermark')) {
                    // Reload page if watermark is removed
                    location.reload();
                }
            });
        });
    });
    
    const watermark = document.querySelector('.watermark');
    if (watermark) {
        observer.observe(watermark.parentNode, { childList: true });
    }
});
