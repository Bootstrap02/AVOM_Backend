const crypto = require('node:crypto');
const axios = require('axios');

const GRAPH = 'https://graph.facebook.com/v21.0';
const cfg = () => ({
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
});

const isConfigured = () => {
  const c = cfg();
  return Boolean(c.accessToken && c.phoneNumberId);
};

// Meta signs every webhook POST: X-Hub-Signature-256 = "sha256=" + HMAC_SHA256(rawBody, appSecret).
function isValidSignature(rawBody, header, secret = cfg().appSecret) {
  if (!rawBody || !header || !secret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Send a free-form text reply. WhatsApp only allows this within 24 hours of the person's last message;
 * outside that window Meta rejects it (an approved template would be needed). We return the error so staff see it.
 */
async function sendText(to, body) {
  if (!isConfigured()) return { ok: false, error: 'WhatsApp is not configured yet' };
  const c = cfg();
  try {
    await axios.post(`${GRAPH}/${c.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', to: String(to).replace(/\D/g, ''), type: 'text', text: { body, preview_url: false },
    }, { headers: { Authorization: `Bearer ${c.accessToken}` }, timeout: 15000 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.response?.data?.error?.message || error.message };
  }
}

/** Pull plain text messages out of Meta's nested webhook payload. */
function extractMessages(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages || []) {
        const text = m.type === 'text' ? m.text?.body : m.type === 'button' ? m.button?.text : `[${m.type} message: please call or send text]`;
        out.push({ id: m.id, from: m.from, name: names[m.from], text: text || '' });
      }
    }
  }
  return out;
}

module.exports = { isConfigured, isValidSignature, sendText, extractMessages, verifyToken: () => cfg().verifyToken };
