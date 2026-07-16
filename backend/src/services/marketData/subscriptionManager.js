const pool = require('../../config/db');

const symbolTradeMap = new Map();
let finnhubServiceRef = null;

function getFinnhubService() {
  if (!finnhubServiceRef) {
    finnhubServiceRef = require('./finnhubService');
  }
  return finnhubServiceRef;
}

async function reloadOpenTrades() {
  const { rows } = await pool.query(`
    SELECT
      id,
      user_id,
      ticker,
      direction,
      entry_price,
      stop_price,
      target_price,
      original_stop,
      current_stop,
      shares,
      original_shares,
      remaining_shares,
      position_size,
      risk_dollars,
      risk_percent,
      stop_distance,
      status,
      opened_at,
      updated_at
    FROM journal_entries
    WHERE status IN ('open', 'trimmed')
  `);

  const nextMap = new Map();

  for (const trade of rows) {
    const symbol = String(trade.ticker || '').trim().toUpperCase();
    if (!symbol) continue;

    if (!nextMap.has(symbol)) {
      nextMap.set(symbol, []);
    }

    nextMap.get(symbol).push(trade);
  }

  const previousSymbols = new Set(symbolTradeMap.keys());
  const nextSymbols = new Set(nextMap.keys());
  const finnhubService = getFinnhubService();

  for (const symbol of nextSymbols) {
    if (!previousSymbols.has(symbol)) {
      finnhubService.subscribe(symbol);
    }
  }

  for (const symbol of previousSymbols) {
    if (!nextSymbols.has(symbol)) {
      finnhubService.unsubscribe(symbol);
    }
  }

  symbolTradeMap.clear();

  for (const [symbol, trades] of nextMap.entries()) {
    symbolTradeMap.set(symbol, trades);
  }

  return rows;
}

function getTradesForSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  return symbolTradeMap.get(normalized) || [];
}

function getTrackedSymbols() {
  return Array.from(symbolTradeMap.keys());
}

function hasTrackedSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  return symbolTradeMap.has(normalized);
}

async function refreshSubscriptions() {
  const trades = await reloadOpenTrades();

  console.log(
    `[subscriptionManager] refreshed subscriptions: ${trades.length} open/trimmed trade(s), symbols: ${getTrackedSymbols().join(', ')}`
  );

  return trades;
}

module.exports = {
  reloadOpenTrades,
  getTradesForSymbol,
  getTrackedSymbols,
  hasTrackedSymbol,
  refreshSubscriptions,
};