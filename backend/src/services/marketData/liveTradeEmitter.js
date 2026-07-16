const { broadcast } = require('./liveStream');
const {
  calculateUnrealizedPnL,
  calculateCurrentR,
  calculateUnrealizedPnLPercent,
  isStopHit,
  isTargetHit,
} = require('./tradeMonitorService');

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDirection(direction) {
  return String(direction || 'long').trim().toLowerCase() === 'short'
    ? 'short'
    : 'long';
}

function emitTradeUpdatesForSymbol(symbol, currentPrice, trades = []) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const numericPrice = Number(currentPrice);

  if (!normalizedSymbol || !Number.isFinite(numericPrice)) {
    console.log('[liveTradeEmitter] skipped invalid tick:', { symbol, currentPrice });
    return;
  }

  if (!Array.isArray(trades) || !trades.length) {
    return;
  }

  console.log(
    `[liveTradeEmitter] tick ${normalizedSymbol} @ ${numericPrice} | matched trades: ${trades.length}`
  );

  const updates = trades.map((trade) => {
    const direction = normalizeDirection(trade.direction);
    const entryPrice = toNumber(trade.entry_price);
    const stopPrice = toNumber(trade.current_stop ?? trade.stop_price);

    const targetPrice =
      trade.target_price == null || trade.target_price === ''
        ? null
        : Number(trade.target_price);

    const shares = toNumber(trade.shares);
    const remainingShares = toNumber(trade.remaining_shares ?? trade.shares);
    const riskDollars = toNumber(trade.risk_dollars);
    const positionSize = toNumber(trade.position_size);

    const unrealizedPnL = calculateUnrealizedPnL(trade, numericPrice);
    const currentR = calculateCurrentR(trade, unrealizedPnL);
    const unrealizedPnLPercent = calculateUnrealizedPnLPercent(trade, unrealizedPnL);

    const riskPerShare = Math.abs(entryPrice - stopPrice);

    let fiveRPrice = null;
    if (riskPerShare > 0) {
      fiveRPrice =
        direction === 'short'
          ? entryPrice - riskPerShare * 5
          : entryPrice + riskPerShare * 5;
    }

    const stopHit = isStopHit(trade, numericPrice);
    const targetHit = targetPrice != null && isTargetHit(trade, numericPrice);

    return {
      tradeId: trade.id,
      userId: trade.user_id,
      symbol: String(trade.ticker || normalizedSymbol).toUpperCase(),
      direction,
      status: trade.status || 'open',
      currentPrice: numericPrice,
      entryPrice,
      stopPrice,
      targetPrice,
      shares,
      remainingShares,
      riskDollars,
      positionSize,
      unrealizedPnL,
      unrealizedPnLPercent,
      currentR,
      riskPerShare,
      fiveRPrice,
      stopHit,
      targetHit,
      updatedAt: new Date().toISOString(),
    };
  });

  console.log(
    `[liveTradeEmitter] broadcasting trade-update for ${normalizedSymbol} with ${updates.length} trade(s)`
  );

  broadcast('trade-update', {
    symbol: normalizedSymbol,
    currentPrice: numericPrice,
    updatedAt: new Date().toISOString(),
    trades: updates,
  });
}

module.exports = {
  emitTradeUpdatesForSymbol,
};