const pool = require('../../config/db');
const { getPrice, hasFreshPrice } = require('./priceCache');
const { reloadOpenTrades } = require('./subscriptionManager');
const {
  calculateUnrealizedPnL,
  calculateCurrentR,
  calculateUnrealizedPnLPercent,
} = require('./tradeMonitorService');
const finnhubService = require('./finnhubService');

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isStopHit(trade, currentPrice) {
  const stop = toNumber(trade.stop_price);
  if ((trade.direction || 'long') === 'short') {
    return currentPrice >= stop;
  }
  return currentPrice <= stop;
}

function isTargetHit(trade, currentPrice) {
  const target = trade.target_price == null ? null : Number(trade.target_price);
  if (!Number.isFinite(target)) return false;

  if ((trade.direction || 'long') === 'short') {
    return currentPrice <= target;
  }
  return currentPrice >= target;
}

function calculateRealizedPnL(trade, exitPrice) {
  const entryPrice = toNumber(trade.entry_price);
  const sharesToClose = toNumber(trade.remaining_shares ?? trade.shares);

  if ((trade.direction || 'long') === 'short') {
    return (entryPrice - exitPrice) * sharesToClose;
  }

  return (exitPrice - entryPrice) * sharesToClose;
}

function calculateCloseRMultiple(trade, realizedPnL) {
  const riskDollars = toNumber(trade.risk_dollars);
  if (!riskDollars) return null;
  return realizedPnL / riskDollars;
}

async function insertAlertIfNeededWithClient(client, trade, alertType, triggerPrice, message) {
  const { rows } = await client.query(
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
    [trade.id, trade.user_id, alertType, triggerPrice, message]
  );

  return rows[0] || null;
}

async function saveSnapshot(trade, currentPrice, snapshottype = 'interval') {
  const unrealizedPnL = calculateUnrealizedPnL(trade, currentPrice);
  const currentR = calculateCurrentR(trade, unrealizedPnL);
  const unrealizedPnLPercent = calculateUnrealizedPnLPercent(trade, unrealizedPnL);

  const { rows } = await pool.query(
    `
    INSERT INTO trade_price_snapshots (
      journalentryid,
      userid,
      snapshotprice,
      snapshottype,
      unrealizedpnl,
      unrealizedpnlpercent,
      currentr
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [
      trade.id,
      trade.user_id,
      currentPrice,
      snapshottype,
      unrealizedPnL,
      unrealizedPnLPercent,
      currentR,
    ]
  );

  return rows[0];
}

async function getLatestPriceForTrade(trade) {
  const staleMinutes = Number(process.env.MARKET_DATA_STALE_MINUTES || 20);

  if (hasFreshPrice(trade.ticker, staleMinutes)) {
    const cached = getPrice(trade.ticker);
    return Number(cached.price);
  }

  const quote = await finnhubService.fetchQuote(trade.ticker);
  const currentPrice = Number(quote.c);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return null;
  }

  return currentPrice;
}

async function closeTradeFromMarketEvent(trade, exitPrice, alertType) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const normalizedExitPrice = Number(exitPrice);
    const sharesToClose = toNumber(trade.remaining_shares ?? trade.shares);
    const realizedPnL = calculateRealizedPnL(trade, normalizedExitPrice);
    const rMultiple = calculateCloseRMultiple(trade, realizedPnL);

    const alertMessage =
      alertType === 'stop_hit'
        ? `${trade.ticker} ${trade.direction} hit stop at ${normalizedExitPrice}`
        : `${trade.ticker} ${trade.direction} hit target at ${normalizedExitPrice}`;

    const alert = await insertAlertIfNeededWithClient(
      client,
      trade,
      alertType,
      normalizedExitPrice,
      alertMessage
    );

    await client.query(
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
      VALUES ($1, $2, 'close', now(), $3, $4, $5, $6, 100)
      `,
      [
        trade.id,
        trade.user_id,
        sharesToClose,
        normalizedExitPrice,
        rMultiple,
        realizedPnL,
      ]
    );

    const { rows } = await client.query(
      `
      UPDATE journal_entries
      SET
        status = 'closed',
        exit_price = $2,
        exit_date = now(),
        pnl = $3,
        total_realized_pnl = COALESCE(total_realized_pnl, 0) + $3,
        remaining_shares = 0,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [trade.id, normalizedExitPrice, realizedPnL]
    );

    await client.query('COMMIT');

    return {
      alert,
      closedTrade: rows[0],
      realizedPnL,
      rMultiple,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runSnapshotCycle() {
  const trades = await reloadOpenTrades();
  const results = [];

  console.log(`[snapshotService] checking ${trades.length} open/trimmed trade(s)`);

  for (const trade of trades) {
    try {
      const currentPrice = await getLatestPriceForTrade(trade);

      if (!currentPrice || Number(currentPrice) <= 0) {
        console.log(
          `[snapshotService] skipped ${trade.ticker} trade ${trade.id} - invalid price: ${currentPrice}`
        );
        continue;
      }

      const snapshot = await saveSnapshot(trade, currentPrice, 'interval');

      let marketCloseResult = null;

      if (isStopHit(trade, currentPrice)) {
        marketCloseResult = await closeTradeFromMarketEvent(trade, currentPrice, 'stop_hit');
      } else if (isTargetHit(trade, currentPrice)) {
        marketCloseResult = await closeTradeFromMarketEvent(trade, currentPrice, 'target_hit');
      }

      results.push({
        tradeId: trade.id,
        symbol: trade.ticker,
        snapshot,
        marketCloseResult,
      });

      console.log(
        `[snapshotService] saved snapshot for ${trade.ticker} trade ${trade.id} at ${currentPrice}`
      );

      if (marketCloseResult?.closedTrade) {
        console.log(
          `[snapshotService] closed ${trade.ticker} trade ${trade.id} via ${marketCloseResult.alert?.alerttype || 'market event'} with pnl ${marketCloseResult.realizedPnL}`
        );
      }
    } catch (error) {
      console.error(
        `[snapshotService] failed for ${trade.ticker} trade ${trade.id}:`,
        error.message
      );
    }
  }

  return results;
}

module.exports = {
  runSnapshotCycle,
  saveSnapshot,
  closeTradeFromMarketEvent,
  calculateRealizedPnL,
};