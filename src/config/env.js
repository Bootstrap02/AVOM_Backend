const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const list = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:5174',
  extraOrigins: list(process.env.EXTRA_ALLOWED_ORIGINS),
  jwt: {
    // Development fallbacks only. Production start-up fails if these are missing (see assertProductionEnv).
    accessSecret: process.env.JWT_ACCESS_SECRET || (isProduction ? '' : 'dev-only-access-secret-change-me'),
    refreshSecret: process.env.JWT_REFRESH_SECRET || (isProduction ? '' : 'dev-only-refresh-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    staffRefreshDays: Number(process.env.STAFF_REFRESH_DAYS) || 7,
    studentRefreshDays: Number(process.env.STUDENT_REFRESH_DAYS) || 30,
  },
  cookie: {
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
    sameSite: process.env.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax'),
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
  email: {
    mode: process.env.EMAIL_MODE || 'auto', // auto | log | resend
    from: process.env.EMAIL_FROM || 'AVOM <no-reply@avomglobal.org>',
    contactInbox: process.env.CONTACT_INBOX || 'info@avomglobal.org',
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'auto', // auto | cloudinary | mock
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY || '',
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },
  jobs: {
    enabled: process.env.RUN_JOBS ? process.env.RUN_JOBS === 'true' : isProduction,
    timezone: process.env.JOBS_TIMEZONE || 'Africa/Lagos',
    expiryCron: process.env.EXPIRY_CRON || '0 2 * * *',
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@avom.test',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!12345',
    adminName: process.env.SEED_ADMIN_NAME || 'AVOM Super Admin',
  },
};

function assertProductionEnv() {
  if (!isProduction) return;
  const missing = [];
  if (!env.jwt.accessSecret) missing.push('JWT_ACCESS_SECRET');
  if (!env.jwt.refreshSecret) missing.push('JWT_REFRESH_SECRET');
  if (!env.mongodbUri) missing.push('MONGODB_URI');
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = { env, assertProductionEnv };
