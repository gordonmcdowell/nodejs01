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

app.get('/stream', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    // Request HLS format specifically
    const stdout = await ytdlp(videoUrl, {
      format: 'best[ext=m3u8]/bestaudio[ext=m3u8]',
      getUrl: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ]
    });
    
    const hlsUrl = stdout.trim();
    
    // Return just the URL instead of proxying
    res.json({ url: hlsUrl });

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
