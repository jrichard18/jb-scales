'use strict';
const express = require('express');
const http = require('http');
const { WebSocketServer, OPEN } = require('ws');
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;
const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[WS] PC connected — ${ip}`);
  ws.on('message', (data) => { try { console.log('[WS] From PC:', JSON.parse(data.toString())); } catch { console.log('[WS] Raw:', data.toString()); } });
  ws.on('close', (code) => console.log(`[WS] Disconnected — code ${code}`));
  ws.on('error', (err) => console.error('[WS] Error:', err.message));
  safeSend(ws, { type: 'connected', message: 'ARAIA bridge ready', ts: Date.now() });
});
function safeSend(ws, payload) {
  if (ws.readyState !== OPEN) return false;
  try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
}
function broadcast(payload) {
  let sent = 0;
  wss.clients.forEach((ws) => { if (safeSend(ws, payload)) sent++; });
  return sent;
}
function checkAuth(req, res) {
  if (!AUTH_TOKEN) return true;
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== AUTH_TOKEN) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}
app.get('/health', (_req, res) => res.json({ status: 'ok', clients: wss.clients.size, ts: Date.now() }));
app.post('/command', (req, res) => {
  if (!checkAuth(req, res)) return;
  const { type, payload } = req.body;
  if (!type || typeof type !== 'string') return res.status(400).json({ error: 'Missing type' });
  if (wss.clients.size === 0) return res.status(503).json({ error: 'No PC clients connected' });
  const envelope = { type, payload: payload ?? null, ts: Date.now() };
  const sent = broadcast(envelope);
  return res.json({ status: 'forwarded', type, recipients: sent, ts: envelope.ts });
});
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
server.listen(PORT, () => console.log(`[ARAIA Bridge] Listening on port ${PORT}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
