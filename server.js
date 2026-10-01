const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.raw({ type: '*/*', limit: '10mb' }));

const M5C = 'http://apiv2.m5clogs.com';

app.all('/proxy/*', async (req, res) => {
  const path = req.path.replace('/proxy', '');
  const url = M5C + path;
  try {
    const headers = { ...req.headers };
    delete headers['host'];
    delete headers['origin'];
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: ['POST','PUT','PATCH'].includes(req.method) ? req.body : undefined
    });
    const data = await response.buffer();
    res.status(response.status);
    res.set('Content-Type', response.headers.get('content-type') || 'application/json');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch(e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy running'));
