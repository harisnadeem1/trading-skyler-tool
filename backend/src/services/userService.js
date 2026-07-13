const pool = require('../config/db');

async function getSettings(userId) {
  const { rows } = await pool.query(
    `
    SELECT
      user_id,
      starting_account_size,
      current_account_size,
      realized_pnl,
      default_risk_percent,
      default_max_position_percent,
      dynamic_account_enabled,
      theme,
      sar_member,
      wizard_enabled,
      celebrations_enabled,
      sound_enabled,
      compound_settings,
      created_at,
      updated_at
    FROM user_settings
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

async function updateSettings(userId, payload) {
  const current = await getSettings(userId);

  if (!current) {
    throw new Error('Settings row not found for user');
  }

  const next = {
    starting_account_size: payload.starting_account_size ?? payload.startingAccountSize ?? current.starting_account_size,
    current_account_size: payload.current_account_size ?? payload.currentAccountSize ?? current.current_account_size,
    realized_pnl: payload.realized_pnl ?? payload.realizedPnL ?? current.realized_pnl,
    default_risk_percent: payload.default_risk_percent ?? payload.defaultRiskPercent ?? current.default_risk_percent,
    default_max_position_percent:
      payload.default_max_position_percent ??
      payload.defaultMaxPositionPercent ??
      current.default_max_position_percent,
    dynamic_account_enabled:
      payload.dynamic_account_enabled ?? payload.dynamicAccountEnabled ?? current.dynamic_account_enabled,
    theme: payload.theme ?? current.theme,
    sar_member: payload.sar_member ?? payload.sarMember ?? current.sar_member,
    wizard_enabled: payload.wizard_enabled ?? payload.wizardEnabled ?? current.wizard_enabled,
    celebrations_enabled:
      payload.celebrations_enabled ?? payload.celebrationsEnabled ?? current.celebrations_enabled,
    sound_enabled: payload.sound_enabled ?? payload.soundEnabled ?? current.sound_enabled,
    compound_settings: payload.compound_settings ?? payload.compoundSettings ?? current.compound_settings,
  };

  const { rows } = await pool.query(
    `
    UPDATE user_settings
    SET
      starting_account_size = $2,
      current_account_size = $3,
      realized_pnl = $4,
      default_risk_percent = $5,
      default_max_position_percent = $6,
      dynamic_account_enabled = $7,
      theme = $8,
      sar_member = $9,
      wizard_enabled = $10,
      celebrations_enabled = $11,
      sound_enabled = $12,
      compound_settings = $13
    WHERE user_id = $1
    RETURNING *
    `,
    [
      userId,
      next.starting_account_size,
      next.current_account_size,
      next.realized_pnl,
      next.default_risk_percent,
      next.default_max_position_percent,
      next.dynamic_account_enabled,
      next.theme,
      next.sar_member,
      next.wizard_enabled,
      next.celebrations_enabled,
      next.sound_enabled,
      next.compound_settings ? JSON.stringify(next.compound_settings) : null,
    ]
  );

  return rows[0];
}

async function getJournalEntries(userId) {
  const { rows: entries } = await pool.query(
    `
    SELECT *
    FROM journal_entries
    WHERE user_id = $1
    ORDER BY opened_at DESC, created_at DESC
    `,
    [userId]
  );

  const { rows: exits } = await pool.query(
    `
    SELECT *
    FROM journal_trade_exits
    WHERE user_id = $1
    ORDER BY exit_date ASC, created_at ASC
    `,
    [userId]
  );

  const exitsByEntry = exits.reduce((acc, exit) => {
    if (!acc[exit.journal_entry_id]) acc[exit.journal_entry_id] = [];
    acc[exit.journal_entry_id].push(exit);
    return acc;
  }, {});

  return entries.map((entry) => ({
    ...entry,
    trim_history: exitsByEntry[entry.id] || [],
  }));
}

async function createJournalEntry(userId, payload) {
  const { rows } = await pool.query(
    `
    INSERT INTO journal_entries (
      user_id,
      ticker,
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
      exit_price,
      exit_date,
      pnl,
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
      $21, $22, $23, $24
    )
    RETURNING *
    `,
    [
      userId,
      payload.ticker,
      payload.entry_price ?? payload.entry,
      payload.stop_price ?? payload.stop,
      payload.target_price ?? payload.target ?? null,
      payload.original_stop ?? payload.stop ?? null,
      payload.current_stop ?? payload.stop ?? null,
      payload.shares ?? 0,
      payload.original_shares ?? payload.shares ?? 0,
      payload.remaining_shares ?? payload.shares ?? 0,
      payload.position_size ?? payload.positionSize ?? null,
      payload.risk_dollars ?? payload.riskDollars ?? null,
      payload.risk_percent ?? payload.riskPercent ?? null,
      payload.stop_distance ?? payload.stopDistance ?? null,
      payload.status ?? 'open',
      payload.exit_price ?? payload.exitPrice ?? null,
      payload.exit_date ?? payload.exitDate ?? null,
      payload.pnl ?? null,
      payload.total_realized_pnl ?? payload.totalRealizedPnL ?? 0,
      payload.notes ?? null,
      payload.thesis ? JSON.stringify(payload.thesis) : null,
      payload.wizard_complete ?? payload.wizardComplete ?? false,
      JSON.stringify(payload.wizard_skipped ?? payload.wizardSkipped ?? []),
      payload.opened_at ?? payload.timestamp ?? new Date().toISOString(),
    ]
  );

  return rows[0];
}

async function updateJournalEntry(userId, entryId, payload) {
  const existing = await pool.query(
    `SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [entryId, userId]
  );

  if (existing.rows.length === 0) {
    return null;
  }

  const current = existing.rows[0];

  const next = {
  ticker: payload.ticker ?? current.ticker,
  entry_price: payload.entry_price ?? payload.entry ?? current.entry_price,
  stop_price: payload.stop_price ?? payload.stop ?? current.stop_price,
  target_price: payload.target_price ?? payload.target ?? current.target_price,
  original_stop: payload.original_stop ?? current.original_stop,
  current_stop: payload.current_stop ?? payload.currentStop ?? current.current_stop,

  shares: current.shares,
  original_shares: current.original_shares,
  remaining_shares:
    payload.remaining_shares ??
    payload.remainingShares ??
    payload.shares ??
    current.remaining_shares,

  position_size: payload.position_size ?? payload.positionSize ?? current.position_size,
  risk_dollars: payload.risk_dollars ?? payload.riskDollars ?? current.risk_dollars,
  risk_percent: payload.risk_percent ?? payload.riskPercent ?? current.risk_percent,
  stop_distance: payload.stop_distance ?? payload.stopDistance ?? current.stop_distance,
  status: payload.status ?? current.status,
  exit_price: payload.exit_price ?? payload.exitPrice ?? current.exit_price,
  exit_date: payload.exit_date ?? payload.exitDate ?? current.exit_date,
  pnl: payload.pnl ?? current.pnl,
  total_realized_pnl:
    payload.total_realized_pnl ?? payload.totalRealizedPnL ?? current.total_realized_pnl,
  notes: payload.notes ?? current.notes,
  thesis: payload.thesis ?? current.thesis,
  wizard_complete: payload.wizard_complete ?? payload.wizardComplete ?? current.wizard_complete,
  wizard_skipped: payload.wizard_skipped ?? payload.wizardSkipped ?? current.wizard_skipped,
};

  const { rows } = await pool.query(
    `
    UPDATE journal_entries
    SET
      ticker = $3,
      entry_price = $4,
      stop_price = $5,
      target_price = $6,
      original_stop = $7,
      current_stop = $8,
      shares = $9,
      original_shares = $10,
      remaining_shares = $11,
      position_size = $12,
      risk_dollars = $13,
      risk_percent = $14,
      stop_distance = $15,
      status = $16,
      exit_price = $17,
      exit_date = $18,
      pnl = $19,
      total_realized_pnl = $20,
      notes = $21,
      thesis = $22,
      wizard_complete = $23,
      wizard_skipped = $24
    WHERE id = $1 AND user_id = $2
    RETURNING *
    `,
    [
      entryId,
      userId,
      next.ticker,
      next.entry_price,
      next.stop_price,
      next.target_price,
      next.original_stop,
      next.current_stop,
      next.shares,
      next.original_shares,
      next.remaining_shares,
      next.position_size,
      next.risk_dollars,
      next.risk_percent,
      next.stop_distance,
      next.status,
      next.exit_price,
      next.exit_date,
      next.pnl,
      next.total_realized_pnl,
      next.notes,
      next.thesis ? JSON.stringify(next.thesis) : null,
      next.wizard_complete,
      JSON.stringify(next.wizard_skipped ?? []),
    ]
  );

  return rows[0];
}

async function deleteJournalEntry(userId, entryId) {
  const { rowCount } = await pool.query(
    `DELETE FROM journal_entries WHERE id = $1 AND user_id = $2`,
    [entryId, userId]
  );

  return rowCount > 0;
}

async function addJournalExit(userId, entryId, payload) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const entryResult = await client.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [entryId, userId]
    );

    if (entryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const entry = entryResult.rows[0];
    const eventType = payload.event_type ?? payload.eventType ?? 'trim';
    const sharesClosed = Number(payload.shares_closed ?? payload.sharesClosed ?? 0);
    const exitPrice = Number(payload.exit_price ?? payload.exitPrice ?? 0);
    const pnl = Number(payload.pnl ?? 0);
    const percentTrimmed = payload.percent_trimmed ?? payload.percentTrimmed ?? null;
    const rMultiple = payload.r_multiple ?? payload.rMultiple ?? null;
    const exitDate = payload.exit_date ?? payload.exitDate ?? new Date().toISOString();
    const nextCurrentStop =
  payload.new_stop ??
  payload.newStop ??
  payload.current_stop ??
  payload.currentStop ??
  null;

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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        entryId,
        userId,
        eventType,
        exitDate,
        sharesClosed,
        exitPrice,
        rMultiple,
        pnl,
        percentTrimmed,
      ]
    );

    const currentRemaining = Number(entry.remaining_shares ?? entry.shares ?? 0);
    const remainingShares = Math.max(0, currentRemaining - sharesClosed);
    const totalRealizedPnL = Number(entry.total_realized_pnl ?? 0) + pnl;
    const nextStatus = remainingShares === 0 || eventType === 'close' ? 'closed' : 'trimmed';

    const updatedEntryResult = await client.query(
      `
      UPDATE journal_entries
      SET
        remaining_shares = $3,
        current_stop = COALESCE($4, current_stop),
        status = $5,
        exit_price = CASE WHEN $5 = 'closed' THEN $6 ELSE exit_price END,
        exit_date = CASE WHEN $5 = 'closed' THEN $7 ELSE exit_date END,
        total_realized_pnl = $8,
        pnl = CASE WHEN $5 = 'closed' THEN $8 ELSE pnl END
      WHERE id = $1 AND user_id = $2
      RETURNING *
      `,
      [
        entryId,
        userId,
        remainingShares,
        nextCurrentStop,
        nextStatus,
        nextStatus === 'closed' ? exitPrice : null,
        nextStatus === 'closed' ? exitDate : null,
        totalRealizedPnL,
      ]
    );

    await client.query('COMMIT');

    return {
      exit: exitInsert.rows[0],
      entry: updatedEntryResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getJournalMeta(userId) {
  const progressResult = await pool.query(
    `
    SELECT
      user_id,
      total_trades,
      current_streak,
      longest_streak,
      last_trade_date,
      trades_with_notes,
      trades_with_thesis,
      complete_wizard_count,
      schema_version,
      updated_at
    FROM user_achievement_progress
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  const achievementsResult = await pool.query(
    `
    SELECT
      id,
      achievement_key,
      unlocked_at,
      notified
    FROM user_achievements
    WHERE user_id = $1
    ORDER BY unlocked_at DESC
    `,
    [userId]
  );

  return {
    achievements: {
      unlocked: achievementsResult.rows,
      progress: progressResult.rows[0] || null,
    },
    settings: {},
    schemaVersion: progressResult.rows[0]?.schema_version ?? 1,
  };
}


async function exportUserData(userId) {
  const [
    settingsResult,
    journalEntriesResult,
    journalExitsResult,
    achievementProgressResult,
    achievementsResult,
    scansResult,
    adminLogsResult,
  ] = await Promise.all([
    pool.query(`SELECT * FROM user_settings WHERE user_id = $1 LIMIT 1`, [userId]),
    pool.query(`SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY opened_at DESC, created_at DESC`, [userId]),
    pool.query(`SELECT * FROM journal_trade_exits WHERE user_id = $1 ORDER BY exit_date ASC, created_at ASC`, [userId]),
    pool.query(`SELECT * FROM user_achievement_progress WHERE user_id = $1 LIMIT 1`, [userId]),
    pool.query(`SELECT * FROM user_achievements WHERE user_id = $1 ORDER BY unlocked_at DESC`, [userId]),
    pool.query(`SELECT * FROM user_scans WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    data: {
      settings: settingsResult.rows[0] || null,
      journal_entries: journalEntriesResult.rows,
      journal_trade_exits: journalExitsResult.rows,
      achievement_progress: achievementProgressResult.rows[0] || null,
      achievements: achievementsResult.rows,
      scans: scansResult.rows,
    },
  };
}



async function clearUserData(userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM journal_trade_exits WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_achievements WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_scans WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM journal_entries WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_achievement_progress WHERE user_id = $1`, [userId]);

    await client.query(
      `
      UPDATE user_settings
      SET
        current_account_size = starting_account_size,
        realized_pnl = 0,
        compound_settings = NULL
      WHERE user_id = $1
      `,
      [userId]
    );

    await client.query('COMMIT');

    return { message: 'All user data cleared successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


async function importUserData(userId, payload) {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    throw new Error('VALIDATION: Invalid import payload');
  }

  const data = payload.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM journal_trade_exits WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_achievements WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_scans WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM journal_entries WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_achievement_progress WHERE user_id = $1`, [userId]);

    if (data.settings) {
      await client.query(
        `
        UPDATE user_settings
        SET
          starting_account_size = $2,
          current_account_size = $3,
          realized_pnl = $4,
          default_risk_percent = $5,
          default_max_position_percent = $6,
          dynamic_account_enabled = $7,
          theme = $8,
          sar_member = $9,
          wizard_enabled = $10,
          celebrations_enabled = $11,
          sound_enabled = $12,
          compound_settings = $13
        WHERE user_id = $1
        `,
        [
          userId,
          data.settings.starting_account_size ?? 10000,
          data.settings.current_account_size ?? data.settings.starting_account_size ?? 10000,
          data.settings.realized_pnl ?? 0,
          data.settings.default_risk_percent ?? 1,
          data.settings.default_max_position_percent ?? 100,
          data.settings.dynamic_account_enabled ?? true,
          data.settings.theme ?? 'dark',
          data.settings.sar_member ?? true,
          data.settings.wizard_enabled ?? false,
          data.settings.celebrations_enabled ?? true,
          data.settings.sound_enabled ?? false,
          data.settings.compound_settings ?? null,
        ]
      );
    }

    if (data.achievement_progress) {
      await client.query(
        `
        INSERT INTO user_achievement_progress (
          user_id, total_trades, current_streak, longest_streak, last_trade_date,
          trades_with_notes, trades_with_thesis, complete_wizard_count, schema_version
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id)
        DO UPDATE SET
          total_trades = EXCLUDED.total_trades,
          current_streak = EXCLUDED.current_streak,
          longest_streak = EXCLUDED.longest_streak,
          last_trade_date = EXCLUDED.last_trade_date,
          trades_with_notes = EXCLUDED.trades_with_notes,
          trades_with_thesis = EXCLUDED.trades_with_thesis,
          complete_wizard_count = EXCLUDED.complete_wizard_count,
          schema_version = EXCLUDED.schema_version
        `,
        [
          userId,
          data.achievement_progress.total_trades ?? 0,
          data.achievement_progress.current_streak ?? 0,
          data.achievement_progress.longest_streak ?? 0,
          data.achievement_progress.last_trade_date ?? null,
          data.achievement_progress.trades_with_notes ?? 0,
          data.achievement_progress.trades_with_thesis ?? 0,
          data.achievement_progress.complete_wizard_count ?? 0,
          data.achievement_progress.schema_version ?? 1,
        ]
      );
    }

    const entryIdMap = new Map();

    if (Array.isArray(data.journal_entries)) {
      for (const entry of data.journal_entries) {
        const inserted = await client.query(
          `
          INSERT INTO journal_entries (
            user_id, ticker, entry_price, stop_price, target_price, original_stop, current_stop,
            shares, original_shares, remaining_shares, position_size, risk_dollars, risk_percent,
            stop_distance, status, exit_price, exit_date, pnl, total_realized_pnl, notes, thesis,
            wizard_complete, wizard_skipped, opened_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
          )
          RETURNING id
          `,
          [
            userId,
            entry.ticker,
            entry.entry_price,
            entry.stop_price,
            entry.target_price,
            entry.original_stop,
            entry.current_stop,
            entry.shares ?? 0,
            entry.original_shares ?? entry.shares ?? 0,
            entry.remaining_shares ?? entry.shares ?? 0,
            entry.position_size,
            entry.risk_dollars,
            entry.risk_percent,
            entry.stop_distance,
            entry.status ?? 'open',
            entry.exit_price,
            entry.exit_date,
            entry.pnl,
            entry.total_realized_pnl ?? 0,
            entry.notes,
            entry.thesis ? JSON.stringify(entry.thesis) : null,
            entry.wizard_complete ?? false,
            JSON.stringify(entry.wizard_skipped ?? []),
            entry.opened_at ?? new Date().toISOString(),
          ]
        );

        if (entry.id) {
          entryIdMap.set(String(entry.id), inserted.rows[0].id);
        }
      }
    }

    if (Array.isArray(data.journal_trade_exits)) {
      for (const exit of data.journal_trade_exits) {
        const mappedEntryId = entryIdMap.get(String(exit.journal_entry_id));
        if (!mappedEntryId) continue;

        await client.query(
          `
          INSERT INTO journal_trade_exits (
            journal_entry_id, user_id, event_type, exit_date, shares_closed,
            exit_price, r_multiple, pnl, percent_trimmed
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `,
          [
            mappedEntryId,
            userId,
            exit.event_type ?? 'trim',
            exit.exit_date ?? new Date().toISOString(),
            exit.shares_closed ?? 0,
            exit.exit_price ?? 0,
            exit.r_multiple ?? null,
            exit.pnl ?? 0,
            exit.percent_trimmed ?? null,
          ]
        );
      }
    }

    if (Array.isArray(data.achievements)) {
      for (const achievement of data.achievements) {
        await client.query(
          `
          INSERT INTO user_achievements (
            user_id, achievement_key, unlocked_at, notified
          )
          VALUES ($1,$2,$3,$4)
          `,
          [
            userId,
            achievement.achievement_key,
            achievement.unlocked_at ?? new Date().toISOString(),
            achievement.notified ?? false,
          ]
        );
      }
    }

    if (Array.isArray(data.scans)) {
      for (const scan of data.scans) {
        await client.query(
          `
          INSERT INTO user_scans (
            user_id, title, scan_date, scan_data
          )
          VALUES ($1,$2,$3,$4)
          `,
          [
            userId,
            scan.title ?? 'Imported Scan',
            scan.scan_date ?? new Date().toISOString(),
            scan.scan_data ?? null,
          ]
        );
      }
    }

    await client.query('COMMIT');

    return { message: 'Data imported successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  addJournalExit,
  getJournalMeta,
   exportUserData,
  importUserData,
  clearUserData,
};