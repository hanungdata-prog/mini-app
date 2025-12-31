// Get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// DEVTOOLS ENABLED - All security measures commented out for debugging

// Disable right-click context menu - DISABLED FOR DEBUG
// document.addEventListener('contextmenu', function(e) {
//     e.preventDefault();
//     return false;
// });

// Disable selection and text highlighting - DISABLED FOR DEBUG
// document.addEventListener('selectstart', function(e) {
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
    // Fetch video data from backend API
    fetch(`/api/video?code=${encodeURIComponent(deepLinkCode)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Video not found');
            }
            return response.json();
        })
        .then(data => {
            console.log('Video data received:', data); // Debug log
            
            // Update UI with video metadata
            document.getElementById('videoTitle').textContent = data.title || 'Untitled';
            document.getElementById('videoDescription').textContent = data.description || '';
            
            // Set video source with proper handling for R2 URLs
            const videoPlayer = document.getElementById('videoPlayer');
            
            // Set the video source
            videoPlayer.src = data.video_url;
            console.log('Video URL set:', data.video_url); // Debug log
            
            // Ensure security attributes are set
            videoPlayer.setAttribute('controlsList', 'nodownload noplaybackrate');
            videoPlayer.disableRemotePlayback = true;
            videoPlayer.setAttribute('crossorigin', 'anonymous');
            videoPlayer.setAttribute('preload', 'metadata');
            
            // Hide loading indicator
            document.getElementById('loadingIndicator').style.display = 'none';
            
            // Add event listener for when video is loaded
            videoPlayer.addEventListener('loadeddata', function() {
                console.log('Video loaded successfully');
            });
            
            // Add error handling for video loading
            videoPlayer.addEventListener('error', function(e) {
                console.error('Video error:', e);
                document.getElementById('errorMessage').style.display = 'block';
                document.getElementById('errorMessage').textContent = 'Failed to load video. Please try again later.';
                document.getElementById('loadingIndicator').style.display = 'none';
            });
            
            // Handle network errors
            videoPlayer.addEventListener('abort', function() {
                console.log('Video loading aborted');
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

// ALL KEYBOARD SHORTCUTS ENABLED FOR DEBUGGING
// No prevention of F12, Ctrl+Shift+I, etc.
console.log('DevTools shortcuts enabled for debugging');

// Additional video event handlers for debugging
document.addEventListener('DOMContentLoaded', function() {
    const videoPlayer = document.getElementById('videoPlayer');
    
    if (videoPlayer) {
        // Log all video events for debugging
        videoPlayer.addEventListener('loadstart', () => console.log('Event: loadstart'));
        videoPlayer.addEventListener('progress', () => console.log('Event: progress'));
        videoPlayer.addEventListener('canplay', () => console.log('Event: canplay'));
        videoPlayer.addEventListener('canplaythrough', () => console.log('Event: canplaythrough'));
        videoPlayer.addEventListener('waiting', () => console.log('Event: waiting'));
        videoPlayer.addEventListener('playing', () => console.log('Event: playing'));
        videoPlayer.addEventListener('pause', () => console.log('Event: pause'));
        videoPlayer.addEventListener('ended', () => console.log('Event: ended'));
        
        // Set additional attributes for better R2 compatibility
        videoPlayer.setAttribute('preload', 'metadata');
        videoPlayer.setAttribute('playsinline', 'true');
        videoPlayer.setAttribute('webkit-playsinline', 'true');
        videoPlayer.setAttribute('crossorigin', 'anonymous');
        
        console.log('Video player initialized for debugging');
    } else {
        console.error('Video player element not found!');
    }
});

console.log('Debug mode: All DevTools protections disabled');
