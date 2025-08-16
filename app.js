// app.js


// Create cookies from Railway environment variable
import fs from 'fs';
if (process.env.YTDLP_COOKIES) {
  fs.writeFileSync('./cookies.txt', process.env.YTDLP_COOKIES, 'utf-8');
} else {
  console.warn('⚠️ YTDLP_COOKIES env var is not set! YouTube downloads may fail. Huh.');
}
console.log('Cookies file contents:', fs.readFileSync('./cookies.txt', 'utf-8'));

import express from 'express';
import got from 'got';
//import ytdlp from 'yt-dlp-exec'; // old way just to try compare
import { create } from 'yt-dlp-exec'; // This one is local copy and newer

const ytdlp = create('./yt-dlp'); // Use the local binary from prestart
const app = express();
const PORT = 3000; // hard‐code 3000 so Railway’s edge proxy lines up

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
      cookies: './cookies.txt',
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

  // Detect platform
  let format, headers;
  if (/youtube\.com|youtu\.be/.test(videoUrl)) {
    format = '18';
    headers = {
      'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
      'X-YouTube-Client-Name': '55',
      'X-YouTube-Client-Version': '1.0',
      'Accept': '*/*',
      'Origin': 'https://www.youtube.com'
    };
  } else if (/twitter\.com|x\.com/.test(videoUrl)) {
    format = 'best[protocol=m3u8]'; // auto-select best HLS stream for X/Twitter
    headers = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*',
      'Origin': 'https://x.com'
    };
  } else {
    return res.status(400).send('❌ Unsupported platform.');
  }

  try {
    const stdout = await ytdlp(videoUrl, {
      format,
      getUrl: true,
      cookies: './cookies.txt',
      noCheckCertificates: true,
      noWarnings: true,
      preferInsecure: true,
      addHeader: Object.entries(headers).map(([k, v]) => `${k}:${v}`)
    });

    const directUrl = stdout.trim();

    res.json({
      url: directUrl,
      headers
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