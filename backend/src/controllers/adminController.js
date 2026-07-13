const crypto = require('crypto');
const pool = require('../config/db');

exports.createInvite = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingInvite = await pool.query(
      'SELECT id, status, expires_at, used_at FROM invites WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail]
    );

    if (existingInvite.rows.length > 0) {
      const invite = existingInvite.rows[0];
      const isUsed = !!invite.used_at;
      const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();

      if (!isUsed && !isExpired) {
        return res.status(409).json({ message: 'An active invite already exists for this email' });
      }
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'User already exists with this email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO invites (email, token, status, expires_at, created_by)
       VALUES ($1, $2, 'pending', $3, $4)
       RETURNING id, email, token, status, expires_at, created_at, used_at`,
      [normalizedEmail, token, expiresAt, req.user.id]
    );

    return res.status(201).json({
      message: 'Invite created successfully',
      invite: result.rows[0],
    });
  } catch (error) {
    console.error('Create invite error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getInvites = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         email,
         token,
         status,
         created_at,
         expires_at,
         used_at,
         created_by,
         CASE
           WHEN used_at IS NOT NULL THEN 'accepted'
           WHEN expires_at < NOW() THEN 'expired'
           ELSE 'pending'
         END AS display_status
       FROM invites
       ORDER BY created_at DESC`
    );

    return res.status(200).json({
      invites: result.rows,
    });
  } catch (error) {
    console.error('Get invites error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};




async function logAdminActivity(adminUserId, action, targetType = null, targetId = null, metadata = null) {
  try {
    await pool.query(
      `INSERT INTO admin_activity_logs (admin_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminUserId, action, targetType, targetId, metadata]
    );
  } catch (error) {
    console.error('Admin activity log error:', error);
  }
}

exports.createInvite = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingInvite = await pool.query(
      'SELECT id, status, expires_at, used_at FROM invites WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail]
    );

    if (existingInvite.rows.length > 0) {
      const invite = existingInvite.rows[0];
      const isUsed = !!invite.used_at;
      const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();

      if (!isUsed && !isExpired) {
        return res.status(409).json({ message: 'An active invite already exists for this email' });
      }
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'User already exists with this email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO invites (email, token, status, expires_at, created_by)
       VALUES ($1, $2, 'pending', $3, $4)
       RETURNING id, email, token, status, expires_at, created_at, used_at`,
      [normalizedEmail, token, expiresAt, req.user.id]
    );

    await logAdminActivity(req.user.id, 'invite.created', 'invite', result.rows[0].id, {
      email: normalizedEmail,
    });

    return res.status(201).json({
      message: 'Invite created successfully',
      invite: result.rows[0],
    });
  } catch (error) {
    console.error('Create invite error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getInvites = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         email,
         token,
         status,
         created_at,
         expires_at,
         used_at,
         created_by,
         CASE
           WHEN used_at IS NOT NULL THEN 'accepted'
           WHEN expires_at < NOW() THEN 'expired'
           ELSE 'pending'
         END AS display_status
       FROM invites
       ORDER BY created_at DESC`
    );

    return res.status(200).json({
      invites: result.rows,
    });
  } catch (error) {
    console.error('Get invites error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAdminUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim().toLowerCase();

    const params = ['admin'];
let whereClause = `WHERE u.role <> $1`;

if (search) {
  params.push(`%${search}%`);
  whereClause += ` AND LOWER(u.email) LIKE $${params.length}`;
}

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM users u
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    params.push(limit);
    const limitParam = `$${params.length}`;

    params.push(offset);
    const offsetParam = `$${params.length}`;

    const usersQuery = `
      SELECT
        u.id,
        u.email,
        u.role,
        u.is_active,
        u.invited_by,
        u.created_at,
        u.updated_at,
        us.starting_account_size,
        us.current_account_size,
        us.realized_pnl,
        us.default_risk_percent,
        us.default_max_position_percent,
        us.theme,
        COALESCE(uap.total_trades, 0) AS total_trades,
        COALESCE(uap.current_streak, 0) AS current_streak,
        COALESCE(uap.longest_streak, 0) AS longest_streak,
        COALESCE(j.trade_count, 0) AS trade_count,
        COALESCE(j.open_trades, 0) AS open_trades,
        COALESCE(j.trimmed_trades, 0) AS trimmed_trades,
        COALESCE(j.closed_trades, 0) AS closed_trades,
        j.last_trade_at,
        COALESCE(sc.scan_count, 0) AS scan_count,
        COALESCE(ua.achievement_count, 0) AS achievement_count
      FROM users u
      LEFT JOIN user_settings us
        ON us.user_id = u.id
      LEFT JOIN user_achievement_progress uap
        ON uap.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS trade_count,
          COUNT(*) FILTER (WHERE status = 'open') AS open_trades,
          COUNT(*) FILTER (WHERE status = 'trimmed') AS trimmed_trades,
          COUNT(*) FILTER (WHERE status = 'closed') AS closed_trades,
          MAX(updated_at) AS last_trade_at
        FROM journal_entries
        GROUP BY user_id
      ) j
        ON j.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS scan_count
        FROM user_scans
        GROUP BY user_id
      ) sc
        ON sc.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS achievement_count
        FROM user_achievements
        GROUP BY user_id
      ) ua
        ON ua.user_id = u.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ${limitParam}
      OFFSET ${offsetParam}
    `;

    const result = await pool.query(usersQuery, params);

    await logAdminActivity(req.user.id, 'admin.users.list.viewed', 'user', null, {
      page,
      limit,
      search: search || null,
    });

    return res.status(200).json({
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAdminUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.role,
         u.is_active,
         u.invited_by,
         u.created_at,
         u.updated_at,
         us.starting_account_size,
         us.current_account_size,
         us.realized_pnl,
         us.default_risk_percent,
         us.default_max_position_percent,
         us.dynamic_account_enabled,
         us.theme,
         us.sar_member,
         us.wizard_enabled,
         us.celebrations_enabled,
         us.sound_enabled,
         us.compound_settings,
         uap.total_trades,
         uap.current_streak,
         uap.longest_streak,
         uap.last_trade_date,
         uap.trades_with_notes,
         uap.trades_with_thesis,
         uap.complete_wizard_count,
         uap.schema_version,
         uap.updated_at AS achievement_progress_updated_at
       FROM users u
       LEFT JOIN user_settings us ON us.user_id = u.id
       LEFT JOIN user_achievement_progress uap ON uap.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const openPositionsResult = await pool.query(
      `SELECT
         id,
         ticker,
         status,
         entry_price,
         stop_price,
         current_stop,
         target_price,
         shares,
         original_shares,
         remaining_shares,
         position_size,
         risk_dollars,
         risk_percent,
         stop_distance,
         pnl,
         total_realized_pnl,
         opened_at,
         updated_at
       FROM journal_entries
       WHERE user_id = $1
         AND status IN ('open', 'trimmed')
       ORDER BY opened_at DESC`,
      [userId]
    );

    const recentTradesResult = await pool.query(
      `SELECT
         id,
         ticker,
         status,
         entry_price,
         stop_price,
         current_stop,
         target_price,
         shares,
         remaining_shares,
         position_size,
         risk_dollars,
         risk_percent,
         pnl,
         total_realized_pnl,
         wizard_complete,
         opened_at,
         exit_date,
         created_at,
         updated_at
       FROM journal_entries
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [userId]
    );

    const recentExitsResult = await pool.query(
      `SELECT
         id,
         journal_entry_id,
         event_type,
         exit_date,
         shares_closed,
         exit_price,
         r_multiple,
         pnl,
         percent_trimmed,
         created_at
       FROM journal_trade_exits
       WHERE user_id = $1
       ORDER BY exit_date DESC
       LIMIT 10`,
      [userId]
    );

    const scansResult = await pool.query(
      `SELECT
         id,
         scan_key,
         scan_date,
         name,
         title,
         source_file_name,
         sort_column,
         sort_order,
         published,
         created_at,
         updated_at
       FROM user_scans
       WHERE user_id = $1
       ORDER BY scan_date DESC, created_at DESC
       LIMIT 10`,
      [userId]
    );

    const achievementsResult = await pool.query(
      `SELECT
         id,
         achievement_key,
         unlocked_at,
         notified
       FROM user_achievements
       WHERE user_id = $1
       ORDER BY unlocked_at DESC`,
      [userId]
    );

    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS total_trades,
         COUNT(*) FILTER (WHERE status = 'open') AS open_trades,
         COUNT(*) FILTER (WHERE status = 'trimmed') AS trimmed_trades,
         COUNT(*) FILTER (WHERE status = 'closed') AS closed_trades,
         COALESCE(SUM(total_realized_pnl), 0) AS summed_realized_pnl,
         MAX(updated_at) AS last_trade_at
       FROM journal_entries
       WHERE user_id = $1`,
      [userId]
    );

    const rawStats = statsResult.rows[0] || {};
    const stats = {
      total_trades: Number(rawStats.total_trades || 0),
      open_trades: Number(rawStats.open_trades || 0),
      trimmed_trades: Number(rawStats.trimmed_trades || 0),
      closed_trades: Number(rawStats.closed_trades || 0),
      summed_realized_pnl: Number(rawStats.summed_realized_pnl || 0),
      last_trade_at: rawStats.last_trade_at || null,
    };

    const summary = {
      achievement_count: achievementsResult.rows.length,
      scan_count: scansResult.rows.length,
      open_position_count: openPositionsResult.rows.length,
      total_trades: stats.total_trades,
      open_trades: stats.open_trades,
      trimmed_trades: stats.trimmed_trades,
      closed_trades: stats.closed_trades,
      last_trade_at: stats.last_trade_at,
    };

    await logAdminActivity(req.user.id, 'admin.user.detail.viewed', 'user', userId, null);

    return res.status(200).json({
      user: userResult.rows[0],
      stats,
      summary,
      open_positions: openPositionsResult.rows,
      recent_trades: recentTradesResult.rows,
      recent_exits: recentExitsResult.rows,
      recent_scans: scansResult.rows,
      achievements: achievementsResult.rows,
    });
  } catch (error) {
    console.error('Get admin user details error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};