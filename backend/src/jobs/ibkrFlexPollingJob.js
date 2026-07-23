const flexSyncService = require('../services/ibkrFlex/ibkrFlexSyncService');

let started = false;

function startIbkrFlexPolling() {
  if (started) return;
  started = true;

  const everySeconds = Number(process.env.IBKR_FLEX_POLL_INTERVAL_SECONDS || 300);
  const historyHours = Number(process.env.IBKR_FLEX_HISTORY_SYNC_HOURS || 12);

  setInterval(async () => {
    try {
      await flexSyncService.runTradeConfirmSyncForAllDue();
    } catch (error) {
    }
  }, everySeconds * 1000);

  setInterval(async () => {
    try {
      await flexSyncService.runHistorySyncForAllDue();
    } catch (error) {
    }
  }, historyHours * 60 * 60 * 1000);
}

module.exports = {
  startIbkrFlexPolling
};