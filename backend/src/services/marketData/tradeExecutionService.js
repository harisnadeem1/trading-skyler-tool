const pool = require('../../config/db');

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDirection(direction) {
  return String(direction || 'long').trim().toLowerCase() === 'short'
    ? 'short'
    : 'long';
}

function getSubscriptionManager() {
  return require('./subscriptionManager');
}

function getLiveStream() {
  return require('./liveStream');
}

function calculateRealizedPnL(trade, exitPrice, sharesClosed) {
  const entryPrice = toNumber(trade.entry_price);
  const direction = normalizeDirection(trade.direction);

  if (direction === 'short') {
    return (entryPrice - exitPrice) * sharesClosed;
  }

  return (exitPrice - entryPrice) * sharesClosed;
}

function calculateRMultiple(trade, realizedPnL) {
  const riskDollars = toNumber(trade.risk_dollars, 0);
  if (!riskDollars) return null;
  return realizedPnL / riskDollars;
}

function calculatePercentTrimmed(trade, sharesClosed) {
  const originalShares = toNumber(trade.original_shares ?? trade.shares, 0);
  if (!originalShares) return null;
  return (sharesClosed / originalShares) * 100;
}

async function closeTradeFromMarketEvent({
  trade,
  currentPrice,
  timestamp,
  reason,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const lockedTradeResult = await client.query(
      `
      SELECT *
      FROM journal_entries
      WHERE id = $1
      FOR UPDATE
      `,
      [trade.id]
    );

    if (!lockedTradeResult.rowCount) {
      throw new Error(`Trade ${trade.id} not found`);
    }

    const lockedTrade = lockedTradeResult.rows[0];

    if (!['open', 'trimmed'].includes(lockedTrade.status)) {
      await client.query('ROLLBACK');
      return {
        skipped: true,
        reason: 'already_closed',
        tradeId: lockedTrade.id,
        status: lockedTrade.status,
      };
    }

    const sharesClosed = toNumber(
      lockedTrade.remaining_shares ?? lockedTrade.shares,
      0
    );

    if (!sharesClosed || sharesClosed <= 0) {
      await client.query('ROLLBACK');
      return {
        skipped: true,
        reason: 'no_remaining_shares',
        tradeId: lockedTrade.id,
      };
    }

    const exitPrice = toNumber(currentPrice);
    const realizedPnL = calculateRealizedPnL(
      lockedTrade,
      exitPrice,
      sharesClosed
    );
    const rMultiple = calculateRMultiple(lockedTrade, realizedPnL);
    const percentTrimmed = calculatePercentTrimmed(lockedTrade, sharesClosed);
    const nextTotalRealizedPnL =
      toNumber(lockedTrade.total_realized_pnl, 0) + realizedPnL;

    const normalizedDirection = normalizeDirection(lockedTrade.direction);

    const alertMessage =
      reason === 'stop_hit'
        ? `${lockedTrade.ticker} ${normalizedDirection} stopped out at ${exitPrice}`
        : `${lockedTrade.ticker} ${normalizedDirection} target hit at ${exitPrice}`;

    const alertInsert = await client.query(
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
      [
        lockedTrade.id,
        lockedTrade.user_id,
        reason,
        exitPrice,
        alertMessage,
      ]
    );

    const exitInsert = await client.query(
      `
      INSERT INTO journal_trade_exits (
        journal_entry_id,
        user_id,
        event_type,
        exit_date,
        shares_closed,
        exit_price,
        r_multiple,
        pnl,
        percent_trimmed
      )
      VALUES ($1, $2, 'close', $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        lockedTrade.id,
        lockedTrade.user_id,
        timestamp,
        sharesClosed,
        exitPrice,
        rMultiple,
        realizedPnL,
        percentTrimmed,
      ]
    );

    const tradeUpdate = await client.query(
      `
      UPDATE journal_entries
      SET
        status = 'closed',
        remaining_shares = 0,
        current_stop = COALESCE(current_stop, stop_price),
        exit_price = $2,
        exit_date = $3,
        pnl = $4,
        total_realized_pnl = $5
      WHERE id = $1
      RETURNING *
      `,
      [
        lockedTrade.id,
        exitPrice,
        timestamp,
        realizedPnL,
        nextTotalRealizedPnL,
      ]
    );

    await client.query('COMMIT');

    const { refreshSubscriptions } = getSubscriptionManager();
    await refreshSubscriptions();

    const { broadcast } = getLiveStream();
    broadcast('trade-closed', {
      tradeId: lockedTrade.id,
      userId: lockedTrade.user_id,
      symbol: String(lockedTrade.ticker || '').toUpperCase(),
      direction: normalizedDirection,
      reason,
      exitPrice,
      sharesClosed,
      realizedPnL,
      rMultiple,
      closedAt: timestamp,
      status: 'closed',
    });

    return {
      skipped: false,
      tradeId: lockedTrade.id,
      reason,
      exitPrice,
      sharesClosed,
      realizedPnL,
      rMultiple,
      alert: alertInsert.rows[0] || null,
      exit: exitInsert.rows[0],
      trade: tradeUpdate.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  closeTradeFromMarketEvent,
};