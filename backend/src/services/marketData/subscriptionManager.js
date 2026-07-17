const pool = require('../../config/db');

const symbolTradeMap = new Map();
let finnhubServiceRef = null;

function getFinnhubService() {
  if (!finnhubServiceRef) {
    finnhubServiceRef = require('./finnhubService');
  }
  return finnhubServiceRef;
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function isLiveEligibleTrade(trade) {
  const symbol = normalizeSymbol(trade?.ticker);
  if (!symbol) return false;

  const status = String(trade?.status || '').trim().toLowerCase();
  if (status !== 'open' && status !== 'trimmed') return false;

  return true;
}

function getTradeSymbol(trade) {
  return normalizeSymbol(trade?.ticker);
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
  const liveEligibleTrades = [];

  for (const trade of rows) {
    if (!isLiveEligibleTrade(trade)) {
      continue;
    }

    const symbol = getTradeSymbol(trade);
    if (!symbol) continue;

    liveEligibleTrades.push(trade);

    if (!nextMap.has(symbol)) {
      nextMap.set(symbol, []);
    }

    nextMap.get(symbol).push({
      ...trade,
      ticker: symbol,
    });
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
  const normalized = normalizeSymbol(symbol);
  return symbolTradeMap.get(normalized) || [];
}

function getTrackedSymbols() {
  return Array.from(symbolTradeMap.keys());
}

function getTrackedSymbolCount() {
  return symbolTradeMap.size;
}

function hasTrackedSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  return symbolTradeMap.has(normalized);
}

function getAllTrackedTrades() {
  return Array.from(symbolTradeMap.values()).flat();
}

function getLiveEligibleTradeCount() {
  return getAllTrackedTrades().length;
}

async function refreshSubscriptions() {
  const trades = await reloadOpenTrades();

  console.log(
    `[subscriptionManager] refreshed subscriptions: ${trades.length} open/trimmed trade(s), tracked symbols: ${getTrackedSymbols().join(', ') || 'none'}`
  );

  return trades;
}

module.exports = {
  reloadOpenTrades,
  getTradesForSymbol,
  getTrackedSymbols,
  getTrackedSymbolCount,
  hasTrackedSymbol,
  getAllTrackedTrades,
  getLiveEligibleTradeCount,
  refreshSubscriptions,
  normalizeSymbol,
  isLiveEligibleTrade,
  getTradeSymbol,
};