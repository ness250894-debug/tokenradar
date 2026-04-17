import { google } from 'googleapis';
import * as fs from 'fs';

/**
 * Uploads a local MP4 file to YouTube as a Short.
 * Requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in .env
 *
 * @param videoPath - Absolute path to the MP4 file
 * @param title - The YouTube video title (Max 60 chars recommended)
 * @param description - The description including #Shorts
 * @param privacyStatus - "public", "unlisted", or "private"
 * @returns The YouTube Video ID
 */
export async function uploadToYouTubeShorts(
  videoPath: string,
  title: string,
  description: string,
  privacyStatus: 'public' | 'unlisted' | 'private' = 'unlisted'
): Promise<string> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing YouTube OAuth credentials in .env.local (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3000');
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client
  });

  const fileSize = fs.statSync(videoPath).size;

  try {
    console.info(`  ▸ Starting YouTube upload (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    }, {
      // Use the media upload endpoint for large files
      onUploadProgress: evt => {
        const progress = (evt.bytesRead / fileSize) * 100;
        process.stdout.write(`\r  [YouTube] Uploading... ${Math.round(progress)}%`);
      },
    });

    console.info();
    if (res.data && res.data.id) {
      console.info(`  ✓ YouTube upload complete! Video ID: ${res.data.id}`);
      return res.data.id;
    }
    throw new Error('Upload succeeded but no video ID was returned.');
  } catch (_error: unknown) {
    console.info();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = _error as any;
    const errorMsg = error.response?.data?.error?.message || error.message || String(error);
    const errorCode = error.response?.status;
    console.error(`❌ YouTube API Error [${errorCode}]: ${errorMsg}`);
    
    if (error.response?.data?.error?.details) {
      console.error('   Details:', JSON.stringify(error.response.data.error.details, null, 2));
    }
    
    throw new Error(`YouTube Upload Error: ${errorMsg}`);
  }
}
