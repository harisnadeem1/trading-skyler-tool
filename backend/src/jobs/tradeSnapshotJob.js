const cron = require('node-cron');
const { runSnapshotCycle } = require('../services/marketData/snapshotService');

let job = null;

function startTradeSnapshotJob() {
  const schedule = process.env.MARKET_SNAPSHOT_CRON || '*/30 * * * *';

  if (job) return job;

  job = cron.schedule(schedule, async () => {
    try {
      const results = await runSnapshotCycle();
      console.log(`[tradeSnapshotJob] completed with ${results.length} snapshot(s)`);
    } catch (error) {
      console.error('[tradeSnapshotJob] failed:', error);
    }
  });

  return job;
}

module.exports = {
  startTradeSnapshotJob,
};