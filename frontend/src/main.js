// AlphaSignal — Frontend

const BACKEND_WS  = import.meta.env.VITE_BACKEND_WS  || 'ws://localhost:3001';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL  || 'http://localhost:3001';

const PAIR_META = {
  BTCUSDT:  { label: 'BTC/USDT',  icon: '₿' },
  ETHUSDT:  { label: 'ETH/USDT',  icon: 'Ξ' },
  SOLUSDT:  { label: 'SOL/USDT',  icon: '◎' },
  XRPUSDT:  { label: 'XRP/USDT',  icon: '✕' },
  BNBUSDT:  { label: 'BNB/USDT',  icon: 'B' },
  ADAUSDT:  { label: 'ADA/USDT',  icon: '₳' },
};

const PAIRS = Object.keys(PAIR_META);

// State
let state = {};       // { [pair]: { price, change24h, score, signal, indicators } }
let selectedPair = null;
let ws = null;
let reconnectTimer = null;
let toastTimer = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const $grid     = document.getElementById('pairs-grid');
const $sigSec   = document.getElementById('signal-section');
const $connDot  = document.getElementById('conn-dot');
const $toast    = document.getElementById('toast');
const $balance  = document.getElementById('balance');
const $riskPct  = document.getElementById('risk-pct');

// ── INIT ──────────────────────────────────────────────────────────────────────
PAIRS.forEach(p => {
  state[p] = { price: null, change24h: null, score: null, signal: null, indicators: null };
});
renderGrid();
connectWS();

document.getElementById('close-signal').addEventListener('click', closeSignal);
$balance.addEventListener('change', () => selectedPair && renderSignalPanel(selectedPair));
$riskPct.addEventListener('change', () => selectedPair && renderSignalPanel(selectedPair));

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
function connectWS() {
  clearTimeout(reconnectTimer);
  ws = new WebSocket(BACKEND_WS);

  ws.onopen = () => {
    setConn('connected');
    showToast('Conectado em tempo real', 'neutral');
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'snapshot') {
        for (const [pair, d] of Object.entries(msg.data)) {
          state[pair] = { price: d.price, change24h: d.change24h, volume24h: d.volume24h, score: d.score, signal: d.signal, indicators: d.indicators, updatedAt: d.updatedAt };
        }
        renderGrid();
        if (selectedPair) renderSignalPanel(selectedPair);
      } else if (msg.type === 'update') {
        const { pair, data: d } = msg;
        state[pair] = { ...state[pair], ...d };
        updateCard(pair);
        if (selectedPair === pair) renderSignalPanel(pair);
        checkSignalAlert(pair, d.signal);
      } else if (msg.type === 'tick') {
        if (!state[msg.pair]) return;
        state[msg.pair].price = msg.price;
        updateCardPrice(msg.pair, msg.price);
        if (selectedPair === msg.pair) {
          const el = document.getElementById('sig-entry');
          if (el && state[msg.pair]?.signal?.direction === 'NEUTRO') el.textContent = fmtPrice(msg.price);
        }
      }
    } catch(e) { console.error(e); }
  };

  ws.onclose = () => {
    setConn('disconnected');
    reconnectTimer = setTimeout(connectWS, 4000);
  };

  ws.onerror = () => setConn('error');
}

function setConn(s) {
  $connDot.className = 'conn-dot';
  if (s === 'connected') { $connDot.classList.add('connected'); $connDot.title = 'Conectado'; }
  else if (s === 'error') { $connDot.classList.add('error'); $connDot.title = 'Erro de conexão'; }
  else { $connDot.title = 'Reconectando...'; }
}

// ── GRID ──────────────────────────────────────────────────────────────────────
function renderGrid() {
  $grid.innerHTML = '';
  PAIRS.forEach(pair => {
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.id = `card-${pair}`;
    card.addEventListener('click', () => selectPair(pair));
    $grid.appendChild(card);
    updateCard(pair);
  });
}

function updateCard(pair) {
  const el = document.getElementById(`card-${pair}`);
  if (!el) return;
  const d = state[pair];
  const meta = PAIR_META[pair];
  const scoreData = d.score;
  const dir = scoreData?.signal || 'NEUTRO';
  const score = scoreData?.total ?? null;
  const dirClass = dir === 'COMPRA' ? 'buy' : dir === 'VENDA' ? 'sell' : 'neutral';

  el.className = `pair-card ${dirClass}${selectedPair === pair ? ' selected' : ''}`;
  el.innerHTML = `
    <div class="pair-card-top">
      <div class="pair-name">${meta.label}</div>
      ${score !== null
        ? `<div class="pair-score ${dirClass}">${score}</div>`
        : `<div class="pair-score loading">—</div>`}
    </div>
    <div class="pair-price">${d.price ? fmtPrice(d.price) : '—'}</div>
    <div class="pair-change ${d.change24h > 0.05 ? 'up' : d.change24h < -0.05 ? 'down' : 'flat'}">
      ${d.change24h != null ? (d.change24h >= 0 ? '+' : '') + d.change24h.toFixed(2) + '%' : '—'}
    </div>
    <div class="pair-signal-bar ${dirClass}">
      ${dir === 'COMPRA' ? '▲ COMPRA' : dir === 'VENDA' ? '▼ VENDA' : '— NEUTRO'}
    </div>
  `;
}

function updateCardPrice(pair, price) {
  const el = document.getElementById(`card-${pair}`);
  if (!el) return;
  const priceEl = el.querySelector('.pair-price');
  if (priceEl) priceEl.textContent = fmtPrice(price);
}

// ── SIGNAL PANEL ──────────────────────────────────────────────────────────────
function selectPair(pair) {
  selectedPair = pair;
  document.querySelectorAll('.pair-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`card-${pair}`)?.classList.add('selected');
  $sigSec.style.display = 'flex';
  renderSignalPanel(pair);
  $sigSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeSignal() {
  selectedPair = null;
  $sigSec.style.display = 'none';
  document.querySelectorAll('.pair-card').forEach(c => c.classList.remove('selected'));
}

function renderSignalPanel(pair) {
  const d = state[pair];
  if (!d) return;
  const meta = PAIR_META[pair];
  const score = d.score;
  const sig = d.signal;
  const ind = d.indicators;

  document.getElementById('sig-pair').textContent = meta.label;
  document.getElementById('sig-ts').textContent = d.updatedAt
    ? 'Atualizado ' + new Date(d.updatedAt).toLocaleTimeString('pt-BR')
    : 'Aguardando dados...';

  // Score ring
  const total = score?.total ?? 0;
  const dir = score?.signal ?? 'NEUTRO';
  const dirClass = dir === 'COMPRA' ? 'buy' : dir === 'VENDA' ? 'sell' : 'neutral';
  const circumference = 2 * Math.PI * 50; // r=50
  const filled = (total / 100) * circumference;

  document.getElementById('sig-score').textContent = total || '—';
  const dirEl = document.getElementById('sig-direction');
  dirEl.textContent = dir; dirEl.className = `score-label ${dirClass}`;
  const ring = document.getElementById('ring-fill');
  ring.style.strokeDasharray = `${filled} ${circumference}`;
  ring.className = `ring-fill ${dirClass}`;

  // Breakdown bars
  const br = score?.breakdown || {};
  setBar('trend',  br.trend);
  setBar('volume', br.volume);
  setBar('ind',    br.indicators);
  setBar('news',   br.news);

  // Signal boxes
  if (sig && sig.entry) {
    document.getElementById('sig-entry').textContent = fmtPrice(sig.entry);
    document.getElementById('sig-tp').textContent    = fmtPrice(sig.tp);
    document.getElementById('sig-sl').textContent    = fmtPrice(sig.sl);
    document.getElementById('sig-tp-pct').textContent = sig.tpPct ? `+${sig.tpPct}%` : '—';
    document.getElementById('sig-sl-pct').textContent = sig.slPct ? `-${sig.slPct}%` : '—';

    const rrBar = document.getElementById('rr-bar');
    rrBar.style.display = 'flex';
    document.getElementById('rr-value').textContent = `1 : ${sig.rrRatio?.toFixed(1) ?? '—'}`;

    // Position sizing
    const balance = parseFloat($balance.value) || 1000;
    const riskPct = parseFloat($riskPct.value) || 2;
    renderPositionBlock(sig, balance, riskPct);
  } else {
    document.getElementById('sig-entry').textContent = d.price ? fmtPrice(d.price) : '—';
    document.getElementById('sig-tp').textContent = '—';
    document.getElementById('sig-sl').textContent = '—';
    document.getElementById('sig-tp-pct').textContent = '';
    document.getElementById('sig-sl-pct').textContent = '';
    document.getElementById('rr-bar').style.display = 'none';
    document.getElementById('position-block').style.display = 'none';
  }

  // Indicator chips
  renderIndicatorChips(ind, score);
}

function setBar(id, val) {
  const bar = document.getElementById(`br-${id}`);
  const label = document.getElementById(`bv-${id}`);
  if (!bar || !label) return;
  const v = val ?? 0;
  bar.style.width = `${v}%`;
  bar.style.background = v >= 65 ? 'var(--green)' : v <= 38 ? 'var(--red)' : 'var(--blue)';
  label.textContent = v || '—';
}

function renderPositionBlock(sig, balance, riskPct) {
  const block = document.getElementById('position-block');
  const grid = document.getElementById('pos-grid');
  if (!sig?.sl || !sig?.entry) { block.style.display = 'none'; return; }

  const riskAmount = balance * (riskPct / 100);
  const slDist = Math.abs(sig.entry - sig.sl);
  if (slDist === 0) { block.style.display = 'none'; return; }

  const baseUnits = riskAmount / slDist;
  const dec = unitDecimals(baseUnits);

  const options = [
    { mult: 1,   label: `${riskPct}% risco (recomendado)`, recommended: true },
    { mult: 0.5, label: `${(riskPct * 0.5).toFixed(1)}% risco (conservador)`, recommended: false },
    { mult: 2,   label: `${riskPct * 2}% risco (agressivo)`, recommended: false },
  ].filter(o => (baseUnits * o.mult * sig.entry) <= balance);

  grid.innerHTML = options.map(o => {
    const units = parseFloat((baseUnits * o.mult).toFixed(dec));
    const value = parseFloat((units * sig.entry).toFixed(2));
    const risk  = parseFloat((riskAmount * o.mult).toFixed(2));
    const pair  = PAIR_META[selectedPair]?.label?.split('/')[0] || '';
    return `
      <div class="pos-option${o.recommended ? ' recommended' : ''}">
        <div class="pos-option-label">${o.label}</div>
        <div class="pos-option-units">${units} ${pair}</div>
        <div class="pos-option-detail">≈ $${value.toLocaleString()} USDT · Risco $${risk}</div>
      </div>`;
  }).join('');

  block.style.display = 'block';
}

function renderIndicatorChips(ind, score) {
  if (!ind) return;
  const rsi = ind.rsi;
  const macd = ind.macd;
  const ema20 = ind.ema20;
  const ema50 = ind.ema50;
  const price = ind.currentPrice;
  const volR  = ind.volumeRatio;

  // RSI
  const rsiEl = document.getElementById('ind-rsi');
  if (rsi != null) {
    const cls = rsi >= 70 ? 'bearish' : rsi <= 30 ? 'neutral' : rsi >= 50 ? 'bullish' : 'neutral';
    rsiEl.textContent = `RSI ${rsi.toFixed(1)}`;
    rsiEl.className = `ind-chip ${cls}`;
  }

  // MACD
  const macdEl = document.getElementById('ind-macd');
  if (macd) {
    const cls = macd.histogram > 0 ? 'bullish' : macd.histogram < 0 ? 'bearish' : 'neutral';
    const sign = macd.histogram >= 0 ? '▲' : '▼';
    macdEl.textContent = `MACD ${sign}`;
    macdEl.className = `ind-chip ${cls}`;
  }

  // EMA
  const emaEl = document.getElementById('ind-ema');
  if (ema20 && ema50 && price) {
    const cls = price > ema20 && ema20 > ema50 ? 'bullish' : price < ema20 && ema20 < ema50 ? 'bearish' : 'neutral';
    emaEl.textContent = price > ema50 ? 'EMA ▲ Alta' : 'EMA ▼ Baixa';
    emaEl.className = `ind-chip ${cls}`;
  }

  // Volume
  const volEl = document.getElementById('ind-vol');
  if (volR != null) {
    const cls = volR >= 1.5 ? 'bullish' : volR < 0.8 ? 'bearish' : 'neutral';
    volEl.textContent = `Vol ${volR.toFixed(1)}x`;
    volEl.className = `ind-chip ${cls}`;
  }
}

// ── ALERTS ───────────────────────────────────────────────────────────────────
function checkSignalAlert(pair, signal) {
  if (!signal || signal.direction === 'NEUTRO') return;
  const meta = PAIR_META[pair];
  const dir = signal.direction;
  showToast(
    `${meta.label} — ${dir === 'COMPRA' ? '▲ COMPRA' : '▼ VENDA'} · Score ${signal.score}`,
    dir === 'COMPRA' ? 'buy' : 'sell'
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtPrice(price) {
  if (!price) return '—';
  if (price < 0.01) return price.toFixed(6);
  if (price < 1)    return price.toFixed(5);
  if (price < 10)   return price.toFixed(4);
  if (price < 1000) return price.toFixed(3);
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function unitDecimals(units) {
  if (units > 1000) return 2;
  if (units > 10) return 3;
  if (units > 1) return 4;
  return 6;
}

function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  $toast.textContent = msg;
  $toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => { $toast.className = 'toast'; }, 4000);
}
