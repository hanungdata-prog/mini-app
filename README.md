# Telegram Drama Mini App Player

A simple, secure Telegram Mini App for playing drama videos stored in Cloudflare R2 with metadata in Supabase.

## Architecture

This solution consists of:

1. **Frontend**: A mobile-first HTML page with video player and security measures
2. **Backend**: Cloudflare Worker API that acts as a secure gateway to Supabase and R2
3. **Database**: Supabase storing video metadata with deep-link codes
4. **Storage**: Cloudflare R2 for video files

## Security Features

- Video download prevention via HTML5 video attributes
- Right-click and context menu blocking
- Keyboard shortcut blocking (F12, Ctrl+Shift+I, Ctrl+U, Ctrl+Alt+I, etc.)
- Text selection and copy/paste prevention
- DevTools detection and prevention
- Signed URLs with short expiration times
- Deep-link code validation
- No direct access to video URLs from HTML source
- Enhanced video element protection
- Orientation support (portrait/landscape)

## Setup Instructions

### Frontend (index.html + app.js)

1. Host the `index.html` and `app.js` files on a web server or CDN
2. Ensure the domain is configured for Telegram Mini App access
3. The app expects a URL format: `https://miniapp.domain.com/?code=DEEP_LINK_CODE`

### Backend (Cloudflare Worker)

1. Create a new Cloudflare Worker
2. Replace the placeholder values in `video-api-worker.js`:
   - `YOUR_SUPABASE_URL` - Your Supabase project URL
   - `YOUR_SUPABASE_ANON_KEY` - Your Supabase anon key
   - `YOUR_R2_BUCKET` - Your R2 bucket name
3. Deploy the worker to your domain (e.g., `api.yourdomain.com`)
4. Ensure the worker endpoint is accessible at `/api/video?code=XXXX`

### Supabase Database

Ensure your Supabase database has a `videos` table with the following structure:

```sql
CREATE TABLE videos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'free',
  video_url TEXT NOT NULL,
  deep_link_code TEXT UNIQUE NOT NULL
);
```

### Cloudflare R2 CORS Configuration

To allow video playback in browsers, configure CORS on your R2 bucket:

```json
[
  {
    "AllowedOrigins": [
      "https://t.me",
      "https://web.telegram.org",
      "https://*.t.me",
      "https://*.web.telegram.org",
      "https://yourdomain.com",
      "https://*.yourdomain.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Type"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

## Usage Flow

1. User clicks Telegram bot deep link: `https://t.me/drachin_harch_bot?start=AB9KQZP21`
2. Bot sends button: "▶️ Tonton Sekarang"
3. Button opens: `https://miniapp.domain.com/?code=AB9KQZP21`
4. Mini App fetches metadata from backend API
5. Video loads and plays inline with security measures in place

## Customization

- Modify the watermark text in `index.html` to match your Telegram bot
- Adjust security timeout values in the Cloudflare Worker as needed
- Customize the UI colors and layout in `index.html` CSS

## Important Notes

- These security measures prevent casual downloading but are not absolute DRM
- For production use, implement proper rate limiting and user validation
- Regularly rotate your Supabase keys and R2 credentials
- Monitor your R2 usage as video streaming can incur costs
- Ensure proper CORS configuration on your R2 bucket for video playback