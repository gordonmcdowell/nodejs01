// app.js

import express from 'express';
import got from 'got';
import ytdlp from 'yt-dlp-exec';

const app = express();
const PORT = process.env.PORT || 3000;

// Health-check endpoint
app.get('/', (_req, res) => {
  res.send('🎬 YouTube‐proxy service is running.');
});

// Stream proxy endpoint
app.get('/stream', async (req, res, next) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    // 1) Extract the direct MP4 URL from yt-dlp
    const stdout = await ytdlp(videoUrl, {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
      getUrl: true
    });
    const directUrl = stdout.trim();

    // 2) Build headers for the upstream request:
    //    - Forward client's Range (for seeking)
    //    - Supply a realistic User-Agent
    //    - Set Referer to the original YouTube URL
    const upstreamHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Referer':    videoUrl
    };
    if (req.headers.range) {
      upstreamHeaders.Range = req.headers.range;
    }

    // 3) Stream the video, following redirects
    const upstream = got.stream(directUrl, {
      headers: upstreamHeaders,
      followRedirect: true
    });

    // 4) Forward key response headers to the client
    upstream.on('response', upstreamRes => {
      res.setHeader('Content-Type', upstreamRes.headers['content-type'] || 'video/mp4');
      if (upstreamRes.headers['content-length']) {
        res.setHeader('Content-Length', upstreamRes.headers['content-length']);
      }
      if (upstreamRes.headers['content-range']) {
        res.setHeader('Content-Range', upstreamRes.headers['content-range']);
        res.status(206); // Partial Content
      }
    });

    upstream.on('error', err => next(err));
    upstream.pipe(res);

  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).send('❌ Failed to fetch or proxy video');
  }
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('❌ Internal server error');
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
