const bcrypt = require('bcryptjs');
const { env } = require('../config/env');
const User = require('../models/User');

const DEFAULT_PASSWORD = 'ChangeMe!12345'; // published in .env.example, so it must never be used in production

/**
 * Optional first-run helper for hosts without a shell (e.g. Render free plan).
 * Runs only when SEED_ON_START=true AND no Super Admin exists yet, so it can never overwrite or duplicate an account.
 * Remove SEED_ON_START and the SEED_* variables after the first login.
 */
async function ensureBootstrapAdmin() {
  if (process.env.SEED_ON_START !== 'true') return;
  if (await User.exists({ role: 'super_admin' })) {
    console.info('Bootstrap: a Super Admin already exists, nothing to do. You can remove SEED_ON_START now.');
    return;
  }
  const { adminEmail, adminPassword, adminName } = env.seed;
  if (env.isProduction && (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD || adminPassword === DEFAULT_PASSWORD || adminPassword.length < 10)) {
    console.error('Bootstrap skipped: in production set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of at least 10 characters (not the example one).');
    return;
  }
  await User.create({
    email: adminEmail, name: adminName, role: 'super_admin', status: 'active',
    passwordHash: await bcrypt.hash(adminPassword, 12), passwordChangedAt: new Date(),
  });
  console.info(`Bootstrap: created Super Admin ${adminEmail}. Sign in, change the password, then remove SEED_ON_START and SEED_* from the environment.`);
}

module.exports = { ensureBootstrapAdmin };
