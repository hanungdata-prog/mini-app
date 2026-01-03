// app.js - Fixed for Telegram Mini App Video Playback

class VideoPlayerApp {
    constructor() {
        this.setupSecurityMeasures();
        this.initializeElements();
        
        this.encryptedVideoUrl = null;
        this.videoBlob = null;
        
        let rawCode = this.getUrlParameter('code') || this.getTelegramStartParam();
        this.deepLinkCode = this.validateVideoCode(rawCode);
        this.userId = this.getTelegramUserId();
        
        this.updateDebugInfo('code', this.deepLinkCode || 'INVALID');
        this.updateDebugInfo('telegram', window.Telegram ? 'YES' : 'NO');
        
        if (!this.deepLinkCode) {
            this.showError('Invalid video code. Please check your link and try again.');
            this.updateDebugInfo('status', 'INVALID CODE');
            document.getElementById('loadingIndicator').style.display = 'none';
        } else {
            this.updateDebugInfo('status', 'Initializing...');
            this.initializePlayer();
        }
        
        this.isVideoPlaying = false;
        this.isControlsVisible = false;
        this.controlsTimeout = null;
        this.videoDuration = 0;
        this.lastVolume = 0.7;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        this.hideControls();
    }
    
    setupSecurityMeasures() {
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        document.addEventListener('selectstart', (e) => {
            e.preventDefault();
            return false;
        });
        
        document.body.style.userSelect = 'none';
        
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
        this.progressBar = document.getElementById('progressBar');
        this.progressContainer = document.getElementById('progressContainer');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.durationDisplay = document.getElementById('duration');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeContainer = document.getElementById('volumeContainer');
        this.videoPlayer = document.getElementById('videoPlayer');
    }
    
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
            console.error('Error getting Telegram start param:', error);
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
        
        let code = String(rawCode).trim();
        
        // Bersihkan URL fragments
        if (code.includes('#')) code = code.split('#')[0];
        if (code.includes('?')) code = code.split('?')[0];
        if (code.includes('&')) code = code.split('&')[0];
        
        // Decode jika ada encoding
        try {
            code = decodeURIComponent(code);
        } catch (e) {
            // Ignore
        }
        
        const regex = /^[a-zA-Z0-9]{6,15}$/;
        if (!regex.test(code)) {
            console.error('Invalid code format:', code);
            return null;
        }

        console.log('Valid code:', code);
        return code;
    }
    
    async initializePlayer() {
        try {
            this.loadingIndicator.style.display = 'flex';
            this.errorMessage.style.display = 'none';
            
            console.log('Deep Link Code:', this.deepLinkCode);
            console.log('User ID:', this.userId);
            
            if (!this.deepLinkCode || !/^[a-zA-Z0-9]{6,15}$/.test(this.deepLinkCode)) {
                console.error('Invalid code format:', this.deepLinkCode);
                throw new Error('Invalid video code format');
            }
            
            const apiUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
            const fullUrl = `${apiUrl}?code=${this.deepLinkCode}` + (this.userId ? `&user_id=${this.userId}` : '');
            
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
            
            if (data.access && !data.access.has_access) {
                this.showVipRequiredError(data);
                return;
            }
            
            if (!data.stream_url) {
                throw new Error('Stream URL not found in response.');
            }

            this.updateDebugInfo('status', 'Video loaded');
            
            this.updateVideoMetadata(data);
            this.setVideoSource(data.stream_url);
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
        if (!this.videoPlayer) return;

        let finalUrl;
        try {
            const cleanUrl = String(videoUrl).trim();

            if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
                finalUrl = cleanUrl;
            } else if (cleanUrl.startsWith('/')) {
                finalUrl = 'https://mini-app.dramachinaharch.workers.dev' + cleanUrl;
            } else {
                finalUrl = 'https://mini-app.dramachinaharch.workers.dev/' + cleanUrl;
            }
        } catch (e) {
            console.error('Invalid video URL:', videoUrl);
            this.showError('Invalid video stream URL.');
            return;
        }

        console.log('Setting video source:', finalUrl);

        const video = this.videoPlayer;

        // 🔥 FULL RESET
        video.pause();
        video.removeAttribute('src');
        video.innerHTML = ''; // Clear any source tags
        video.load();

        // ⚡ Essential Telegram attributes
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('x5-playsinline', ''); // Tencent X5 WebView
        video.setAttribute('x5-video-player-type', 'h5');
        video.setAttribute('x5-video-player-fullscreen', 'false');
        video.setAttribute('x-webkit-airplay', 'deny');
        video.setAttribute('disablePictureInPicture', '');
        video.setAttribute('controlsList', 'nodownload');
        
        // ❌ NO crossorigin
        video.removeAttribute('crossorigin');
        
        // 🎯 Preload
        video.preload = 'auto';
        
        // 🔊 Unmute (Telegram block muted autoplay)
        video.muted = false;
        video.volume = 0.7;

        // ⏱️ Set source dengan delay
        setTimeout(() => {
            // Try dengan type hint
            const source = document.createElement('source');
            source.src = finalUrl;
            source.type = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
            
            video.appendChild(source);
            video.load();
            
            console.log('Video source set with codec hint');
            
            // Fallback: set direct src jika source tag gagal
            setTimeout(() => {
                if (video.readyState === 0) {
                    console.log('Source tag failed, trying direct src');
                    video.innerHTML = '';
                    video.src = finalUrl;
                    video.load();
                }
            }, 1000);
        }, 150);
    }

    
    setupEventListeners() {
        if (!this.videoPlayer) return;

        this.videoPlayer.addEventListener('loadeddata', this.handleVideoLoaded.bind(this));
        this.videoPlayer.addEventListener('loadedmetadata', this.handleVideoLoaded.bind(this));
        this.videoPlayer.addEventListener('canplay', this.handleVideoCanPlay.bind(this));
        this.videoPlayer.addEventListener('canplaythrough', this.handleVideoCanPlay.bind(this));
        this.videoPlayer.addEventListener('playing', this.handleVideoPlaying.bind(this));
        this.videoPlayer.addEventListener('pause', this.handleVideoPause.bind(this));
        this.videoPlayer.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
        this.videoPlayer.addEventListener('ended', this.handleVideoEnded.bind(this));
        this.videoPlayer.addEventListener('error', this.handleVideoError.bind(this));
        this.videoPlayer.addEventListener('waiting', this.handleVideoWaiting.bind(this));
        this.videoPlayer.addEventListener('stalled', this.handleVideoWaiting.bind(this));

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

        this.videoPlayer.addEventListener('click', () => {
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
            }
        });
    }
    
    updateDebugInfo(field, value) {
        const debugEl = document.getElementById('debug' + field.charAt(0).toUpperCase() + field.slice(1));
        if (debugEl) {
            debugEl.textContent = value;
        }
    }
    
    handleVideoLoaded() {
        this.videoDuration = this.videoPlayer.duration;
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
        setTimeout(() => {
            if (this.isVideoPlaying) {
                this.hideControls();
            }
        }, 2000);
        console.log('Video can play');
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
            console.error('Video error code:', error.code);
            console.error('Video error message:', error.message);
            console.error('Video src:', this.videoPlayer.src);
            console.error('Video networkState:', this.videoPlayer.networkState);
            console.error('Video readyState:', this.videoPlayer.readyState);
            
            switch (error.code) {
                case error.MEDIA_ERR_ABORTED:
                    errorMessage = 'Video playback was aborted.';
                    break;
                case error.MEDIA_ERR_NETWORK:
                    errorMessage = 'Network error occurred while loading video.';
                    break;
                case error.MEDIA_ERR_DECODE:
                    errorMessage = 'Video decoding error. Format may not be supported.';
                    break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = 'Video format not supported. This may be a Telegram WebView compatibility issue.';
                    break;
            }
        }

        this.showError(errorMessage);
        this.updateDebugInfo('status', 'ERROR: ' + errorMessage);
    }
    
    handleVideoWaiting() {
        if (this.isVideoPlaying) {
            this.loadingIndicator.style.display = 'flex';
        }
    }
    
    togglePlayPause() {
        if (!this.videoPlayer) return;

        if (this.videoPlayer.paused) {
            this.videoPlayer.play()
                .then(() => {
                    this.isVideoPlaying = true;
                    if (this.playIcon) this.playIcon.style.display = 'none';
                    if (this.pauseIcon) this.pauseIcon.style.display = 'block';
                })
                .catch(error => {
                    console.error('Play error:', error);
                    this.showError('Cannot play video. ' + error.message);
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
        
        if (!document.fullscreenElement) {
            if (this.videoContainer.requestFullscreen) {
                this.videoContainer.requestFullscreen();
            } else if (this.videoContainer.webkitRequestFullscreen) {
                this.videoContainer.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
        this.showControls();
    }
    
    rewindVideo() {
        if (!this.videoPlayer) return;
        const currentTime = this.videoPlayer.currentTime;
        this.videoPlayer.currentTime = Math.max(0, currentTime - 10);
        this.showControls();
    }

    forwardVideo() {
        if (!this.videoPlayer) return;
        const currentTime = this.videoPlayer.currentTime;
        this.videoPlayer.currentTime = Math.min(
            this.videoDuration,
            currentTime + 10
        );
        this.showControls();
    }
    
    adjustVolume() {
        if (!this.videoPlayer || !this.volumeSlider) return;
        this.videoPlayer.volume = this.volumeSlider.value;
        this.lastVolume = this.volumeSlider.value;
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
        this.videoPlayer.currentTime = pos * this.videoDuration;
        this.showControls();
    }
    
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
            <button class="retry-btn" onclick="window.videoPlayerApp.openVipPurchase()" style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #000; font-weight: bold;">
                <i class="fas fa-crown"></i> Beli Akses VIP
            </button>
        `;
        
        errorContainer.style.display = 'block';
        this.updateDebugInfo('status', 'VIP Required');
    }
    
    openVipPurchase() {
        if (window.Telegram && window.Telegram.WebApp) {
            try {
                window.Telegram.WebApp.close();
            } catch (error) {
                alert('Silakan kembali ke bot untuk membeli VIP.');
            }
        }
    }
    
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
    
    destroy() {
        if (this.videoBlob) {
            URL.revokeObjectURL(this.videoBlob);
            this.videoBlob = null;
        }

        this.encryptedVideoUrl = null;

        if (this.videoPlayer) {
            this.videoPlayer.src = '';
            this.videoPlayer.load();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.videoPlayerApp = new VideoPlayerApp();
    
    window.addEventListener('beforeunload', () => {
        if (window.videoPlayerApp) {
            window.videoPlayerApp.destroy();
        }
    });
});
