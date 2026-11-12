const configured = Boolean(process.env.PAYSTACK_SECRET_KEY);

module.exports = {
  isConfigured: configured,
  secretKey: configured ? process.env.PAYSTACK_SECRET_KEY : null,
  publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
  webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || null,
};
