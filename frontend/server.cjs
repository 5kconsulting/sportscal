const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.VITE_API_URL || 'https://sportscal-production.up.railway.app';

const apiProxy = createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathFilter: (path) => path.startsWith('/api/') || path.startsWith('/feed/'),
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

// SEO files
app.get('/robots.txt', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'robots.txt')));
app.get('/sitemap.xml', (_req, res) => res.type('application/xml').sendFile(path.join(__dirname, 'landing', 'sitemap.xml')));

// Explicit landing pages at their own paths
app.get('/pricing', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'pricing.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'terms.html')));
app.get('/privacy', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'privacy.html')));

// Static assets
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/landing', express.static(path.join(__dirname, 'landing')));
app.use('/demo-feeds', (_req, res, next) => {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  next();
}, express.static(path.join(__dirname, 'dist', 'demo-feeds')));

// SPA fallback — handles /, /login, /signup, /kids, etc.
app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
