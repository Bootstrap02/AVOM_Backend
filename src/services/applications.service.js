const Application = require('../models/Application');
const Student = require('../models/Student');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { sendEmail } = require('./email.service');
const students = require('./students.service');
const auth = require('./auth.service');
const { logActivity } = require('./audit.service');

async function submit(data) {
  const email = String(data.email).toLowerCase().trim();
  if (await User.exists({ email })) {
    throw ApiError.conflict('This email already has an AVOM account. Please sign in instead.');
  }
  if (await Application.exists({ email, status: 'pending' })) {
    throw ApiError.conflict('You already have an application waiting for review.');
  }
  // A previous rejection does not block reapplying; the old application stays in the history.
  const application = await Application.create({ ...data, email });
  await sendEmail({ to: email, template: 'application_received', data: { name: application.fullName } });
  return application;
}

async function accept(id, { programme, batch, studyMode }, reviewer) {
  // Atomic pending -> accepted transition prevents double acceptance and duplicate students.
  const application = await Application.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'accepted', reviewedBy: reviewer._id, reviewedAt: new Date() } },
    { new: true },
  );
  if (!application) {
    const exists = await Application.exists({ _id: id });
    throw exists ? ApiError.conflict('This application has already been reviewed') : ApiError.notFound('Application not found');
  }

  try {
    const { user, student } = await students.createStudent(
      {
        ...application.toObject(),
        programme: programme || application.programme,
        batch,
        studyMode: studyMode || application.studyMode,
      },
      { source: 'online', application },
    );
    application.student = student._id;
    application.programme = student.programme;
    await application.save();

    const activation = await auth.sendActivation(user, { studentNumber: student.studentNumber });
    await logActivity({
      actor: reviewer, action: 'application.accepted', entityType: 'Application', entityId: application._id,
      summary: `Accepted ${application.fullName} (${student.studentNumber})`,
    });
    return { application, student, emailStatus: activation.status };
  } catch (error) {
    // Roll the decision back so the application can be reviewed again.
    await Application.updateOne(
      { _id: id }, { $set: { status: 'pending' }, $unset: { reviewedBy: '', reviewedAt: '', student: '' } },
    );
    throw error;
  }
}

async function reject(id, reason, reviewer) {
  const application = await Application.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'rejected', rejectionReason: reason, reviewedBy: reviewer._id, reviewedAt: new Date() } },
    { new: true },
  );
  if (!application) {
    const exists = await Application.exists({ _id: id });
    throw exists ? ApiError.conflict('This application has already been reviewed') : ApiError.notFound('Application not found');
  }
  await sendEmail({
    to: application.email, template: 'application_rejected', data: { name: application.fullName, reason },
  });
  await logActivity({
    actor: reviewer, action: 'application.rejected', entityType: 'Application', entityId: application._id,
    summary: `Rejected ${application.fullName}`, meta: { reason },
  });
  return application;
}

async function findStudentForApplication(application) {
  return application.student ? Student.findById(application.student) : null;
}

module.exports = { submit, accept, reject, findStudentForApplication };
