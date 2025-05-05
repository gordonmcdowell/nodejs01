// app.js

import express from 'express';
import got from 'got';
import ytdlp from 'yt-dlp-exec';

const app = express();
const PORT = process.env.PORT || 3000;

// health‐check
app.get('/', (_req, res) => {
  res.send('🎬 YouTube-proxy service is running.');
});

app.get('/stream', async (req, res, next) => {
  const videoUrl = req.query.url;
  console.log(`[stream] incoming URL: ${videoUrl}`);
  if (!videoUrl) {
    return res.status(400).send('❌ Missing ?url parameter');
  }

  try {
    // 1) ask yt-dlp for the direct mp4 URL
    const stdout = await ytdlp(videoUrl, {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
      getUrl: true
    });
    const directUrl = stdout.trim();
    console.log('[stream] got directUrl:', directUrl);

    // 2) build headers for the video fetch
    const upstreamHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Referer':    videoUrl,
      ...(req.headers.range ? { Range: req.headers.range } : {})
    };

    // 3) start streaming from Google’s servers
    const upstream = got.stream(directUrl, {
      headers: upstreamHeaders,
      followRedirect: true,
      timeout: { request: 30000 }
    });

    upstream.on('response', upstreamRes => {
      console.log('[stream] upstream status:', upstreamRes.statusCode);
      res.setHeader('Content-Type', upstreamRes.headers['content-type'] || 'video/mp4');
      if (upstreamRes.headers['content-length']) {
        res.setHeader('Content-Length', upstreamRes.headers['content-length']);
      }
      if (upstreamRes.headers['content-range']) {
        res.setHeader('Content-Range', upstreamRes.headers['content-range']);
        res.status(206);
      }
    });

    upstream.on('error', err => {
      console.error('[stream] upstream error:', err);
      next(err);
    });

    // if client disconnects, destroy the upstream
    req.on('close', () => {
      console.log('[stream] client closed connection');
      upstream.destroy();
    });

    upstream.pipe(res);

  } catch (err) {
    console.error('[stream] error:', err);
    res.status(500).send(`❌ Stream error: ${err.message}`);
  }
});

// catch-all
app.use((err, _req, res, _next) => {
  console.error('[error handler]', err);
  res.status(500).send(`❌ Internal error: ${err.message}`);
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
