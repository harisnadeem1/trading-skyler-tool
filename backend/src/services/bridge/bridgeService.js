const pool = require('../../config/db');
const { generateRawToken, hashToken } = require('./bridgeTokenService');

const { refreshSubscriptions, getTradesForSymbol } = require('../marketData/subscriptionManager');
const { getPrice } = require('../marketData/priceCache');
const { processLivePriceUpdate } = require('../marketData/tradeMonitorService');
const { emitTradeUpdatesForSymbol } = require('../marketData/liveTradeEmitter');

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSymbol(execOrOrder) {
  const secType = String(execOrOrder?.secType || '').toUpperCase();
  const localSymbol = String(execOrOrder?.localSymbol || '').trim();
  const symbol = String(execOrOrder?.symbol || '').trim().toUpperCase();

  if (secType === 'CASH' && localSymbol.includes('.')) {
    return localSymbol.replace('.', '/').toUpperCase();
  }

  return symbol;
}

function deriveDirection(entryPrice, stopPrice) {
  return stopPrice < entryPrice ? 'long' : 'short';
}

async function syncLiveMarketForEntry(userid, entry) {
  if (!entry?.ticker) return;

  try {
    await refreshSubscriptions();

    const cachedPrice = getPrice(entry.ticker);
    const tradesForSymbol = getTradesForSymbol(entry.ticker);

    if (cachedPrice && Number.isFinite(Number(cachedPrice.price))) {
      emitTradeUpdatesForSymbol(
        entry.ticker,
        Number(cachedPrice.price),
        tradesForSymbol
      );

      await processLivePriceUpdate({
        symbol: entry.ticker,
        price: Number(cachedPrice.price),
        timestamp: cachedPrice.timestamp || new Date().toISOString(),
        tick: cachedPrice,
        trades: [
          {
            id: entry.id,
            user_id: userid,
            ticker: entry.ticker,
            direction: entry.direction,
            entry_price: entry.entry_price,
            stop_price: entry.stop_price,
            target_price: entry.target_price,
            original_stop: entry.original_stop,
            current_stop: entry.current_stop,
            shares: entry.shares,
            original_shares: entry.original_shares,
            remaining_shares: entry.remaining_shares,
            position_size: entry.position_size,
            risk_dollars: entry.risk_dollars,
            risk_percent: entry.risk_percent,
            stop_distance: entry.stop_distance,
            status: entry.status,
            opened_at: entry.opened_at,
            updated_at: entry.updated_at,
          },
        ],
      });
    }
  } catch (error) {
    console.error('[Bridge] syncLiveMarketForEntry error:', error);
  }
}

async function registerBridge(userid, label) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  await pool.query(
    `INSERT INTO broker_bridge_clients (userid, brokername, bridge_token_hash, client_label)
     VALUES ($1, 'ibkr', $2, $3)
     ON CONFLICT (userid, brokername)
     DO UPDATE SET bridge_token_hash = $2, client_label = $3, updatedat = now()`,
    [userid, tokenHash, label || null]
  );

  return { bridgeToken: rawToken };
}

async function getBridgeStatus(userid) {
  const result = await pool.query(
    `SELECT client_label, last_seen_at, status
     FROM broker_bridge_clients
     WHERE userid = $1 AND brokername = 'ibkr'
     LIMIT 1`,
    [userid]
  );

  if (!result.rows.length) {
    return { registered: false };
  }

  const row = result.rows[0];
  const isOnline =
    row.last_seen_at &&
    Date.now() - new Date(row.last_seen_at).getTime() < 30000;

  return {
    registered: true,
    status: isOnline ? 'online' : 'offline',
    lastSeenAt: row.last_seen_at,
    clientLabel: row.client_label || null,
  };
}

async function getBridgeClientFromToken(rawToken) {
  const tokenHash = hashToken(rawToken);

  const result = await pool.query(
    `SELECT *
     FROM broker_bridge_clients
     WHERE bridge_token_hash = $1 AND brokername = 'ibkr'
     LIMIT 1`,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function touchHeartbeat(bridgeClientId) {
  await pool.query(
    `UPDATE broker_bridge_clients
     SET last_seen_at = now(),
         status = 'online',
         updatedat = now()
     WHERE id = $1`,
    [bridgeClientId]
  );
}

async function resolveBrokerConnection(userid) {
  const found = await pool.query(
    `SELECT id
     FROM broker_connections
     WHERE userid = $1 AND brokername = 'ibkr'
     LIMIT 1`,
    [userid]
  );

  if (found.rows[0]?.id) {
    return found.rows[0].id;
  }

  const created = await pool.query(
    `INSERT INTO broker_connections (
       userid, brokername, status, authmode, connectedat, createdat, updatedat
     )
     VALUES ($1, 'ibkr', 'connected', 'gateway', now(), now(), now())
     ON CONFLICT (userid, brokername)
     DO UPDATE SET
       status = 'connected',
       connectedat = COALESCE(broker_connections.connectedat, now()),
       updatedat = now()
     RETURNING id`,
    [userid]
  );

  return created.rows[0].id;
}

async function upsertOpenOrder(userid, order) {
  await pool.query(
    `
    INSERT INTO broker_open_orders (
      userid,
      brokername,
      ibkr_order_id,
      parent_order_id,
      perm_id,
      symbol,
      local_symbol,
      sec_type,
      action,
      order_type,
      quantity,
      lmt_price,
      aux_price,
      status,
      raw_payload,
      created_at,
      updated_at
    )
    VALUES (
      $1, 'ibkr', $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14::jsonb, now(), now()
    )
    ON CONFLICT (userid, brokername, ibkr_order_id)
    DO UPDATE SET
      parent_order_id = EXCLUDED.parent_order_id,
      perm_id = EXCLUDED.perm_id,
      symbol = EXCLUDED.symbol,
      local_symbol = EXCLUDED.local_symbol,
      sec_type = EXCLUDED.sec_type,
      action = EXCLUDED.action,
      order_type = EXCLUDED.order_type,
      quantity = EXCLUDED.quantity,
      lmt_price = EXCLUDED.lmt_price,
      aux_price = EXCLUDED.aux_price,
      status = EXCLUDED.status,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = now()
    `,
    [
      userid,
      String(order.orderId),
      order.parentId !== undefined && order.parentId !== null ? String(order.parentId) : null,
      order.permId !== undefined && order.permId !== null ? String(order.permId) : null,
      normalizeSymbol(order),
      order.localSymbol || null,
      order.secType || null,
      order.action || null,
      order.orderType || null,
      toNumberOrNull(order.totalQuantity),
      toNumberOrNull(order.lmtPrice),
      toNumberOrNull(order.auxPrice),
      order.status || null,
      JSON.stringify(order),
    ]
  );
}

async function getChildOrdersForExecution(userid, orderId, symbol) {
  const result = await pool.query(
    `
    SELECT *
    FROM broker_open_orders
    WHERE userid = $1
      AND brokername = 'ibkr'
      AND (
        parent_order_id = $2
        OR ibkr_order_id = $2
      )
      AND symbol = $3
    ORDER BY updated_at DESC
    `,
    [userid, String(orderId), symbol]
  );

  return result.rows;
}

async function journalEntryExistsForBrokerTrade(brokerTradeId) {
  const result = await pool.query(
    `SELECT id
     FROM journal_entries
     WHERE broker_trade_id = $1
     LIMIT 1`,
    [brokerTradeId]
  );

  return !!result.rows[0];
}

async function createJournalEntryFromBridge(userid, payload) {
  const exists = await pool.query(
    `SELECT id
     FROM journal_entries
     WHERE broker_trade_id = $1
     LIMIT 1`,
    [payload.broker_trade_id]
  );

  if (exists.rows[0]) {
    return null;
  }

  const result = await pool.query(
    `
    INSERT INTO journal_entries (
      user_id,
      broker_trade_id,
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
      total_realized_pnl,
      notes,
      thesis,
      wizard_complete,
      wizard_skipped,
      opened_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20,
      $21, $22, $23
    )
    RETURNING *
    `,
    [
      userid,
      payload.broker_trade_id,
      payload.ticker,
      payload.direction,
      payload.entry_price,
      payload.stop_price,
      payload.target_price,
      payload.stop_price,
      payload.stop_price,
      payload.shares,
      payload.shares,
      payload.shares,
      payload.position_size,
      payload.risk_dollars,
      payload.risk_percent,
      payload.stop_distance,
      'open',
      0,
      null,
      null,
      false,
      JSON.stringify([]),
      payload.opened_at,
    ]
  );

  return result.rows[0] || null;
}

async function tryCreateJournalEntryFromExecution(userid, brokerTradeId, exec) {
  if (await journalEntryExistsForBrokerTrade(brokerTradeId)) {
    return { created: false, reason: 'exists' };
  }

  const ticker = normalizeSymbol(exec);
  const entryPrice = toNumberOrNull(exec.price);
  const shares = toNumberOrNull(exec.shares);

  if (!ticker || !entryPrice || !shares) {
    return { created: false, reason: 'missing_execution_basics' };
  }

  const orders = await getChildOrdersForExecution(userid, exec.orderId, ticker);

  const stopOrder = orders.find((o) => {
    const type = String(o.order_type || '').toUpperCase();
    return (type === 'STP' || type === 'STP LMT' || type === 'STP_LMT') && toNumberOrNull(o.aux_price) > 0;
  });

  if (!stopOrder) {
    return { created: false, reason: 'stop_not_found' };
  }

  const targetOrder = orders.find((o) => {
    const type = String(o.order_type || '').toUpperCase();
    return type === 'LMT' && toNumberOrNull(o.lmt_price) > 0;
  });

  const stopPrice = toNumberOrNull(stopOrder.aux_price);
  const targetPrice = targetOrder ? toNumberOrNull(targetOrder.lmt_price) : null;

  if (!stopPrice) {
    return { created: false, reason: 'invalid_stop' };
  }

  const direction = deriveDirection(entryPrice, stopPrice);
  const positionSize = Number((shares * entryPrice).toFixed(8));
  const stopDistance = entryPrice > 0
    ? Number((((Math.abs(entryPrice - stopPrice)) / entryPrice) * 100).toFixed(8))
    : null;
  const riskDollars = Number((shares * Math.abs(entryPrice - stopPrice)).toFixed(8));

  let riskPercent = null;
  const settingsRes = await pool.query(
    `SELECT current_account_size
     FROM user_settings
     WHERE user_id = $1
     LIMIT 1`,
    [userid]
  );

  const accountSize = toNumberOrNull(settingsRes.rows[0]?.current_account_size);
  if (accountSize && accountSize > 0) {
    riskPercent = Number(((riskDollars / accountSize) * 100).toFixed(8));
  }

  const payload = {
    broker_trade_id: brokerTradeId,
    ticker,
    direction,
    entry_price: entryPrice,
    stop_price: stopPrice,
    target_price: targetPrice,
    shares,
    position_size: positionSize,
    risk_dollars: riskDollars,
    risk_percent: riskPercent,
    stop_distance: stopDistance,
    opened_at: exec.time ? new Date(exec.time).toISOString() : new Date().toISOString(),
  };

  console.log('[Bridge] create from execution payload:', payload);

  const entry = await createJournalEntryFromBridge(userid, payload);

if (entry) {
  await syncLiveMarketForEntry(userid, entry);
}

return {
  created: !!entry,
  entry: entry || null,
};
}
async function findOpenJournalEntryForManualClose(userid, exec) {
  const ticker = normalizeSymbol(exec);
  const side = String(exec.side || '').toUpperCase();

  if (!ticker || !['BUY', 'SELL'].includes(side)) {
    return null;
  }

  const expectedDirection = side === 'SELL' ? 'long' : 'short';

  const result = await pool.query(
    `
    SELECT *
    FROM journal_entries
    WHERE user_id = $1
      AND ticker = $2
      AND direction = $3
      AND status IN ('open', 'trimmed')
      AND COALESCE(remaining_shares, 0) > 0
    ORDER BY opened_at DESC, created_at DESC
    LIMIT 1
    `,
    [userid, ticker, expectedDirection]
  );

  return result.rows[0] || null;
}

async function isBracketChildExecution(userid, exec) {
  if (exec?.orderId === undefined || exec?.orderId === null) {
    return false;
  }

  const result = await pool.query(
    `
    SELECT id, parent_order_id, order_type
    FROM broker_open_orders
    WHERE userid = $1
      AND brokername = 'ibkr'
      AND ibkr_order_id = $2
    LIMIT 1
    `,
    [userid, String(exec.orderId)]
  );

  const row = result.rows[0];
  if (!row) return false;

  const orderType = String(row.order_type || '').toUpperCase();
  return !!row.parent_order_id || orderType === 'STP' || orderType === 'STP LMT' || orderType === 'STP_LMT' || orderType === 'LMT';
}



async function applyManualCloseFromExecution(userid, exec) {
  const entry = await findOpenJournalEntryForManualClose(userid, exec);
  if (!entry) {
    return { matched: false, reason: 'manual_close_entry_not_found' };
  }

  const sharesClosed = toNumberOrNull(exec.shares);
  const exitPrice = toNumberOrNull(exec.price);
  const exitDate = exec.time ? new Date(exec.time).toISOString() : new Date().toISOString();
  const remainingShares = toNumberOrNull(entry.remaining_shares);

  

  if (!sharesClosed || !exitPrice || !remainingShares) {
    return { matched: false, reason: 'manual_close_invalid_values' };
  }

  const eventType = sharesClosed >= remainingShares ? 'close' : 'trim';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockedEntryRes = await client.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [entry.id, userid]
    );

    const lockedEntry = lockedEntryRes.rows[0];
    if (!lockedEntry) {
      await client.query('ROLLBACK');
      return { matched: false, reason: 'manual_close_entry_missing_after_lock' };
    }

    const lockedRemainingShares = toNumberOrNull(lockedEntry.remaining_shares);
    if (!lockedRemainingShares || lockedRemainingShares <= 0) {
      await client.query('ROLLBACK');
      return { matched: false, reason: 'manual_close_no_remaining_shares' };
    }

    const normalizedSharesClosed = Math.min(sharesClosed, lockedRemainingShares);
    const direction = String(lockedEntry.direction || 'long').toLowerCase();

    const pnl =
      direction === 'short'
        ? (Number(lockedEntry.entry_price) - exitPrice) * normalizedSharesClosed
        : (exitPrice - Number(lockedEntry.entry_price)) * normalizedSharesClosed;

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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        lockedEntry.id,
        userid,
        eventType,
        exitDate,
        normalizedSharesClosed,
        exitPrice,
        null,
        pnl,
        eventType === 'trim'
          ? Number(((normalizedSharesClosed / Number(lockedEntry.original_shares || lockedEntry.shares || normalizedSharesClosed)) * 100).toFixed(2))
          : null,
      ]
    );

    const nextRemainingShares = Math.max(0, lockedRemainingShares - normalizedSharesClosed);
    const totalRealizedPnL = Number(lockedEntry.total_realized_pnl ?? 0) + pnl;
    const nextStatus = nextRemainingShares === 0 ? 'closed' : 'trimmed';

    const updatedEntryRes = await client.query(
      `
      UPDATE journal_entries
      SET
        remaining_shares = $3,
        status = $4,
        exit_price = CASE WHEN $4 = 'closed' THEN $5 ELSE exit_price END,
        exit_date = CASE WHEN $4 = 'closed' THEN $6 ELSE exit_date END,
        total_realized_pnl = $7,
        pnl = CASE WHEN $4 = 'closed' THEN $7 ELSE pnl END
      WHERE id = $1 AND user_id = $2
      RETURNING *
      `,
      [
        lockedEntry.id,
        userid,
        nextRemainingShares,
        nextStatus,
        nextStatus === 'closed' ? exitPrice : null,
        nextStatus === 'closed' ? exitDate : null,
        totalRealizedPnL,
      ]
    );

    await client.query('COMMIT');

    const updatedEntry = updatedEntryRes.rows[0];
    await syncLiveMarketForEntry(userid, updatedEntry);

    return {
      matched: true,
      eventType,
      exit: exitInsert.rows[0],
      entry: updatedEntry,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function hasOpenOrderRecord(userid, exec) {
  if (exec?.orderId === undefined || exec?.orderId === null) {
    return false;
  }

  const result = await pool.query(
    `
    SELECT id
    FROM broker_open_orders
    WHERE userid = $1
      AND brokername = 'ibkr'
      AND ibkr_order_id = $2
    LIMIT 1
    `,
    [userid, String(exec.orderId)]
  );

  return !!result.rows[0];
}

async function ingestExecutions(userid, executions) {
  const brokerConnectionId = await resolveBrokerConnection(userid);
  let imported = 0;
  let journalCreated = 0;
  let journalExited = 0;
  const skipped = [];

  for (const exec of executions) {
    const side = String(exec.side || '').toUpperCase();
    const isPossibleEntrySide = side === 'BUY' || side === 'SELL';

    const insertResult = await pool.query(
      `
      INSERT INTO broker_trades
        (
          userid,
          brokerconnectionid,
          ibkrexecutionid,
          ibkrorderid,
          symbol,
          side,
          quantity,
          price,
          executedat,
          commission,
          currency,
          source
        )
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'tws_bridge')
      ON CONFLICT (userid, ibkrexecutionid)
      DO NOTHING
      RETURNING id
      `,
      [
        userid,
        brokerConnectionId,
        exec.execId,
        exec.orderId != null ? String(exec.orderId) : null,
        normalizeSymbol(exec),
        exec.side,
        toNumberOrNull(exec.shares),
        toNumberOrNull(exec.price),
        exec.time ? new Date(exec.time) : new Date(),
        toNumberOrNull(exec.commission) ?? 0,
        exec.currency || 'USD',
      ]
    );

    const brokerTradeId = insertResult.rows[0]?.id;
    if (!brokerTradeId) {
      skipped.push({ execId: exec.execId, reason: 'duplicate_execution' });
      continue;
    }

    imported++;

    try {
      const manualCloseResult = await applyManualCloseFromExecution(userid, exec);

      if (manualCloseResult.matched) {
        journalExited++;
        continue;
      }

      const journalResult = await tryCreateJournalEntryFromExecution(userid, brokerTradeId, exec);

      if (journalResult.created) {
        journalCreated++;
      } else {
        if (
          isPossibleEntrySide &&
          journalResult.reason === 'stop_not_found' &&
          await hasOpenOrderRecord(userid, exec)
        ) {
          skipped.push({
            execId: exec.execId,
            reason: 'entry_execution_waiting_for_bracket_resolution',
          });
          continue;
        }

        skipped.push({
          execId: exec.execId,
          reason: manualCloseResult.reason || journalResult.reason,
        });
      }
    } catch (error) {
      console.error('[Bridge] ingestExecutions journal error:', error);
      skipped.push({
        execId: exec.execId,
        reason: 'journal_create_failed',
        error: error.message,
      });
    }
  }

  return { imported, journalCreated, journalExited, skipped };
}

async function ingestPositions(userid, positions) {
  return { received: positions.length };
}

async function ingestOpenOrders(userid, orders) {
  let received = 0;
  let journalCreated = 0;
  const skipped = [];

  for (const order of orders) {
    if (order?.orderId === undefined || order?.orderId === null) continue;

    console.log('[Bridge] OPEN ORDER incoming:', order);

    await upsertOpenOrder(userid, order);
    received++;

    const orderType = String(order.orderType || '').toUpperCase();
    const isStopChild =
      (orderType === 'STP' || orderType === 'STP LMT' || orderType === 'STP_LMT') &&
      order.parentId !== undefined &&
      order.parentId !== null &&
      toNumberOrNull(order.auxPrice) > 0;

    console.log('[Bridge] isStopChild?', {
      orderId: order.orderId,
      parentId: order.parentId,
      orderType: order.orderType,
      auxPrice: order.auxPrice,
      isStopChild,
    });

    if (!isStopChild) {
      continue;
    }

    try {
      const parentOrderId = String(order.parentId);
      const symbol = normalizeSymbol(order);

      console.log('[Bridge] Looking for broker trade with:', {
        userid,
        parentOrderId,
        symbol,
      });

      const btRes = await pool.query(
        `
        SELECT id, ibkrexecutionid, ibkrorderid, symbol, quantity, price, executedat, side, currency
        FROM broker_trades
        WHERE userid = $1
          AND ibkrorderid = $2
          AND symbol = $3
        ORDER BY executedat DESC
        LIMIT 1
        `,
        [userid, parentOrderId, symbol]
      );

      const brokerTrade = btRes.rows[0];
      console.log('[Bridge] brokerTrade found:', brokerTrade);

      if (!brokerTrade) {
        skipped.push({
          orderId: order.orderId,
          reason: 'parent_broker_trade_not_found',
        });
        continue;
      }

      const alreadyExists = await journalEntryExistsForBrokerTrade(brokerTrade.id);
      console.log('[Bridge] journal exists already?', alreadyExists);

      if (alreadyExists) {
        skipped.push({
          orderId: order.orderId,
          reason: 'journal_already_exists_for_parent',
        });
        continue;
      }

      const entryPrice = toNumberOrNull(brokerTrade.price);
      const stopPrice = toNumberOrNull(order.auxPrice);
      const shares = toNumberOrNull(brokerTrade.quantity);

      if (!entryPrice || !stopPrice || !shares) {
        skipped.push({
          orderId: order.orderId,
          reason: 'invalid_execution_or_stop_for_parent',
        });
        continue;
      }

      const direction = deriveDirection(entryPrice, stopPrice);
      const positionSize = Number((shares * entryPrice).toFixed(8));
      const riskDollars = Number((shares * Math.abs(entryPrice - stopPrice)).toFixed(8));
      const stopDistance =
        entryPrice > 0
          ? Number(((Math.abs(entryPrice - stopPrice) / entryPrice) * 100).toFixed(8))
          : null;

      let riskPercent = null;
      const settingsRes = await pool.query(
        `SELECT current_account_size
         FROM user_settings
         WHERE user_id = $1
         LIMIT 1`,
        [userid]
      );
      const accountSize = toNumberOrNull(settingsRes.rows[0]?.current_account_size);
      if (accountSize && accountSize > 0) {
        riskPercent = Number(((riskDollars / accountSize) * 100).toFixed(8));
      }

      const payload = {
        broker_trade_id: brokerTrade.id,
        ticker: normalizeSymbol(order),
        direction,
        entry_price: entryPrice,
        stop_price: stopPrice,
        target_price: null,
        shares,
        position_size: positionSize,
        risk_dollars: riskDollars,
        risk_percent: riskPercent,
        stop_distance: stopDistance,
        opened_at: brokerTrade.executedat || new Date().toISOString(),
      };

      console.log('[Bridge] payload to create journal:', payload);

      const entry = await createJournalEntryFromBridge(userid, payload);
console.log('[Bridge] created entry:', entry);

if (entry) {
  await syncLiveMarketForEntry(userid, entry);
  journalCreated++;
} else {
  skipped.push({
    orderId: order.orderId,
    reason: 'journal_insert_failed_for_parent',
  });
}
    } catch (err) {
      console.error('[Bridge] ingestOpenOrders error:', err);
      skipped.push({
        orderId: order.orderId,
        reason: 'journal_create_exception_for_parent',
        error: err.message,
      });
    }
  }

  return { received, journalCreated, skipped };
}

module.exports = {
  registerBridge,
  getBridgeStatus,
  getBridgeClientFromToken,
  touchHeartbeat,
  ingestExecutions,
  ingestPositions,
  ingestOpenOrders,
};