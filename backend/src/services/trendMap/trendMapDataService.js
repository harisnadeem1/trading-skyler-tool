const fs = require('fs');
const path = require('path');

const {
  computeComponentBreadthModel,
  buildTrendMapSignalBlock,
} = require('./trendMapSignalService');

const db = require('../../config/db');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

const QQQE_TICKER = 'QQQE';
const HOLDINGS_FILE = path.join(__dirname, 'qqqe_holdings.csv');

const MAX_COMPONENTS = 20;
const MIN_HOLDINGS_REQUIRED = 12;
const CACHE_TTL_MS = 5 * 60 * 1000;
const RECENT_TRADES_LIMIT = 5;

const snapshotCache = new Map();
const inFlightPromises = new Map();

function assertApiKey() {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY is missing');
  }
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSignal5Override(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized || normalized === 'AUTO') return null;
  if (['YES', 'NO', 'ATTEMPT'].includes(normalized)) return normalized;
  return null;
}

function getCacheKey({ userId, signal5Override }) {
  const overrideKey = normalizeSignal5Override(signal5Override) || 'AUTO';
  return `${userId || 'anonymous'}::${overrideKey}`;
}

async function finnhubGet(pathname, params = {}) {
  assertApiKey();

  const url = new URL(`${FINNHUB_BASE_URL}${pathname}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  url.searchParams.set('token', FINNHUB_API_KEY);

  const response = await fetch(url.toString());

  if (response.status === 429) {
    throw new Error('FINNHUB_RATE_LIMIT');
  }

  if (!response.ok) {
    throw new Error(`Finnhub request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function getStockCandles(symbol, { resolution = 'D', from, to }) {
  const data = await finnhubGet('/stock/candle', {
    symbol,
    resolution,
    from,
    to,
  });

  if (!data || data.s !== 'ok' || !Array.isArray(data.c)) {
    return [];
  }

  return data.t.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    timestamp: ts,
    open: data.o?.[i] ?? null,
    high: data.h?.[i] ?? null,
    low: data.l?.[i] ?? null,
    close: data.c?.[i] ?? null,
    volume: data.v?.[i] ?? null,
  }));
}

function buildWeeklyBarsFromDaily(dailyBars) {
  if (!Array.isArray(dailyBars) || !dailyBars.length) return [];

  const buckets = new Map();

  for (const bar of dailyBars) {
    const d = new Date(bar.timestamp * 1000);
    if (Number.isNaN(d.getTime())) continue;

    const day = d.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate()
    ));
    monday.setUTCDate(monday.getUTCDate() + diffToMonday);

    const key = monday.toISOString().slice(0, 10);

    if (!buckets.has(key)) {
      buckets.set(key, {
        date: key,
        timestamp: Math.floor(monday.getTime() / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: Number(bar.volume || 0),
      });
      continue;
    }

    const row = buckets.get(key);
    row.high = Math.max(Number(row.high ?? -Infinity), Number(bar.high ?? -Infinity));
    row.low = Math.min(Number(row.low ?? Infinity), Number(bar.low ?? Infinity));
    row.close = bar.close;
    row.volume += Number(bar.volume || 0);
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function loadHoldingsFromCsv() {
  if (!fs.existsSync(HOLDINGS_FILE)) {
    return [];
  }

  const raw = fs.readFileSync(HOLDINGS_FILE, 'utf8');

  return Array.from(new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(',')[0]?.trim())
      .map(normalizeSymbol)
      .filter((symbol) => symbol && symbol !== 'SYMBOL')
  ));
}

async function getBulkDailyCloseHistory(symbols, monthsBack = 18) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);

  const result = {};
  const uniqueSymbols = Array.from(
    new Set((symbols || []).map(normalizeSymbol).filter(Boolean))
  ).slice(0, MAX_COMPONENTS);

  for (const symbol of uniqueSymbols) {
    try {
      const candles = await getStockCandles(symbol, {
        resolution: 'D',
        from: toUnix(from),
        to: toUnix(to),
      });

      if (candles.length) {
        result[symbol] = candles;
      }

      await sleep(350);
    } catch (error) {
      if (error.message === 'FINNHUB_RATE_LIMIT') {
        console.warn(`[TREND MAP] rate limit hit at ${symbol}, stopping component fetch early`);
        break;
      }

      console.warn(`[TREND MAP] failed candles for ${symbol}:`, error.message);
    }
  }

  return result;
}

async function getRecentClosedTrades(userId, limit = RECENT_TRADES_LIMIT) {
  if (!userId) return [];

  const result = await db.query(
    `
      SELECT
        id,
        ticker,
        COALESCE(exit_date, updated_at, created_at) AS trade_date,
        COALESCE(total_realized_pnl, pnl, 0) AS realized_pnl
      FROM journal_entries
      WHERE user_id = $1
        AND status = 'closed'
      ORDER BY COALESCE(exit_date, updated_at, created_at) DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

function deriveSignal5FromTrades(trades) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return 'NO';
  }

  const wins = trades.filter((trade) => Number(trade.realized_pnl || 0) > 0).length;

  if (wins >= 3) return 'YES';
  if (wins >= 2) return 'ATTEMPT';
  return 'NO';
}

async function resolveSignal5Value({ userId, signal5Override }) {
  const normalizedOverride = normalizeSignal5Override(signal5Override);

  if (normalizedOverride) {
    return normalizedOverride;
  }

  const trades = await getRecentClosedTrades(userId, RECENT_TRADES_LIMIT);
  return deriveSignal5FromTrades(trades);
}

async function buildSnapshot({ userId, signal5Override }) {
  const now = new Date();
  const dailyFrom = new Date();
  dailyFrom.setFullYear(dailyFrom.getFullYear() - 1);

  const qqqeDailyBars = await getStockCandles(QQQE_TICKER, {
    resolution: 'D',
    from: toUnix(dailyFrom),
    to: toUnix(now),
  });

  const qqqeWeeklyBars = buildWeeklyBarsFromDaily(qqqeDailyBars);
  const holdings = loadHoldingsFromCsv();
  const componentHistoryMap = await getBulkDailyCloseHistory(holdings, 18);
  const signal5Value = await resolveSignal5Value({ userId, signal5Override });

  let componentModel = {
    status: 'INVALID',
    reason: 'Coverage too low',
    symbols: [],
    breadthSeries: [],
    signal1: null,
    signal6: null,
    signal7: null,
    msiLatest: null,
    mcoLatest: null,
  };

  const coverage = Object.keys(componentHistoryMap).length;

  if (coverage >= MIN_HOLDINGS_REQUIRED) {
    componentModel = computeComponentBreadthModel(
      componentHistoryMap,
      MIN_HOLDINGS_REQUIRED
    );
  } else {
    componentModel.reason = `Coverage too low: ${coverage}`;
  }

  const signalBlock = buildTrendMapSignalBlock({
    qqqeDailyBars,
    qqqeWeeklyBars,
    breadthSheetRows: [],
    componentModel,
    signal5Value,
    ticker: QQQE_TICKER,
  });

  return {
    ...signalBlock,
    signal5Source: normalizeSignal5Override(signal5Override) ? 'MANUAL_OVERRIDE' : 'AUTO_RECENT_TRADES',
    signal5RecentTradesCount: normalizeSignal5Override(signal5Override)
      ? null
      : RECENT_TRADES_LIMIT,
  };
}

async function getTrendMapSnapshot({
  userId,
  signal5Override,
  forceRefresh = false,
} = {}) {
  const cacheKey = getCacheKey({ userId, signal5Override });
  const now = Date.now();
  const useCache = !forceRefresh;

  if (useCache) {
    const cached = snapshotCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.value;
    }
  }

  if (inFlightPromises.has(cacheKey)) {
    return inFlightPromises.get(cacheKey);
  }

  const promise = buildSnapshot({ userId, signal5Override })
    .then((snapshot) => {
      snapshotCache.set(cacheKey, {
        value: snapshot,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return snapshot;
    })
    .finally(() => {
      inFlightPromises.delete(cacheKey);
    });

  inFlightPromises.set(cacheKey, promise);

  return promise;
}

module.exports = {
  getTrendMapSnapshot,
  getRecentClosedTrades,
  deriveSignal5FromTrades,
  resolveSignal5Value,
};