const Lesson = require('../models/Lesson');
const LecturePublication = require('../models/LecturePublication');
const NgoPost = require('../models/NgoPost');
const AudioEpisode = require('../models/AudioEpisode');
const Student = require('../models/Student');
const User = require('../models/User');
const Batch = require('../models/Batch');
const Progress = require('../models/Progress');
const { getStorage } = require('../integrations/storage');
const { sendEmail } = require('./email.service');
const { logActivity } = require('./audit.service');
const settings = require('./settings.service');
const { inactivityAction } = require('./logic');
const { addDays } = require('../utils/dates');
const { effectivePermissions } = require('../utils/permissions');
const { PERMISSIONS, STAFF_ROLES } = require('../constants/roles');
const { env } = require('../config/env');

const MAX_DELETE_ATTEMPTS = 5;

/**
 * Delete one stored asset safely. Returns the new bookkeeping fields; the caller saves them.
 * Never throws, so one failed delete cannot corrupt a record or stop the sweep.
 */
async function purgeAsset(storage, asset, { resourceType, deliveryType = 'upload', now }) {
  if (!asset || !asset.publicId) return null; // nothing to delete
  if (asset.deletionStatus === 'deleted') return null; // already done (idempotent)
  if ((asset.deletionAttempts || 0) >= MAX_DELETE_ATTEMPTS) return null; // stop retrying; surface to admins instead
  try {
    const result = await storage.deleteAsset({ publicId: asset.publicId, resourceType, deliveryType });
    if (!result.ok) throw new Error(`Provider replied "${result.raw}"`);
    return { deletionStatus: 'deleted', deletedAt: now, lastError: undefined };
  } catch (error) {
    return { deletionStatus: 'failed', deletionAttempts: (asset.deletionAttempts || 0) + 1, lastError: error.message };
  }
}

/** Step 1: scheduled lectures whose publish time has arrived become live. (Access is also date-checked live.) */
async function activateScheduled(now) {
  const res = await LecturePublication.updateMany({ status: 'scheduled', publishedAt: { $lte: now }, expiresAt: { $gt: now } }, { status: 'live' });
  return res.modifiedCount || 0;
}

/**
 * Step 2: close lectures past their expiry, then delete a lesson's video files only when NO live or scheduled
 * publication still needs them (a lesson can be published to several batches at different times).
 * Quiz attempts, scores and progress are never touched.
 */
async function expireLectures(now, storage) {
  const closed = await LecturePublication.updateMany({ status: 'live', expiresAt: { $lte: now } }, { status: 'expired' });

  const candidates = await LecturePublication.distinct('lesson', { status: { $in: ['expired', 'withdrawn'] } });
  let deleted = 0;
  let failed = 0;
  for (const lessonId of candidates) {
    if (await LecturePublication.exists({ lesson: lessonId, status: { $in: ['live', 'scheduled'] } })) continue;
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) continue;
    let changed = false;
    for (const part of lesson.parts) {
      const update = await purgeAsset(storage, part.video, { resourceType: 'video', deliveryType: 'authenticated', now });
      if (!update) continue;
      Object.assign(part.video, update);
      if (update.deletionStatus === 'deleted') { part.video.secureUrl = undefined; deleted += 1; } else failed += 1;
      changed = true;
    }
    if (changed) await lesson.save();
  }
  return { closed: closed.modifiedCount || 0, videosDeleted: deleted, videoDeleteFailures: failed };
}

function contentAssets(doc, kind) {
  if (kind === 'audio') {
    return [
      { asset: doc.audio, resourceType: 'video' },
      { asset: doc.cover, resourceType: 'image' },
    ];
  }
  return [{ asset: doc.cover, resourceType: 'image' }, ...(doc.gallery || []).map((g) => ({ asset: g, resourceType: 'image' }))];
}

/** Step 3: expire unpinned NGO/radio content, delete its files, keep the record. Retries failed deletions. */
async function expireContent(Model, kind, now, storage) {
  const due = await Model.find({
    $or: [
      { status: 'published', pinned: false, expiresAt: { $lte: now } },
      { status: 'expired' }, // retry earlier failed deletions
    ],
  });
  let expired = 0;
  let deleted = 0;
  let failed = 0;
  for (const doc of due) {
    if (doc.pinned) continue; // pinned content never expires automatically
    if (doc.status === 'published') {
      if (!doc.expiresAt || doc.expiresAt > now) continue; // extended since the query
      doc.status = 'expired';
      expired += 1;
    }
    for (const { asset, resourceType } of contentAssets(doc, kind)) {
      if (!asset || !asset.publicId || asset.deletionStatus === 'deleted') continue;
      const update = await purgeAsset(storage, { ...asset.toObject?.() ?? asset }, { resourceType, now });
      if (!update) continue;
      asset.deletionStatus = update.deletionStatus;
      if (update.deletionStatus === 'deleted') { asset.secureUrl = undefined; deleted += 1; } else failed += 1;
    }
    await doc.save();
  }
  return { expired, filesDeleted: deleted, deleteFailures: failed };
}

async function contentAdmins() {
  const users = await User.find({ role: { $in: STAFF_ROLES }, status: 'active' }).lean();
  return users.filter((u) => {
    const perms = effectivePermissions(u);
    return perms.includes(PERMISSIONS.CONTENT_NGO) || perms.includes(PERMISSIONS.CONTENT_RADIO);
  });
}

/** Step 4: warn admins 7 days before unpinned radio/NGO content expires (once per item). */
async function sendContentWarnings(now) {
  const days = await settings.get('expiry.warningDays');
  const horizon = addDays(now, days);
  const admins = await contentAdmins();
  let sent = 0;
  for (const [Model, kind, adminPath] of [[NgoPost, 'NGO item', 'ngo'], [AudioEpisode, 'radio episode', 'radio']]) {
    const items = await Model.find({ status: 'published', pinned: false, warningSentAt: null, expiresAt: { $gt: now, $lte: horizon } });
    for (const item of items) {
      for (const admin of admins) {
        await sendEmail({
          to: admin.email, template: 'content_expiring',
          data: { kind, title: item.title, expiresAt: item.expiresAt.toDateString(), url: `${env.adminUrl}/${adminPath}`, buttonLabel: 'Review content' },
        });
      }
      item.warningSentAt = now;
      await item.save();
      sent += 1;
    }
  }
  return sent;
}

/** Step 5: remind students (once) that a live lecture is about to close if they have not finished it. */
async function sendLectureWarnings(now) {
  const days = await settings.get('expiry.lectureWarningDays');
  const pubs = await LecturePublication.find({ status: 'live', warningSentAt: null, expiresAt: { $gt: now, $lte: addDays(now, days) } }).populate('lesson', 'title');
  let sent = 0;
  for (const pub of pubs) {
    const students = await Student.find({ batch: pub.batch }).select('user').lean();
    const done = new Set((await Progress.find({ lesson: pub.lesson._id, batch: pub.batch, lessonCompleted: true }).select('student').lean()).map((p) => String(p.student)));
    const pending = students.filter((s) => !done.has(String(s._id)));
    const users = await User.find({ _id: { $in: pending.map((s) => s.user) }, status: 'active' }).select('email name').lean();
    for (const u of users) {
      await sendEmail({ to: u.email, template: 'lecture_expiring', data: { name: u.name, lesson: pub.lesson.title, expiresAt: pub.expiresAt.toDateString(), url: `${env.clientUrl}/student/courses`, buttonLabel: 'Open my lessons' } });
      sent += 1;
    }
    pub.warningSentAt = now;
    await pub.save();
  }
  return sent;
}

async function nextBatchFor(student, now) {
  const open = await Batch.find({ programme: student.programme, status: 'open', _id: { $ne: student.batch } }).sort('startDate').lean();
  return open.find((b) => b.startDate && new Date(b.startDate) >= now) || open.find((b) => !b.startDate) || null;
}

/**
 * Step 6: inactive students pause (not fail); after a month away they are moved into the next batch,
 * which restarts the course. Old progress stays as history (progress is stored per batch).
 */
async function handleInactiveStudents(now) {
  const cfg = await settings.getMany(['student.pauseAfterDays', 'student.moveAfterDays']);
  const rules = { pauseAfterDays: cfg['student.pauseAfterDays'], moveAfterDays: cfg['student.moveAfterDays'] };
  const students = await Student.find({ batch: { $ne: null }, lastActivityAt: { $ne: null } });
  let paused = 0;
  let moved = 0;
  let flagged = 0;
  for (const student of students) {
    const user = await User.findById(student.user).select('status').lean();
    if (!user || user.status !== 'active') continue;
    const action = inactivityAction(student.lastActivityAt, now, rules);
    if (action === 'pause' && student.state === 'active') {
      student.state = 'paused';
      student.pausedAt = now;
      await student.save();
      paused += 1;
    } else if (action === 'move') {
      const next = await nextBatchFor(student, now);
      if (next) {
        student.batchHistory.push({ batch: student.batch, to: now, reason: 'Moved after one month of inactivity' });
        student.batch = next._id;
        student.state = 'active';
        student.pausedAt = undefined;
        student.needsBatch = false;
        student.lastActivityAt = now; // gives the student a fresh start in the new batch
        await student.save();
        moved += 1;
      } else if (!student.needsBatch) {
        student.state = 'paused';
        student.needsBatch = true; // admins see this on the dashboard and create/open a new batch
        await student.save();
        flagged += 1;
      }
    }
  }
  return { paused, moved, flaggedNeedingBatch: flagged };
}

async function runExpirySweep({ now = new Date(), storage = getStorage() } = {}) {
  const summary = {};
  summary.activated = await activateScheduled(now);
  summary.lectures = await expireLectures(now, storage);
  summary.ngo = await expireContent(NgoPost, 'ngo', now, storage);
  summary.radio = await expireContent(AudioEpisode, 'audio', now, storage);
  summary.contentWarnings = await sendContentWarnings(now);
  summary.lectureWarnings = await sendLectureWarnings(now);
  summary.students = await handleInactiveStudents(now);
  await logActivity({ action: 'system.expiry_sweep', summary: 'Daily expiry and inactivity sweep', meta: summary });
  return summary;
}

module.exports = { runExpirySweep, purgeAsset, expireLectures, expireContent };
