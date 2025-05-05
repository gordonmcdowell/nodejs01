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
    // 1) ask yt-dlp for the direct MP4 URL
    const stdout = await ytdlp(videoUrl, {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
      getUrl: true
    });
    const directUrl = stdout.trim();

    // 2) build headers for the upstream fetch
    const upstreamHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Referer':    videoUrl,
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
