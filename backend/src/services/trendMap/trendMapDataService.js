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

const MAX_COMPONENTS = 120;
const MIN_HOLDINGS_REQUIRED = 80;
const RECENT_TRADES_LIMIT = 5;

// -----------------------------------------------------------------------
// Layer 1: global market snapshot cache.
//
// Signals 1, 2, 3, 4, 6, 7 and all breadth metrics (Pct Above 20MA, NHNL,
// MCSI, MCO, etc.) are derived purely from QQQE + QQQE-component Finnhub
// candles, which are identical for every user. This cache is keyed by a
// single fixed key -- NOT by userId or Signal 5 -- so it is shared across
// all requests and only ever rebuilt on TTL expiry or a forced refresh.
// -----------------------------------------------------------------------
const MARKET_CACHE_KEY = 'trend-map:market';
const MARKET_CACHE_TTL_MS = 5 * 60 * 1000;

const marketSnapshotCache = new Map();
let marketSnapshotInFlight = null;

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
  const startedAt = Date.now();

  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);

  const result = {};
  const uniqueSymbols = Array.from(
    new Set((symbols || []).map(normalizeSymbol).filter(Boolean))
  ).slice(0, MAX_COMPONENTS);

  console.log(
    `[TREND MAP] Starting component fetch: ${uniqueSymbols.length} symbols`
  );

  for (const [index, symbol] of uniqueSymbols.entries()) {
    const symbolStartedAt = Date.now();

    try {
      console.log(
        `[TREND MAP] ${index + 1}/${uniqueSymbols.length}: fetching ${symbol}`
      );

      const candles = await getStockCandles(symbol, {
        resolution: 'D',
        from: toUnix(from),
        to: toUnix(to),
      });

      if (candles.length) {
        result[symbol] = candles;
      }

      console.log(
        `[TREND MAP] ${index + 1}/${uniqueSymbols.length}: ${symbol} complete ` +
        `(${candles.length} candles, ${Date.now() - symbolStartedAt}ms)`
      );

      await sleep(350);
    } catch (error) {
      console.error(
        `[TREND MAP] ${index + 1}/${uniqueSymbols.length}: ${symbol} failed:`,
        error.message
      );

      if (error.message === 'FINNHUB_RATE_LIMIT') {
        console.warn('[TREND MAP] Stopping after Finnhub rate limit.');
        break;
      }
    }
  }

  console.log(
    `[TREND MAP] Completed ${Object.keys(result).length}/${uniqueSymbols.length} ` +
    `component requests in ${Date.now() - startedAt}ms`
  );

  return result;
}

// -----------------------------------------------------------------------
// Builds the shared, user-agnostic market snapshot: QQQE bars + the full
// component breadth model (pctAbove20MA, NHNL, MCSI, MCO, signals 1/6/7,
// etc). Throws on failure -- callers decide whether to fall back to a
// stale cached snapshot or surface an error.
// -----------------------------------------------------------------------
async function buildMarketSnapshot() {
  const startedAt = Date.now();

  try {
    console.log('[TREND MAP] Market snapshot started');

    const now = new Date();
    const dailyFrom = new Date();
    dailyFrom.setFullYear(dailyFrom.getFullYear() - 1);

    console.time('[TREND MAP] QQQE request');

    const qqqeDailyBars = await getStockCandles(QQQE_TICKER, {
      resolution: 'D',
      from: toUnix(dailyFrom),
      to: toUnix(now),
    });

    console.timeEnd('[TREND MAP] QQQE request');

    if (!qqqeDailyBars.length) {
      throw new Error('QQQE daily candles unavailable from Finnhub');
    }

    const qqqeWeeklyBars = buildWeeklyBarsFromDaily(qqqeDailyBars);
    const holdings = loadHoldingsFromCsv();

    console.log(`[TREND MAP] Holdings in CSV: ${holdings.length}`);

    console.time('[TREND MAP] All component requests');
    const componentHistoryMap = await getBulkDailyCloseHistory(holdings, 18);
    console.timeEnd('[TREND MAP] All component requests');

    console.time('[TREND MAP] Breadth calculation');
    const componentModel = computeComponentBreadthModel(
      componentHistoryMap,
      MIN_HOLDINGS_REQUIRED
    );
    console.timeEnd('[TREND MAP] Breadth calculation');

    const createdAtDate = new Date();
    const createdAtMs = createdAtDate.getTime();
    const expiresAtMs = createdAtMs + MARKET_CACHE_TTL_MS;
    const latestDailyBar = qqqeDailyBars[qqqeDailyBars.length - 1];

    return {
      qqqeDailyBars,
      qqqeWeeklyBars,
      componentModel,
      createdAtMs,
      expiresAtMs,
      createdAt: createdAtDate.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      marketDataAsOf: latestDailyBar?.date || createdAtDate.toISOString(),
    };
  } finally {
    console.log(
      `[TREND MAP] Snapshot total time: ${Date.now() - startedAt}ms`
    );
  }
}

// -----------------------------------------------------------------------
// getGlobalMarketSnapshot: the single entry point every request goes
// through to get shared market data.
//
// - Serves the cached snapshot while it is within MARKET_CACHE_TTL_MS.
// - On expiry (or forceRefresh), rebuilds from Finnhub.
// - Concurrent callers during a rebuild share one in-flight Promise, so
//   a burst of requests never triggers more than one 100+ symbol fetch.
// - If a rebuild fails and a previous snapshot exists, that snapshot is
//   returned marked `stale: true` with the failure reason attached,
//   rather than surfacing an error to users who don't need one.
// - If a rebuild fails and there is no previous snapshot to fall back
//   on, the error propagates -- callers must not fabricate zero values.
// -----------------------------------------------------------------------
async function getGlobalMarketSnapshot({ forceRefresh = false } = {}) {
  const nowMs = Date.now();

  if (!forceRefresh) {
    const cached = marketSnapshotCache.get(MARKET_CACHE_KEY);
    if (cached && nowMs < cached.expiresAtMs) {
      return cached;
    }
  }

  if (marketSnapshotInFlight) {
    return marketSnapshotInFlight;
  }

  marketSnapshotInFlight = buildMarketSnapshot()
    .then((snapshot) => {
      marketSnapshotCache.set(MARKET_CACHE_KEY, snapshot);
      return snapshot;
    })
    .catch((error) => {
      const stale = marketSnapshotCache.get(MARKET_CACHE_KEY);

      if (stale) {
        console.warn('[TREND MAP] market snapshot refresh failed, serving stale snapshot:', error.message);
        return {
          ...stale,
          stale: true,
          staleError: error.message,
        };
      }

      throw error;
    })
    .finally(() => {
      marketSnapshotInFlight = null;
    });

  return marketSnapshotInFlight;
}

// -----------------------------------------------------------------------
// Layer 2: per-user response composition.
//
// Cheap: no Finnhub calls, just Signal 5 resolution (DB lookup or manual
// override) plus the existing signal-block math over already-cached
// market data.
// -----------------------------------------------------------------------
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

function buildCacheMeta(marketSnapshot) {
  const cacheAgeSeconds = Math.max(
    0,
    Math.floor((Date.now() - marketSnapshot.createdAtMs) / 1000)
  );

  const cache = {
    marketDataAsOf: marketSnapshot.marketDataAsOf,
    calculatedAt: marketSnapshot.createdAt,
    expiresAt: marketSnapshot.expiresAt,
    cacheAgeSeconds,
  };

  if (marketSnapshot.stale) {
    cache.stale = true;
    cache.staleWarning = marketSnapshot.staleError
      ? `Market data refresh failed; showing last known snapshot. (${marketSnapshot.staleError})`
      : 'Market data refresh failed; showing last known snapshot.';
  }

  return cache;
}

async function composeTrendMapResponse({ userId, signal5Override, marketSnapshot }) {
  const signal5Value = await resolveSignal5Value({ userId, signal5Override });

  const dashboard = buildTrendMapSignalBlock({
    qqqeDailyBars: marketSnapshot.qqqeDailyBars,
    qqqeWeeklyBars: marketSnapshot.qqqeWeeklyBars,
    componentModel: marketSnapshot.componentModel,
    signal5Value,
    ticker: QQQE_TICKER,
  });

  const normalizedOverride = normalizeSignal5Override(signal5Override);

  return {
    ...dashboard,
    signal5Source: normalizedOverride ? 'MANUAL_OVERRIDE' : 'AUTO_RECENT_TRADES',
    signal5RecentTradesCount: normalizedOverride ? null : RECENT_TRADES_LIMIT,
    cache: buildCacheMeta(marketSnapshot),
  };
}

// GET /trend-map/current
// forceRefresh defaults to false: reloading the page or flipping Signal 5
// never re-fetches Finnhub data, it just re-reads the shared cache.
async function getTrendMapSnapshot({
  userId,
  signal5Override,
  forceRefresh = false,
} = {}) {
  const marketSnapshot = await getGlobalMarketSnapshot({ forceRefresh });
  return composeTrendMapResponse({ userId, signal5Override, marketSnapshot });
}

// POST /trend-map/refresh
// Always forces a rebuild of the global market snapshot (benefits every
// user), then composes the response for the requesting user's Signal 5.
async function refreshTrendMapSnapshot({ userId, signal5Override } = {}) {
  const marketSnapshot = await getGlobalMarketSnapshot({ forceRefresh: true });
  return composeTrendMapResponse({ userId, signal5Override, marketSnapshot });
}

module.exports = {
  getTrendMapSnapshot,
  refreshTrendMapSnapshot,
  getGlobalMarketSnapshot,
  getRecentClosedTrades,
  deriveSignal5FromTrades,
  resolveSignal5Value,
};