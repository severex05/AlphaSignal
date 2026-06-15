const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { startBinanceStreams, getMarketData } = require('./services/binance');
const { calcPositionSize } = require('./services/signals');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`[WS] Client connected (${clients.size} total)`);

  // Send full snapshot on connect
  ws.send(JSON.stringify({ type: 'snapshot', data: getMarketData() }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} total)`);
  });
  ws.on('error', () => clients.delete(ws));
});

function broadcast(msg) {
  const str = JSON.stringify(msg);
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(str); });
}

// ── REST API ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.get('/api/market', (_, res) => {
  const data = getMarketData();
  const summary = {};
  for (const [pair, d] of Object.entries(data)) {
    summary[pair] = {
      price: d.price,
      change24h: d.change24h,
      volume24h: d.volume24h,
      score: d.score,
      signal: d.signal,
      updatedAt: d.updatedAt,
    };
  }
  res.json(summary);
});

app.get('/api/market/:pair', (req, res) => {
  const pair = req.params.pair.toUpperCase();
  const d = getMarketData()[pair];
  if (!d) return res.status(404).json({ error: 'Pair not found' });
  res.json(d);
});

// Position size calculator
app.post('/api/position', (req, res) => {
  const { pair, balance, riskPct } = req.body;
  if (!pair || !balance) return res.status(400).json({ error: 'pair and balance required' });
  const d = getMarketData()[pair.toUpperCase()];
  if (!d?.signal?.entry) return res.status(400).json({ error: 'No active signal for this pair' });
  const size = calcPositionSize(d.signal.entry, d.signal.sl, parseFloat(balance), parseFloat(riskPct) || 2);
  res.json(size);
});

// Candles for chart (last N)
app.get('/api/candles/:pair', (req, res) => {
  const pair = req.params.pair.toUpperCase();
  const d = getMarketData()[pair];
  if (!d) return res.status(404).json({ error: 'Pair not found' });
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  res.json(d.candles.slice(-limit));
});

// ── START ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n⚡ AlphaSignal backend running on port ${PORT}`);
  startBinanceStreams(broadcast);
});
