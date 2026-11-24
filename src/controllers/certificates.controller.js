const PDFDocument = require('pdfkit');
const Certificate = require('../models/Certificate');
const Student = require('../models/Student');
const records = require('../services/records.service');
const { sendEmail } = require('../services/email.service');
const { logActivity, fromRequest } = require('../services/audit.service');
const { randomCode } = require('../utils/tokens');
const { hasPermission } = require('../utils/permissions');
const { PERMISSIONS, ROLES } = require('../constants/roles');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');
const { env } = require('../config/env');

async function uniqueNumber() {
  for (let i = 0; i < 5; i += 1) {
    const number = `AVOM-${randomCode(4)}-${randomCode(4)}`;
    if (!(await Certificate.exists({ verificationNumber: number }))) return number;
  }
  throw new Error('Could not generate a unique verification number');
}

// A certificate needs the programme's requirements met. Only a Super Admin may override, with a recorded reason.
async function issue(req, res) {
  const student = await Student.findById(req.body.student).populate('programme', 'name').populate('user', 'email name');
  if (!student || !student.programme) throw ApiError.badRequest('Student or programme not found');
  if (await Certificate.exists({ student: student._id, programme: student.programme._id, status: 'valid' })) {
    throw ApiError.conflict('This student already holds a valid certificate for this programme');
  }
  const completion = await records.programmeCompletion(student._id);
  let overrideReason;
  if (!completion.eligible) {
    if (req.user.role !== ROLES.SUPER_ADMIN || !req.body.overrideReason) {
      throw ApiError.unprocessable('This student has not met the programme requirements', [
        { field: 'completion', message: `Completion ${completion.completionPercent}% (needs ${completion.requirements.minCompletion}%), average ${completion.averageScore}% (needs ${completion.requirements.minAverage}%)` },
      ]);
    }
    overrideReason = req.body.overrideReason;
  }
  const cert = await Certificate.create({
    student: student._id, programme: student.programme._id, verificationNumber: await uniqueNumber(),
    title: `Certificate of Completion: ${student.programme.name}`, issuedBy: req.user._id, overrideReason,
  });
  await logActivity({ ...fromRequest(req), action: 'certificate.issued', entityType: 'Certificate', entityId: cert._id, summary: `Issued certificate to ${student.fullName}`, meta: { overridden: Boolean(overrideReason) } });
  await sendEmail({ to: student.user.email, template: 'certificate_issued', data: { name: student.fullName, verificationNumber: cert.verificationNumber, url: `${env.clientUrl}/student/certificates`, buttonLabel: 'View my certificates' } });
  created(res, cert, 'Certificate issued');
}

async function revoke(req, res) {
  const cert = await Certificate.findByIdAndUpdate(req.params.id, { status: 'revoked', revokedReason: req.body.reason }, { new: true });
  if (!cert) throw ApiError.notFound('Certificate not found');
  await logActivity({ ...fromRequest(req), action: 'certificate.revoked', entityType: 'Certificate', entityId: cert._id, summary: 'Revoked a certificate', meta: { reason: req.body.reason } });
  ok(res, cert, 'Certificate revoked');
}

async function list(req, res) {
  const filter = {};
  if (req.query.student) filter.student = req.query.student;
  ok(res, await Certificate.find(filter).populate('student', 'fullName studentNumber').populate('programme', 'name').sort('-issuedAt').limit(300).lean());
}

async function eligibility(req, res) {
  ok(res, await records.programmeCompletion(req.params.studentId));
}

// PDF generated on demand. The database record, not the PDF, is what proves validity.
async function pdf(req, res) {
  const cert = await Certificate.findById(req.params.id).populate('student', 'fullName studentNumber user').populate('programme', 'name').lean();
  if (!cert) throw ApiError.notFound('Certificate not found');
  const isOwner = req.user.role === ROLES.STUDENT && String(cert.student.user) === String(req.user._id);
  if (!isOwner && !hasPermission(req.user, PERMISSIONS.CERTIFICATES_ISSUE) && !hasPermission(req.user, PERMISSIONS.RECORDS_READ_ALL)) throw ApiError.forbidden();

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${cert.verificationNumber}.pdf"`);
  doc.pipe(res);
  doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(4).stroke('#2C3E50');
  doc.fillColor('#2C3E50').font('Times-Bold').fontSize(32).text('AVOM Believers Bible School', { align: 'center' }).moveDown(0.2);
  doc.font('Times-Roman').fontSize(16).fillColor('#6ABF4B').text('Apostle Victor Ogagaoghene Ministries', { align: 'center' }).moveDown(1.5);
  doc.fillColor('#2C3E50').fontSize(22).text('Certificate of Completion', { align: 'center' }).moveDown(1);
  doc.fontSize(14).text('This is to certify that', { align: 'center' }).moveDown(0.5);
  doc.font('Times-Bold').fontSize(30).text(cert.student.fullName, { align: 'center' }).moveDown(0.5);
  doc.font('Times-Roman').fontSize(14).text('has successfully completed the requirements of', { align: 'center' }).moveDown(0.5);
  doc.font('Times-Bold').fontSize(20).text(cert.programme.name, { align: 'center' }).moveDown(1.5);
  doc.font('Times-Roman').fontSize(12).fillColor('#555')
    .text(`Student number: ${cert.student.studentNumber}    Issued: ${new Date(cert.issuedAt).toDateString()}`, { align: 'center' })
    .text(`Verification number: ${cert.verificationNumber}`, { align: 'center' })
    .text(`Verify at ${env.clientUrl}/verify`, { align: 'center' });
  if (cert.status === 'revoked') doc.fillColor('red').fontSize(40).text('REVOKED', { align: 'center' });
  doc.end();
}

async function publicVerify(req, res) {
  const cert = await Certificate.findOne({ verificationNumber: String(req.params.number).toUpperCase().trim() })
    .populate('student', 'fullName').populate('programme', 'name').lean();
  if (!cert) return ok(res, { valid: false });
  ok(res, { valid: cert.status === 'valid', status: cert.status, holder: cert.student.fullName, programme: cert.programme.name, issuedAt: cert.issuedAt, issuer: cert.issuingAuthority });
}

module.exports = { issue, revoke, list, eligibility, pdf, publicVerify };
