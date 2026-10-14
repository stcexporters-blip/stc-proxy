const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const M5C_BASE = 'http://apiv2.m5clogs.com';

// Simple JSON file database
const DB_FILE = path.join('/tmp', 'stc_data.json');

function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch(e) { console.error('DB read error:', e.message); }
  return { shipments: [], clients: [], payments: [] };
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch(e) {
    console.error('DB write error:', e.message);
    return false;
  }
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/x-www-form-urlencoded', limit: '10mb' }));
app.use(express.raw({ type: 'text/plain', limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  const db = readDB();
  res.json({
    status: 'STC Proxy Running',
    time: new Date().toISOString(),
    shipments: db.shipments.length,
    clients: db.clients.length
  });
});

// ─── DATABASE ENDPOINTS ───────────────────────────────────────

// GET all shipments
app.get('/db/shipments', (req, res) => {
  const db = readDB();
  res.json(db.shipments || []);
});

// POST save all shipments (full sync)
app.post('/db/shipments', (req, res) => {
  const db = readDB();
  db.shipments = req.body;
  writeDB(db);
  res.json({ ok: true, count: db.shipments.length });
});

// POST add/update single shipment
app.post('/db/shipment', (req, res) => {
  const db = readDB();
  const shipment = req.body;
  const idx = db.shipments.findIndex(s => s.awb === shipment.awb);
  if (idx >= 0) {
    db.shipments[idx] = shipment;
  } else {
    db.shipments.unshift(shipment);
  }
  writeDB(db);
  res.json({ ok: true });
});

// DELETE single shipment
app.delete('/db/shipment/:awb', (req, res) => {
  const db = readDB();
  db.shipments = db.shipments.filter(s => s.awb !== req.params.awb);
  writeDB(db);
  res.json({ ok: true });
});

// GET all clients
app.get('/db/clients', (req, res) => {
  const db = readDB();
  res.json(db.clients || []);
});

// POST save all clients (full sync)
app.post('/db/clients', (req, res) => {
  const db = readDB();
  db.clients = req.body;
  writeDB(db);
  res.json({ ok: true, count: db.clients.length });
});

// GET senders/receivers
app.get('/db/senders', (req, res) => {
  const db = readDB();
  res.json(db.senders || { senders: [], receivers: [] });
});

// POST save senders/receivers
app.post('/db/senders', (req, res) => {
  const db = readDB();
  db.senders = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// GET all payments
app.get('/db/payments', (req, res) => {
  const db = readDB();
  res.json(db.payments || []);
});

// POST save all payments
app.post('/db/payments', (req, res) => {
  const db = readDB();
  db.payments = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// POST full backup (save everything at once)
app.post('/db/backup', (req, res) => {
  const data = req.body;
  writeDB(data);
  res.json({ ok: true });
});

// GET full backup
app.get('/db/backup', (req, res) => {
  res.json(readDB());
});

// ─── M5C PROXY ───────────────────────────────────────────────

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

    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (req.body) {
        body = JSON.stringify(req.body);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }
    }

    const response = await fetch(url, { method: req.method, headers, body });
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
app.listen(PORT, () => console.log(`STC Proxy + DB running on port ${PORT}`));
