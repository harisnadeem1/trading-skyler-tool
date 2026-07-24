// services/trendMap/trendMapSignalsService.js

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(values.length - period);
  const nums = slice.map(toNumber);
  if (nums.some((v) => v === null)) return null;
  return nums.reduce((sum, v) => sum + v, 0) / period;
}

function emaSeries(values, span) {
  const alpha = 2 / (span + 1);
  const out = new Array(values.length).fill(null);

  let seedCount = 0;
  let seedSum = 0;
  let prevEma = null;

  for (let i = 0; i < values.length; i += 1) {
    const v = toNumber(values[i]);
    if (v === null) continue;

    if (seedCount < span) {
      seedSum += v;
      seedCount += 1;

      if (seedCount === span) {
        prevEma = seedSum / span;
        out[i] = prevEma;
      }

      continue;
    }

    prevEma = (v * alpha) + (prevEma * (1 - alpha));
    out[i] = prevEma;
  }

  return out;
}

function statusColorKey(signalValue) {
  if (signalValue === 'YES') return 'GREEN';
  if (signalValue === 'ATTEMPT') return 'AMBER';
  if (signalValue === 'NO') return 'RED';
  return 'GRAY';
}

function deriveExposureMessage(regime) {
  const messages = {
    GREEN: 'I can build to full exposure progressively and have the option of moving to margin when trades are working and gaining cushion.',
    YELLOW: 'I am allowed to only build to around 50% exposure. I will allow myself to move beyond this level ONLY if most exposure is fully financed or protected.',
    AMBER: 'Test ONE or TWO trades and see if they gain cushion. Added exposure can ONLY be taken after initial risk is fully financed or protected. If these positions are negative by the end of the day on the day of entry, they may be closed out depending on the general market close.',
    ORANGE: "Absolutely NO new trades are allowed. For existing positions, move SL's up, take needed trims to reduce open heat to a comfortable level. Priority: Protect principle AND gains already made.",
    RED: 'Exit the market by either manually selling positions or allowing them to hit trailing stops. Hard stops at my final level can be important in a RED environment.',
  };

  return messages[regime] || '';
}

function deriveRegimeActionTitle(regime) {
  const titles = {
    GREEN: 'BUILD TO FULL EXPOSURE',
    YELLOW: 'CAUTION / ~50% EXPOSURE',
    AMBER: 'TEST ONE OR TWO TRADES',
    ORANGE: 'NO NEW TRADES',
    RED: 'EXIT / STAND ASIDE',
  };

  return titles[regime] || '';
}

function calculateTrendMapRegime(sig1, sig2, sig3, sig4, sig5) {
  const signals2To5 = [sig2, sig3, sig4, sig5];

  if (sig1 === 'YES' && signals2To5.every((s) => s === 'YES')) {
    return 'GREEN';
  }

  if (sig1 === 'YES' && signals2To5.some((s) => s === 'NO')) {
    return 'YELLOW';
  }

  if (sig1 === 'ATTEMPT' && signals2To5.some((s) => s === 'YES')) {
    return 'AMBER';
  }

  if (sig1 === 'NO' && signals2To5.some((s) => s === 'YES')) {
    return 'ORANGE';
  }

  if (sig1 === 'NO' && signals2To5.every((s) => s === 'NO')) {
    return 'RED';
  }

  return 'YELLOW';
}

function computeDailyMetrics(dailyBars) {
  if (!Array.isArray(dailyBars) || dailyBars.length < 2) return null;

  const closes = dailyBars.map((bar) => toNumber(bar.close)).filter((v) => v !== null);
  const opens = dailyBars.map((bar) => toNumber(bar.open));

  if (closes.length < 2) return null;

  const latestClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  const ma5 = sma(closes, 5);
  const ma5Prev = closes.length >= 6 ? sma(closes.slice(0, -1), 5) : null;
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);

  const latestOpen = opens[opens.length - 1];
  const dailyPct = prevClose ? ((latestClose / prevClose) - 1) : null;
  const intradayPct = latestOpen ? ((latestClose / latestOpen) - 1) : null;

  let pct5D = null;
  if (closes.length >= 6) {
    const close5dAgo = closes[closes.length - 6];
    if (close5dAgo) pct5D = (latestClose / close5dAgo) - 1;
  }

  const trailingWindow = closes.slice(-252);
  const rollingHigh = trailingWindow.length ? Math.max(...trailingWindow) : null;
  const off52WkHigh = rollingHigh ? ((latestClose / rollingHigh) - 1) : null;

  return {
    latestClose,
    dailyPct,
    pct5D,
    intradayPct,
    ma5,
    ma5Prev,
    ma10,
    ma20,
    off52WkHigh,
  };
}

function computeWeeklyMetrics(weeklyBars) {
  if (!Array.isArray(weeklyBars) || weeklyBars.length === 0) {
    return {
      weeklyClose: null,
      wma10: null,
      wma20: null,
      weeklyBuySignal: 'NO',
    };
  }

  const closes = weeklyBars.map((bar) => toNumber(bar.close)).filter((v) => v !== null);
  if (!closes.length) {
    return {
      weeklyClose: null,
      wma10: null,
      wma20: null,
      weeklyBuySignal: 'NO',
    };
  }

  const weeklyClose = closes[closes.length - 1];
  const wma10 = sma(closes, 10);
  const wma20 = sma(closes, 20);

  const weeklyBuySignal = (
    weeklyClose !== null &&
    wma10 !== null &&
    wma20 !== null &&
    weeklyClose > wma10 &&
    weeklyClose > wma20 &&
    wma10 > wma20
  ) ? 'YES' : 'NO';

  return {
    weeklyClose,
    wma10,
    wma20,
    weeklyBuySignal,
  };
}

function computeComponentBreadthModel(componentHistoryMap, minHoldingsRequired = 80) {
  const symbols = Object.keys(componentHistoryMap || {});
  if (symbols.length < minHoldingsRequired) {
    return {
      status: 'INVALID',
      reason: `Coverage too low: ${symbols.length}`,
      symbols,
      breadthSeries: [],
      signal1: null,
      signal6: null,
      signal7: null,
      msiLatest: null,
      mcoLatest: null,
    };
  }

  const allDates = new Set();
  for (const rows of Object.values(componentHistoryMap)) {
    for (const row of rows || []) {
      if (row?.date) allDates.add(row.date);
    }
  }

  const sortedDates = Array.from(allDates).sort();
  const closesBySymbolDate = {};

  for (const [symbol, rows] of Object.entries(componentHistoryMap)) {
    closesBySymbolDate[symbol] = new Map();
    for (const row of rows || []) {
      const close = toNumber(row.close);
      if (row?.date && close !== null) {
        closesBySymbolDate[symbol].set(row.date, close);
      }
    }
  }

  const ffilled = {};
  for (const symbol of symbols) {
    const map = closesBySymbolDate[symbol];
    let lastClose = null;
    ffilled[symbol] = new Map();

    for (const date of sortedDates) {
      const raw = map.get(date);
      if (raw !== undefined) lastClose = raw;
      if (lastClose !== null) {
        ffilled[symbol].set(date, lastClose);
      }
    }
  }

  const breadthSeries = [];
  const mcoInput = [];
  const nhnlValues = [];

  for (let i = 1; i < sortedDates.length; i += 1) {
    const date = sortedDates[i];
    const prevDate = sortedDates[i - 1];

    let advances = 0;
    let declines = 0;
    let unchanged = 0;

    const symbolClosesToday = [];

    for (const symbol of symbols) {
      const current = ffilled[symbol].get(date);
      const prev = ffilled[symbol].get(prevDate);

      if (current === undefined || prev === undefined) continue;

      symbolClosesToday.push(current);

      if (current > prev) advances += 1;
      else if (current < prev) declines += 1;
      else unchanged += 1;
    }

    const denom = advances + declines;
    const netAdv = advances - declines;
    const ratioAdjustedBreadth = denom > 0 ? (1000 * (netAdv / denom)) : 0;

    let newHighs = 0;
    let newLows = 0;

    for (const symbol of symbols) {
      const recent = [];
      for (let j = Math.max(0, i - 251); j <= i; j += 1) {
        const px = ffilled[symbol].get(sortedDates[j]);
        if (px !== undefined) recent.push(px);
      }

      if (recent.length < 252) continue;

      const current = ffilled[symbol].get(date);
      const max252 = Math.max(...recent);
      const min252 = Math.min(...recent);

      if (current >= max252) newHighs += 1;
      if (current <= min252) newLows += 1;
    }

    const nhnl = newHighs - newLows;
    nhnlValues.push(nhnl);
    mcoInput.push(ratioAdjustedBreadth);

    breadthSeries.push({
      date,
      advances,
      declines,
      unchanged,
      netAdv,
      ratioAdjustedBreadth,
      new52WkHighs: newHighs,
      new52WkLows: newLows,
      nhnl,
    });
  }

  if (breadthSeries.length < 5) {
    return {
      status: 'INVALID',
      reason: 'Breadth dataframe insufficient',
      symbols,
      breadthSeries,
      signal1: null,
      signal6: null,
      signal7: null,
      msiLatest: null,
      mcoLatest: null,
    };
  }

  const ema19 = emaSeries(mcoInput, 19);
  const ema39 = emaSeries(mcoInput, 39);

  let cumulativeMsi = 0;
  for (let i = 0; i < breadthSeries.length; i += 1) {
    const e19 = ema19[i];
    const e39 = ema39[i];
    const mco = (e19 !== null && e39 !== null) ? (e19 - e39) : null;
    cumulativeMsi += (mco ?? 0);

    breadthSeries[i].ema19 = e19;
    breadthSeries[i].ema39 = e39;
    breadthSeries[i].mcClellanOscillator = mco;
    breadthSeries[i].mcClellanSummationIndex = cumulativeMsi;
  }

  const latest = breadthSeries[breadthSeries.length - 1];
  const prev = breadthSeries[breadthSeries.length - 2];
  const nhnl5 = breadthSeries.slice(-5).map((row) => toNumber(row.nhnl)).filter((v) => v !== null);

  let signal1 = 'NO';
  if (
    latest.mcClellanSummationIndex !== null &&
    prev.mcClellanSummationIndex !== null &&
    latest.mcClellanSummationIndex > prev.mcClellanSummationIndex
  ) {
    signal1 = latest.mcClellanSummationIndex > 0 ? 'YES' : 'ATTEMPT';
  }

  const signal6 = (
    latest.nhnl !== null &&
    latest.nhnl > 0 &&
    nhnl5.length > 0 &&
    (nhnl5.reduce((a, b) => a + b, 0) / nhnl5.length) > 0
  ) ? 'YES' : 'NO';

  const signal7 = (
    latest.mcClellanOscillator !== null &&
    latest.mcClellanOscillator < 100
  ) ? 'YES' : 'NO';

  return {
    status: 'OK',
    reason: '',
    symbols,
    breadthSeries,
    signal1,
    signal6,
    signal7,
    msiLatest: latest.mcClellanSummationIndex,
    mcoLatest: latest.mcClellanOscillator,
  };
}

function formatDashboardDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function buildTrendMapSignalBlock({
  qqqeDailyBars,
  qqqeWeeklyBars,
  breadthSheetRows = [],
  componentModel,
  signal5Value = 'YES',
  ticker = 'QQQE',
}) {
  const now = new Date();
  const metrics = computeDailyMetrics(qqqeDailyBars);
  const weekly = computeWeeklyMetrics(qqqeWeeklyBars);

  let latestPctAbove20MA = null;
  let latestNHNLFromSheet = null;

  if (breadthSheetRows.length) {
    const last = breadthSheetRows[breadthSheetRows.length - 1];
    latestPctAbove20MA = toNumber(last.pctAbove20MA);
    latestNHNLFromSheet = toNumber(last.nhnl);
  }

  if (!metrics) {
    const regime = 'RED';
    return {
      asOf: now.toISOString(),
      dashboardDate: formatDashboardDate(now),
      ticker,
      marketRegime: regime,
      regimeActionTitle: deriveRegimeActionTitle(regime),
      exposureMessage: deriveExposureMessage(regime),
      metrics: {},
      signals: [],
      breadthModelStatus: 'INVALID',
      breadthModelReason: 'QQQE daily metrics unavailable',
      dashboardWarning: '',
    };
  }

  const signal2 = (
    metrics.ma5 !== null &&
    metrics.ma5Prev !== null &&
    metrics.latestClose > metrics.ma5 &&
    metrics.ma5 > metrics.ma5Prev
  ) ? 'YES' : 'NO';

  const signal3 = (
    metrics.ma10 !== null &&
    metrics.ma20 !== null &&
    metrics.latestClose > metrics.ma10 &&
    metrics.latestClose > metrics.ma20 &&
    metrics.ma10 > metrics.ma20
  ) ? 'YES' : 'NO';

  const signal4 = weekly.weeklyBuySignal;
  const signal5 = ['YES', 'NO', 'ATTEMPT'].includes(signal5Value) ? signal5Value : 'YES';

  const breadthStatus = componentModel?.status || 'INVALID';
  const breadthReason = componentModel?.reason || '';
  const signal1 = componentModel?.signal1 ?? null;
  const signal6 = componentModel?.signal6 ?? null;
  const signal7 = componentModel?.signal7 ?? null;

  let marketRegime = 'PROVISIONAL';
  let dashboardWarning = '';

  if (breadthStatus === 'OK') {
    marketRegime = calculateTrendMapRegime(signal1, signal2, signal3, signal4, signal5);
  } else {
    dashboardWarning = `Breadth model unavailable: ${breadthReason}`;
  }

  const regimeActionTitle = ['GREEN', 'YELLOW', 'AMBER', 'ORANGE', 'RED'].includes(marketRegime)
    ? deriveRegimeActionTitle(marketRegime)
    : 'BREADTH DATA UNAVAILABLE';

  const exposureMessage = ['GREEN', 'YELLOW', 'AMBER', 'ORANGE', 'RED'].includes(marketRegime)
    ? deriveExposureMessage(marketRegime)
    : '';

  const signals = [
    {
      key: 'signal1',
      label: 'QQQE McClellan Summation Index (MCSI) in an uptrend?',
      value: signal1 ?? 'N/A',
      colorKey: statusColorKey(signal1 ?? 'N/A'),
    },
    {
      key: 'signal2',
      label: 'QQQE above a rising 5 SMA?',
      value: signal2,
      colorKey: statusColorKey(signal2),
    },
    {
      key: 'signal3',
      label: 'Daily Buy Signal? (QQQE above 10/20 SMA + 10SMA > 20SMA)',
      value: signal3,
      colorKey: statusColorKey(signal3),
    },
    {
      key: 'signal4',
      label: 'Weekly Buy Signal? (QQQE trades above 10/20 WMA + 10WMA > 20WMA)',
      value: signal4,
      colorKey: statusColorKey(signal4),
    },
    {
      key: 'signal5',
      label: 'Gained traction on last few trades?',
      value: signal5,
      colorKey: statusColorKey(signal5),
    },
    {
      key: 'signal6',
      label: 'QQQE net 52-Week High/Low indicator trending positive?',
      value: signal6 ?? 'N/A',
      colorKey: statusColorKey(signal6 ?? 'N/A'),
    },
    {
      key: 'signal7',
      label: 'McClellan Oscillator out of overbought territory?',
      value: signal7 ?? 'N/A',
      colorKey: statusColorKey(signal7 ?? 'N/A'),
    },
  ];

  return {
    asOf: now.toISOString(),
    dashboardDate: formatDashboardDate(now),
    ticker,
    marketRegime,
    regimeActionTitle,
    exposureMessage,
    metrics: {
      latestClose: metrics.latestClose,
      ma5: metrics.ma5,
      ma10: metrics.ma10,
      ma20: metrics.ma20,
      weeklyClose: weekly.weeklyClose,
      wma10: weekly.wma10,
      wma20: weekly.wma20,
      latestPctAbove20MA,
      latestNHNLFromSheet,
      componentCountUsed: componentModel?.symbols?.length || 0,
      mcClellanSummationIndex: componentModel?.msiLatest ?? null,
      mcClellanOscillator: componentModel?.mcoLatest ?? null,
    },
    signals,
    breadthModelStatus: breadthStatus,
    breadthModelReason: breadthReason,
    dashboardWarning,
    componentBreadthTail: (componentModel?.breadthSeries || []).slice(-30),
  };
}

module.exports = {
  statusColorKey,
  deriveExposureMessage,
  deriveRegimeActionTitle,
  calculateTrendMapRegime,
  computeDailyMetrics,
  computeWeeklyMetrics,
  computeComponentBreadthModel,
  buildTrendMapSignalBlock,
};