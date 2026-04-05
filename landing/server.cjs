const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.static(__dirname));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Landing page on port ${PORT}`));
