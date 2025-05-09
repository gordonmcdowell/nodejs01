// app.js

import express from 'express';
import got from 'got';
import ytdlp from 'yt-dlp-exec';

const app = express();
// hard‐code 3000 so Railway’s edge proxy lines up
const PORT = 3000;

// Health check
app.get('/', (_req, res) => {
  res.send('🎬 YouTube-proxy service is running.');
});

app.get('/stream', async (req, res, next) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    // 1) ask yt-dlp for the direct MP4 URL with more options
    const stdout = await ytdlp(videoUrl, {
      format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]',
      getUrl: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language:en-US,en;q=0.5'
      ]
    });
    const directUrl = stdout.trim();

    // 2) build headers for the upstream fetch with more realistic headers
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': videoUrl,
      ...(req.headers.range ? { Range: req.headers.range } : {})
    };

    // 3) proxy the MP4 stream
    const upstream = got.stream(directUrl, {
      headers: upstreamHeaders,
      followRedirect: true,
      timeout: { request: 20000 }
    });

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
    req.on('close', () => upstream.destroy());
    upstream.pipe(res);

  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).send(`❌ Failed to fetch video: ${err.message}`);
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send(`❌ Internal error: ${err.message}`);
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
