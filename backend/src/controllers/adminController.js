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