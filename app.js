// app.js (ES Module + static yt-dlp binary)

import express from 'express';
import got from 'got';
import { spawn } from 'child_process';
import ytDlpPath from 'yt-dlp-static';

const app = express();
const PORT = process.env.PORT || 3000;

// Health-check endpoint
app.get('/', (_req, res) => {
  res.send('🎬 YouTube-proxy service is running.');
});

// Stream proxy endpoint
app.get('/stream', async (req, res, next) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    // Spawn yt-dlp-static to get the direct MP4 URL
    const args = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4', '--get-url', videoUrl];
    const directUrl = await new Promise((resolve, reject) => {
      const proc = spawn(ytDlpPath, args);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk) => stdout += chunk);
      proc.stderr.on('data', (chunk) => stderr += chunk);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr.trim()));
        }
      });
    });

    // Proxy the video stream, forwarding Range headers for seeking
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

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('❌ Internal server error');
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
