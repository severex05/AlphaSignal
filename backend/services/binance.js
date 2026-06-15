const WebSocket = require('ws');
const https = require('https');
const { calculateIndicators } = require('./indicators');
const { calculateScore } = require('./scoring');
const { generateSignal } = require('./signals');

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'ADAUSDT'];
const CANDLE_LIMIT = 200;
const INTERVAL = '1h';

const marketData = {};
PAIRS.forEach(p => {
  marketData[p] = { candles: [], price: null, change24h: null, volume24h: null, indicators: null, score: null, signal: null, updatedAt: null };
});

function getMarketData() { return marketData; }

function httpsGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: 'api.binance.com', path }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchCandles(symbol) {
  const raw = await httpsGet(`/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=${CANDLE_LIMIT}`);
  return raw.map(c => ({
    time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5],
  }));
}

async function fetchTicker(symbol) {
  const t = await httpsGet(`/api/v3/ticker/24hr?symbol=${symbol}`);
  return { price: +t.lastPrice, change24h: +t.priceChangePercent, volume24h: +t.quoteVolume };
}

function recompute(pair, broadcast) {
  const d = marketData[pair];
  if (!d || d.candles.length < 50) return;
  d.indicators = calculateIndicators(d.candles);
  d.score = calculateScore(d.indicators, d.change24h);
  d.signal = generateSignal(d.indicators, d.score);
  d.updatedAt = Date.now();
  if (broadcast) {
    broadcast({ type: 'update', pair, data: { price: d.price, change24h: d.change24h, volume24h: d.volume24h, indicators: d.indicators, score: d.score, signal: d.signal, updatedAt: d.updatedAt } });
  }
}

async function startBinanceStreams(broadcast) {
  // Load historical data first
  for (const pair of PAIRS) {
    try {
      const [candles, ticker] = await Promise.all([fetchCandles(pair), fetchTicker(pair)]);
      marketData[pair].candles = candles;
      marketData[pair].price = ticker.price;
      marketData[pair].change24h = ticker.change24h;
      marketData[pair].volume24h = ticker.volume24h;
      recompute(pair, null);
      console.log(`[Binance] ${pair} initialized — ${candles.length} candles, price: ${ticker.price}`);
    } catch (e) {
      console.error(`[Binance] Failed to init ${pair}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 400)); // avoid rate limit
  }

  // Subscribe to live kline streams
  const streams = PAIRS.map(p => `${p.toLowerCase()}@kline_${INTERVAL}`).join('/');
  const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

  function connect() {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => console.log('[Binance] WebSocket connected'));

    ws.on('message', raw => {
      try {
        const { data } = JSON.parse(raw);
        if (!data?.k) return;
        const pair = data.s;
        const k = data.k;
        const candle = { time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
        const d = marketData[pair];
        if (!d) return;

        d.price = candle.close;

        if (k.x) {
          // Candle closed — add to history and recompute
          d.candles.push(candle);
          if (d.candles.length > CANDLE_LIMIT) d.candles.shift();
          recompute(pair, broadcast);
        } else {
          // Update last in-progress candle
          if (d.candles.length > 0) {
            const last = d.candles[d.candles.length - 1];
            d.candles[d.candles.length - 1] = {
              ...last,
              close: candle.close,
              high: Math.max(last.high, candle.high),
              low: Math.min(last.low, candle.low),
              volume: candle.volume,
            };
          }
          // Broadcast lightweight price tick only
          broadcast({ type: 'tick', pair, price: candle.close });
        }
      } catch (e) {
        console.error('[Binance] Message parse error:', e.message);
      }
    });

    ws.on('close', () => {
      console.log('[Binance] WS closed — reconnecting in 5s');
      setTimeout(connect, 5000);
    });

    ws.on('error', e => console.error('[Binance] WS error:', e.message));
  }

  connect();
}

module.exports = { startBinanceStreams, getMarketData };
