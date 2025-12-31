// app.js - Enhanced Video Player for Harch Short

class VideoPlayerApp {
    constructor() {
        // Security measures
        this.setupSecurityMeasures();
        
        // Initialize elements
        this.initializeElements();
        
        // Get deep link code
        this.deepLinkCode = this.getUrlParameter('code');
        
        // Initialize player
        if (!this.deepLinkCode) {
            this.showError('No video code provided');
            document.getElementById('loadingIndicator').style.display = 'none';
        } else {
            this.initializePlayer();
        }
        
        // State variables
        this.isVideoPlaying = false;
        this.isControlsVisible = true;
        this.controlsTimeout = null;
        this.videoDuration = 0;
        this.lastVolume = 0.7;
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
    }
    
    // Get URL parameter
    getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
    
    // Setup security measures
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
        
        // Disable long press on mobile
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });
        
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // Disable copy/paste
        document.addEventListener('copy', (e) => {
            e.preventDefault();
            return false;
        });
        
        document.addEventListener('paste', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Set user-select on body
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.mozUserSelect = 'none';
        document.body.style.msUserSelect = 'none';
    }
    
    // Initialize DOM elements
    initializeElements() {
        // Video elements
        this.videoPlayer = document.getElementById('videoPlayer');
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
        
        // Prevent opening video in new tab
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'VIDEO') {
                e.preventDefault();
            }
        });
    }
    
    // Initialize player with API call
    async initializePlayer() {
        try {
            // Fetch video data from backend API
            const apiUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
            const response = await fetch(`${apiUrl}?code=${encodeURIComponent(this.deepLinkCode)}`);
            
            if (!response.ok) {
                throw new Error('Video not found');
            }
            
            const data = await response.json();
            
            // Update UI with video metadata
            this.updateVideoMetadata(data);
            
            // Set video source
            this.setVideoSource(data.video_url);
            
            // Setup event listeners for enhanced UI
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error fetching video data:', error);
            this.showError('Failed to load video data. Please try again later.');
            document.getElementById('loadingIndicator').style.display = 'none';
        }
    }
    
    // Update video metadata
    updateVideoMetadata(data) {
        this.videoTitle.textContent = data.title || 'Untitled';
        this.overlayTitle.textContent = data.title || 'Untitled';
        this.videoDescription.textContent = data.description || '';
    }
    
    // Set video source with security
    setVideoSource(videoUrl) {
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
    }
    
    // Setup event listeners for enhanced UI
    setupEventListeners() {
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
        this.videoPlayer.addEventListener('progress', this.handleVideoProgress.bind(this));
        this.videoPlayer.addEventListener('loadstart', this.handleVideoLoadStart.bind(this));
        this.videoPlayer.addEventListener('stalled', this.handleVideoStalled.bind(this));
        this.videoPlayer.addEventListener('abort', this.handleVideoAbort.bind(this));
        this.videoPlayer.addEventListener('canplaythrough', this.handleVideoCanPlayThrough.bind(this));
        
        // Control button events
        this.playPauseButton.addEventListener('click', this.togglePlayPause.bind(this));
        this.fullscreenButton.addEventListener('click', this.toggleFullscreen.bind(this));
        this.rewindButton.addEventListener('click', this.rewindVideo.bind(this));
        this.forwardButton.addEventListener('click', this.forwardVideo.bind(this));
        this.retryButton.addEventListener('click', this.retryLoading.bind(this));
        this.backButton.addEventListener('click', this.goBack.bind(this));
        
        // Progress bar events
        this.progressContainer.addEventListener('click', this.seekToPosition.bind(this));
        
        // Volume control events
        this.volumeSlider.addEventListener('input', this.adjustVolume.bind(this));
        
        // Video player click events
        this.videoPlayer.addEventListener('click', this.toggleControlsVisibility.bind(this));
        this.controlsOverlay.addEventListener('click', (e) => e.stopPropagation());
        
        // Touch/mouse events for controls visibility
        document.addEventListener('mousemove', this.showControls.bind(this));
        document.addEventListener('touchstart', this.showControls.bind(this));
        
        // Fullscreen events
        document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange.bind(this));
        document.addEventListener('mozfullscreenchange', this.handleFullscreenChange.bind(this));
        
        // Orientation change
        window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));
        
        // Page visibility
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case ' ':
                case 'k':
                    this.togglePlayPause();
                    e.preventDefault();
                    break;
                case 'f':
                    this.toggleFullscreen();
                    e.preventDefault();
                    break;
                case 'ArrowLeft':
                    this.rewindVideo();
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    this.forwardVideo();
                    e.preventDefault();
                    break;
                case 'm':
                    this.toggleMute();
                    e.preventDefault();
                    break;
                case 'ArrowUp':
                    this.increaseVolume();
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                    this.decreaseVolume();
                    e.preventDefault();
                    break;
                case 'Escape':
                    if (document.fullscreenElement || 
                        document.webkitFullscreenElement || 
                        document.mozFullScreenElement) {
                        this.exitFullscreen();
                    }
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
        console.log('Video can play');
    }
    
    handleVideoPlaying() {
        this.isVideoPlaying = true;
        this.playIcon.style.display = 'none';
        this.pauseIcon.style.display = 'block';
        this.hideControlsAfterDelay();
    }
    
    handleVideoPause() {
        this.isVideoPlaying = false;
        this.playIcon.style.display = 'block';
        this.pauseIcon.style.display = 'none';
    }
    
    handleTimeUpdate() {
        if (this.videoDuration) {
            const progressPercent = (this.videoPlayer.currentTime / this.videoDuration) * 100;
            this.progressBar.style.width = `${progressPercent}%`;
            this.updateCurrentTimeDisplay();
        }
    }
    
    handleVideoEnded() {
        this.isVideoPlaying = false;
        this.playIcon.style.display = 'block';
        this.pauseIcon.style.display = 'none';
        this.showControls();
    }
    
    handleVideoError() {
        this.loadingIndicator.style.display = 'none';
        this.showError('Failed to load video. Please try again later.');
        console.error('Video error:', this.videoPlayer.error);
    }
    
    handleVideoWaiting() {
        if (this.isVideoPlaying) {
            this.loadingIndicator.style.display = 'flex';
        }
    }
    
    handleVideoProgress() {
        // Monitor download progress
        console.log('Video progress event');
    }
    
    handleVideoLoadStart() {
        // Reset security attributes when loading starts
        this.videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
        this.videoPlayer.disableRemotePlayback = true;
        this.videoPlayer.setAttribute('crossorigin', 'anonymous');
    }
    
    handleVideoStalled() {
        console.log('Video loading stalled');
    }
    
    handleVideoAbort() {
        this.showError('Video loading was aborted.');
        this.loadingIndicator.style.display = 'none';
    }
    
    handleVideoCanPlayThrough() {
        console.log('Video can play through');
    }
    
    handleVolumeChange() {
        this.volumeSlider.value = this.videoPlayer.volume;
        this.lastVolume = this.videoPlayer.volume;
    }
    
    handleFullscreenChange() {
        // Update UI for fullscreen if needed
    }
    
    handleOrientationChange() {
        // Reset controls visibility on orientation change
        this.showControls();
    }
    
    handleVisibilityChange() {
        if (document.hidden && this.isVideoPlaying) {
            this.videoPlayer.pause();
        }
    }
    
    // ========== CONTROL FUNCTIONS ==========
    
    togglePlayPause() {
        if (this.videoPlayer.paused || this.videoPlayer.ended) {
            this.videoPlayer.play();
        } else {
            this.videoPlayer.pause();
        }
        this.showControls();
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement && 
            !document.webkitFullscreenElement && 
            !document.mozFullScreenElement) {
            // Enter fullscreen
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
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
    
    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        }
    }
    
    rewindVideo() {
        this.videoPlayer.currentTime = Math.max(0, this.videoPlayer.currentTime - 10);
        this.showControls();
    }
    
    forwardVideo() {
        this.videoPlayer.currentTime = Math.min(
            this.videoDuration, 
            this.videoPlayer.currentTime + 10
        );
        this.showControls();
    }
    
    toggleMute() {
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
        this.videoPlayer.volume = Math.min(1, this.videoPlayer.volume + 0.1);
        this.showVolumeControl();
    }
    
    decreaseVolume() {
        this.videoPlayer.volume = Math.max(0, this.videoPlayer.volume - 0.1);
        this.showVolumeControl();
    }
    
    adjustVolume() {
        this.videoPlayer.volume = this.volumeSlider.value;
        this.showVolumeControl();
    }
    
    showVolumeControl() {
        // Show volume control temporarily
        this.volumeContainer.style.display = 'block';
        clearTimeout(this.volumeContainer.timeout);
        this.volumeContainer.timeout = setTimeout(() => {
            this.volumeContainer.style.display = 'none';
        }, 2000);
    }
    
    retryLoading() {
        this.errorMessage.style.display = 'none';
        this.loadingIndicator.style.display = 'flex';
        this.videoPlayer.load();
    }
    
    goBack() {
        if (document.referrer && document.referrer !== '') {
            window.history.back();
        } else if (window.history.length > 1) {
            window.history.back();
        } else {
            // Close window or show message
            console.log('No previous page in history');
            // You could implement a custom navigation here
        }
    }
    
    seekToPosition(e) {
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        this.videoPlayer.currentTime = pos * this.videoDuration;
        this.showControls();
    }
    
    // ========== UI UPDATE FUNCTIONS ==========
    
    updateCurrentTimeDisplay() {
        const currentTime = this.videoPlayer.currentTime;
        const minutes = Math.floor(currentTime / 60);
        const seconds = Math.floor(currentTime % 60);
        this.currentTimeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateDurationDisplay() {
        const minutes = Math.floor(this.videoDuration / 60);
        const seconds = Math.floor(this.videoDuration % 60);
        this.durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.style.display = 'block';
        this.loadingIndicator.style.display = 'none';
    }
    
    // ========== CONTROLS VISIBILITY ==========
    
    toggleControlsVisibility() {
        if (this.isControlsVisible) {
            this.hideControls();
        } else {
            this.showControls();
        }
    }
    
    showControls() {
        this.controlsOverlay.style.opacity = '1';
        this.controlsOverlay.style.pointerEvents = 'all';
        this.isControlsVisible = true;
        
        this.hideControlsAfterDelay();
    }
    
    hideControlsAfterDelay() {
        clearTimeout(this.controlsTimeout);
        if (this.isVideoPlaying) {
            this.controlsTimeout = setTimeout(() => {
                this.hideControls();
            }, 3000);
        }
    }
    
    hideControls() {
        if (this.isVideoPlaying) {
            this.controlsOverlay.style.opacity = '0';
            this.controlsOverlay.style.pointerEvents = 'none';
            this.isControlsVisible = false;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.videoPlayerApp = new VideoPlayerApp();
    
    // Additional R2 video handling
    const videoPlayer = document.getElementById('videoPlayer');
    
    // Ensure video player is properly configured for R2 streaming
    videoPlayer.setAttribute('preload', 'metadata');
    videoPlayer.setAttribute('playsinline', 'true');
    videoPlayer.setAttribute('webkit-playsinline', 'true');
    videoPlayer.setAttribute('crossorigin', 'anonymous');
    
    // Handle orientation lock and ensure responsive behavior
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            document.body.style.height = '100vh';
            document.body.offsetHeight; // Trigger reflow
        }, 100);
    });
});
