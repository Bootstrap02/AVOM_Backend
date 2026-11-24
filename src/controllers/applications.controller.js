const Application = require('../models/Application');
const Programme = require('../models/Programme');
const service = require('../services/applications.service');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated, parsePage, pageMeta } = require('../utils/respond');

const FIELDS = [
  'fullName', 'gender', 'email', 'phone', 'country', 'city', 'church', 'denomination', 'pastorName', 'pastorContact',
  'programme', 'studyMode', 'testimony', 'reason', 'ministryInvolvement', 'education',
];

// Public
async function submit(req, res) {
  const data = Object.fromEntries(FIELDS.filter((f) => req.body[f] !== undefined && req.body[f] !== '').map((f) => [f, req.body[f]]));
  await service.submit(data);
  created(res, null, 'Application received. We have emailed you a confirmation.');
}

async function publicProgrammes(_req, res) {
  const programmes = await Programme.find({ active: true }).select('name description studyModes').sort('name').lean();
  ok(res, programmes);
}

// Admin
async function list(req, res) {
  const { page, limit, skip } = parsePage(req.query);
  const filter = {};
  if (['pending', 'accepted', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([
    Application.find(filter).populate('programme', 'name').sort('-createdAt').skip(skip).limit(limit).lean(),
    Application.countDocuments(filter),
  ]);
  paginated(res, items, pageMeta(page, limit, total));
}

async function getOne(req, res) {
  const application = await Application.findById(req.params.id).populate('programme', 'name').populate('reviewedBy', 'name').lean();
  if (!application) throw ApiError.notFound('Application not found');
  ok(res, application);
}

async function accept(req, res) {
  const result = await service.accept(req.params.id, req.body, req.user);
  ok(res, { application: result.application, studentNumber: result.student.studentNumber, emailStatus: result.emailStatus }, 'Application accepted');
}

async function reject(req, res) {
  const application = await service.reject(req.params.id, req.body.reason, req.user);
  ok(res, application, 'Application rejected');
}

module.exports = { submit, publicProgrammes, list, getOne, accept, reject };
