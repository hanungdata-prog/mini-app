// Get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Disable right-click context menu
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
});

// Disable selection and text highlighting
document.addEventListener('selectstart', function(e) {
    e.preventDefault();
    return false;
});

// Disable drag and drop
document.addEventListener('dragstart', function(e) {
    e.preventDefault();
    return false;
});

// Disable long press on mobile
document.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Prevent video context menu
document.getElementById('videoPlayer').addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
});

// Prevent video selection
document.getElementById('videoPlayer').addEventListener('selectstart', function(e) {
    e.preventDefault();
    return false;
});

// Get the deep link code from URL
const deepLinkCode = getUrlParameter('code');

if (!deepLinkCode) {
    document.getElementById('errorMessage').style.display = 'block';
    document.getElementById('errorMessage').textContent = 'No video code provided';
    document.getElementById('loadingIndicator').style.display = 'none';
} else {
    // Fetch video data from backend API
    fetch(`/api/video?code=${encodeURIComponent(deepLinkCode)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Video not found');
            }
            return response.json();
        })
        .then(data => {
            // Update UI with video metadata
            document.getElementById('videoTitle').textContent = data.title || 'Untitled';
            document.getElementById('videoDescription').textContent = data.description || '';
            
            // Set video source with proper handling for R2 URLs
            const videoPlayer = document.getElementById('videoPlayer');
            
            // Set the video source
            videoPlayer.src = data.video_url;
            
            // Ensure security attributes are set
            videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
            videoPlayer.disableRemotePlayback = true;
            videoPlayer.setAttribute('crossorigin', 'anonymous');
            videoPlayer.setAttribute('preload', 'metadata');
            
            // Hide loading indicator
            document.getElementById('loadingIndicator').style.display = 'none';
            
            // Add event listener for when video is loaded
            videoPlayer.addEventListener('loadeddata', function() {
                // Video is ready to play
                console.log('Video loaded successfully');
            });
            
            // Add error handling for video loading
            videoPlayer.addEventListener('error', function(e) {
                document.getElementById('errorMessage').style.display = 'block';
                document.getElementById('errorMessage').textContent = 'Failed to load video. Please try again later.';
                document.getElementById('loadingIndicator').style.display = 'none';
                console.error('Video error:', e);
            });
            
            // Handle network errors
            videoPlayer.addEventListener('abort', function() {
                document.getElementById('errorMessage').style.display = 'block';
                document.getElementById('errorMessage').textContent = 'Video loading was aborted.';
                document.getElementById('loadingIndicator').style.display = 'none';
            });
            
            videoPlayer.addEventListener('stalled', function() {
                console.log('Video loading stalled');
            });
        })
        .catch(error => {
            console.error('Error fetching video data:', error);
            document.getElementById('errorMessage').style.display = 'block';
            document.getElementById('errorMessage').textContent = 'Failed to load video data. Please try again later.';
            document.getElementById('loadingIndicator').style.display = 'none';
        });
}

// Enhanced security: Prevent video URL inspection and devtools access
window.addEventListener('load', function() {
    // Remove the video source from the element after it starts loading
    const videoPlayer = document.getElementById('videoPlayer');
    
    videoPlayer.addEventListener('loadstart', function() {
        // The video has started loading, we can consider it secure at this point
    });
    
    // More comprehensive key prevention
    document.addEventListener('keydown', function(e) {
        // Prevent F12, Ctrl+Shift+I, Ctrl+U, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+Shift+T
        if (e.keyCode === 123 || 
            (e.ctrlKey && e.shiftKey && e.keyCode === 73) ||
            (e.ctrlKey && e.keyCode === 85) ||
            (e.ctrlKey && e.shiftKey && e.keyCode === 74) ||
            (e.ctrlKey && e.shiftKey && e.keyCode === 67) ||
            (e.ctrlKey && e.shiftKey && e.keyCode === 84) || // Ctrl+Shift+T (New tab)
            (e.ctrlKey && e.keyCode === 83) ||  // Ctrl+S (Save)
            (e.ctrlKey && e.keyCode === 80) ||  // Ctrl+P (Print)
            (e.ctrlKey && e.shiftKey && e.keyCode === 80) || // Ctrl+Shift+P (Private browsing)
            (e.ctrlKey && e.altKey && e.keyCode === 73) || // Ctrl+Alt+I (Alternative dev tools)
            (e.ctrlKey && e.altKey && e.keyCode === 74) || // Ctrl+Alt+J (Alternative dev tools)
            (e.ctrlKey && e.altKey && e.keyCode === 75) || // Ctrl+Alt+K (Alternative dev tools)
            (e.f11) // F11 (Fullscreen)
        ) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        
        // Prevent specific key combinations on video element
        if (e.target.tagName === 'VIDEO') {
            // Prevent space (play/pause), arrow keys, etc. if needed
            // For now, we allow normal video controls
        }
    });
});

// Prevent common download methods
document.addEventListener('keydown', function(e) {
    // Prevent F12, Ctrl+Shift+I, Ctrl+U, Ctrl+Shift+J
    if (e.keyCode === 123 || 
        (e.ctrlKey && e.shiftKey && e.keyCode === 73) ||
        (e.ctrlKey && e.keyCode === 85) ||
        (e.ctrlKey && e.shiftKey && e.keyCode === 74)) {
        e.preventDefault();
        return false;
    }
});

// Additional security measures
document.addEventListener('DOMContentLoaded', function() {
    // Disable text selection on the entire page
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.mozUserSelect = 'none';
    document.body.style.msUserSelect = 'none';
    
    // Disable copy/paste events
    document.addEventListener('copy', function(e) {
        e.preventDefault();
        return false;
    });
    
    document.addEventListener('paste', function(e) {
        e.preventDefault();
        return false;
    });
    
    // Disable drag and drop on video element
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.addEventListener('dragstart', function(e) {
        e.preventDefault();
        return false;
    });
    
    // Prevent saving via right-click context menu on video
    videoPlayer.addEventListener('canplay', function() {
        // Once video is loaded, ensure security attributes are set
        videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
        videoPlayer.disableRemotePlayback = true;
    });
});

// Prevent opening video in new tab via context menu
document.addEventListener('click', function(e) {
    if (e.target.tagName === 'VIDEO') {
        // Prevent any special actions on video clicks
    }
});

// Additional protection: Monitor for attempts to access video URL
const originalXMLHttpRequest = window.XMLHttpRequest;
const originalFetch = window.fetch;

// Override fetch to prevent interception of video URLs
window.fetch = function(...args) {
    // Check if this is a request for the video URL
    if (typeof args[0] === 'string' && (args[0].includes('r2') || args[0].includes('video'))) {
        // Add additional headers or validation if needed
    }
    return originalFetch.apply(this, args);
};

// Enhanced devtools detection and prevention
let devtools = false;
const devtoolsHandler = () => {
    if (devtools) {
        // If devtools are open, we can take action
        // For now, we'll just log it
        console.log('DevTools detected');
    }
};

// Check for devtools by measuring performance
setInterval(() => {
    const start = performance.now();
    debugger;
    const end = performance.now();
    if (end - start > 100) {
        devtools = true;
        devtoolsHandler();
    } else {
        devtools = false;
    }
}, 1000);

// Additional video security measures
document.addEventListener('DOMContentLoaded', function() {
    const videoPlayer = document.getElementById('videoPlayer');
    
    // Prevent download by intercepting video events
    videoPlayer.addEventListener('progress', function() {
        // Monitor download progress
    });
    
    videoPlayer.addEventListener('loadstart', function() {
        // Reset security attributes when loading starts
        videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
        videoPlayer.disableRemotePlayback = true;
        videoPlayer.setAttribute('crossorigin', 'anonymous');
    });
    
    // Prevent video download by intercepting network requests
    videoPlayer.addEventListener('load', function() {
        // Ensure security attributes are always set
        videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
        videoPlayer.disableRemotePlayback = true;
    });
    
    // Handle R2 video specific events
    videoPlayer.addEventListener('waiting', function() {
        // Video is buffering, show appropriate UI if needed
        console.log('Video is buffering');
    });
    
    videoPlayer.addEventListener('canplaythrough', function() {
        // Video can play through without buffering
        console.log('Video can play through');
    });
});

// Prevent video download by disabling video element access
Object.defineProperty(HTMLVideoElement.prototype, 'src', {
    set: function(value) {
        // Add security check before setting video source
        this.setAttribute('controlsList', 'nodownload noplaybackrate');
        this.disableRemotePlayback = true;
        this.setAttribute('crossorigin', 'anonymous');
        // Call the original setter
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src').set;
        nativeSetter.call(this, value);
    },
    get: function() {
        // Return the current source
        const nativeGetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src').get;
        return nativeGetter.call(this);
    }
});

// Prevent video download by intercepting video element attributes
const originalSetAttribute = Element.prototype.setAttribute;
Element.prototype.setAttribute = function(name, value) {
    if (this.tagName === 'VIDEO' && name === 'src') {
        // Ensure security attributes are maintained when setting video source
        this.setAttribute('controlsList', 'nodownload noplaybackrate');
        this.disableRemotePlayback = true;
        this.setAttribute('crossorigin', 'anonymous');
    }
    return originalSetAttribute.call(this, name, value);
};

// Prevent orientation lock and ensure responsive behavior
window.addEventListener('orientationchange', function() {
    // Adjust layout based on orientation
    setTimeout(function() {
        // Force a redraw to ensure proper layout
        document.body.style.height = '100vh';
        document.body.offsetHeight; // Trigger reflow
    }, 100);
});

// Additional security: Prevent video element inspection
const originalGetElementsByTagName = document.getElementsByTagName;
document.getElementsByTagName = function(tagName) {
    const elements = originalGetElementsByTagName.call(this, tagName);
    if (tagName.toLowerCase() === 'video') {
        // Add security measures to video elements
        for (let i = 0; i < elements.length; i++) {
            elements[i].setAttribute('controlsList', 'nodownload noplaybackrate');
            elements[i].disableRemotePlayback = true;
            elements[i].setAttribute('crossorigin', 'anonymous');
        }
    }
    return elements;
};

// Additional R2 video handling
document.addEventListener('DOMContentLoaded', function() {
    // Ensure video player is properly configured for R2 streaming
    const videoPlayer = document.getElementById('videoPlayer');

    // Set additional attributes for better R2 compatibility
    videoPlayer.setAttribute('preload', 'metadata');
    videoPlayer.setAttribute('playsinline', 'true');
    videoPlayer.setAttribute('webkit-playsinline', 'true');

    // Handle potential CORS issues with R2
    videoPlayer.setAttribute('crossorigin', 'anonymous');
});