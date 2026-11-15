# BentoBabu — Media Storage System Setup & Production Guide

This guide provides instructions for configuring, deploying, and maintaining BentoBabu's high-efficiency media management system using **Cloudinary** (for food images) and **Cloudflare R2** (for food videos), backed by MongoDB Atlas and secured with role-based admin controls.

---

## 1. System Architecture Overview

```
                          ┌──────────────────────────┐
                          │   BentoBabu Admin UI     │
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┴───────────────────────────┐
           │ (Images)                                               │ (Videos: Direct Presigned)
           ▼                                                        ▼
┌───────────────────────┐                                ┌───────────────────────┐
│  BentoBabu Backend    │                                │     Cloudflare R2     │
│  (Express 5 on Render)│                                │  (S3-Compatible Store)│
└──────────┬────────────┘                                └──────────▲────────────┘
           │                                                        │
           │ 1. Sharp Pipeline (WebP, Q84, max 1800px)              │ Presigned PUT
           │ 2. Buffer Stream Upload                                │ Direct Upload
           ▼                                                        │
┌───────────────────────┐                                           │
│      Cloudinary       │                                           │
│  (Food Images Store)  │                                           │
└───────────────────────┘                                           │
           │                                                        │
           │ Fixed Presets (320, 640, 1200)                         │ Public CDN Streaming
           ▼                                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Customer Web Frontend                             │
│                  (Next.js App Router on Vercel)                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Storage Efficiency Principles
1. **Zero Render Disk/Memory Video Load**: 50 MB video uploads bypass the Render Node.js instance completely. The browser receives a short-lived presigned PUT URL and streams video directly to Cloudflare R2.
2. **Sharp Pre-Processing**: Images uploaded by admins are pre-optimized before reaching Cloudinary:
   - Converted to WebP format (quality 84, effort 4).
   - Resized fit-inside max 1800x1800 px without upscaling.
   - All EXIF metadata stripped; orientation auto-corrected.
   - Typical byte size savings: **75% to 90%**.
3. **Fixed Cloudinary Delivery Presets**: Cloudinary delivery URLs use strictly fixed width presets (`thumbnail`: 320, `card`: 640, `detail`: 1200) with `c_limit, q_auto`. Dynamic ad-hoc transformations are prevented, ensuring transformation quotas are not consumed by crawler bot requests.
4. **Lifecycle Cleanups**: When an admin updates a product with new media, replaced Cloudinary image assets and Cloudflare R2 video objects are deleted automatically. Permanent product deletions wipe all associated image and video assets from storage.

---

## 2. Cloudinary Setup (Food Images)

### Step 1: Create Account & Retrieve API Keys
1. Go to [cloudinary.com](https://cloudinary.com/) and register for a free account.
2. From the **Dashboard / API Keys** section, copy:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

### Step 2: Environment Variables
Add these to `bentobabu-backend/.env` (and Render Dashboard under Environment):

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Step 3: Fixed Delivery Presets
Images stored in Cloudinary are accessed using deterministic delivery presets:
- `thumbnail` (320px): For cart previews, mobile mini-cards, and detail thumbnails.
- `card` (640px): For menu grids, home page sliders, and search results.
- `detail` (1200px): For hero banners and product detail displays.

---

## 3. Cloudflare R2 Setup (Food Videos)

Cloudflare R2 provides zero-egress cost object storage with an S3-compatible API.

### Step 1: Create an R2 Bucket
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, click **R2**.
3. Click **Create Bucket**.
4. Set Bucket Name to: `bentobabu-media` (or your preferred name).
5. Choose **Automatic** location (or closest region) and click **Create Bucket**.

### Step 2: Generate S3-Compatible API Credentials
1. In the R2 Overview page, click **Manage R2 API Tokens** (top right).
2. Click **Create API Token**.
3. Set Token Name: `bentobabu-backend-uploader`.
4. Permissions: Select **Object Read & Write**.
5. Specify bucket: Apply to `bentobabu-media`.
6. Set TTL or leave as indefinite.
7. Click **Create API Token**.
8. Copy the credentials immediately:
   - **Account ID** (found in your R2 dashboard URL: `dash.cloudflare.com/<account_id>/r2`)
   - **Access Key ID**
   - **Secret Access Key**

### Step 3: Public Bucket Access / Custom Domain
1. In your `bentobabu-media` bucket settings, go to the **Settings** tab.
2. Under **Public Access**, choose one of the following:
   - **Custom Domain** (Recommended for Production): Connect a domain such as `media.bentobabu.com`. Cloudflare will provision an SSL certificate automatically.
   - **R2.dev Subdomain** (For Staging/Dev): Enable the `pub-xxxx.r2.dev` public access URL.
3. Note your public base URL (e.g., `https://media.bentobabu.com`).

### Step 4: Configure CORS on the R2 Bucket
To allow browser-to-R2 direct PUT uploads from the admin dashboard and video playback from the customer frontend, configure CORS on the bucket:

1. In the bucket **Settings** tab, scroll to **CORS Policy**.
2. Click **Add CORS Policy** and paste:

```json
[
  {
    "AllowedOrigins": [
      "https://admin.bentobabu.com",
      "https://bentobabu.com",
      "https://www.bentobabu.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3005"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length",
      "Authorization",
      "x-amz-date",
      "x-amz-content-sha256"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### Step 5: Environment Variables
Add these to `bentobabu-backend/.env` (and Render Dashboard under Environment):

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=bentobabu-media
R2_PUBLIC_BASE_URL=https://media.bentobabu.com
R2_REGION=auto
R2_UPLOAD_URL_EXPIRY_SECONDS=600
```

---

## 4. Video Specifications & Constraints

To preserve storage and avoid customer buffering:
- **Format**: MP4 (H.264 / AAC) or WebM (VP9).
- **Max File Size**: 50 MB (strictly enforced client-side and server-side).
- **Max Duration**: 60 seconds (verified client-side via metadata inspection before upload).
- **Playback Architecture**:
  - HTML5 `<video>` player with `controls`, `playsInline`, `preload="metadata"`.
  - Poster image fallback displayed before user interaction.
  - No autoplay with audio.

---

## 5. Security & Content Security Policy (CSP)

Both `bentobabu-frontend` and `bentobabu-admin` enforce strict Content Security Policies in their respective `next.config.ts` files:

### Permitted Origins
- **Images (`img-src`)**:
  - `'self'`, `data:`, `blob:`
  - `https://res.cloudinary.com`
  - `https://media.bentobabu.com`
  - `https://*.r2.cloudflarestorage.com`
- **Video Media (`media-src`)**:
  - `'self'`, `blob:`
  - `https://media.bentobabu.com`
  - `https://*.r2.cloudflarestorage.com`
- **API & Upload Connections (`connect-src`)**:
  - `https://api.bentobabu.com`
  - `https://res.cloudinary.com`
  - `https://media.bentobabu.com`
  - `https://*.r2.cloudflarestorage.com`

---

## 6. Admin Dashboard Features

1. **Storage Usage & Quota Monitoring Card** (at top of Catalogue page):
   - Real-time Cloudflare R2 bucket usage (Object count, GB stored, % of 10GB free tier).
   - Warning badges:
     - `NORMAL` (< 70% capacity)
     - `INFO` (>= 70% capacity)
     - `HIGH` (>= 85% capacity)
     - `CRITICAL` (>= 95% capacity)
2. **Food Image Drag-and-Drop Dropzone**:
   - Supports up to 4 images per product (1 for category).
   - Instant WebP conversion with savings percentage indicator (e.g. `87% saved`).
   - Remove/replace actions with automatic Cloudinary cleanup.
3. **Food Video Direct Upload Component**:
   - Duration check (rejects files > 60s).
   - Real-time progress bar (0% to 100%) during direct upload to R2.
   - Built-in preview video player.

---

## 7. Automated Maintenance & Tests

### Run Media Test Suite
```bash
npm --prefix bentobabu-backend run test:media
```

### Clean Stale Abandoned Uploads
Admins can trigger cleanup of abandoned video uploads (started over 2 hours ago but never confirmed):
```http
POST /api/v1/admin/media/cleanup-abandoned
Authorization: Bearer <ADMIN_TOKEN>
```
Response:
```json
{
  "success": true,
  "message": "Cleaned up 2 abandoned upload(s).",
  "data": { "cleanedCount": 2 }
}
```
