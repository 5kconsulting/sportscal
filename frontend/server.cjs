const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.VITE_API_URL || 'https://sportscal-production.up.railway.app';

const apiProxy = createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathFilter: ['/api/**', '/feed/**'],
  on: {
    proxyReq: (proxyReq, req) => {
      console.log('[proxy]', req.method, req.url, '->', API_URL + req.url);
    },
    error: (err, req, res) => {
      console.error('[proxy error]', err.message);
      res.status(502).json({ error: 'Bad gateway' });
    }
  }
});

// Proxy FIRST before anything else
app.use(apiProxy);

// Landing pages
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'index.html')));
app.get('/pricing', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'pricing.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'terms.html')));
app.get('/privacy', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'privacy.html')));

// Static assets
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/landing', express.static(path.join(__dirname, 'landing')));

// SPA fallback
app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
