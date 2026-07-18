const { getAllPrices, getPrice } = require('../services/marketData/priceCache');
const {
  getTrackedSymbols,
  reloadOpenTrades,
  getAllTrackedTrades,
  normalizeSymbol,
} = require('../services/marketData/subscriptionManager');
const { runSnapshotCycle } = require('../services/marketData/snapshotService');
const finnhubService = require('../services/marketData/finnhubService');
const {
  addClient,
  removeClient,
  getClientCount,
  sendToClient,
} = require('../services/marketData/liveStream');
const { buildTradeUpdate } = require('../services/marketData/liveTradeEmitter');

async function testQuote(req, res) {
  try {
    const symbol = String(req.query.symbol || 'AAPL').toUpperCase();
    const quote = await finnhubService.fetchQuote(symbol);
    return res.json({ symbol, quote });
  } catch (error) {
    console.error('testQuote error:', error);
    return res.status(500).json({ message: 'Failed to fetch quote' });
  }
}

async function reloadSubscriptions(req, res) {
  try {
    const trades = await reloadOpenTrades();
    return res.json({
      message: 'Subscriptions reloaded',
      trackedSymbols: getTrackedSymbols(),
      openTrades: trades.length,
    });
  } catch (error) {
    console.error('reloadSubscriptions error:', error);
    return res.status(500).json({ message: 'Failed to reload subscriptions' });
  }
}

async function getCache(req, res) {
  try {
    return res.json({
      trackedSymbols: getTrackedSymbols(),
      prices: getAllPrices(),
    });
  } catch (error) {
    console.error('getCache error:', error);
    return res.status(500).json({ message: 'Failed to fetch market cache' });
  }
}

async function runSnapshots(req, res) {
  try {
    const results = await runSnapshotCycle();
    return res.json({
      message: 'Snapshot cycle completed',
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('runSnapshots error:', error);
    return res.status(500).json({ message: 'Failed to run snapshot cycle' });
  }
}

function getCachedPriceForSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  const entry = getPrice(normalized);

  if (!entry) return null;

  const price = Number(entry.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function buildInitialTradesForUser(userId) {
  const normalizedUserId = String(userId);
  const trackedTrades = getAllTrackedTrades();

  const updates = [];

  for (const trade of trackedTrades) {
    if (String(trade.user_id) !== normalizedUserId) continue;

    const symbol = normalizeSymbol(trade.ticker);
    const currentPrice = getCachedPriceForSymbol(symbol);
    if (!(currentPrice > 0)) continue;

    const update = buildTradeUpdate(trade, symbol, currentPrice);
    if (update) {
      updates.push(update);
    }
  }

  return updates;
}

function sendInitialTradeSnapshot(res, userId) {
  const trades = buildInitialTradesForUser(userId);

//   console.log(
//   '[marketController] initial snapshot payload',
//   trades.map((trade) => ({
//     tradeId: trade.tradeId,
//     symbol: trade.symbol,
//     currentPrice: trade.currentPrice,
//   }))
// );

  sendToClient(res, 'trade-update', {
    symbol: null,
    currentPrice: null,
    updatedAt: new Date().toISOString(),
    snapshot: true,
    trades,
  });

  console.log(
    `[marketController] sent initial trade snapshot to user ${userId}: ${trades.length} trade(s)`
  );
}

async function streamMarket(req, res) {
  const userId = req.user?.id ?? req.user?.userId ?? null;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  addClient(res, { userId });

  sendToClient(res, 'connected', {
    ok: true,
    message: 'Live stream connected',
    userId: String(userId),
    clients: getClientCount(),
  });

  sendInitialTradeSnapshot(res, userId);

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      sendToClient(res, 'ping', { ts: Date.now() });
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);

    if (!res.writableEnded) {
      res.end();
    }
  });
}

module.exports = {
  testQuote,
  reloadSubscriptions,
  getCache,
  runSnapshots,
  streamMarket,
};