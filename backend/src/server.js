require('dotenv').config();

const app = require('./app');
const pool = require('./config/db');

const finnhubService = require('./services/marketData/finnhubService');
const { reloadOpenTrades } = require('./services/marketData/subscriptionManager');
const { startTradeSnapshotJob } = require('./jobs/tradeSnapshotJob');
const { startIbkrFlexPolling } = require('./jobs/ibkrFlexPollingJob');

const PORT = process.env.PORT || 3000;
const ENABLE_FINNHUB_WS = process.env.ENABLE_FINNHUB_WS === 'true';
const ENABLE_TRADE_SNAPSHOT_JOB = process.env.ENABLE_TRADE_SNAPSHOT_JOB === 'true';

async function startServer() {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connection verified');

    const openTrades = await reloadOpenTrades();
    console.log(`Loaded ${openTrades.length} open/trimmed trade(s) for live monitoring`);

    if (ENABLE_FINNHUB_WS) {
      finnhubService.connect();
      console.log('Finnhub live market data service started');
    } else {
      console.log('Finnhub live market data service disabled by environment');
    }

    if (ENABLE_TRADE_SNAPSHOT_JOB) {
      startTradeSnapshotJob();
      console.log(
        `Trade snapshot job started on schedule: ${
          process.env.MARKET_SNAPSHOT_CRON || '*/30 * * * *'
        }`
      );
    } else {
      console.log('Trade snapshot job disabled by environment');
    }



startIbkrFlexPolling();





    require('dotenv').config();
console.log({
  key: JSON.stringify(process.env.IBKR_CONSUMER_KEY),
  keyLen: process.env.IBKR_CONSUMER_KEY?.length,
  token: JSON.stringify(process.env.IBKR_ACCESS_TOKEN),
  tokenLen: process.env.IBKR_ACCESS_TOKEN?.length,
});

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();