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

function roundMoney(value) {
  if (value === null || value === undefined) return null;
  return Number(Number(value).toFixed(2));
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
      userid, brokerconnectionid, ibkrexecutionid, ibkrorderid,
      symbol, side, quantity, price, executedat, commission, currency,
      source, account_id, con_id, asset_category, trade_date,
      source_details, raw_payload
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18
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
    JSON.stringify({ import_source: source }),
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

  const brokerCurrentAccountSize = roundMoney(latest.total);
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
    LEFT JOIN journal_entries je
      ON je.broker_trade_id = bt.id
    WHERE bt.userid = $1
      AND je.id IS NULL
    ORDER BY bt.executedat ASC, bt.createdat ASC
    `,
    [userId]
  );

  let journalEntriesCreated = 0;
  let exitEventsCreated = 0;

  for (const trade of brokerTrades) {
    const qty = Number(trade.quantity);
    const price = Number(trade.price);
    const commission = Number(trade.commission || 0);
    const isBuy = trade.side === 'BUY';
    const ticker = trade.symbol;

    if (isBuy) {
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
          'long',
          $3,
          $3,
          NULL,
          $3,
          $3,
          $4,
          $4,
          $4,
          $5,
          0,
          0,
          0,
          'open',
          'Imported from IBKR Flex',
          NULL,
          true,
          '[]'::jsonb,
          $6,
          now(),
          now(),
          $7
        )
        RETURNING id
        `,
        [
          userId,
          ticker,
          price,
          qty,
          roundMoney(price * qty),
          trade.executedat,
          trade.id
        ]
      );

      if (insertResult.rows[0]) {
        journalEntriesCreated += 1;
      }

      continue;
    }

    let remainingToClose = qty;

    const { rows: openEntries } = await client.query(
      `
      SELECT *
      FROM journal_entries
      WHERE user_id = $1
        AND ticker = $2
        AND status IN ('open', 'trimmed')
        AND COALESCE(remaining_shares, 0) > 0
      ORDER BY opened_at ASC, created_at ASC
      `,
      [userId, ticker]
    );

    for (const entry of openEntries) {
      if (remainingToClose <= 0) break;

      const entryRemaining = Number(entry.remaining_shares || 0);
      if (entryRemaining <= 0) continue;

      const sharesClosed = Math.min(entryRemaining, remainingToClose);
      const entryPrice = Number(entry.entry_price);
      const pnl = roundMoney((price - entryPrice) * sharesClosed - commission);
      const newRemaining = Number((entryRemaining - sharesClosed).toFixed(8));
      const originalShares = Number(entry.original_shares || entry.shares || entryRemaining);
      const totalRealizedPnl = roundMoney(Number(entry.total_realized_pnl || 0) + pnl);
      const percentTrimmed =
        originalShares > 0 ? Number(((sharesClosed / originalShares) * 100).toFixed(2)) : null;
      const eventType = newRemaining > 0 ? 'trim' : 'close';
      const newStatus = newRemaining > 0 ? 'trimmed' : 'closed';

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
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, now())
        `,
        [
          entry.id,
          userId,
          eventType,
          trade.executedat,
          sharesClosed,
          price,
          pnl,
          percentTrimmed
        ]
      );

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
    exitEventsCreated
  };
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