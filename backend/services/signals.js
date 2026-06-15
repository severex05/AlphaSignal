// Signal generation: Entry, Take Profit, Stop Loss, Position Size

function priceDecimals(price) {
  if (price < 0.01) return 6;
  if (price < 1) return 5;
  if (price < 10) return 4;
  if (price < 100) return 3;
  if (price < 10000) return 2;
  return 1;
}

function fmt(price, dec) {
  return parseFloat(price.toFixed(dec));
}

function generateSignal(indicators, scoreData) {
  if (!indicators || !scoreData) return null;
  const { currentPrice, atr } = indicators;
  const { total: score, signal: direction } = scoreData;

  if (direction === 'NEUTRO' || !atr || !currentPrice) {
    return { direction: 'NEUTRO', score, entry: null, tp: null, sl: null };
  }

  const dec = priceDecimals(currentPrice);
  const isLong = direction === 'COMPRA';

  const entry = fmt(currentPrice, dec);
  const slDistance = atr * 1.5;

  const sl = isLong
    ? fmt(entry - slDistance, dec)
    : fmt(entry + slDistance, dec);

  // R:R ratio scales with score confidence
  const rrRatio = score >= 80 ? 3.0 : score >= 72 ? 2.5 : 2.0;
  const tpDistance = slDistance * rrRatio;

  const tp = isLong
    ? fmt(entry + tpDistance, dec)
    : fmt(entry - tpDistance, dec);

  const slPct = parseFloat(((Math.abs(entry - sl) / entry) * 100).toFixed(2));
  const tpPct = parseFloat(((Math.abs(tp - entry) / entry) * 100).toFixed(2));

  return {
    direction,
    score,
    entry,
    tp,
    sl,
    slPct,
    tpPct,
    rrRatio,
    timestamp: Date.now(),
  };
}

function calcPositionSize(entry, sl, balanceUsdt, riskPct = 2) {
  if (!entry || !sl || !balanceUsdt || entry === sl) return null;
  const riskAmount = balanceUsdt * (riskPct / 100);
  const slDistance = Math.abs(entry - sl);
  const units = riskAmount / slDistance;
  const positionValue = units * entry;

  // Lot suggestions (crypto — unit is the coin itself)
  const dec = priceDecimals(units);
  const suggestions = [0.25, 0.5, 1, 2, 5].map(mult => {
    const u = fmt(units * mult, Math.min(dec + 1, 6));
    return { label: `${mult}x risco`, units: u, value: fmt(u * entry, 2), risk: fmt(riskAmount * mult, 2) };
  }).filter(s => s.value <= balanceUsdt);

  return {
    recommended: fmt(units, Math.min(dec, 6)),
    positionValue: fmt(positionValue, 2),
    riskAmount: fmt(riskAmount, 2),
    riskPct,
    suggestions: suggestions.slice(0, 3),
  };
}

module.exports = { generateSignal, calcPositionSize };
