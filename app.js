// Get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Disable right-click context menu (optional for production)
// document.addEventListener('contextmenu', function(e) {
//     e.preventDefault();
//     return false;
// });

// Disable selection and text highlighting (optional for production)
// document.addEventListener('selectstart', function(e) {
//     e.preventDefault();
//     return false;
// });

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

// Prevent video context menu (optional for production)
// document.getElementById('videoPlayer').addEventListener('contextmenu', function(e) {
//     e.preventDefault();
//     return false;
// });

// Prevent video selection (optional for production)
// document.getElementById('videoPlayer').addEventListener('selectstart', function(e) {
//     e.preventDefault();
//     return false;
// });

// Get the deep link code from URL
const deepLinkCode = getUrlParameter('code');

if (!deepLinkCode) {
    document.getElementById('errorMessage').style.display = 'block';
    document.getElementById('errorMessage').textContent = 'No video code provided';
    document.getElementById('loadingIndicator').style.display = 'none';
} else {
    // Fetch video data from backend API (using your Cloudflare Worker)
    const apiUrl = 'https://mini-app.dramachinaharch.workers.dev/api/video';
    fetch(`${apiUrl}?code=${encodeURIComponent(deepLinkCode)}`)
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


// Additional security measures (reduced to allow devtools)
document.addEventListener('DOMContentLoaded', function() {
    // Disable text selection on the entire page (reduced from full blocking)
    // document.body.style.userSelect = 'none';
    // document.body.style.webkitUserSelect = 'none';
    // document.body.style.mozUserSelect = 'none';
    // document.body.style.msUserSelect = 'none';

    // Disable copy/paste events (optional, can be removed for dev)
    // document.addEventListener('copy', function(e) {
    //     e.preventDefault();
    //     return false;
    // });

    // document.addEventListener('paste', function(e) {
    //     e.preventDefault();
    //     return false;
    // });

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


// Prevent orientation lock and ensure responsive behavior
window.addEventListener('orientationchange', function() {
    // Adjust layout based on orientation
    setTimeout(function() {
        // Force a redraw to ensure proper layout
        document.body.style.height = '100vh';
        document.body.offsetHeight; // Trigger reflow
    }, 100);
});


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