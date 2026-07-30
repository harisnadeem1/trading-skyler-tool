const finnhubService = require('./marketData/finnhubService');

async function getHistory(symbol, range = '24h', interval = '1m') {
  return finnhubService.fetchHistory(symbol, range, interval);
}

module.exports = {
  getHistory,
};