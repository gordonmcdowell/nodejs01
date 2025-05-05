// app.js

import express from 'express';
import ytdl from 'ytdl-core';
import got from 'got';

const app = express();
const PORT = process.env.PORT || 3000;

// Health-check
app.get('/', (_req, res) => {
  res.send('🎬 YouTube-proxy service is running.');
});

// /stream?url=<YouTube URL>
app.get('/stream', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl || !ytdl.validateURL(videoUrl)) {
    return res.status(400).send('❌ Missing or invalid ?url parameter');
  }

  try {
    // 1) Fetch video info & select the best progressive MP4
    const info = await ytdl.getInfo(videoUrl);
    const format = ytdl.chooseFormat(info.formats, {
      filter: f => f.hasVideo && f.hasAudio && f.container === 'mp4',
      quality: 'highest'
    });
    const directUrl = format.url;

    // 2) Build upstream headers:
    //    - Forward Range (seeking)
    //    - Use a real User-Agent
    //    - Set Referer to the YouTube page
    const upstreamHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Referer':    videoUrl,
      ...(req.headers.range ? { Range: req.headers.range } : {})
    };

    // 3) Stream from the direct URL
    const upstream = got.stream(directUrl, {
      headers: upstreamHeaders,
      followRedirect: true
    });

    // 4) Forward key headers back to the client
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

    // 5) Pipe the video
    upstream.pipe(res);

    // 6) Handle errors
    upstream.on('error', err => {
      console.error('[stream] upstream error:', err);
      if (!res.headersSent) {
        res.status(500).send('❌ Error streaming video');
      }
    });

  } catch (err) {
    console.error('[stream] error:', err);
    res.status(500).send(`❌ Failed to retrieve video: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
