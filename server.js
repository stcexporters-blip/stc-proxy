const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const M5C_BASE = 'http://apiv2.m5clogs.com';

app.use(cors({ origin: '*' }));
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'STC Proxy Running', time: new Date().toISOString() });
});

// Proxy all /proxy/* requests to M5C
app.all('/proxy/*', async (req, res) => {
  const path = req.path.replace('/proxy', '');
  const url = M5C_BASE + path;

  console.log(`[PROXY] ${req.method} ${url}`);

  try {
    const headers = {};
    Object.entries(req.headers).forEach(([k, v]) => {
      const kl = k.toLowerCase();
      if (!['host', 'origin', 'connection', 'x-forwarded-for', 
            'x-forwarded-proto', 'x-render-origin-server'].includes(kl)) {
        headers[k] = v;
      }
    });

    const options = { method: req.method, headers };
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      options.body = req.body;
    }

    const response = await fetch(url, options);
    const data = await response.buffer();

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Content-Type', response.headers.get('content-type') || 'application/json');
    res.status(response.status).send(data);

  } catch (err) {
    console.error(`[PROXY ERROR] ${err.message}`);
    res.set('Access-Control-Allow-Origin', '*');
    res.status(502).json({ error: err.message });
  }
});

// Handle OPTIONS preflight
app.options('*', cors({ origin: '*' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`STC Proxy running on port ${PORT}`));
