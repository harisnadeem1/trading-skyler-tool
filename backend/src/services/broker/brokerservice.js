const pool = require('../../config/db');
const ibkrService = require('./ibkrservice');

async function getOrCreateBrokerConnection(client, userId) {
  const existing = await client.query(
    `
    SELECT *
    FROM broker_connections
    WHERE userid = $1 AND brokername = 'ibkr'
    LIMIT 1
    `,
    [userId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await client.query(
    `
    INSERT INTO broker_connections (userid, brokername, status)
    VALUES ($1, 'ibkr', 'disconnected')
    RETURNING *
    `,
    [userId]
  );

  return inserted.rows[0];
}

function normalizeAccountsPayload(accountsData) {
  const rawAccounts = Array.isArray(accountsData?.accounts)
    ? accountsData.accounts
    : Array.isArray(accountsData)
      ? accountsData
      : [];

  const selectedAccount =
    accountsData?.selectedAccount ||
    (typeof rawAccounts[0] === 'string'
      ? rawAccounts[0]
      : rawAccounts[0]?.accountId || rawAccounts[0]?.id || rawAccounts[0]?.accountVan || null);

  const accounts = rawAccounts
    .map((account) => {
      const accountId =
        typeof account === 'string'
          ? account
          : account?.accountId || account?.id || account?.accountVan || '';

      return {
        id: accountId,
      };
    })
    .filter((item) => item.id);

  return {
    accounts,
    selectedAccount,
    raw: accountsData,
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureGatewayAuthenticated() {
  let tickleData;

  try {
    tickleData = await ibkrService.pingGateway();
  } catch (error) {
    console.error('IBKR Gateway ping failed:', error);

    if (error.status === 401) {
      const err = new Error(
        'IBKR Gateway is reachable, but the session is not authenticated. Open https://localhost:5000 and log in again.'
      );
      err.status = 401;
      throw err;
    }

    if (error.status === 403) {
      const err = new Error(
        'IBKR Gateway denied the request. Recheck session on this same machine and try again.'
      );
      err.status = 403;
      throw err;
    }

    const err = new Error(
      'IBKR Gateway is not responding correctly. Restart Gateway and log in again.'
    );
    err.status = 503;
    throw err;
  }

  let authStatus =
    tickleData?.iserver?.authStatus || (await ibkrService.getAuthStatus());

  if (!authStatus?.authenticated || !authStatus?.connected) {
    try {
      await ibkrService.reauthenticate();
    } catch (error) {
      console.warn('IBKR reauthenticate failed:', error.message);
    }

    try {
      await ibkrService.validateSso();
    } catch (error) {
      console.warn('IBKR validateSso failed:', error.message);
    }

    await sleep(3000);

    const recheckedTickle = await ibkrService.pingGateway();
    authStatus =
      recheckedTickle?.iserver?.authStatus || (await ibkrService.getAuthStatus());
    tickleData = recheckedTickle;
  }

  if (!authStatus?.authenticated || !authStatus?.connected) {
    const err = new Error(
      'IBKR Gateway is running, but brokerage session is not authenticated. Open https://localhost:5000 and log in first.'
    );
    err.status = 401;
    throw err;
  }

  const accountsData = await ibkrService.getAccounts();
  const normalizedAccounts = normalizeAccountsPayload(accountsData);

  if (!normalizedAccounts.accounts.length) {
    const err = new Error(
      'IBKR Gateway authenticated, but no brokerage accounts were returned.'
    );
    err.status = 400;
    throw err;
  }

  return {
    tickleData,
    authStatus,
    accounts: normalizedAccounts,
  };
}

async function startIbkrConnection(user) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const connection = await getOrCreateBrokerConnection(client, user.id);
    const gatewayState = await ensureGatewayAuthenticated();

    const accountId =
      gatewayState.accounts.selectedAccount ||
      gatewayState.accounts.accounts[0]?.id ||
      null;

    const updated = await client.query(
      `
      UPDATE broker_connections
      SET
        status = 'connected',
        connectedat = COALESCE(connectedat, now()),
        lasttickleat = now(),
        lasterror = null,
        requiresreauth = false,
        ibkraccountid = COALESCE($2, ibkraccountid),
        updatedat = now()
      WHERE id = $1
      RETURNING *
      `,
      [connection.id, accountId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'IBKR Gateway connected successfully',
      accountId,
      accounts: gatewayState.accounts.accounts,
      connection: updated.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    await pool.query(
  `
  UPDATE broker_connections
  SET
    status = CASE
      WHEN $2 ILIKE '%not authenticated%'
        OR $2 ILIKE '%log in first%'
        OR $2 ILIKE '%reauth%'
        OR $2 ILIKE '%session%'
      THEN 'reauth_required'
      ELSE 'error'
    END,
    lasterror = $2,
    requiresreauth = CASE
      WHEN $2 ILIKE '%not authenticated%'
        OR $2 ILIKE '%log in first%'
        OR $2 ILIKE '%reauth%'
        OR $2 ILIKE '%session%'
      THEN true
      ELSE false
    END,
    updatedat = now()
  WHERE userid = $1 AND brokername = 'ibkr'
  `,
  [user.id, error.message]
).catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

async function handleIbkrCallback(userId) {
  return {
    success: true,
    message: 'Gateway mode does not use OAuth callback',
    userId,
  };
}

async function getBrokerStatus(userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      brokername,
      status,
      ibkraccountid,
      lastsyncat,
      lasttickleat,
      lasterror,
      requiresreauth,
      connectedat,
      createdat,
      updatedat
    FROM broker_connections
    WHERE userid = $1 AND brokername = 'ibkr'
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getBrokerAccounts(userId) {
  const connectionResult = await pool.query(
    `
    SELECT *
    FROM broker_connections
    WHERE userid = $1 AND brokername = 'ibkr'
    LIMIT 1
    `,
    [userId]
  );

  const connection = connectionResult.rows[0];
  if (!connection) {
    throw new Error('Broker connection not found');
  }

  const gatewayState = await ensureGatewayAuthenticated();

  await pool.query(
    `
    UPDATE broker_connections
    SET
      status = 'connected',
      lasttickleat = now(),
      lasterror = null,
      requiresreauth = false,
      updatedat = now()
    WHERE id = $1
    `,
    [connection.id]
  );

  return {
    accounts: gatewayState.accounts.accounts.map((account) => ({
      id: account.id,
      selected: account.id === (connection.ibkraccountid || gatewayState.accounts.selectedAccount),
    })),
    selectedAccount: connection.ibkraccountid || gatewayState.accounts.selectedAccount || null,
  };
}

async function selectBrokerAccount(userId, accountId) {
  const connectionResult = await pool.query(
    `
    SELECT *
    FROM broker_connections
    WHERE userid = $1 AND brokername = 'ibkr'
    LIMIT 1
    `,
    [userId]
  );

  const connection = connectionResult.rows[0];
  if (!connection) {
    throw new Error('Broker connection not found');
  }

  const gatewayState = await ensureGatewayAuthenticated();
  const validAccountIds = gatewayState.accounts.accounts.map((account) => account.id);

  if (!validAccountIds.includes(accountId)) {
    const err = new Error('Selected IBKR account is not available for this session');
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `
    UPDATE broker_connections
    SET
      ibkraccountid = $2,
      status = 'connected',
      lasttickleat = now(),
      lasterror = null,
      requiresreauth = false,
      updatedat = now()
    WHERE userid = $1 AND brokername = 'ibkr'
    RETURNING ibkraccountid
    `,
    [userId, accountId]
  );

  return {
    success: true,
    accountId: result.rows[0]?.ibkraccountid || accountId,
  };
}

function mapIbkrTrade(raw, userId, brokerConnectionId) {
  const rawSide = String(raw.side || raw.buySell || '').toUpperCase();

  let side = 'BUY';
  if (rawSide === 'SELL' || rawSide === 'S') {
    side = 'SELL';
  }

  return {
    userid: userId,
    brokerconnectionid: brokerConnectionId,
    ibkrexecutionid:
      raw.execution_id ||
      raw.execId ||
      raw.executionId ||
      raw.trade_id ||
      raw.transactionId ||
      null,
    ibkrorderid: raw.order_ref || raw.orderId || raw.order_id || raw.permId || null,
    symbol: raw.symbol || raw.conidEx || raw.description || raw.contractDesc || 'UNKNOWN',
    side,
    quantity: Number(raw.size || raw.quantity || raw.qty || raw.shares || 0),
    price: Number(raw.price || raw.tradePrice || raw.avgPrice || 0),
    executedat:
      raw.timestamp ||
      raw.trade_time ||
      raw.executed_at ||
      raw.dateTime ||
      raw.time ||
      null,
    commission: raw.commission != null ? Number(raw.commission) : null,
    currency: raw.currency || 'USD',
  };
}

async function upsertBrokerTrade(client, trade) {
  if (!trade.ibkrexecutionid || !trade.executedat || !trade.quantity || !trade.price) {
    return false;
  }

  await client.query(
    `
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
      currency
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (userid, ibkrexecutionid)
    DO UPDATE SET
      ibkrorderid = EXCLUDED.ibkrorderid,
      symbol = EXCLUDED.symbol,
      side = EXCLUDED.side,
      quantity = EXCLUDED.quantity,
      price = EXCLUDED.price,
      executedat = EXCLUDED.executedat,
      commission = EXCLUDED.commission,
      currency = EXCLUDED.currency
    `,
    [
      trade.userid,
      trade.brokerconnectionid,
      trade.ibkrexecutionid,
      trade.ibkrorderid,
      trade.symbol,
      trade.side,
      trade.quantity,
      trade.price,
      trade.executedat,
      trade.commission,
      trade.currency || 'USD',
    ]
  );

  return true;
}

async function syncBrokerTrades(userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const connectionResult = await client.query(
      `
      SELECT *
      FROM broker_connections
      WHERE userid = $1 AND brokername = 'ibkr'
      FOR UPDATE
      `,
      [userId]
    );

    const connection = connectionResult.rows[0];

    if (!connection) {
      throw new Error('Broker connection not found');
    }

    if (!connection.ibkraccountid) {
      throw new Error('Please select an IBKR account before syncing');
    }

    const syncLogResult = await client.query(
      `
      INSERT INTO broker_sync_logs (userid, brokerconnectionid, status, startedat)
      VALUES ($1, $2, 'started', now())
      RETURNING *
      `,
      [userId, connection.id]
    );

    const syncLog = syncLogResult.rows[0];

    await client.query(
      `
      UPDATE broker_connections
      SET
        status = 'syncing',
        lasterror = null,
        lasttickleat = now(),
        updatedat = now()
      WHERE id = $1
      `,
      [connection.id]
    );

    await client.query('COMMIT');

    await ensureGatewayAuthenticated();

    const rawTrades = await ibkrService.getTrades();
    console.log('IBKR raw trades response:', JSON.stringify(rawTrades, null, 2));
    const tradeList = Array.isArray(rawTrades)
      ? rawTrades
      : Array.isArray(rawTrades?.trades)
        ? rawTrades.trades
        : [];

    let importedCount = 0;
    const writeClient = await pool.connect();

    try {
      await writeClient.query('BEGIN');

      for (const rawTrade of tradeList) {
        const mapped = mapIbkrTrade(rawTrade, userId, connection.id);

        if (mapped.symbol === 'UNKNOWN') continue;

        const saved = await upsertBrokerTrade(writeClient, mapped);
        if (saved) importedCount += 1;
      }

      await writeClient.query(
        `
        UPDATE broker_sync_logs
        SET
          status = 'success',
          finishedat = now(),
          recordsimported = $2
        WHERE id = $1
        `,
        [syncLog.id, importedCount]
      );

      await writeClient.query(
        `
        UPDATE broker_connections
        SET
          status = 'connected',
          lastsyncat = now(),
          lasttickleat = now(),
          lasterror = null,
          requiresreauth = false,
          updatedat = now()
        WHERE id = $1
        `,
        [connection.id]
      );

      await writeClient.query('COMMIT');
    } catch (error) {
      await writeClient.query('ROLLBACK');
      throw error;
    } finally {
      writeClient.release();
    }

    return {
      success: true,
      imported: importedCount,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    await pool.query(
      `
      UPDATE broker_connections
      SET
        status = CASE
          WHEN $2 ILIKE '%not authenticated%'
            OR $2 ILIKE '%log in first%'
            OR $2 ILIKE '%reauth%'
          THEN 'reauth_required'
          ELSE 'error'
        END,
        lasterror = $2,
        requiresreauth = true,
        updatedat = now()
      WHERE userid = $1 AND brokername = 'ibkr'
      `,
      [userId, error.message]
    ).catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

async function disconnectBroker(userId) {
  try {
    await ibkrService.logoutGateway();
  } catch (error) {
    console.warn('IBKR logoutGateway failed:', error.message);
  }

  await pool.query(
    `
    UPDATE broker_connections
    SET
      status = 'disconnected',
      lasttickleat = null,
      lasterror = null,
      requiresreauth = false,
      connectedat = null,
      updatedat = now()
    WHERE userid = $1 AND brokername = 'ibkr'
    `,
    [userId]
  );

  return { success: true };
}

async function getBrokerTrades(userId) {
  const result = await pool.query(
    `
    SELECT *
    FROM broker_trades
    WHERE userid = $1
    ORDER BY executedat DESC
    `,
    [userId]
  );

  return result.rows;
}

module.exports = {
  startIbkrConnection,
  handleIbkrCallback,
  getBrokerStatus,
  getBrokerAccounts,
  selectBrokerAccount,
  syncBrokerTrades,
  disconnectBroker,
  getBrokerTrades,
};