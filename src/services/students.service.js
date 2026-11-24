const User = require('../models/User');
const Student = require('../models/Student');
const Counter = require('../models/Counter');
const Batch = require('../models/Batch');
const Programme = require('../models/Programme');
const ApiError = require('../utils/ApiError');
const { formatStudentNumber } = require('../utils/studentNumber');
const { ROLES } = require('../constants/roles');
const settings = require('./settings.service');
const auth = require('./auth.service');

async function generateStudentNumber(now = new Date()) {
  const year = now.getFullYear();
  const pattern = await settings.get('student.numberPattern');
  const seq = await Counter.next(`student-number:${year}`);
  return formatStudentNumber(pattern, year, seq);
}

async function resolveProgrammeAndBatch({ programme, batch }) {
  let programmeDoc = null;
  let batchDoc = null;
  if (programme) {
    programmeDoc = await Programme.findById(programme);
    if (!programmeDoc) throw ApiError.badRequest('Programme not found');
  }
  if (batch) {
    batchDoc = await Batch.findById(batch);
    if (!batchDoc) throw ApiError.badRequest('Batch not found');
    if (programmeDoc && String(batchDoc.programme) !== String(programmeDoc._id)) {
      throw ApiError.badRequest('That batch belongs to a different programme');
    }
    if (!programmeDoc) programmeDoc = await Programme.findById(batchDoc.programme);
  }
  return { programmeDoc, batchDoc };
}

/**
 * Create the login identity (User, status "invited") and the academic Student record.
 * Used by application acceptance, offline registration and bulk import, so all students share one model.
 */
async function createStudent(data, { source = 'online', application } = {}) {
  const email = String(data.email).toLowerCase().trim();
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');

  const { programmeDoc, batchDoc } = await resolveProgrammeAndBatch(data);
  const user = await User.create({ email, role: ROLES.STUDENT, name: data.fullName, phone: data.phone, status: 'invited' });
  try {
    const studentNumber = await generateStudentNumber();
    const student = await Student.create({
      user: user._id, studentNumber, application: application?._id, source,
      fullName: data.fullName, gender: data.gender || '', phone: data.phone, country: data.country, city: data.city,
      church: data.church, denomination: data.denomination, pastorName: data.pastorName, pastorContact: data.pastorContact,
      ministryInvolvement: data.ministryInvolvement, education: data.education,
      programme: programmeDoc?._id, batch: batchDoc?._id, studyMode: data.studyMode || 'online',
      lastActivityAt: new Date(),
    });
    return { user, student };
  } catch (error) {
    await User.deleteOne({ _id: user._id }); // do not leave an orphan identity behind
    throw error;
  }
}

async function createAndInvite(data, options) {
  const { user, student } = await createStudent(data, options);
  const email = await auth.sendActivation(user, { studentNumber: student.studentNumber });
  return { user, student, emailStatus: email.status };
}

/** Moving batch restarts the course: old progress stays as history, new progress is per batch. */
async function moveToBatch(student, batchId, reason = 'Moved by staff') {
  const batch = await Batch.findById(batchId);
  if (!batch) throw ApiError.badRequest('Batch not found');
  if (student.programme && String(batch.programme) !== String(student.programme)) {
    throw ApiError.badRequest('That batch belongs to a different programme');
  }
  if (student.batch) {
    student.batchHistory.push({ batch: student.batch, to: new Date(), reason });
  }
  student.batch = batch._id;
  student.programme = student.programme || batch.programme;
  student.needsBatch = false;
  student.state = 'active';
  student.pausedAt = undefined;
  student.lastActivityAt = new Date();
  await student.save();
  return student;
}

async function setAccountStatus(student, status) {
  const user = await User.findById(student.user);
  if (!user) throw ApiError.notFound('Account not found');
  user.status = status;
  await user.save();
  if (status === 'suspended') await auth.revokeAllSessions(user._id);
  return user;
}

module.exports = { generateStudentNumber, createStudent, createAndInvite, moveToBatch, setAccountStatus };
