const bcrypt = require('bcrypt');
const pool = require('../config/db');
const generateToken = require('../utils/generateToken');

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account is disabled' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.cookie('token', token, getAuthCookieOptions());

    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.me = async (req, res) => {
  return res.json({ user: req.user });
};

exports.logout = async (req, res) => {
  const { maxAge, ...clearOptions } = getAuthCookieOptions();
  res.clearCookie('token', clearOptions);
  return res.json({ message: 'Logged out successfully' });
};

exports.getInviteByToken = async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `SELECT id, email, status, expires_at, used_at
       FROM invites
       WHERE token = $1`,
      [token]
    );

    const invite = result.rows[0];

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ message: 'Invite is no longer valid' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ message: 'Invite has expired' });
    }

    return res.json({
      valid: true,
      invite: {
        email: invite.email,
        status: invite.status,
        expires_at: invite.expires_at,
      },
    });
  } catch (error) {
    console.error('Get invite by token error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.signupWithInvite = async (req, res) => {
  const client = await pool.connect();

  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    await client.query('BEGIN');

    const inviteResult = await client.query(
      `SELECT id, email, status, expires_at, created_by
       FROM invites
       WHERE token = $1
       FOR UPDATE`,
      [token]
    );

    const invite = inviteResult.rows[0];

    if (!invite) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (invite.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invite is no longer valid' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invite has expired' });
    }

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [invite.email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'User already exists for this email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active, invited_by)
       VALUES ($1, $2, 'user', true, $3)
       RETURNING id, email, role, is_active`,
      [invite.email, passwordHash, invite.created_by]
    );

    await client.query(
      `UPDATE invites
       SET status = 'used',
           used_at = NOW()
       WHERE id = $1`,
      [invite.id]
    );

    await client.query('COMMIT');

    const user = userResult.rows[0];
    const authToken = generateToken(user);

    res.cookie('token', authToken, getAuthCookieOptions());

    return res.status(201).json({
      message: 'Signup completed successfully',
      user,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Signup with invite error:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};