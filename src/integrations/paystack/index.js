const crypto = require('node:crypto');
const axios = require('axios');

const configured = Boolean(process.env.PAYSTACK_SECRET_KEY);
const api = axios.create({ baseURL: 'https://api.paystack.co', timeout: 15000 });
const headers = () => ({ Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` });

// Amounts are passed in major units (naira) and converted to kobo here.
async function initializeTransaction({ email, amount, reference, callbackUrl, metadata }) {
  const { data } = await api.post(
    '/transaction/initialize',
    { email, amount: Math.round(amount * 100), reference, callback_url: callbackUrl, metadata },
    { headers: headers() },
  );
  return data.data; // { authorization_url, access_code, reference }
}

async function verifyTransaction(reference) {
  const { data } = await api.get(`/transaction/verify/${encodeURIComponent(reference)}`, { headers: headers() });
  return data.data;
}

// Paystack signs the raw request body with HMAC SHA-512 using the secret key.
function isValidWebhookSignature(rawBody, signature, secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY) {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { isConfigured: configured, initializeTransaction, verifyTransaction, isValidWebhookSignature };
