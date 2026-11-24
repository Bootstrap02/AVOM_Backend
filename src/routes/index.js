const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission } = require('../middlewares/auth');
const { publicFormLimiter } = require('../middlewares/rate-limiters');
const { PERMISSIONS: P } = require('../constants/roles');
const { submitRules, acceptRules, rejectRules } = require('../validators/applications.validators');

const applications = require('../controllers/applications.controller');
const students = require('../controllers/students.controller');
const academics = require('../controllers/academics.controller');
const lectures = require('../controllers/lectures.controller');
const learning = require('../controllers/learning.controller');
const content = require('../controllers/content.controller');
const support = require('../controllers/support.controller');
const faq = require('../controllers/faq.controller');
const certificates = require('../controllers/certificates.controller');
const attendance = require('../controllers/attendance.controller');
const payments = require('../controllers/payments.controller');
const dashboard = require('../controllers/dashboard.controller');
const staff = require('../controllers/staff.controller');
const system = require('../controllers/system.controller');

const router = express.Router();
const mongoId = (field) => body(field).isMongoId().withMessage('Invalid id');
const any = (...perms) => requirePermission(...perms);

router.use('/auth', require('./auth.routes'));

/* ---------------- Public (no login) ---------------- */
const pub = express.Router();
pub.get('/programmes', applications.publicProgrammes);
pub.post('/applications', publicFormLimiter, submitRules, validate, applications.submit);
pub.get('/ngo', content.publicNgoList);
pub.get('/ngo/:key', content.publicNgoOne);
pub.get('/gallery', content.publicGallery);
pub.get('/radio', content.publicRadioList);
pub.get('/radio/latest', content.publicRadioLatest);
pub.get('/podcast.xml', content.podcastFeed);
pub.get('/settings', system.publicSettings);
pub.get('/faq', faq.publicList);
pub.post('/contact', publicFormLimiter,
  body('name').trim().notEmpty(), body('email').trim().toLowerCase().isEmail(), body('message').trim().isLength({ min: 5, max: 5000 }), validate, system.contact);
pub.get('/certificates/verify/:number', certificates.publicVerify);
pub.post('/payments/initialize', publicFormLimiter,
  body('email').trim().toLowerCase().isEmail(), body('amount').isFloat({ min: 100 }).withMessage('Enter an amount'), validate, payments.initialize);
pub.get('/payments/verify/:reference', payments.verify);
router.use('/public', pub);

/* ---------------- Student (login required, student accounts only) ---------------- */
const stu = express.Router();
stu.use(authenticate('student'));
stu.get('/dashboard', learning.dashboard);
stu.get('/continue', learning.continueLearning);
stu.get('/lectures', learning.lectures);
stu.get('/lectures/:publicationId', learning.lecture);
stu.get('/lectures/:publicationId/parts/:order/playback', learning.playback);
stu.get('/lectures/:publicationId/parts/:order/quiz', learning.quiz);
stu.post('/lectures/:publicationId/parts/:order/quiz', body('answers').isArray(), validate, learning.submitQuiz);
stu.put('/progress', mongoId('publicationId'), body('partOrder').isInt({ min: 1 }), body('positionSeconds').isFloat({ min: 0 }), validate, learning.saveProgress);
stu.get('/results', learning.results);
stu.get('/certificates', learning.myCertificates);
stu.get('/attendance', learning.myAttendance);
stu.get('/profile', students.myProfile);
stu.patch('/profile', students.updateMyProfile);
stu.get('/faq', faq.publicList);
stu.get('/questions', support.mine);
stu.post('/questions', body('subject').trim().notEmpty(), body('message').trim().isLength({ min: 3, max: 5000 }), validate, support.create);
stu.get('/questions/:id', support.mineOne);
stu.post('/questions/:id/replies', body('message').trim().isLength({ min: 1, max: 5000 }), validate, support.studentReply);
router.use('/student', stu);

// Certificate PDF: the owning student or authorised staff (checked in the controller).
router.get('/certificates/:id/pdf', authenticate(), certificates.pdf);

/* ---------------- Admin (staff only; every route checks a permission) ---------------- */
const adm = express.Router();
adm.use(authenticate('staff'));

adm.get('/dashboard', dashboard.dashboard);
adm.get('/storage/usage', any(P.SETTINGS_MANAGE, P.LECTURES_PUBLISH), dashboard.storageUsage);

// Applications
adm.get('/applications', any(P.APPLICATIONS_READ), applications.list);
adm.get('/applications/:id', any(P.APPLICATIONS_READ), applications.getOne);
adm.post('/applications/:id/accept', any(P.APPLICATIONS_REVIEW), acceptRules, validate, applications.accept);
adm.post('/applications/:id/reject', any(P.APPLICATIONS_REVIEW), rejectRules, validate, applications.reject);

// Students
adm.get('/students', any(P.STUDENTS_READ), students.list);
adm.get('/students/export.csv', any(P.STUDENTS_READ), students.exportCsv);
adm.post('/students', any(P.STUDENTS_WRITE),
  body('fullName').trim().notEmpty(), body('email').trim().toLowerCase().isEmail(),
  body('studyMode').optional({ values: 'falsy' }).isIn(['online', 'modular', 'on_ground']), validate, students.createOffline);
adm.post('/students/import', any(P.STUDENTS_WRITE), students.importRows);
adm.get('/students/:id', any(P.STUDENTS_READ, P.RECORDS_READ_ALL), students.getOne);
adm.patch('/students/:id', any(P.STUDENTS_WRITE), students.update);
const withAction = (action) => (req, _res, next) => { req.params.action = action; next(); };
adm.post('/students/:id/suspend', any(P.STUDENTS_WRITE), withAction('suspend'), students.setStatus);
adm.post('/students/:id/reactivate', any(P.STUDENTS_WRITE), withAction('reactivate'), students.setStatus);
adm.post('/students/:id/batch', any(P.STUDENTS_WRITE), mongoId('batch'), validate, students.assignBatch);
adm.post('/students/:id/resend-activation', any(P.STUDENTS_WRITE), students.resendActivation);
adm.post('/students/:id/password-reset', any(P.STUDENTS_WRITE), students.sendPasswordReset);

// School setup
const setup = (path, r) => {
  adm.get(path, any(P.ACADEMICS_MANAGE, P.LECTURES_WRITE, P.STUDENTS_READ, P.APPLICATIONS_READ), r.list);
  adm.post(path, any(P.ACADEMICS_MANAGE), r.create);
  adm.patch(`${path}/:id`, any(P.ACADEMICS_MANAGE), r.update);
  adm.delete(`${path}/:id`, any(P.ACADEMICS_MANAGE), r.remove);
};
setup('/programmes', academics.programmes);
setup('/courses', academics.courses);
setup('/modules', academics.modules);
setup('/batches', academics.batches);
adm.get('/lecturers', any(P.ACADEMICS_MANAGE), staff.lecturers);
adm.get('/academics/tree', any(P.ACADEMICS_MANAGE, P.LECTURES_WRITE), academics.tree);
adm.get('/batches/:id/members', any(P.STUDENTS_READ, P.ATTENDANCE_MANAGE), academics.batchMembers);

// Lectures, quizzes and publishing
adm.post('/uploads/signature', body('kind').notEmpty(), validate, lectures.uploadSignature);
adm.get('/lessons', any(P.LECTURES_WRITE), lectures.list);
adm.post('/lessons', any(P.LECTURES_WRITE), mongoId('module'), body('title').trim().notEmpty(), validate, lectures.create);
adm.get('/lessons/:id', any(P.LECTURES_WRITE), lectures.getOne);
adm.patch('/lessons/:id', any(P.LECTURES_WRITE), lectures.update);
adm.delete('/lessons/:id', any(P.LECTURES_WRITE), lectures.remove);
adm.put('/lessons/:id/parts/:order/video', any(P.LECTURES_WRITE), body('publicId').notEmpty(), validate, lectures.attachVideo);
adm.put('/lessons/:id/parts/:order/quiz', any(P.LECTURES_WRITE), lectures.saveQuiz);
adm.get('/lessons/:id/parts/:order/preview', any(P.LECTURES_WRITE), lectures.preview);
adm.post('/lessons/:id/publish', any(P.LECTURES_PUBLISH), lectures.publish); // lecturers draft; admins publish
adm.get('/publications', any(P.LECTURES_WRITE, P.LECTURES_PUBLISH), lectures.listPublications);
adm.patch('/publications/:id/expiry', any(P.LECTURES_PUBLISH), body('expiresAt').isISO8601(), validate, lectures.extendPublication);
adm.post('/publications/:id/withdraw', any(P.LECTURES_PUBLISH), lectures.withdrawPublication);

// Records, attendance, certificates
adm.get('/records/batches/:batchId/results', any(P.RECORDS_READ_ALL), dashboard.batchResults);
adm.get('/records/courses', any(P.RECORDS_READ_ALL, P.RECORDS_READ_OWN_COURSES), dashboard.courseResults);
adm.get('/attendance', any(P.ATTENDANCE_MANAGE, P.RECORDS_READ_ALL), attendance.list);
adm.post('/attendance', any(P.ATTENDANCE_MANAGE), mongoId('batch'), body('date').isISO8601(), validate, attendance.mark);
adm.get('/certificates', any(P.CERTIFICATES_ISSUE, P.RECORDS_READ_ALL), certificates.list);
adm.get('/certificates/eligibility/:studentId', any(P.CERTIFICATES_ISSUE), certificates.eligibility);
adm.post('/certificates', any(P.CERTIFICATES_ISSUE), mongoId('student'), validate, certificates.issue);
adm.post('/certificates/:id/revoke', any(P.CERTIFICATES_ISSUE), body('reason').trim().notEmpty(), validate, certificates.revoke);

// NGO and radio
const manage = (path, r, perm) => {
  adm.get(path, any(perm), r.list);
  adm.post(path, any(perm), body('title').trim().notEmpty(), validate, r.create);
  adm.get(`${path}/:id`, any(perm), r.getOne);
  adm.patch(`${path}/:id`, any(perm), r.update);
  adm.post(`${path}/:id/publish`, any(perm), r.publish);
  adm.post(`${path}/:id/unpublish`, any(perm), r.unpublish);
  adm.post(`${path}/:id/pin`, any(perm), r.pin);
  adm.patch(`${path}/:id/expiry`, any(perm), body('expiresAt').isISO8601(), validate, r.setExpiry);
  adm.delete(`${path}/:id`, any(perm), r.remove);
};
manage('/ngo', content.ngo, P.CONTENT_NGO);
manage('/radio', content.radio, P.CONTENT_RADIO);

// Support and FAQ
adm.get('/questions', any(P.SUPPORT_READ), support.staffList);
adm.get('/questions/:id', any(P.SUPPORT_READ), support.staffOne);
adm.post('/questions/:id/replies', any(P.SUPPORT_RESPOND), body('message').trim().notEmpty(), validate, support.staffReply);
adm.post('/questions/:id/resolve', any(P.SUPPORT_RESPOND), support.resolve);
adm.get('/faq', any(P.FAQ_MANAGE), faq.adminList);
adm.post('/faq', any(P.FAQ_MANAGE), body('question').trim().notEmpty(), body('answer').trim().notEmpty(), validate, faq.create);
adm.patch('/faq/:id', any(P.FAQ_MANAGE), faq.update);
adm.delete('/faq/:id', any(P.FAQ_MANAGE), faq.remove);

// Staff, settings, logs, templates, payments
adm.get('/staff/meta', any(P.STAFF_MANAGE), staff.meta);
adm.get('/staff', any(P.STAFF_MANAGE), staff.list);
adm.post('/staff', any(P.STAFF_MANAGE), body('name').trim().notEmpty(), body('email').trim().toLowerCase().isEmail(), validate, staff.create);
adm.patch('/staff/:id', any(P.STAFF_MANAGE), staff.update);
adm.post('/staff/:id/resend-invite', any(P.STAFF_MANAGE), staff.resendInvite);
adm.get('/settings', any(P.SETTINGS_MANAGE), system.getSettings);
adm.put('/settings', any(P.SETTINGS_MANAGE), system.putSettings);
adm.get('/email-templates', any(P.SETTINGS_MANAGE), system.templates);
adm.put('/email-templates/:key', any(P.SETTINGS_MANAGE), body('subject').notEmpty(), body('bodyHtml').notEmpty(), validate, system.saveTemplate);
adm.delete('/email-templates/:key', any(P.SETTINGS_MANAGE), system.resetTemplate);
adm.get('/email-logs', any(P.SETTINGS_MANAGE, P.LOGS_VIEW), system.emailLogs);
adm.get('/activity', any(P.LOGS_VIEW), system.activity);
adm.get('/payments', any(P.PAYMENTS_VIEW), payments.adminList);
router.use('/admin', adm);

module.exports = router;
