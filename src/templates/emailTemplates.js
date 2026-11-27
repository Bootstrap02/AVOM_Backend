// Built-in email templates. Admins can override subject/body per key (EmailTemplate collection).
// Placeholders use {{name}} syntax. Values are HTML-escaped when rendered.
// Absolute URL: email clients cannot load relative images. The file is served by the public website.
const LOGO_URL = `${(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '')}/avom-logo.png`;
const BRAND = { blue: '#2C3E50', green: '#6ABF4B', gold: '#F1C40F', grey: '#BDC3C7' };

const button = (href, label) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:${BRAND.green};color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block">${label}</a></p>`;

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Lato,Open Sans,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:${BRAND.blue};padding:16px 28px;color:#fff;font-size:20px;font-weight:bold"><img src="${LOGO_URL}" alt="AVOM" height="44" style="vertical-align:middle;margin-right:12px;border:0"> <span style="vertical-align:middle">${title}</span></td></tr>
<tr><td style="padding:28px;color:${BRAND.blue};font-size:16px;line-height:1.55">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;background:#fafafa;color:#7f8c8d;font-size:12px">Apostle Victor Ogagaoghene Ministries</td></tr>
</table></td></tr></table></body></html>`;
}

const defaults = {
  application_received: {
    subject: 'We received your application',
    title: 'Application received',
    body: '<p>Dear {{name}},</p><p>Thank you for applying to the AVOM Believers Bible School. Your application is now <b>pending</b> review. We will email you as soon as a decision is made.</p>',
  },
  application_accepted: {
    subject: 'Your AVOM application has been accepted',
    title: 'Welcome to AVOM Bible School',
    body: '<p>Dear {{name}},</p><p>We are glad to tell you that your application has been <b>accepted</b>. Your student number is <b>{{studentNumber}}</b>.</p><p>Please activate your account and choose a password:</p>{{button}}<p>This link expires in {{expiresInDays}} days.</p>',
  },
  application_rejected: {
    subject: 'About your AVOM application',
    title: 'Application update',
    body: '<p>Dear {{name}},</p><p>Thank you for your interest in the AVOM Believers Bible School. We are unable to accept your application at this time.</p><p><b>Reason:</b> {{reason}}</p><p>You are welcome to apply again.</p>',
  },
  account_activation: {
    subject: 'Activate your AVOM account',
    title: 'Activate your account',
    body: '<p>Dear {{name}},</p><p>Your AVOM account has been created. Your student number is <b>{{studentNumber}}</b>. Choose a password to activate it:</p>{{button}}<p>This link expires in {{expiresInDays}} days.</p>',
  },
  staff_invitation: {
    subject: 'You have been invited to AVOM administration',
    title: 'Staff invitation',
    body: '<p>Dear {{name}},</p><p>You have been added to the AVOM administration site as <b>{{role}}</b>. Set your password here:</p>{{button}}<p>This link expires in {{expiresInDays}} days.</p>',
  },
  password_reset: {
    subject: 'Reset your AVOM password',
    title: 'Password reset',
    body: '<p>Dear {{name}},</p><p>We received a request to reset your password. If this was you, choose a new password:</p>{{button}}<p>This link expires in 1 hour. If you did not ask for this, you can ignore this email.</p>',
  },
  lecture_published: {
    subject: 'New lecture available: {{lesson}}',
    title: 'New lecture',
    body: '<p>Dear {{name}},</p><p>A new lecture, <b>{{lesson}}</b>, is now available to your batch. It stays open until <b>{{expiresAt}}</b>, after which it is removed.</p>{{button}}',
  },
  lecture_expiring: {
    subject: 'Lecture closing soon: {{lesson}}',
    title: 'Lecture closing soon',
    body: '<p>Dear {{name}},</p><p>The lecture <b>{{lesson}}</b> closes on <b>{{expiresAt}}</b>. Please finish it before then.</p>{{button}}',
  },
  content_expiring: {
    subject: 'Content expires soon: {{title}}',
    title: 'Content expiring',
    body: '<p>Hello,</p><p>The {{kind}} <b>{{title}}</b> will expire and be removed on <b>{{expiresAt}}</b>. Open it and choose <i>Keep</i> (pin) if it should stay.</p>{{button}}',
  },
  certificate_issued: {
    subject: 'Your AVOM certificate',
    title: 'Certificate issued',
    body: '<p>Dear {{name}},</p><p>Congratulations! Your certificate has been issued. Verification number: <b>{{verificationNumber}}</b>.</p>{{button}}',
  },
  support_reply: {
    subject: 'Reply to your question: {{subject}}',
    title: 'We replied to your question',
    body: '<p>Dear {{name}},</p><p>{{reply}}</p>{{button}}',
  },
  payment_receipt: {
    subject: 'Payment received - thank you',
    title: 'Payment received',
    body: '<p>Dear {{name}},</p><p>We received your payment of <b>{{currency}} {{amount}}</b> (reference {{reference}}). Thank you.</p>',
  },
  contact_message: {
    subject: 'Website contact: {{subject}}',
    title: 'New contact message',
    body: '<p><b>From:</b> {{name}} ({{email}}) {{phone}}</p><p>{{message}}</p>',
  },
};

const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fill(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    if (key === 'button') return data.url ? button(data.url, data.buttonLabel || 'Open') : '';
    return escapeHtml(data[key]);
  });
}

function render(key, data, override) {
  const base = defaults[key];
  if (!base) throw new Error(`Unknown email template: ${key}`);
  const subject = fill(override?.subject || base.subject, data);
  const bodyHtml = fill(override?.bodyHtml || base.body, data);
  const text = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { subject, html: layout(base.title, bodyHtml), text };
}

module.exports = { defaults, render, fill, escapeHtml, BRAND };
