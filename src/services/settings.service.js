const Setting = require('../models/Setting');

// Every tunable business value lives here with a default, so nothing is hard-coded in feature code.
const DEFAULTS = Object.freeze({
  'expiry.lectureAccessDays': 7,
  'expiry.audioDays': 100,
  'expiry.ngoDays': 200,
  'expiry.warningDays': 7,
  'expiry.lectureWarningDays': 1,
  'student.numberPattern': 'ABBS/{year}/{seq:3}',
  'student.pauseAfterDays': 7,
  'student.moveAfterDays': 30,
  'quiz.defaultPassMark': 50,
  'quiz.defaultMaxAttempts': 3,
  'video.completionThreshold': 0.9,
  'auth.activationDays': 7,
  'site.contact': { email: 'info@avomglobal.org', phone: '', whatsapp: '', address: '' },
  'site.social': { youtube: '', facebook: '', instagram: '', twitter: '', telegram: '' },
  'radio.schedule': { day: 'Wednesday', time: '', note: '' },
  'radio.liveStreamUrl': '',
  'radio.spotifyShowUrl': '',
});

// Values the public website may read.
const PUBLIC_KEYS = ['site.contact', 'site.social', 'radio.schedule', 'radio.liveStreamUrl', 'radio.spotifyShowUrl'];

async function get(key) {
  const doc = await Setting.findOne({ key }).lean();
  return doc ? doc.value : DEFAULTS[key];
}

async function getMany(keys) {
  const docs = await Setting.find({ key: { $in: keys } }).lean();
  const found = Object.fromEntries(docs.map((d) => [d.key, d.value]));
  return Object.fromEntries(keys.map((k) => [k, k in found ? found[k] : DEFAULTS[k]]));
}

async function getAll() {
  return getMany(Object.keys(DEFAULTS));
}

async function set(key, value) {
  if (!(key in DEFAULTS)) {
    const error = new Error(`Unknown setting: ${key}`);
    error.status = 400;
    throw error;
  }
  await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
  return value;
}

module.exports = { DEFAULTS, PUBLIC_KEYS, get, getMany, getAll, set };
