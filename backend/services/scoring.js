// Signal scoring engine — weights: Trend 30%, Volume 20%, Indicators 20%, News 20%, Social 10%

function calculateScore(indicators, change24h = 0, newsScore = 50) {
  if (!indicators) return { total: 50, breakdown: {}, signal: 'NEUTRO' };
  const { rsi, macd, ema20, ema50, ema200, volumeRatio, currentPrice } = indicators;

  // Trend score (30%) — EMA alignment
  let trendScore = 50;
  if (currentPrice && ema20 && ema50) {
    let pts = 0, max = 0;
    if (currentPrice > ema20) pts += 25; max += 25;
    if (currentPrice > ema50) pts += 30; max += 30;
    if (ema20 > ema50) pts += 25; max += 25;
    if (ema200) {
      if (currentPrice > ema200) pts += 20; max += 20;
    }
    trendScore = (pts / max) * 100;
    const changeFactor = Math.max(-15, Math.min(15, change24h * 1.5));
    trendScore = Math.max(0, Math.min(100, trendScore + changeFactor));
  }

  // Volume score (20%)
  let volumeScore = 50;
  if (volumeRatio !== null) {
    if (volumeRatio >= 2.5) volumeScore = 95;
    else if (volumeRatio >= 2.0) volumeScore = 85;
    else if (volumeRatio >= 1.5) volumeScore = 72;
    else if (volumeRatio >= 1.2) volumeScore = 62;
    else if (volumeRatio >= 0.8) volumeScore = 50;
    else if (volumeRatio >= 0.5) volumeScore = 35;
    else volumeScore = 20;
  }

  // Indicator score (20%) — RSI + MACD
  let indicatorScore = 50;
  if (rsi !== null) {
    if (rsi >= 50 && rsi <= 62) indicatorScore = 85;
    else if (rsi >= 62 && rsi <= 68) indicatorScore = 65;
    else if (rsi >= 40 && rsi < 50) indicatorScore = 55;
    else if (rsi >= 68 && rsi < 75) indicatorScore = 35;
    else if (rsi >= 75) indicatorScore = 15;
    else if (rsi < 30) indicatorScore = 40;
    else indicatorScore = 45;

    if (macd && macd.histogram !== null) {
      if (macd.histogram > 0 && macd.macdLine > 0) indicatorScore = Math.min(100, indicatorScore + 15);
      else if (macd.histogram > 0 && macd.macdLine <= 0) indicatorScore = Math.min(100, indicatorScore + 8);
      else if (macd.histogram < 0) indicatorScore = Math.max(0, indicatorScore - 12);
    }
  }

  // Social score (10%) — proxy via 24h change + volume
  const socialScore = change24h > 8 ? 80 : change24h > 4 ? 68 : change24h > 1 ? 58
    : change24h > -1 ? 50 : change24h > -4 ? 38 : change24h > -8 ? 28 : 18;

  const total = Math.round(
    trendScore * 0.30 +
    volumeScore * 0.20 +
    indicatorScore * 0.20 +
    newsScore * 0.20 +
    socialScore * 0.10
  );

  const signal = total >= 65 ? 'COMPRA' : total <= 38 ? 'VENDA' : 'NEUTRO';

  return {
    total,
    signal,
    breakdown: {
      trend: Math.round(trendScore),
      volume: Math.round(volumeScore),
      indicators: Math.round(indicatorScore),
      news: Math.round(newsScore),
      social: Math.round(socialScore),
    },
  };
}

module.exports = { calculateScore };
