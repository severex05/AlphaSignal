// Technical indicator calculations — pure functions, no side effects

function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0);
  const losses = recent.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACD(closes) {
  if (closes.length < 35) return null;
  const macdValues = [];
  for (let i = 26; i <= closes.length; i++) {
    const e12 = calcEMA(closes.slice(0, i), 12);
    const e26 = calcEMA(closes.slice(0, i), 26);
    if (e12 && e26) macdValues.push(e12 - e26);
  }
  const macdLine = macdValues[macdValues.length - 1];
  const signalLine = macdValues.length >= 9 ? calcEMA(macdValues, 9) : null;
  const histogram = signalLine !== null ? macdLine - signalLine : null;
  return { macdLine, signalLine, histogram };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcVolumeRatio(candles, period = 20) {
  if (candles.length < period) return null;
  const recent = candles.slice(-period);
  const avgVol = recent.slice(0, -1).reduce((a, b) => a + b.volume, 0) / (period - 1);
  return avgVol > 0 ? recent[recent.length - 1].volume / avgVol : 1;
}

function calculateIndicators(candles) {
  const closes = candles.map(c => c.close);
  return {
    rsi: calcRSI(closes),
    macd: calcMACD(closes),
    ema20: calcEMA(closes, 20),
    ema50: calcEMA(closes, 50),
    ema200: closes.length >= 200 ? calcEMA(closes, 200) : null,
    atr: calcATR(candles),
    volumeRatio: calcVolumeRatio(candles),
    currentPrice: closes[closes.length - 1],
    high24h: Math.max(...candles.slice(-24).map(c => c.high)),
    low24h: Math.min(...candles.slice(-24).map(c => c.low)),
  };
}

module.exports = { calculateIndicators };
