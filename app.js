// app.js - Fixed version with Telegram connection error handling

class VideoPlayerApp {
    constructor() {
        // Initialize with fallback for Telegram errors
        this.initWithFallback();
    }
    
    async initWithFallback() {
        try {
            // First try to initialize normally
            await this.initializeApp();
        } catch (error) {
            console.error('App initialization failed:', error);
            
            // If Telegram connection fails, try fallback mode
            if (this.isTelegramConnectionError(error)) {
                console.log('Switching to fallback mode (no Telegram)');
                await this.initializeFallbackMode();
            } else {
                this.showError('Failed to initialize app: ' + error.message);
            }
        }
    }
    
    async initializeApp() {
        // Security measures
        this.setupSecurityMeasures();
        
        // Initialize elements
        this.initializeElements();
        
        // Try to initialize Telegram with timeout
        await this.initTelegramWithTimeout();
        
        // Get code from all sources
        this.deepLinkCode = this.getVideoCodeFromAllSources();
        
        // Get user ID with fallback
        this.userId = await this.getUserIdWithFallback();
        
        // Debug info
        console.log('App initialized:', {
            code: this.deepLinkCode,
            userId: this.userId,
            hasTelegram: !!window.Telegram
        });
        
        // Update debug UI
        this.updateDebugInfo('code', this.deepLinkCode || 'NOT FOUND');
        this.updateDebugInfo('telegram', window.Telegram ? 'YES' : 'NO');
        this.updateDebugInfo('user', this.userId || 'NOT LOGGED IN');
        this.updateDebugInfo('mode', window.Telegram ? 'TELEGRAM' : 'FALLBACK');
        
        // Initialize player
        if (!this.deepLinkCode) {
            this.showError('Video code not found. Please use a valid link.');
            this.updateDebugInfo('status', 'NO CODE FOUND');
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
    
    async initTelegramWithTimeout() {
        return new Promise((resolve, reject) => {
            // Set timeout for Telegram initialization
            const timeout = setTimeout(() => {
                console.warn('Telegram initialization timeout');
                reject(new Error('Telegram connection timeout'));
            }, 5000); // 5 second timeout
            
            try {
                if (window.Telegram && window.Telegram.WebApp) {
                    const tg = window.Telegram.WebApp;
                    
                    // Initialize with error handling
                    try {
                        tg.ready();
                        tg.expand();
                        tg.setBackgroundColor('#000000');
                        tg.setHeaderColor('#000000');
                        
                        console.log('Telegram WebApp initialized successfully');
                        clearTimeout(timeout);
                        resolve();
                    } catch (tgError) {
                        clearTimeout(timeout);
                        console.warn('Telegram WebApp error:', tgError);
                        reject(tgError);
                    }
                } else {
                    clearTimeout(timeout);
                    console.log('Telegram WebApp not available, running in browser mode');
                    resolve(); // Resolve even without Telegram
                }
            } catch (error) {
                clearTimeout(timeout);
                console.error('Error checking Telegram:', error);
                reject(error);
            }
        });
    }
    
    isTelegramConnectionError(error) {
        const errorMessage = error.message || '';
        const errorString = error.toString();
        
        const telegramErrors = [
            'TIMEOUT',
            'WebSocket connection',
            'connection timeout',
            'TelegramClient',
            'zws5.web.telegram.org',
            'MTProtoSender'
        ];
        
        return telegramErrors.some(keyword => 
            errorMessage.includes(keyword) || errorString.includes(keyword)
        );
    }
    
    async initializeFallbackMode() {
        console.log('Initializing in fallback mode...');
        
        // Basic initialization without Telegram
        this.setupSecurityMeasures();
        this.initializeElements();
        
        // Try to get code from URL only (since Telegram failed)
        this.deepLinkCode = this.extractCodeFromURLOnly();
        
        // No user ID in fallback mode
        this.userId = null;
        
        // Show notification about fallback mode
        this.showFallbackNotification();
        
        // Update debug UI
        this.updateDebugInfo('code', this.deepLinkCode || 'NOT FOUND');
        this.updateDebugInfo('telegram', 'NO (Fallback Mode)');
        this.updateDebugInfo('user', 'UNAVAILABLE');
        this.updateDebugInfo('mode', 'FALLBACK');
        this.updateDebugInfo('status', 'Running without Telegram');
        
        // Initialize player if code found
        if (this.deepLinkCode) {
            this.initializePlayer();
        } else {
            this.showError('Cannot find video code. Please make sure you are using the correct link.');
        }
    }
    
    extractCodeFromURLOnly() {
        // Extract code only from URL parameters (no Telegram)
        const urlParams = new URLSearchParams(window.location.search);
        
        // Check common parameter names
        const paramNames = ['code', 'startapp', 'video', 'v', 'id', 'start_param'];
        
        for (const name of paramNames) {
            const value = urlParams.get(name);
            if (value && this.validateVideoCode(value)) {
                console.log('Found code from URL parameter (fallback):', name, value);
                return value;
            }
        }
        
        // Check hash
        if (window.location.hash) {
            const hash = window.location.hash.substring(1);
            const hashParams = new URLSearchParams(hash);
            
            for (const name of paramNames) {
                const value = hashParams.get(name);
                if (value && this.validateVideoCode(value)) {
                    console.log('Found code from hash (fallback):', name, value);
                    return value;
                }
            }
            
            // Direct hash value
            if (hash && this.validateVideoCode(hash)) {
                return hash;
            }
        }
        
        return null;
    }
    
    showFallbackNotification() {
        // Show a subtle notification about fallback mode
        const notification = document.createElement('div');
        notification.id = 'fallbackNotification';
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(255, 193, 7, 0.9);
            color: #000;
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 12px;
            z-index: 10000;
            max-width: 300px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 213, 79, 0.5);
            animation: slideIn 0.3s ease;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-info-circle"></i>
                <div>
                    <strong>Browser Mode</strong><br>
                    <small>Running without Telegram integration</small>
                </div>
                <button onclick="document.getElementById('fallbackNotification').remove()" 
                        style="background: none; border: none; color: #000; cursor: pointer; margin-left: auto;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.5s';
                setTimeout(() => notification.remove(), 500);
            }
        }, 10000);
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    async getUserIdWithFallback() {
        try {
            // First try Telegram
            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;
                const userId = tg.initDataUnsafe?.user?.id;
                if (userId) return String(userId);
            }
            
            // Fallback: try to get from URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            const urlUserId = urlParams.get('user_id') || urlParams.get('userId');
            if (urlUserId && /^\d+$/.test(urlUserId)) {
                return urlUserId;
            }
            
            // Fallback: generate anonymous session ID
            return this.generateAnonymousSessionId();
            
        } catch (error) {
            console.warn('Error getting user ID:', error);
            return this.generateAnonymousSessionId();
        }
    }
    
    generateAnonymousSessionId() {
        // Generate a temporary session ID for anonymous users
        const sessionKey = 'anonymous_session_id';
        let sessionId = sessionStorage.getItem(sessionKey);
        
        if (!sessionId) {
            sessionId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem(sessionKey, sessionId);
        }
        
        return sessionId;
    }
    
    // ========== IMPROVED API CALL WITH RETRY ==========
    
    async fetchVideoDataWithRetry(apiUrl, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`API attempt ${attempt}/${maxRetries}: ${apiUrl}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-Fallback-Mode': this.userId ? 'false' : 'true'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                console.log(`API attempt ${attempt} successful`);
                return data;
                
            } catch (error) {
                lastError = error;
                console.warn(`API attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxRetries) {
                    // Wait before retrying (exponential backoff)
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await this.sleep(delay);
                }
            }
        }
        
        throw lastError || new Error('Failed to fetch video data after retries');
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // ========== MODIFIED PLAYER INITIALIZATION ==========
    
    async initializePlayer() {
        try {
            this.showLoading('Loading video...');
            this.hideError();
            
            // Validate code
            if (!this.deepLinkCode || !/^[A-Z0-9]{8,10}$/.test(this.deepLinkCode)) {
                throw new Error(`Invalid video code format: ${this.deepLinkCode}`);
            }
            
            // Build API URL
            const apiUrl = this.buildApiUrl();
            console.log('API URL:', apiUrl);
            
            this.updateDebugInfo('api', 'Fetching...');
            this.updateDebugInfo('status', 'Loading video data...');
            
            // Fetch video data with retry
            const data = await this.fetchVideoDataWithRetry(apiUrl);
            
            console.log('API Response:', data);
            
            this.updateDebugInfo('api', 'SUCCESS');
            this.updateDebugInfo('status', 'Video loaded');
            
            // Handle API errors in response
            if (data.error) {
                throw new Error(data.message || data.error);
            }
            
            // Check access
            if (data.access && !data.access.has_access) {
                this.showVipRequiredError(data);
                return;
            }
            
            if (!data.video_url) {
                throw new Error('Video URL not found in response');
            }
            
            // Update UI
            this.updateVideoMetadata(data);
            
            // Set video source
            await this.setVideoSource(data.video_url);
            
            // Setup event listeners
            this.setupEventListeners();
            
            this.retryCount = 0;
            
        } catch (error) {
            console.error('Error initializing player:', error);
            this.handleInitializationError(error);
        }
    }
    
    buildApiUrl() {
        const baseUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
        const params = new URLSearchParams({
            code: this.deepLinkCode,
            _t: Date.now(), // Prevent caching
            _v: '2.0' // API version
        });
        
        if (this.userId) {
            params.append('user_id', this.userId);
        }
        
        // Add mode indicator
        params.append('mode', window.Telegram ? 'telegram' : 'browser');
        
        return `${baseUrl}?${params.toString()}`;
    }
    
    // ========== REMAINING METHODS (same as before with improvements) ==========
    
    setupSecurityMeasures() {
        // ... [same as before but less restrictive in fallback mode] ...
        
        // In fallback mode, allow some dev tools for debugging
        if (!window.Telegram) {
            console.log('Security relaxed in fallback mode');
            return;
        }
        
        // Original security measures for Telegram mode
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        // ... [rest of security measures] ...
    }
    
    validateVideoCode(rawCode) {
        if (!rawCode) return null;
        
        let code = String(rawCode).trim();
        
        // Clean the code
        code = code.replace(/^startapp=/, '')
                   .replace(/^start_param=/, '')
                   .replace(/^code=/, '')
                   .replace(/^video=/, '');
        
        code = code.split('#')[0].split('?')[0].split('&')[0];
        
        try {
            if (code.includes('%')) {
                code = decodeURIComponent(code);
            }
        } catch (e) {
            // Ignore decode errors
        }
        
        code = code.replace(/[^a-zA-Z0-9]/g, '');
        
        // More flexible validation for fallback
        const regex = window.Telegram ? /^[A-Z0-9]{8,10}$/ : /^[A-Z0-9]{6,12}$/;
        
        if (!regex.test(code)) {
            console.error('Invalid code format:', code);
            return null;
        }
        
        return code;
    }
    
    handleInitializationError(error) {
        this.updateDebugInfo('api', 'FAILED');
        this.updateDebugInfo('status', `Error: ${error.message}`);
        
        let userMessage = 'Failed to load video. ';
        
        if (error.name === 'AbortError') {
            userMessage += 'Request timeout. Please check your connection.';
        } else if (error.message.includes('Access denied')) {
            userMessage = error.message;
        } else if (error.message.includes('Video not found')) {
            userMessage = 'Video not found. Please check your video code.';
        } else if (!window.Telegram) {
            userMessage += ' (Running in browser mode)';
        }
        
        // Add retry button with improved UX
        this.showError(userMessage, true);
        this.hideLoading();
    }
    
    showError(message, showRetry = true) {
        if (this.errorText) {
            this.errorText.textContent = message;
        }
        if (this.errorMessage) {
            this.errorMessage.style.display = 'block';
            
            // Update retry button
            if (this.retryButton) {
                this.retryButton.style.display = showRetry ? 'inline-block' : 'none';
                this.retryButton.textContent = 'Try Again';
            }
        }
        this.hideLoading();
    }
    
    // ========== NETWORK STATUS MONITORING ==========
    
    setupNetworkMonitoring() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            this.showNetworkStatus('Connected', 'success');
        });
        
        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.showNetworkStatus('No internet connection', 'error');
            
            if (this.isVideoPlaying) {
                this.videoPlayer.pause();
            }
        });
        
        // Monitor fetch failures
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                return await originalFetch(...args);
            } catch (error) {
                if (error.message.includes('Failed to fetch')) {
                    this.showNetworkStatus('Network error', 'error');
                }
                throw error;
            }
        };
    }
    
    showNetworkStatus(message, type = 'info') {
        const statusEl = document.getElementById('networkStatus') || this.createNetworkStatusElement();
        
        statusEl.textContent = message;
        statusEl.className = `network-status network-status-${type}`;
        statusEl.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusEl.style.opacity = '0';
            setTimeout(() => {
                statusEl.style.display = 'none';
                statusEl.style.opacity = '1';
            }, 500);
        }, 3000);
    }
    
    createNetworkStatusElement() {
        const statusEl = document.createElement('div');
        statusEl.id = 'networkStatus';
        statusEl.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 10000;
            display: none;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: opacity 0.3s;
        `;
        
        document.body.appendChild(statusEl);
        return statusEl;
    }
    
    // Add CSS for network status
    addNetworkStatusStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .network-status-success {
                background: rgba(46, 204, 113, 0.9) !important;
                border-color: rgba(39, 174, 96, 0.5) !important;
            }
            .network-status-error {
                background: rgba(231, 76, 60, 0.9) !important;
                border-color: rgba(192, 57, 43, 0.5) !important;
            }
            .network-status-info {
                background: rgba(52, 152, 219, 0.9) !important;
                border-color: rgba(41, 128, 185, 0.5) !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    // ========== INITIALIZATION ==========
    
    async init() {
        // Add network status styles
        this.addNetworkStatusStyles();
        
        // Setup network monitoring
        this.setupNetworkMonitoring();
        
        // Check initial network status
        if (!navigator.onLine) {
            this.showNetworkStatus('No internet connection', 'error');
        }
        
        // Try to initialize
        await this.initWithFallback();
    }
}

// Enhanced initialization with error recovery
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app...');
    
    try {
        // Create global instance
        window.videoPlayerApp = new VideoPlayerApp();
        
        // Initialize with error handling
        await window.videoPlayerApp.init();
        
    } catch (error) {
        console.error('Critical initialization error:', error);
        
        // Last resort error display
        const emergencyError = document.createElement('div');
        emergencyError.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #000;
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            text-align: center;
            z-index: 99999;
        `;
        
        emergencyError.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
            <div style="font-size: 24px; margin-bottom: 10px;">Unable to Load Player</div>
            <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">
                There was a problem initializing the video player.<br>
                Error: ${error.message}
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="window.location.reload()" style="
                    background: #ff375f;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">Reload Page</button>
                <button onclick="window.location.href='https://t.me/drachin_harch_bot'" style="
                    background: #0088cc;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">Open Telegram Bot</button>
            </div>
        `;
        
        document.body.innerHTML = '';
        document.body.appendChild(emergencyError);
    }
});

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // Don't show if it's a Telegram connection error (we handle those)
    if (event.error && event.error.message && 
        event.error.message.includes('Telegram') &&
        event.error.message.includes('TIMEOUT')) {
        event.preventDefault();
        return;
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Ignore Telegram connection errors
    if (event.reason && event.reason.message &&
        event.reason.message.includes('Telegram')) {
        event.preventDefault();
    }
});
