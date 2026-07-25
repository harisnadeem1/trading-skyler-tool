const pool = require('../../config/db');
const ibkrFlexService = require('./ibkrFlexService');
const ibkrFlexParser = require('./ibkrFlexParserService');

const TRADE_SYNC_COOLDOWN_SECONDS = Number(
  process.env.IBKR_FLEX_POLL_INTERVAL_SECONDS || 900
);

const HISTORY_SYNC_COOLDOWN_HOURS = Number(
  process.env.IBKR_FLEX_HISTORY_SYNC_HOURS || 12
);

function secondsSince(dateValue) {
  if (!dateValue) return null;
  const then = new Date(dateValue).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 1000);
}

function isTooManyRequestsError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('too many requests');
}

function roundFinalPnl(value) {
  if (value === null || value === undefined) return null;
  return Number(Number(value).toFixed(4));
}

async function saveConnection(userId, payload) {
  const sql = `
    INSERT INTO broker_connections (
      userid, brokername, authmode, status, flex_enabled,
      flex_token, flex_token_expires_at,
      flex_activity_query_id, flex_trade_confirm_query_id,
      connectedat, updatedat
    )
    VALUES (
      $1, 'ibkr', 'flex', 'connected', true,
      $2, $3, $4, $5, now(), now()
    )
    ON CONFLICT (userid, brokername)
    DO UPDATE SET
      authmode = 'flex',
      flex_enabled = true,
      flex_token = EXCLUDED.flex_token,
      flex_token_expires_at = EXCLUDED.flex_token_expires_at,
      flex_activity_query_id = EXCLUDED.flex_activity_query_id,
      flex_trade_confirm_query_id = EXCLUDED.flex_trade_confirm_query_id,
      status = 'connected',
      connectedat = COALESCE(broker_connections.connectedat, now()),
      updatedat = now()
  `;

  await pool.query(sql, [
    userId,
    payload.flexToken,
    payload.flexTokenExpiresAt,
    payload.activityQueryId,
    payload.tradeConfirmQueryId
  ]);
}

async function getConnectionByUser(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM broker_connections WHERE userid = $1 AND brokername = 'ibkr' LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getConnectionStatus(userId) {
  const conn = await getConnectionByUser(userId);

  return {
    connected: !!conn,
    flexEnabled: !!conn?.flex_enabled,
    authmode: conn?.authmode || null,
    status: conn?.status || 'disconnected',
    lastSyncAt: conn?.lastsyncat || null,
    flexLastTradeSyncAt: conn?.flex_last_trade_sync_at || null,
    flexLastHistorySyncAt: conn?.flex_last_history_sync_at || null,
    lastError: conn?.lasterror || null
  };
}

async function createSyncLog(userId, brokerConnectionId) {
  const { rows } = await pool.query(
    `INSERT INTO broker_sync_logs (userid, brokerconnectionid, status, startedat, createdat)
     VALUES ($1, $2, 'started', now(), now())
     RETURNING id`,
    [userId, brokerConnectionId]
  );
  return rows[0].id;
}

async function finishSyncLog(logId, status, recordsImported, errorMessage = null) {
  await pool.query(
    `UPDATE broker_sync_logs
     SET status = $2, finishedat = now(), recordsimported = $3, errormessage = $4
     WHERE id = $1`,
    [logId, status, recordsImported, errorMessage]
  );
}

async function upsertTrade(userId, brokerConnectionId, trade, source) {
  const sql = `
    INSERT INTO broker_trades (
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
      source,
      account_id,
      con_id,
      asset_category,
      trade_date,
      ibkr_transaction_id,
      ibkr_open_close_indicator,
      ibkr_order_ref,
      ibkr_code,
      source_details,
      raw_payload
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18, $19, $20,
      $21, $22
    )
    ON CONFLICT (userid, ibkrexecutionid)
    DO UPDATE SET
      ibkrorderid = EXCLUDED.ibkrorderid,
      commission = COALESCE(EXCLUDED.commission, broker_trades.commission),
      source = EXCLUDED.source,
      account_id = COALESCE(EXCLUDED.account_id, broker_trades.account_id),
      con_id = COALESCE(EXCLUDED.con_id, broker_trades.con_id),
      asset_category = COALESCE(EXCLUDED.asset_category, broker_trades.asset_category),
      trade_date = COALESCE(EXCLUDED.trade_date, broker_trades.trade_date),
      ibkr_transaction_id = COALESCE(EXCLUDED.ibkr_transaction_id, broker_trades.ibkr_transaction_id),
      ibkr_open_close_indicator = COALESCE(EXCLUDED.ibkr_open_close_indicator, broker_trades.ibkr_open_close_indicator),
      ibkr_order_ref = COALESCE(EXCLUDED.ibkr_order_ref, broker_trades.ibkr_order_ref),
      ibkr_code = COALESCE(EXCLUDED.ibkr_code, broker_trades.ibkr_code),
      source_details = EXCLUDED.source_details,
      raw_payload = EXCLUDED.raw_payload
    RETURNING id
  `;

  const values = [
    userId,
    brokerConnectionId,
    trade.ibkrExecutionId,
    trade.ibkrOrderId,
    trade.symbol,
    trade.side,
    trade.quantity,
    trade.price,
    trade.executedAt,
    trade.commission,
    trade.currency || 'USD',
    source,
    trade.accountId,
    trade.conId,
    trade.assetCategory,
    trade.tradeDate,
    trade.ibkrTransactionId,
    trade.ibkrOpenCloseIndicator,
    trade.ibkrOrderRef,
    trade.ibkrCode,
    JSON.stringify({
  import_source: source,
  fifoPnlRealized: trade.ibkrFifoPnlRealized,
  mtmPnl: trade.ibkrMtmPnl,
  proceeds: trade.ibkrProceeds,
  cost: trade.ibkrCost,
  netCash: trade.ibkrNetCash,
  tradeMoney: trade.ibkrTradeMoney
}),
    JSON.stringify(trade.rawPayload || {})
  ];

  const { rows } = await pool.query(sql, values);
  return rows[0].id;
}

async function applyLatestAccountSnapshotToUserSettings(client, userId, accountSnapshots) {
  if (!Array.isArray(accountSnapshots) || accountSnapshots.length === 0) return;

  const sorted = [...accountSnapshots].sort((a, b) => {
    const da = new Date(a.reportDate).getTime();
    const db = new Date(b.reportDate).getTime();
    return db - da;
  });

  const latest = sorted.find(x => x.total !== null && x.total !== undefined);
  if (!latest) return;

  const brokerCurrentAccountSize = Number(latest.total);
  if (brokerCurrentAccountSize === null) return;

  await client.query(
    `
    UPDATE user_settings
    SET broker_current_account_size = $2,
        broker_balance_as_of = $3,
        updated_at = now()
    WHERE user_id = $1
    `,
    [userId, brokerCurrentAccountSize, latest.reportDate]
  );
}



async function syncBrokerTradesToJournal(client, userId) {
  const { rows: brokerTrades } = await client.query(
    `
    SELECT bt.*
    FROM broker_trades bt
    LEFT JOIN journal_entries je ON je.broker_trade_id = bt.id
    LEFT JOIN journal_trade_exits jte ON jte.broker_trade_id = bt.id
    WHERE bt.userid = $1
      AND je.id IS NULL
      AND jte.id IS NULL
    ORDER BY bt.executedat ASC, bt.createdat ASC, bt.ibkrexecutionid ASC
    `,
    [userId]
  );

  let journalEntriesCreated = 0;
  let exitEventsCreated = 0;
  let skippedAmbiguousTrades = 0;
  let skippedNoMatchingOpenPosition = 0;

  for (const trade of brokerTrades) {
    const qty = Number(trade.quantity);
    const price = Number(trade.price);
    const ticker = String(trade.symbol || '').trim();
    const assetCategory = String(trade.asset_category || '').toUpperCase();

    if (!qty || Number.isNaN(qty) || !price || Number.isNaN(price) || !ticker) {
      skippedAmbiguousTrades += 1;
      continue;
    }

    if (assetCategory && assetCategory !== 'STK') {
      skippedAmbiguousTrades += 1;
      continue;
    }

    const side = String(trade.side || '').toUpperCase();
    const oci = String(trade.ibkr_open_close_indicator || '').toUpperCase();
    const code = String(trade.ibkr_code || '').toUpperCase();

    const codeFlags = code
      .split(';')
      .map(x => x.trim())
      .filter(Boolean);

    const hasOpenFlag = oci === 'O' || codeFlags.includes('O');
    const hasCloseFlag = oci === 'C' || codeFlags.includes('C');

    const isOpeningLong = side === 'BUY' && hasOpenFlag;
    const isOpeningShort = side === 'SELL' && hasOpenFlag;
    const isClosingLong = side === 'SELL' && hasCloseFlag;
    const isClosingShort = side === 'BUY' && hasCloseFlag;

    const canAutoJournal =
      isOpeningLong ||
      isOpeningShort ||
      isClosingLong ||
      isClosingShort;

    if (!canAutoJournal) {
      skippedAmbiguousTrades += 1;
      continue;
    }

    if (isOpeningLong || isOpeningShort) {
      const direction = isOpeningShort ? 'short' : 'long';

      const { rows: activeEntryRows } = await client.query(
        `
        SELECT je.*
        FROM journal_entries je
        WHERE je.user_id = $1
          AND je.ticker = $2
          AND je.direction = $3
          AND je.status IN ('open', 'trimmed')
          AND COALESCE(je.remaining_shares, 0) > 0
        ORDER BY je.opened_at DESC, je.created_at DESC, je.id DESC
        LIMIT 1
        `,
        [userId, ticker, direction]
      );

      if (activeEntryRows.length > 0) {
        const existing = activeEntryRows[0];

        const existingOriginalShares = Number(existing.original_shares || existing.shares || 0);
        const existingRemainingShares = Number(existing.remaining_shares || existing.shares || 0);
        const existingEntryPrice = Number(existing.entry_price || 0);
        const existingPositionSize = Number(
          existing.position_size || (existingEntryPrice * existingOriginalShares) || 0
        );

        const addedPositionSize = price * qty;
        const newOriginalShares = Number((existingOriginalShares + qty).toFixed(8));
        const newRemainingShares = Number((existingRemainingShares + qty).toFixed(8));
        const newPositionSize = Number((existingPositionSize + addedPositionSize).toFixed(8));
        const newAverageEntryPrice =
          newOriginalShares > 0
            ? Number((newPositionSize / newOriginalShares).toFixed(8))
            : price;

        const stopPrice =
          direction === 'short'
            ? Number((newAverageEntryPrice * 1.02).toFixed(8))
            : newAverageEntryPrice;

        await client.query(
          `
          UPDATE journal_entries
          SET shares = $2,
              original_shares = $3,
              remaining_shares = $2,
              position_size = $4,
              entry_price = $5,
              stop_price = $6,
              original_stop = $6,
              current_stop = $6,
              status = 'open',
              updated_at = now()
          WHERE id = $1
          `,
          [
            existing.id,
            newRemainingShares,
            newOriginalShares,
            newPositionSize,
            newAverageEntryPrice,
            stopPrice
          ]
        );

        continue;
      }

      const stopPrice =
        direction === 'short'
          ? Number((price * 1.02).toFixed(8))
          : price;

      const insertResult = await client.query(
        `
        INSERT INTO journal_entries (
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
          notes,
          thesis,
          wizard_complete,
          wizard_skipped,
          opened_at,
          created_at,
          updated_at,
          broker_trade_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          NULL,
          $5,
          $5,
          $6,
          $6,
          $6,
          $7,
          0,
          0,
          0,
          'open',
          $8,
          NULL,
          true,
          '[]'::jsonb,
          $9,
          now(),
          now(),
          $10
        )
        RETURNING id
        `,
        [
          userId,
          ticker,
          direction,
          price,
          stopPrice,
          qty,
          price * qty,
          direction === 'short'
            ? 'Imported from IBKR Flex (short)'
            : 'Imported from IBKR Flex',
          trade.executedat,
          trade.id
        ]
      );

      if (insertResult.rows[0]) {
        journalEntriesCreated += 1;
      }

      continue;
    }

    const targetDirection = isClosingShort ? 'short' : 'long';
    let remainingToClose = qty;
    let matchedAnyOpenEntry = false;

    const { rows: openEntries } = await client.query(
      `
      SELECT *
      FROM journal_entries
      WHERE user_id = $1
        AND ticker = $2
        AND direction = $3
        AND status IN ('open', 'trimmed')
        AND COALESCE(remaining_shares, 0) > 0
      ORDER BY opened_at ASC, created_at ASC, id ASC
      `,
      [userId, ticker, targetDirection]
    );

    if (openEntries.length === 0) {
      skippedNoMatchingOpenPosition += 1;
      continue;
    }

    for (const entry of openEntries) {
      if (remainingToClose <= 0) break;

      const entryRemaining = Number(entry.remaining_shares || 0);
      if (entryRemaining <= 0) continue;

      matchedAnyOpenEntry = true;

      const sharesClosed = Math.min(entryRemaining, remainingToClose);
      const entryPrice = Number(entry.entry_price || 0);

      const rawPnl =
        targetDirection === 'long'
          ? (price - entryPrice) * sharesClosed
          : (entryPrice - price) * sharesClosed;

      let ibkrFifoPnlRealized = null;

      try {
        const sourceDetails =
          trade.source_details && typeof trade.source_details === 'string'
            ? JSON.parse(trade.source_details)
            : trade.source_details;

        if (
          sourceDetails?.fifoPnlRealized !== null &&
          sourceDetails?.fifoPnlRealized !== undefined
        ) {
          ibkrFifoPnlRealized = Number(sourceDetails.fifoPnlRealized);
          if (Number.isNaN(ibkrFifoPnlRealized)) {
            ibkrFifoPnlRealized = null;
          }
        }
      } catch (_) {
        ibkrFifoPnlRealized = null;
      }

      const originalExecutionQty = Number(trade.quantity || 0);

      const executionPnlRaw =
        ibkrFifoPnlRealized !== null && originalExecutionQty > 0
          ? ibkrFifoPnlRealized * (sharesClosed / originalExecutionQty)
          : rawPnl;

      const newRemaining = Number((entryRemaining - sharesClosed).toFixed(8));
      const originalShares = Number(entry.original_shares || entry.shares || entryRemaining);
      const previousRealizedRaw = Number(entry.total_realized_pnl || 0);
      const totalRealizedRaw = previousRealizedRaw + executionPnlRaw;

      const pnl = roundFinalPnl(executionPnlRaw);
      const totalRealizedPnl = roundFinalPnl(totalRealizedRaw);

      const percentTrimmed =
        originalShares > 0
          ? Number(((sharesClosed / originalShares) * 100).toFixed(2))
          : null;

      const eventType = newRemaining > 0 ? 'trim' : 'close';
      const newStatus = newRemaining > 0 ? 'trimmed' : 'closed';

      const { rows: existingExit } = await client.query(
        `
        SELECT 1
        FROM journal_trade_exits
        WHERE user_id = $1
          AND broker_trade_id = $2
          AND journal_entry_id = $3
        LIMIT 1
        `,
        [userId, trade.id, entry.id]
      );

      if (existingExit.length === 0) {
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
            percent_trimmed,
            broker_trade_id,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, now())
          `,
          [
            entry.id,
            userId,
            eventType,
            trade.executedat,
            sharesClosed,
            price,
            pnl,
            percentTrimmed,
            trade.id
          ]
        );
      }

      await client.query(
        `
        UPDATE journal_entries
        SET remaining_shares = $2,
            shares = $2,
            status = $3,
            exit_price = CASE WHEN $3 = 'closed' THEN $4 ELSE exit_price END,
            exit_date = CASE WHEN $3 = 'closed' THEN $5 ELSE exit_date END,
            pnl = CASE WHEN $3 = 'closed' THEN $6 ELSE pnl END,
            total_realized_pnl = $7,
            updated_at = now()
        WHERE id = $1
        `,
        [
          entry.id,
          newRemaining,
          newStatus,
          price,
          trade.executedat,
          totalRealizedPnl,
          totalRealizedPnl
        ]
      );

      remainingToClose = Number((remainingToClose - sharesClosed).toFixed(8));
      exitEventsCreated += 1;
    }

    if (!matchedAnyOpenEntry) {
      skippedNoMatchingOpenPosition += 1;
    }
  }

  await client.query(
    `
    UPDATE user_settings us
    SET realized_pnl = COALESCE((
      SELECT SUM(COALESCE(j.total_realized_pnl, 0))
      FROM journal_entries j
      WHERE j.user_id = us.user_id
    ), 0),
    updated_at = now()
    WHERE us.user_id = $1
    `,
    [userId]
  );

  return {
    journalEntriesCreated,
    exitEventsCreated,
    skippedAmbiguousTrades,
    skippedNoMatchingOpenPosition
  };
}



// Helper: check if any open position exists for ticker+direction
async function hasOpenPosition(client, userId, ticker, direction) {
  const { rows } = await client.query(
    `SELECT 1 FROM journal_entries
     WHERE user_id = $1 AND ticker = $2 AND direction = $3
       AND status IN ('open', 'trimmed')
       AND COALESCE(remaining_shares, 0) > 0
     LIMIT 1`,
    [userId, ticker, direction]
  );
  return rows.length > 0;
}

async function syncTradesForConnection(connection, queryId, source, syncField) {
  const logId = await createSyncLog(connection.userid, connection.id);
  let imported = 0;

  try {
    await pool.query(
      `UPDATE broker_connections
       SET status = 'syncing', lasterror = NULL, updatedat = now()
       WHERE id = $1`,
      [connection.id]
    );

    const download = await ibkrFlexService.downloadReport({
      token: connection.flex_token,
      queryId
    });
const { trades, accountSnapshots } = ibkrFlexParser.parseFlexReport(download.xml);

const jul22DebugTrades = trades
  .filter(t => {
    const executedAt = t.executedAt ? new Date(t.executedAt) : null;
    const assetCategory = String(t.assetCategory || '').toUpperCase();

    if (!executedAt || Number.isNaN(executedAt.getTime())) return false;

    const month = executedAt.getUTCMonth() + 1;
    const day = executedAt.getUTCDate();

    return month === 7 && day === 22 && assetCategory === 'STK';
  })
  .map(t => ({
    executionId: t.ibkrExecutionId,
    orderId: t.ibkrOrderId,
    transactionId: t.ibkrTransactionId,
    symbol: t.symbol,
    assetCategory: t.assetCategory,
    side: t.side,
    buySell: t.ibkrBuySell,
    openClose: t.ibkrOpenCloseIndicator,
    quantity: t.quantity,
    price: t.price,
    executedAt: t.executedAt,
    tradeDate: t.tradeDate,
    commission: t.commission,
    fifoPnlRealized: t.ibkrFifoPnlRealized,
    mtmPnl: t.ibkrMtmPnl,
    proceeds: t.ibkrProceeds,
    cost: t.ibkrCost,
    netCash: t.ibkrNetCash
  }));

console.log(
  'IBKR RAW JUL 22 STK DEBUG TRADES',
  JSON.stringify(jul22DebugTrades, null, 2)
);

    const client = await pool.connect();
    let journalSyncResult = {
      journalEntriesCreated: 0,
      exitEventsCreated: 0
    };

    try {
      await client.query('BEGIN');

      for (const trade of trades) {
        await upsertTrade(connection.userid, connection.id, trade, source);
        imported += 1;
      }

      if (source === 'ibkr_flex_activity' && accountSnapshots.length > 0) {
        await applyLatestAccountSnapshotToUserSettings(
          client,
          connection.userid,
          accountSnapshots
        );
      }

      journalSyncResult = await syncBrokerTradesToJournal(client, connection.userid);

      await client.query(
        `UPDATE broker_connections
         SET status = 'connected',
             lastsyncat = now(),
             ${syncField} = now(),
             flex_last_reference_code = $2,
             flex_last_response_url = $3,
             ibkraccountid = COALESCE($4, ibkraccountid),
             lasterror = NULL,
             updatedat = now()
         WHERE id = $1`,
        [
          connection.id,
          download.referenceCode,
          download.responseUrl,
          trades[0]?.accountId || accountSnapshots[0]?.accountId || null
        ]
      );

      await finishSyncLog(logId, 'success', imported, null);
      await client.query('COMMIT');

      return {
        imported,
        accountSnapshotsImported: accountSnapshots.length,
        journalEntriesCreated: journalSyncResult.journalEntriesCreated,
        exitEventsCreated: journalSyncResult.exitEventsCreated
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error.message || 'Sync failed';

    await pool.query(
      `UPDATE broker_connections
       SET status = $2, lasterror = $3, updatedat = now()
       WHERE id = $1`,
      [
        connection.id,
        isTooManyRequestsError(error) ? 'connected' : 'error',
        message
      ]
    );

    await finishSyncLog(logId, 'error', imported, message);
    throw error;
  }
}

async function runTradeConfirmSyncForUser(userId) {
  const connection = await getConnectionByUser(userId);

  if (!connection || !connection.flex_enabled || !connection.flex_trade_confirm_query_id) {
    throw new Error('IBKR Flex trade confirmation is not configured');
  }

  if (connection.status === 'syncing') {
    throw new Error('A sync is already in progress');
  }

  const elapsed = secondsSince(connection.flex_last_trade_sync_at);
  if (elapsed !== null && elapsed < TRADE_SYNC_COOLDOWN_SECONDS) {
    const waitFor = TRADE_SYNC_COOLDOWN_SECONDS - elapsed;
    throw new Error(`Sync was run recently. Please wait ${waitFor} seconds.`);
  }

  return syncTradesForConnection(
    connection,
    connection.flex_trade_confirm_query_id,
    'ibkr_flex_trade_confirm',
    'flex_last_trade_sync_at'
  );
}

async function runHistorySyncForUser(userId) {
  const connection = await getConnectionByUser(userId);

  if (!connection || !connection.flex_enabled || !connection.flex_activity_query_id) {
    throw new Error('IBKR Flex activity query is not configured');
  }

  if (connection.status === 'syncing') {
    throw new Error('A sync is already in progress');
  }

  const elapsed = secondsSince(connection.flex_last_history_sync_at);
  const cooldownSeconds = HISTORY_SYNC_COOLDOWN_HOURS * 3600;

  if (elapsed !== null && elapsed < cooldownSeconds) {
    const waitFor = cooldownSeconds - elapsed;
    throw new Error(`History sync was run recently. Please wait ${waitFor} seconds.`);
  }

  return syncTradesForConnection(
    connection,
    connection.flex_activity_query_id,
    'ibkr_flex_activity',
    'flex_last_history_sync_at'
  );
}

async function runTradeConfirmSyncForAllDue() {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM broker_connections
    WHERE brokername = 'ibkr'
      AND flex_enabled = true
      AND flex_trade_confirm_query_id IS NOT NULL
      AND status <> 'syncing'
      AND (
        flex_last_trade_sync_at IS NULL
        OR flex_last_trade_sync_at < now() - ($1::text || ' seconds')::interval
      )
    `,
    [String(TRADE_SYNC_COOLDOWN_SECONDS)]
  );

  for (const row of rows) {
    try {
      await syncTradesForConnection(
        row,
        row.flex_trade_confirm_query_id,
        'ibkr_flex_trade_confirm',
        'flex_last_trade_sync_at'
      );
    } catch (error) {
    }
  }
}

async function runHistorySyncForAllDue() {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM broker_connections
    WHERE brokername = 'ibkr'
      AND flex_enabled = true
      AND flex_activity_query_id IS NOT NULL
      AND status <> 'syncing'
      AND (
        flex_last_history_sync_at IS NULL
        OR flex_last_history_sync_at < now() - ($1::text || ' hours')::interval
      )
    `,
    [String(HISTORY_SYNC_COOLDOWN_HOURS)]
  );

  for (const row of rows) {
    try {
      await syncTradesForConnection(
        row,
        row.flex_activity_query_id,
        'ibkr_flex_activity',
        'flex_last_history_sync_at'
      );
    } catch (error) {
    }
  }
}

async function disconnectFlex(userId) {
  await pool.query(
    `
    UPDATE broker_connections
    SET flex_enabled = false,
        flex_token = NULL,
        flex_token_expires_at = NULL,
        flex_activity_query_id = NULL,
        flex_trade_confirm_query_id = NULL,
        flex_last_reference_code = NULL,
        flex_last_response_url = NULL,
        updatedat = now()
    WHERE userid = $1 AND brokername = 'ibkr'
    `,
    [userId]
  );
}

module.exports = {
  saveConnection,
  getConnectionStatus,
  runTradeConfirmSyncForUser,
  runHistorySyncForUser,
  runTradeConfirmSyncForAllDue,
  runHistorySyncForAllDue,
  disconnectFlex
};