const pool = require('../config/db');



function normalizeDirection(value, fallback = 'long') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'long' || normalized === 'short') return normalized;
  throw new Error('VALIDATION: direction must be either "long" or "short"');
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function validateJournalEntryPayload(payload, direction) {
  const entry = toNumberOrNull(payload.entry_price ?? payload.entry);
  const stop = toNumberOrNull(payload.stop_price ?? payload.stop);
  const target = toNumberOrNull(payload.target_price ?? payload.target);

  if (entry === null || entry <= 0) {
    throw new Error('VALIDATION: entry price must be greater than 0');
  }

  if (stop === null || stop <= 0) {
    throw new Error('VALIDATION: stop price must be greater than 0');
  }

  if (direction === 'long' && stop >= entry) {
    throw new Error('VALIDATION: for long trades, stop price must be below entry price');
  }

  if (direction === 'short' && stop <= entry) {
    throw new Error('VALIDATION: for short trades, stop price must be above entry price');
  }

  if (target !== null) {
    if (direction === 'long' && target <= entry) {
      throw new Error('VALIDATION: for long trades, target price should be above entry price');
    }
    if (direction === 'short' && target >= entry) {
      throw new Error('VALIDATION: for short trades, target price should be below entry price');
    }
  }
}

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
  const direction = normalizeDirection(payload.direction, 'long');
  validateJournalEntryPayload(payload, direction);

  const { rows } = await pool.query(
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
      $21, $22, $23, $24, $25, $26
    )
    RETURNING *
    `,
    [
      userId,
      payload.broker_trade_id ?? null,
      payload.ticker,
      direction,
      payload.entry_price ?? payload.entry,
      payload.stop_price ?? payload.stop,
      payload.target_price ?? payload.target ?? null,
      payload.original_stop ?? payload.stop_price ?? payload.stop ?? null,
      payload.current_stop ?? payload.stop_price ?? payload.stop ?? null,
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

  const nextDirection = normalizeDirection(
    payload.direction ?? current.direction,
    current.direction ?? 'long'
  );

  validateJournalEntryPayload(
    {
      entry: payload.entry_price ?? payload.entry ?? current.entry_price,
      stop: payload.stop_price ?? payload.stop ?? current.stop_price,
      target: payload.target_price ?? payload.target ?? current.target_price,
    },
    nextDirection
  );

  const next = {
    ticker: payload.ticker ?? current.ticker,
    direction: nextDirection,
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
      direction = $4,
      entry_price = $5,
      stop_price = $6,
      target_price = $7,
      original_stop = $8,
      current_stop = $9,
      shares = $10,
      original_shares = $11,
      remaining_shares = $12,
      position_size = $13,
      risk_dollars = $14,
      risk_percent = $15,
      stop_distance = $16,
      status = $17,
      exit_price = $18,
      exit_date = $19,
      pnl = $20,
      total_realized_pnl = $21,
      notes = $22,
      thesis = $23,
      wizard_complete = $24,
      wizard_skipped = $25
    WHERE id = $1 AND user_id = $2
    RETURNING *
    `,
    [
      entryId,
      userId,
      next.ticker,
      next.direction,
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
    const percentTrimmed = payload.percent_trimmed ?? payload.percentTrimmed ?? null;
    const rMultiple = payload.r_multiple ?? payload.rMultiple ?? null;
    const exitDate = payload.exit_date ?? payload.exitDate ?? new Date().toISOString();
    const nextCurrentStop =
      payload.new_stop ??
      payload.newStop ??
      payload.current_stop ??
      payload.currentStop ??
      null;

    if (!['trim', 'close'].includes(eventType)) {
      throw new Error('VALIDATION: event_type must be "trim" or "close"');
    }

    if (!Number.isFinite(sharesClosed) || sharesClosed <= 0) {
      throw new Error('VALIDATION: shares_closed must be greater than 0');
    }

    const currentRemaining = Number(entry.remaining_shares ?? entry.shares ?? 0);
    if (sharesClosed > currentRemaining) {
      throw new Error('VALIDATION: shares_closed cannot be greater than remaining shares');
    }

    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      throw new Error('VALIDATION: exit_price must be greater than 0');
    }

    const direction = entry.direction ?? 'long';
    const pnl =
      direction === 'short'
        ? (Number(entry.entry_price) - exitPrice) * sharesClosed
        : (exitPrice - Number(entry.entry_price)) * sharesClosed;

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

  const progressRow = progressResult.rows[0];

  return {
    achievements: {
      progress: progressRow
        ? {
            totalTrades: Number(progressRow.total_trades || 0),
            currentStreak: Number(progressRow.current_streak || 0),
            longestStreak: Number(progressRow.longest_streak || 0),
            lastTradeDate: progressRow.last_trade_date,
            tradesWithNotes: Number(progressRow.trades_with_notes || 0),
            tradesWithThesis: Number(progressRow.trades_with_thesis || 0),
            completeWizardCount: Number(progressRow.complete_wizard_count || 0),
            schemaVersion: Number(progressRow.schema_version || 1),
            updatedAt: progressRow.updated_at,
          }
        : {
            totalTrades: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastTradeDate: null,
            tradesWithNotes: 0,
            tradesWithThesis: 0,
            completeWizardCount: 0,
            schemaVersion: 1,
            updatedAt: null,
          },

      unlocked: achievementsResult.rows.map((row) => ({
        id: row.achievement_key,
        achievementKey: row.achievement_key,
        unlockedAt: row.unlocked_at,
        notified: row.notified,
      })),
    },
    settings: {},
    schemaVersion: progressRow?.schema_version ?? 1,
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
    version: 2,
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

    await client.query(
      `
      INSERT INTO user_achievement_progress (
        user_id,
        total_trades,
        current_streak,
        longest_streak,
        last_trade_date,
        trades_with_notes,
        trades_with_thesis,
        complete_wizard_count,
        schema_version
      )
      VALUES ($1, 0, 0, 0, NULL, 0, 0, 0, 1)
      ON CONFLICT (user_id)
      DO UPDATE SET
        total_trades = 0,
        current_streak = 0,
        longest_streak = 0,
        last_trade_date = NULL,
        trades_with_notes = 0,
        trades_with_thesis = 0,
        complete_wizard_count = 0,
        schema_version = 1,
        updated_at = now()
      `,
      [userId]
    );

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
    } else {
      await client.query(
        `
        INSERT INTO user_achievement_progress (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId]
      );
    }

    const entryIdMap = new Map();

    if (Array.isArray(data.journal_entries)) {
      for (const entry of data.journal_entries) {
        const direction = normalizeDirection(
          entry.direction,
          Number(entry.stop_price) > Number(entry.entry_price) ? 'short' : 'long'
        );

        const inserted = await client.query(
          `
          INSERT INTO journal_entries (
            user_id, ticker, direction, entry_price, stop_price, target_price, original_stop, current_stop,
            shares, original_shares, remaining_shares, position_size, risk_dollars, risk_percent,
            stop_distance, status, exit_price, exit_date, pnl, total_realized_pnl, notes, thesis,
            wizard_complete, wizard_skipped, opened_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
          )
          RETURNING id
          `,
          [
            userId,
            entry.ticker,
            direction,
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
            user_id, scan_key, scan_date, name, title, tags, headers, rows,
            source_file_name, sort_column, sort_order, published
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          `,
          [
            userId,
            scan.scan_key ?? `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            scan.scan_date ?? new Date().toISOString().slice(0, 10),
            scan.name ?? null,
            scan.title ?? 'Imported Scan',
            JSON.stringify(scan.tags ?? []),
            JSON.stringify(scan.headers ?? []),
            JSON.stringify(scan.rows ?? []),
            scan.source_file_name ?? null,
            scan.sort_column ?? null,
            scan.sort_order ?? 'desc',
            scan.published ?? false,
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