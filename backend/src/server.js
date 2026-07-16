require('dotenv').config();

const app = require('./app');
const pool = require('./config/db');

const finnhubService = require('./services/marketData/finnhubService');
const { reloadOpenTrades } = require('./services/marketData/subscriptionManager');
const { startTradeSnapshotJob } = require('./jobs/tradeSnapshotJob');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connection verified');

    const openTrades = await reloadOpenTrades();
    console.log(`Loaded ${openTrades.length} open/trimmed trade(s) for live monitoring`);

    finnhubService.connect();
    console.log('Finnhub live market data service started');

    startTradeSnapshotJob();
    console.log(
      `Trade snapshot job started on schedule: ${
        process.env.MARKET_SNAPSHOT_CRON || '*/30 * * * *'
      }`
    );

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();