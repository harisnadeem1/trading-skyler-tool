const pool = require('../config/db');

const ACHIEVEMENTS = {
  FIRST_STEPS: 'first_steps',
  DAY_ONE: 'day_one',
  HOT_STREAK: 'hot_streak',
};

function toDateStringUTC(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function diffDaysUTC(a, b) {
  const aDate = new Date(`${a}T00:00:00.000Z`);
  const bDate = new Date(`${b}T00:00:00.000Z`);
  return Math.round((bDate - aDate) / 86400000);
}

async function ensureProgressRow(client, userId) {
  await client.query(
    `
    INSERT INTO user_achievement_progress (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function updateProgressForNewTrade(client, userId, entry) {
  await ensureProgressRow(client, userId);

  const progressResult = await client.query(
    `
    SELECT *
    FROM user_achievement_progress
    WHERE user_id = $1
    FOR UPDATE
    `,
    [userId]
  );

  const current = progressResult.rows[0];
  const tradeDate = toDateStringUTC(entry.opened_at || new Date().toISOString());
  const lastTradeDate = toDateStringUTC(current.last_trade_date);

  let nextCurrentStreak = Number(current.current_streak || 0);

  if (!lastTradeDate) {
    nextCurrentStreak = 1;
  } else if (lastTradeDate === tradeDate) {
    nextCurrentStreak = Number(current.current_streak || 0);
  } else {
    const dayDiff = diffDaysUTC(lastTradeDate, tradeDate);
    nextCurrentStreak = dayDiff === 1 ? Number(current.current_streak || 0) + 1 : 1;
  }

  const nextTotalTrades = Number(current.total_trades || 0) + 1;
  const nextLongestStreak = Math.max(Number(current.longest_streak || 0), nextCurrentStreak);
  const nextTradesWithNotes =
    Number(current.trades_with_notes || 0) + (entry.notes ? 1 : 0);
  const nextTradesWithThesis =
    Number(current.trades_with_thesis || 0) + (entry.thesis ? 1 : 0);
  const nextCompleteWizardCount =
    Number(current.complete_wizard_count || 0) + (entry.wizard_complete ? 1 : 0);

  const updateResult = await client.query(
    `
    UPDATE user_achievement_progress
    SET
      total_trades = $2,
      current_streak = $3,
      longest_streak = $4,
      last_trade_date = $5,
      trades_with_notes = $6,
      trades_with_thesis = $7,
      complete_wizard_count = $8,
      updated_at = now()
    WHERE user_id = $1
    RETURNING *
    `,
    [
      userId,
      nextTotalTrades,
      nextCurrentStreak,
      nextLongestStreak,
      tradeDate,
      nextTradesWithNotes,
      nextTradesWithThesis,
      nextCompleteWizardCount,
    ]
  );

  return updateResult.rows[0];
}

async function insertAchievementIfNew(client, userId, achievementKey) {
  const result = await client.query(
    `
    INSERT INTO user_achievements (user_id, achievement_key, notified)
    VALUES ($1, $2, false)
    ON CONFLICT (user_id, achievement_key) DO NOTHING
    RETURNING id, achievement_key, unlocked_at, notified
    `,
    [userId, achievementKey]
  );

  return result.rows[0] || null;
}

async function unlockAchievementsFromProgress(client, userId, progress) {
  const unlockedNow = [];
  const today = toDateStringUTC(new Date().toISOString());
  const lastTradeDate = toDateStringUTC(progress.last_trade_date);

  if (Number(progress.total_trades || 0) >= 1) {
    const row = await insertAchievementIfNew(client, userId, ACHIEVEMENTS.FIRST_STEPS);
    if (row) unlockedNow.push(row);
  }

  if (lastTradeDate === today) {
    const row = await insertAchievementIfNew(client, userId, ACHIEVEMENTS.DAY_ONE);
    if (row) unlockedNow.push(row);
  }

  if (Number(progress.current_streak || 0) >= 3) {
    const row = await insertAchievementIfNew(client, userId, ACHIEVEMENTS.HOT_STREAK);
    if (row) unlockedNow.push(row);
  }

  return unlockedNow;
}

async function processTradeAchievements(userId, entry) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const progress = await updateProgressForNewTrade(client, userId, entry);
    const newlyUnlocked = await unlockAchievementsFromProgress(client, userId, progress);

    await client.query('COMMIT');

    return { progress, newlyUnlocked };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  processTradeAchievements,
};