const pool = require('../../config/db');
const { closeTradeFromMarketEvent } = require('./tradeExecutionService');
const { broadcastToUser } = require('./liveStream');

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDirection(direction) {
  return String(direction || 'long').trim().toLowerCase() === 'short'
    ? 'short'
    : 'long';
}

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === '') {
    return null;
  }
  return String(userId);
}

function hasLiveSymbol(trade) {
  return String(trade?.ticker || '').trim().length > 0;
}

function calculateUnrealizedPnL(trade, currentPrice) {
  const entryPrice = toNumber(trade.entry_price);
  const shares = toNumber(trade.remaining_shares ?? trade.shares);
  const direction = normalizeDirection(trade.direction);

  if (direction === 'short') {
    return (entryPrice - currentPrice) * shares;
  }

  return (currentPrice - entryPrice) * shares;
}

function calculateCurrentR(trade, unrealizedPnL) {
  const riskDollars = toNumber(trade.risk_dollars);
  if (!riskDollars) return null;
  return unrealizedPnL / riskDollars;
}

function calculateUnrealizedPnLPercent(trade, unrealizedPnL) {
  const positionSize = toNumber(trade.position_size);
  if (!positionSize) return null;
  return (unrealizedPnL / positionSize) * 100;
}

function isStopHit(trade, currentPrice) {
  const stopPrice = toNumber(trade.current_stop ?? trade.stop_price, NaN);
  const direction = normalizeDirection(trade.direction);

  if (!Number.isFinite(stopPrice)) return false;

  return direction === 'short'
    ? currentPrice >= stopPrice
    : currentPrice <= stopPrice;
}

function getTargetPrice(trade) {
  const raw = trade.target_price ?? trade.targetPrice ?? null;

  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const target = Number(raw);

  if (!Number.isFinite(target) || target <= 0) {
    return null;
  }

  return target;
}

function hasTarget(trade) {
  return getTargetPrice(trade) !== null;
}

function isTargetHit(trade, currentPrice) {
  const targetPrice = getTargetPrice(trade);
  const direction = normalizeDirection(trade.direction);

  if (targetPrice === null) return false;

  return direction === 'short'
    ? currentPrice <= targetPrice
    : currentPrice >= targetPrice;
}

async function recordAlertIfNeeded({
  journalEntryId,
  userId,
  alertType,
  triggerPrice,
  message,
}) {
  const { rows } = await pool.query(
    `
    INSERT INTO trade_alerts (
      journalentryid,
      userid,
      alerttype,
      triggerprice,
      message
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (journalentryid, alerttype) DO NOTHING
    RETURNING *
    `,
    [journalEntryId, userId, alertType, triggerPrice, message]
  );

  return rows[0] || null;
}

async function processLivePriceUpdate({
  symbol,
  price,
  timestamp,
  tick,
  trades = [],
}) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const currentPrice = toNumber(price, NaN);

  if (!normalizedSymbol || !Number.isFinite(currentPrice)) {
    // console.log('[tradeMonitorService] skipped invalid price update:', {
    //   symbol,
    //   price,
    //   timestamp,
    // });
    return [];
  }

  if (!Array.isArray(trades) || !trades.length) {
    return [];
  }

  // console.log(
  //   `[tradeMonitorService] processing ${normalizedSymbol} @ ${currentPrice} | matched trades: ${trades.length}`
  // );

  const triggered = [];

  for (const trade of trades) {
    const userId = normalizeUserId(trade.user_id);

    if (!userId || !hasLiveSymbol(trade)) {
      continue;
    }

    const unrealizedPnL = calculateUnrealizedPnL(trade, currentPrice);
    const currentR = calculateCurrentR(trade, unrealizedPnL);
    const unrealizedPnLPercent = calculateUnrealizedPnLPercent(trade, unrealizedPnL);
    const tradeHasTarget = hasTarget(trade);
    const stopHit = isStopHit(trade, currentPrice);
    const targetHit = tradeHasTarget && isTargetHit(trade, currentPrice);

    try {
      if (stopHit) {
        const result = await closeTradeFromMarketEvent({
          trade,
          currentPrice,
          timestamp,
          reason: 'stop_hit',
        });

        triggered.push({
          type: 'trade_closed',
          reason: 'stop_hit',
          tradeId: trade.id,
          userId,
          symbol: normalizedSymbol,
          timestamp,
          currentPrice,
          unrealizedPnL,
          unrealizedPnLPercent,
          currentR,
          result,
        });

        continue;
      }

      if (targetHit) {
        const result = await closeTradeFromMarketEvent({
          trade,
          currentPrice,
          timestamp,
          reason: 'target_hit',
        });

        triggered.push({
          type: 'trade_closed',
          reason: 'target_hit',
          tradeId: trade.id,
          userId,
          symbol: normalizedSymbol,
          timestamp,
          currentPrice,
          unrealizedPnL,
          unrealizedPnLPercent,
          currentR,
          result,
        });

        continue;
      }

      if (!tradeHasTarget && currentR !== null && currentR >= 5) {
        const direction = normalizeDirection(trade.direction);
        const message = `${trade.ticker} ${direction} reached 5R at ${currentPrice}`;

        const alert = await recordAlertIfNeeded({
          journalEntryId: trade.id,
          userId: trade.user_id,
          alertType: 'five_r_hit',
          triggerPrice: currentPrice,
          message,
        });

        if (alert) {
          broadcastToUser(userId, 'trade-alert', {
            type: 'five_r_hit',
            tradeId: trade.id,
            userId,
            symbol: normalizedSymbol,
            direction,
            currentPrice,
            currentR,
            unrealizedPnL,
            unrealizedPnLPercent,
            message,
            createdAt: timestamp,
          });

          triggered.push({
            type: 'alert',
            reason: 'five_r_hit',
            tradeId: trade.id,
            userId,
            symbol: normalizedSymbol,
            timestamp,
            currentPrice,
            unrealizedPnL,
            unrealizedPnLPercent,
            currentR,
            alert,
          });
        }
      }
    } catch (error) {
      // console.error(
      //   `[tradeMonitorService] failed processing trade ${trade.id} (${trade.ticker})`,
      //   error
      // );
    }
  }

  return triggered;
}

module.exports = {
  calculateUnrealizedPnL,
  calculateCurrentR,
  calculateUnrealizedPnLPercent,
  isStopHit,
  isTargetHit,
  processLivePriceUpdate,
};