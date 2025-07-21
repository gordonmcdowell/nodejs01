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
      listFormats: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
        'X-YouTube-Client-Name:55',
        'X-YouTube-Client-Version:1.0'
      ],
      noCheckCertificates: true,
      noWarnings: true,
      preferInsecure: true,
      addHeaders: {
        'Accept': '*/*',
        'Origin': 'https://www.youtube.com',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors'
      }
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
    // Use format ID 18 (360p MP4 with audio)
    const stdout = await ytdlp(videoUrl, {
      format: '18',
      getUrl: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
        'X-YouTube-Client-Name:55',
        'X-YouTube-Client-Version:1.0'
      ],
      noCheckCertificates: true,
      noWarnings: true,
      preferInsecure: true,
      addHeaders: {
        'Accept': '*/*',
        'Origin': 'https://www.youtube.com',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors'
      }
    });
    
    const directUrl = stdout.trim();
    
    res.json({
      url: directUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
        'Accept': '*/*',
        'Origin': 'https://www.youtube.com'
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

const updateYtDlp = async () => {
  try {
    await ytdlp('', {
      updateTo: 'nightly'
    });
    console.log('✅ yt-dlp updated successfully');
  } catch (err) {
    console.error('⚠️ yt-dlp update failed:', err);
  }
};

// Update yt-dlp before starting server
updateYtDlp().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Listening on port ${PORT}`);
  });
});
