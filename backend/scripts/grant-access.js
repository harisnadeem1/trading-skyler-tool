'use strict';

require('dotenv').config();
const { Pool } = require('pg');


console.log({
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD_TYPE: typeof process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
});
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error', err);
});

async function initializeDatabase() {
  await pool.query('SELECT 1');
}

async function closePool() {
  await pool.end();
}

async function getUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  return result.rows[0] || null;
}

async function grantEntitlement({
  userId,
  productKey,
  source,
  stripeSessionId = null,
  status = 'paid',
  amountTotal = null,
  currency = null,
  customerEmail = null,
  paymentIntentId = null,
  expiresAt = null,
}) {
  await pool.query(
    `
    INSERT INTO entitlements (user_id, product_key, active, source, expires_at)
    VALUES ($1, $2, TRUE, $3, $4)
    ON CONFLICT (user_id, product_key)
    DO UPDATE SET
      active = TRUE,
      source = EXCLUDED.source,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
    `,
    [userId, productKey, source, expiresAt]
  );

  if (stripeSessionId) {
    await pool.query(
      `
      INSERT INTO payments (
        stripe_session_id, user_id, product_key, status, amount_total, currency,
        customer_email, payment_intent_id, refunded_at, fulfilled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NOW())
      ON CONFLICT (stripe_session_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        amount_total = EXCLUDED.amount_total,
        currency = EXCLUDED.currency,
        customer_email = EXCLUDED.customer_email,
        payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, payments.payment_intent_id),
        fulfilled_at = COALESCE(payments.fulfilled_at, NOW()),
        updated_at = NOW()
      `,
      [stripeSessionId, userId, productKey, status, amountTotal, currency, customerEmail, paymentIntentId]
    );
  }
}

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run grant-access -- trader@example.com');

  await initializeDatabase();

  const user = await getUserByEmail(email);
  if (!user) throw new Error(`No user found for ${email}. Register the user first.`);

  await grantEntitlement({
    userId: user.id,
    productKey: process.env.COURSE_PRODUCT_KEY || 'ronin_academy',
    source: 'manual',
    stripeSessionId: null,
    status: 'paid',
    amountTotal: null,
    currency: null,
    customerEmail: email,
    paymentIntentId: null,
    expiresAt: null,
  });

  console.log(`Granted academy access to ${email}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch {}
  });