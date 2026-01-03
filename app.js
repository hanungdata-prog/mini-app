// app-videojs.js - Video Player dengan Video.js untuk Telegram Mini App

class VideoPlayerApp {
    constructor() {
        this.setupSecurityMeasures();
        this.initializeElements();
        
        let rawCode = this.getUrlParameter('code') || this.getTelegramStartParam();
        this.deepLinkCode = this.validateVideoCode(rawCode);
        this.userId = this.getTelegramUserId();
        
        this.updateDebugInfo('code', this.deepLinkCode || 'INVALID');
        this.updateDebugInfo('telegram', window.Telegram ? 'YES' : 'NO');
        
        this.player = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        if (!this.deepLinkCode) {
            this.showError('Invalid video code. Please check your link and try again.');
            this.updateDebugInfo('status', 'INVALID CODE');
            this.loadingIndicator.style.display = 'none';
        } else {
            this.updateDebugInfo('status', 'Initializing...');
            this.initializePlayer();
        }
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
        this.videoDescription = document.getElementById('videoDescription');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
        this.retryButton = document.getElementById('retryButton');
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
        
        if (code.includes('#')) code = code.split('#')[0];
        if (code.includes('?')) code = code.split('?')[0];
        if (code.includes('&')) code = code.split('&')[0];
        
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
                if (response.status === 404) {
                    throw new Error('Video not found. Please check your video code.');
                } else if (response.status === 403) {
                    throw new Error('Access denied.');
                } else {
                    throw new Error(`Error ${response.status}: Failed to load video.`);
                }
            }
            
            const data = await response.json();
            this.updateDebugInfo('api', 'SUCCESS');
            
            if (!data || !data.stream_url) {
                throw new Error('Invalid response from server.');
            }
            
            if (data.access && !data.access.has_access) {
                this.showVipRequiredError(data);
                return;
            }

            this.updateDebugInfo('status', 'Video loaded');
            
            this.updateVideoMetadata(data);
            this.setupVideoPlayer(data.stream_url);
            
            this.retryCount = 0;
            
        } catch (error) {
            console.error('Error fetching video data:', error);
            
            this.updateDebugInfo('api', 'FAILED');
            this.updateDebugInfo('status', 'Error: ' + error.message);
            
            let errorMessage = 'Failed to load video. Please try again.';
            
            if (error.name === 'AbortError') {
                errorMessage = 'Request timeout. Please check your connection.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showError(errorMessage);
            this.loadingIndicator.style.display = 'none';
            
            if (this.retryButton) {
                this.retryButton.style.display = 'inline-block';
                this.retryButton.onclick = () => this.retryLoading();
            }
        }
    }
    
    updateVideoMetadata(data) {
        const title = data.title || 'Untitled Video';
        if (this.videoTitle) {
            this.videoTitle.textContent = title;
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
    
    setupVideoPlayer(videoUrl) {
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

        console.log('Setting up Video.js with URL:', finalUrl);

        // Initialize Video.js player
        this.player = videojs('videoPlayer', {
            controls: true,
            autoplay: false,
            preload: 'auto',
            fluid: false,
            fill: true,
            responsive: true,
            playsinline: true,
            html5: {
                vhs: {
                    overrideNative: true
                },
                nativeVideoTracks: false,
                nativeAudioTracks: false,
                nativeTextTracks: false
            },
            controlBar: {
                pictureInPictureToggle: false,
                volumePanel: {
                    inline: false
                }
            }
        });

        // Set video source
        this.player.src({
            type: 'video/mp4',
            src: finalUrl
        });

        // Event listeners
        this.player.ready(() => {
            console.log('Video.js player ready');
            this.loadingIndicator.style.display = 'none';
        });

        this.player.on('loadedmetadata', () => {
            console.log('Video metadata loaded');
            this.updateDebugInfo('status', 'Ready to play');
        });

        this.player.on('canplay', () => {
            console.log('Video can play');
            this.loadingIndicator.style.display = 'none';
        });

        this.player.on('playing', () => {
            console.log('Video playing');
            this.loadingIndicator.style.display = 'none';
        });

        this.player.on('waiting', () => {
            console.log('Video waiting/buffering');
            this.loadingIndicator.style.display = 'flex';
        });

        this.player.on('error', (e) => {
            console.error('Video.js error:', e);
            const error = this.player.error();
            
            if (error) {
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);
                
                let errorMessage = 'Failed to play video.';
                
                switch (error.code) {
                    case 1:
                        errorMessage = 'Video loading was aborted.';
                        break;
                    case 2:
                        errorMessage = 'Network error occurred.';
                        break;
                    case 3:
                        errorMessage = 'Video decoding failed.';
                        break;
                    case 4:
                        errorMessage = 'Video format not supported. The video may need to be re-encoded.';
                        break;
                }
                
                this.showError(errorMessage);
            }
            
            this.loadingIndicator.style.display = 'none';
            this.updateDebugInfo('status', 'ERROR');
        });

        // Disable right-click on player
        this.player.el().addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
    }
    
    retryLoading() {
        if (this.retryCount >= this.maxRetries) {
            this.showError('Maximum retry attempts reached. Please refresh the page.');
            return;
        }
        
        this.retryCount++;
        this.errorMessage.style.display = 'none';
        this.loadingIndicator.style.display = 'flex';
        
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
        
        this.initializePlayer();
    }
    
    updateDebugInfo(field, value) {
        const debugEl = document.getElementById('debug' + field.charAt(0).toUpperCase() + field.slice(1));
        if (debugEl) {
            debugEl.textContent = value;
        }
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
                <i class="fas fa-crown" style="font-size: 48px; color: #ffd700;"></i>
            </div>
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">
                Konten VIP
            </div>
            <div style="font-size: 14px; color: #ffb3b3; margin-bottom: 20px;">
                ${data.access.message || 'Video ini khusus member VIP'}
            </div>
            <button class="retry-btn" onclick="window.videoPlayerApp.openVipPurchase()" style="background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #000;">
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
    
    destroy() {
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.videoPlayerApp = new VideoPlayerApp();
    
    window.addEventListener('beforeunload', () => {
        if (window.videoPlayerApp) {
            window.videoPlayerApp.destroy();
        }
    });
});
