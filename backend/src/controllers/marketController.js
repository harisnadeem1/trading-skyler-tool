const { getAllPrices } = require('../services/marketData/priceCache');
const { getTrackedSymbols, reloadOpenTrades } = require('../services/marketData/subscriptionManager');
const { runSnapshotCycle } = require('../services/marketData/snapshotService');
const finnhubService = require('../services/marketData/finnhubService');
const { addClient, removeClient } = require('../services/marketData/liveStream');


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
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, message: 'Live stream connected' })}\n\n`);

  addClient(res);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
    res.end();
  });
}

module.exports = {
  testQuote,
  reloadSubscriptions,
  getCache,
  runSnapshots,
  streamMarket,

};




