const express = require('express');
const path = require('path');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
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

// Use proxy at root level so path is preserved
app.use(apiProxy);

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'index.html')));
app.get('/pricing', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'pricing.html')));

app.use(express.static(path.join(__dirname, 'dist')));
app.use('/landing', express.static(path.join(__dirname, 'landing')));

app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
