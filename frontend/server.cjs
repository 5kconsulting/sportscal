const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

// Landing pages
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'index.html')));
app.get('/pricing', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'pricing.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'terms.html')));
app.get('/privacy', (_req, res) => res.sendFile(path.join(__dirname, 'landing', 'privacy.html')));

// Static assets (landing + React dist)
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/landing', express.static(path.join(__dirname, 'landing')));

// SPA fallback
app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
