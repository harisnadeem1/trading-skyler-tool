const { getAllPrices } = require('../services/marketData/priceCache');
const { getTrackedSymbols, reloadOpenTrades } = require('../services/marketData/subscriptionManager');
const { runSnapshotCycle } = require('../services/marketData/snapshotService');
const finnhubService = require('../services/marketData/finnhubService');
const { addClient, removeClient, getClientCount } = require('../services/marketData/liveStream');

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

async function streamMarket(req, res) {
  const userId = req.user?.id ?? req.user?.userId ?? null;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  addClient(res, { userId });

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      ok: true,
      message: 'Live stream connected',
      userId: String(userId),
      clients: getClientCount(),
    })}\n\n`
  );

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
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