// server.js
// Simple Express + WebSocket server for Dodge-the-Block game.
// - / emits events to connected WS clients when POSTed to /emit
// - serves a minimal health endpoint
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// simple health
app.get('/health', (req, res) => res.json({ ok: true }));

// create http + ws servers
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// broadcast helper
function broadcastJSON(obj) {
  const data = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

// POST /emit  -> proxy to all connected clients
// expected body: { type: "powerup", payload: { ... } }
app.post('/emit', (req, res) => {
  const body = req.body;
  if (!body || !body.type) {
    return res.status(400).json({ error: 'missing type in body' });
  }
  broadcastJSON({ from: 'server', ...body });
  return res.json({ ok: true, emitted: body });
});

wss.on('connection', (ws, req) => {
  console.log('WS connected', new Date().toISOString());
  ws.send(JSON.stringify({ from: 'server', type: 'hello', ts: Date.now() }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('WS msg:', msg);
      // optional: echo or handle subscription
    } catch (e) { console.warn('bad ws payload'); }
  });

  ws.on('close', () => console.log('WS closed'));
});

server.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
