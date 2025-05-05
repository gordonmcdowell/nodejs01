// app.js

const express = require('express');
const got = require('got');
const { ytdlp } = require('yt-dlp-exec');

const app = express();
const PORT = process.env.PORT || 3000;

// Root route: simple health check
app.get('/', (_req, res) => {
  res.send('🎬 YouTube‐proxy service is running.');
});

// /stream?url=<YouTube URL>
// Proxies the MP4 stream URL extracted by yt-dlp, forwarding Range headers.
app.get('/stream', async (req, res, next) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    // 1) Extract the direct MP4 URL (best video+audio)
    const stdout = await ytdlp(videoUrl, {
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
      getUrl: true
    });
    const directUrl = stdout.trim();

    // 2) Stream it through us, preserving Range for seeking
    const upstreamHeaders = {};
    if (req.headers.range) {
      upstreamHeaders.Range = req.headers.range;
    }

    const upstream = got.stream(directUrl, { headers: upstreamHeaders });
    upstream.on('response', upstreamRes => {
      // Forward relevant headers
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

// Global error handler (optional, but helps debug)
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('❌ Internal server error');
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
