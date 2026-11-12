const { Resend } = require('resend');

const configured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
const resend = configured ? new Resend(process.env.RESEND_API_KEY) : null;

module.exports = {
  resend,
  isConfigured: configured,
  from: process.env.EMAIL_FROM || null,
};
