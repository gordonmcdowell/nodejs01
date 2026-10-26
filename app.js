// app.js


// Create cookies from Railway environment variable
import fs from 'fs';
if (process.env.YTDLP_COOKIES) {
  fs.writeFileSync('./cookies.txt', process.env.YTDLP_COOKIES, 'utf-8');
  // Never log the contents: they are a logged-in YouTube session.
  console.log(`Cookies file written (${process.env.YTDLP_COOKIES.length} bytes).`);
} else {
  console.warn('⚠️ YTDLP_COOKIES env var is not set! YouTube downloads may fail.');
}
const cookieOptions = fs.existsSync('./cookies.txt') ? { cookies: './cookies.txt' } : {};

import express from 'express';
//import ytdlp from 'yt-dlp-exec'; // old way just to try compare
import { create } from 'yt-dlp-exec'; // This one is local copy and newer

const ytdlp = create('./yt-dlp'); // Use the local binary from prestart
const app = express();
app.disable('x-powered-by');
const PORT = 3000; // hard‐code 3000 so Railway’s edge proxy lines up

const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be'];
const X_HOSTS = ['x.com', 'twitter.com'];

const hostMatches = (host, domains) =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

// Accept only a real http(s) URL on a supported host. The normalized href always
// starts with "http", so yt-dlp can never read it as a command-line option.
function parseVideoUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (hostMatches(host, YOUTUBE_HOSTS)) return { href: url.href, platform: 'youtube' };
  if (hostMatches(host, X_HOSTS)) return { href: url.href, platform: 'x' };
  return null;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Health check
app.get('/', (_req, res) => {
  res.send('🎬 YouTube-proxy service is running.');
});

app.get('/formats', async (req, res) => {
  if (!req.query.url) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }
  const video = parseVideoUrl(req.query.url);
  if (!video) {
    return res.status(400).send('❌ Unsupported URL.');
  }

  try {
    const stdout = await ytdlp(video.href, {
      ...cookieOptions,
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
    res.send(`<pre>${escapeHtml(stdout)}</pre>`);
  } catch (err) {
    console.error('Format list error:', err);
    res.status(500).send('❌ Failed to list formats.');
  }
});

app.get('/stream', async (req, res) => {
  if (!req.query.url) {
    return res.status(400).send('❌ Missing required query parameter: ?url=');
  }
  const video = parseVideoUrl(req.query.url);
  if (!video) {
    return res.status(400).send('❌ Unsupported platform.');
  }

  // Detect platform
  let format, headers;
  if (video.platform === 'youtube') {
    format = '18';
    headers = {
      'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
      'X-YouTube-Client-Name': '55',
      'X-YouTube-Client-Version': '1.0',
      'Accept': '*/*',
      'Origin': 'https://www.youtube.com'
    };
  } else {
    format = 'best[protocol=m3u8]'; // auto-select best HLS stream for X/Twitter
    headers = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*',
      'Origin': 'https://x.com'
    };
  }

  try {
    const stdout = await ytdlp(video.href, {
      format,
      getUrl: true,
      ...cookieOptions,
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
    res.status(500).send('❌ Failed to fetch video.');
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('❌ Internal error.');
});

app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
