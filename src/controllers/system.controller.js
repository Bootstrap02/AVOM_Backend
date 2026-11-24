const ActivityLog = require('../models/ActivityLog');
const EmailLog = require('../models/EmailLog');
const EmailTemplate = require('../models/EmailTemplate');
const settings = require('../services/settings.service');
const { defaults } = require('../templates/emailTemplates');
const { sendEmail } = require('../services/email.service');
const { logActivity, fromRequest } = require('../services/audit.service');
const ApiError = require('../utils/ApiError');
const { ok, paginated, parsePage, pageMeta } = require('../utils/respond');
const { env } = require('../config/env');

// Settings
const getSettings = async (_req, res) => ok(res, await settings.getAll());
async function putSettings(req, res) {
  for (const [key, value] of Object.entries(req.body || {})) await settings.set(key, value);
  await logActivity({ ...fromRequest(req), action: 'settings.updated', summary: 'Updated platform settings', meta: { keys: Object.keys(req.body || {}) } });
  ok(res, await settings.getAll(), 'Settings saved');
}
const publicSettings = async (_req, res) => ok(res, await settings.getMany(settings.PUBLIC_KEYS));

// Logs
async function activity(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 50 });
  const filter = req.query.action ? { action: new RegExp(`^${String(req.query.action).replace(/[^\w.]/g, '')}`) } : {};
  const [items, total] = await Promise.all([ActivityLog.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(), ActivityLog.countDocuments(filter)]);
  paginated(res, items, pageMeta(page, limit, total));
}
async function emailLogs(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 50 });
  const filter = req.query.status ? { status: req.query.status } : {};
  const [items, total] = await Promise.all([EmailLog.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(), EmailLog.countDocuments(filter)]);
  paginated(res, items, pageMeta(page, limit, total));
}

// Email templates (built-in defaults + admin overrides)
async function templates(_req, res) {
  const overrides = Object.fromEntries((await EmailTemplate.find().lean()).map((t) => [t.key, t]));
  ok(res, Object.entries(defaults).map(([key, d]) => ({ key, title: d.title, subject: overrides[key]?.subject || d.subject, bodyHtml: overrides[key]?.bodyHtml || d.body, customised: Boolean(overrides[key]) })));
}
async function saveTemplate(req, res) {
  if (!defaults[req.params.key]) throw ApiError.notFound('Unknown template');
  const t = await EmailTemplate.findOneAndUpdate({ key: req.params.key }, { subject: req.body.subject, bodyHtml: req.body.bodyHtml, updatedBy: req.user._id }, { upsert: true, new: true });
  ok(res, t, 'Template saved');
}
async function resetTemplate(req, res) {
  await EmailTemplate.deleteOne({ key: req.params.key });
  ok(res, null, 'Template reset to default');
}

// Public contact form -> AVOM inbox
async function contact(req, res) {
  const { name, email, phone, subject, message } = req.body;
  const contactSettings = await settings.get('site.contact');
  await sendEmail({ to: contactSettings?.email || env.email.contactInbox, template: 'contact_message', data: { name, email, phone: phone || '', subject: subject || 'Website enquiry', message } });
  ok(res, null, 'Thank you. Your message has been sent.');
}

module.exports = { getSettings, putSettings, publicSettings, activity, emailLogs, templates, saveTemplate, resetTemplate, contact };
