const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.VITE_API_URL || 'https://sportscal-production.up.railway.app';

// Proxy API and feed requests to backend
app.use('/api', createProxyMiddleware({ target: API_URL, changeOrigin: true }));
app.use('/feed', createProxyMiddleware({ target: API_URL, changeOrigin: true }));

// Landing pages
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'index.html')));
app.get('/pricing', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'pricing.html')));

// Static assets
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/landing', express.static(path.join(__dirname, 'landing')));

// SPA fallback
app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
