const wa = require('../integrations/whatsapp');
const Student = require('../models/Student');
const SupportQuestion = require('../models/SupportQuestion');

// Meta calls this once when you register the webhook.
function verify(req, res) {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token && token === wa.verifyToken()) return res.status(200).send(String(challenge));
  return res.sendStatus(403);
}

async function findStudentByPhone(from) {
  const digits = String(from).replace(/\D/g, '');
  if (digits.length < 7) return null;
  // Students may store numbers with +, spaces or a leading 0, so match on the last 9 digits.
  return Student.findOne({ phoneDigits: new RegExp(`${digits.slice(-9)}$`) }).select('_id').lean();
}

/** Each inbound message joins the open WhatsApp conversation for that number, or starts a new question. */
async function ingest(message) {
  if (!message.text) return;
  if (await SupportQuestion.exists({ 'messages.externalId': message.id })) return; // Meta retries; never store twice
  const entry = { from: 'student', body: message.text, externalId: message.id, at: new Date() };
  const open = await SupportQuestion.findOne({ channel: 'whatsapp', contact: message.from, status: { $ne: 'resolved' } });
  if (open) {
    open.messages.push(entry);
    open.status = 'open';
    await open.save();
    return;
  }
  const student = await findStudentByPhone(message.from);
  await SupportQuestion.create({
    channel: 'whatsapp', contact: message.from, student: student?._id,
    subject: `WhatsApp: ${message.text.slice(0, 60)}${message.name ? ` (${message.name})` : ''}`,
    messages: [entry],
  });
}

// Raw body is required for the signature check (mounted before express.json in app.js).
async function receive(req, res) {
  if (!wa.isValidSignature(req.body, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch (_) { return res.sendStatus(400); }
  try {
    for (const message of wa.extractMessages(payload)) await ingest(message);
  } catch (error) {
    console.error('WhatsApp ingest failed:', error.message);
    return res.sendStatus(500); // lets Meta retry
  }
  return res.sendStatus(200);
}

module.exports = { verify, receive, ingest, findStudentByPhone };
