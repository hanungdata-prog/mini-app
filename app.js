// Get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

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
            
            // Set security attributes for video protection
            videoPlayer.setAttribute('controlsList', 'nodownload');
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

// Optional: Disable right-click context menu on video only (bukan seluruh halaman)
document.addEventListener('DOMContentLoaded', function() {
    const videoPlayer = document.getElementById('videoPlayer');
    
    // Hanya nonaktifkan right-click pada video player
    if (videoPlayer) {
        videoPlayer.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        });
    }
});

// Optional: Prevent download via video controls (tanpa mengganggu Developer Tools)
document.addEventListener('DOMContentLoaded', function() {
    const videoPlayer = document.getElementById('videoPlayer');
    
    if (videoPlayer) {
        // Set security attributes for video
        videoPlayer.setAttribute('controlsList', 'nodownload');
        videoPlayer.disableRemotePlayback = true;
        
        // Tambahkan atribut playsinline untuk mobile
        videoPlayer.setAttribute('playsinline', 'true');
        videoPlayer.setAttribute('webkit-playsinline', 'true');
    }
});

// HAPUS atau COMMENT semua kode yang memblokir Developer Tools:
// - Hapus event listener untuk keydown yang memblokir F12, Ctrl+Shift+I, dll
// - Hapus devtools detection dengan interval debugger
// - Hapus override XMLHttpRequest dan fetch
// - Hapus override Element.prototype.setAttribute
// - Hapus override document.getElementsByTagName

// Fitur keamanan yang TIDAK mengganggu Developer Tools:
document.addEventListener('DOMContentLoaded', function() {
    // Opsional: Nonaktifkan drag and drop pada video
    const videoPlayer = document.getElementById('videoPlayer');
    
    if (videoPlayer) {
        videoPlayer.addEventListener('dragstart', function(e) {
            e.preventDefault();
            return false;
        });
    }
});

// Handling untuk R2 video streaming
document.addEventListener('DOMContentLoaded', function() {
    const videoPlayer = document.getElementById('videoPlayer');
    
    if (videoPlayer) {
        // Konfigurasi tambahan untuk R2
        videoPlayer.setAttribute('preload', 'metadata');
        videoPlayer.setAttribute('crossorigin', 'anonymous');
        
        videoPlayer.addEventListener('canplay', function() {
            console.log('R2 video is ready to play');
        });
    }
});

// Optional: Untuk pengalaman pengguna yang lebih baik, biarkan text selection aktif
// (Hapus style.userSelect = 'none' dan event listener untuk copy/paste)

// Optional: Untuk mobile experience yang baik
window.addEventListener('orientationchange', function() {
    // Atur ulang layout jika diperlukan
    setTimeout(function() {
        window.scrollTo(0, 0);
    }, 100);
});
