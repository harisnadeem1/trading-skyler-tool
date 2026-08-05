// backend/src/middleware/academyAccess.js
const db = require('../config/db');

async function requireAcademyAccess(req, res, next) {
  try {
    const userId = req.user && req.user.id;


    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const result = await db.query(
      'SELECT id, user_id, product_key, active, expires_at, source, created_at, updated_at FROM entitlements WHERE user_id = $1 AND product_key = $2',
      [userId, 'ronin_academy']
    );

    const row = result.rows[0];
    const now = new Date();

    const active =
      row &&
      row.active &&
      (!row.expires_at || new Date(row.expires_at) > now);

    

    if (!active) {
      console.log('[academyAccess] blocked: no active entitlement');
      return res
        .status(403)
        .json({ message: 'Course access is locked.', code: 'COURSE_LOCKED' });
    }

    next();
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Unable to verify academy access.', code: 'ACADEMY_ACCESS_ERROR' });
  }
}

module.exports = { requireAcademyAccess };