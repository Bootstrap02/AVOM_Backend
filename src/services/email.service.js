const { env } = require('../config/env');
const { render } = require('../templates/emailTemplates');
const EmailLog = require('../models/EmailLog');
const EmailTemplate = require('../models/EmailTemplate');

/**
 * Send a templated email. Never throws: a failed email must not undo the action that triggered it.
 * Failures are recorded in EmailLog so staff can follow up (e.g. "resend activation").
 * With no Resend key (or EMAIL_MODE=log) the email is logged to the console instead of sent.
 */
async function sendEmail({ to, template, data = {} }) {
  let subject = template;
  try {
    const override = await EmailTemplate.findOne({ key: template }).lean();
    const rendered = render(template, data, override);
    subject = rendered.subject;

    const { resend, isConfigured } = require('../integrations/resend');
    const useResend = isConfigured && env.email.mode !== 'log';

    if (!useResend) {
      console.info(`[email:log] to=${to} template=${template} subject="${rendered.subject}"${data.url ? ` url=${data.url}` : ''}`);
      await EmailLog.create({ to, template, subject, status: 'logged' });
      return { status: 'logged' };
    }

    const result = await resend.emails.send({
      from: env.email.from, to, subject: rendered.subject, html: rendered.html, text: rendered.text,
    });
    if (result.error) throw new Error(result.error.message || 'Resend error');
    await EmailLog.create({ to, template, subject, status: 'sent', providerId: result.data?.id });
    return { status: 'sent' };
  } catch (error) {
    console.error(`[email:failed] to=${to} template=${template}: ${error.message}`);
    try {
      await EmailLog.create({ to, template, subject, status: 'failed', error: error.message });
    } catch (_) { /* logging must not throw */ }
    return { status: 'failed', error: error.message };
  }
}

module.exports = { sendEmail };
