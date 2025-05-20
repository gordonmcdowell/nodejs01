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

app.get('/formats', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    const stdout = await ytdlp(videoUrl, {
      listFormats: true
    });
    res.send(`<pre>${stdout}</pre>`);
  } catch (err) {
    console.error('Format list error:', err);
    res.status(500).send(`❌ Failed to list formats: ${err.message}`);
  }
});

app.get('/stream', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }

  try {
    // Request best MP4 format - compatible with AVPlayer
    const stdout = await ytdlp(videoUrl, {
      format: 'bestvideo[ext=mp4][protocol^=http]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      getUrl: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      ]
    });
    
    const directUrl = stdout.trim();
    
    // Return URL and suggested headers for AVPlayer
    res.json({
      url: directUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://www.youtube.com/'
      }
    });

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
