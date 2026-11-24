const Payment = require('../models/Payment');
const paystack = require('../integrations/paystack');
const { sendEmail } = require('../services/email.service');
const { randomCode } = require('../utils/tokens');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated, parsePage, pageMeta } = require('../utils/respond');
const { env } = require('../config/env');

async function settle(reference, verified) {
  const payment = await Payment.findOne({ reference });
  if (!payment) return null;
  if (payment.status === 'success') return payment; // idempotent: webhook and callback can both arrive
  // Trust only the gateway's verified data, and check amount and currency match what we asked for.
  const paidMajor = verified.amount / 100;
  if (verified.status === 'success' && paidMajor === payment.amount && verified.currency === payment.currency) {
    payment.status = 'success';
    payment.paidAt = verified.paid_at ? new Date(verified.paid_at) : new Date();
    await sendEmail({ to: payment.email, template: 'payment_receipt', data: { name: payment.name || 'Friend', currency: payment.currency, amount: payment.amount, reference } });
  } else if (verified.status === 'failed' || verified.status === 'abandoned') {
    payment.status = verified.status;
  }
  payment.gatewayResponse = { status: verified.status, channel: verified.channel, gateway_response: verified.gateway_response };
  await payment.save();
  return payment;
}

// Public: start a donation/partner payment. The browser only receives the gateway URL.
async function initialize(req, res) {
  if (!paystack.isConfigured) throw ApiError.badRequest('Online payments are not enabled yet');
  const amount = Number(req.body.amount);
  const reference = `AVOM-${Date.now()}-${randomCode(6)}`;
  await Payment.create({ reference, purpose: req.body.purpose || 'donation', email: req.body.email, name: req.body.name, amount, currency: 'NGN' });
  const tx = await paystack.initializeTransaction({
    email: req.body.email, amount, reference, callbackUrl: `${env.clientUrl}/give/thanks`,
    metadata: { purpose: req.body.purpose || 'donation', name: req.body.name },
  });
  created(res, { authorizationUrl: tx.authorization_url, reference });
}

// Public: the thank-you page asks the server to verify; the browser's own claim of success is never trusted.
async function verify(req, res) {
  if (!paystack.isConfigured) throw ApiError.badRequest('Online payments are not enabled yet');
  const payment = await settle(req.params.reference, await paystack.verifyTransaction(req.params.reference));
  if (!payment) throw ApiError.notFound('Payment not found');
  ok(res, { status: payment.status, amount: payment.amount, currency: payment.currency });
}

// Webhook: express.raw body + HMAC signature check (see app.js mount).
async function webhook(req, res) {
  if (!paystack.isValidWebhookSignature(req.body, req.get('x-paystack-signature'))) return res.sendStatus(401);
  const event = JSON.parse(req.body.toString('utf8'));
  if (event.event === 'charge.success' && event.data?.reference) {
    try {
      // Re-verify with the gateway rather than trusting the payload alone.
      await settle(event.data.reference, await paystack.verifyTransaction(event.data.reference));
    } catch (error) {
      console.error('Paystack webhook processing failed:', error.message);
      return res.sendStatus(500); // lets Paystack retry
    }
  }
  return res.sendStatus(200);
}

async function adminList(req, res) {
  const { page, limit, skip } = parsePage(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([Payment.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(), Payment.countDocuments(filter)]);
  paginated(res, items, pageMeta(page, limit, total));
}

module.exports = { initialize, verify, webhook, adminList, settle };
