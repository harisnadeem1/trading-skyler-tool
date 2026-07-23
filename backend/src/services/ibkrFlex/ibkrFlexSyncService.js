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

async function saveConnection(userId, payload) {
  const sql = `
    INSERT INTO broker_connections (
      userid, brokername, authmode, status, flex_enabled,
      flex_token, flex_token_expires_at,
      flex_activity_query_id, flex_trade_confirm_query_id,
      connectedat, updatedat
    )
    VALUES (
      $1, 'ibkr', 'gateway', 'connected', true,
      $2, $3, $4, $5, now(), now()
    )
    ON CONFLICT (userid, brokername)
    DO UPDATE SET
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

console.log('[IBKR FLEX] download meta:', {
  userId: connection.userid,
  connectionId: connection.id,
  source,
  queryId,
  referenceCode: download.referenceCode,
  responseUrl: download.responseUrl,
  xmlLength: download.xml ? download.xml.length : 0
});

if (download.xml) {
  console.log('[IBKR FLEX] raw xml preview start ----------------');
  console.log(download.xml.slice(0, 4000));
  console.log('[IBKR FLEX] raw xml preview end ------------------');
}

const trades = ibkrFlexParser.parseExecutions(download.xml);

console.log('[IBKR FLEX] parsed trades count:', trades.length);

if (trades.length > 0) {
  console.log('[IBKR FLEX] first parsed trade:', JSON.stringify(trades[0], null, 2));
}

for (const trade of trades) {
  console.log('[IBKR FLEX] upserting trade:', JSON.stringify({
    ibkrExecutionId: trade.ibkrExecutionId,
    ibkrOrderId: trade.ibkrOrderId,
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
    price: trade.price,
    executedAt: trade.executedAt,
    source
  }, null, 2));

  await upsertTrade(connection.userid, connection.id, trade, source);
  imported += 1;
}

    await pool.query(
      `UPDATE broker_connections
       SET status = 'connected',
           lastsyncat = now(),
           ${syncField} = now(),
           flex_last_reference_code = $2,
           flex_last_response_url = $3,
           lasterror = NULL,
           updatedat = now()
       WHERE id = $1`,
      [connection.id, download.referenceCode, download.responseUrl]
    );

    await finishSyncLog(logId, 'success', imported, null);
    return { imported };
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