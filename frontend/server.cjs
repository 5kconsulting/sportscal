const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

// Landing page at root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

// React app static assets
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback for all app routes
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
