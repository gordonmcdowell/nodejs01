// app.js

import express from 'express';
import got from 'got';
import { ytdlp } from 'yt-dlp-exec';

const app = express();
const PORT = process.env.PORT || 3000;

// Health-check
app.get('/', (_req, res) => {
  res.send('🎬 YouTube-proxy service is running.');
});

// Stream proxy
app.get('/stream', async (req, res, next) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    // 1) Get direct MP4 URL
    const stdout = await ytdlp(videoUrl, {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
      getUrl: true
    });
    const directUrl = stdout.trim();

    // 2) Proxy the stream, forwarding Range headers
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = got.stream(directUrl, { headers });
    upstream.on('response', upstreamRes => {
      res.setHeader('Content-Type', upstreamRes.headers['content-type'] || 'video/mp4');
      if (upstreamRes.headers['content-length']) {
        res.setHeader('Content-Length', upstreamRes.headers['content-length']);
      }
      if (upstreamRes.headers['content-range']) {
        res.setHeader('Content-Range', upstreamRes.headers['content-range']);
        res.status(206);
      }
    });
    upstream.on('error', err => next(err));
    upstream.pipe(res);

  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).send('❌ Failed to fetch or proxy video');
  }
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('❌ Internal server error');
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
