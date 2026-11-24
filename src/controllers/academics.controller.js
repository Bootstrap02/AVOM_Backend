const Programme = require('../models/Programme');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Batch = require('../models/Batch');
const Lesson = require('../models/Lesson');
const Student = require('../models/Student');
const LecturePublication = require('../models/LecturePublication');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');
const { logActivity, fromRequest } = require('../services/audit.service');

function pick(body, fields) {
  return Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
}

// Small factory so the four setup resources behave the same way.
function resource({ Model, label, fields, filterFields = [], populate, guardDelete }) {
  return {
    async list(req, res) {
      const filter = {};
      filterFields.forEach((f) => { if (req.query[f]) filter[f] = req.query[f]; });
      let query = Model.find(filter).sort('order name');
      if (populate) query = query.populate(populate);
      ok(res, await query.lean());
    },
    async create(req, res) {
      const doc = await Model.create(pick(req.body, fields));
      await logActivity({ ...fromRequest(req), action: `${label}.created`, entityType: label, entityId: doc._id, summary: `Created ${label} "${doc.name}"` });
      created(res, doc);
    },
    async update(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      Object.assign(doc, pick(req.body, fields));
      await doc.save();
      await logActivity({ ...fromRequest(req), action: `${label}.updated`, entityType: label, entityId: doc._id, summary: `Updated ${label} "${doc.name}"` });
      ok(res, doc);
    },
    async remove(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      if (guardDelete) await guardDelete(doc);
      await doc.deleteOne();
      await logActivity({ ...fromRequest(req), action: `${label}.deleted`, entityType: label, entityId: doc._id, summary: `Deleted ${label} "${doc.name}"` });
      ok(res, null, `${label} deleted`);
    },
  };
}

const programmes = resource({
  Model: Programme, label: 'programme', fields: ['name', 'description', 'active', 'studyModes', 'requirements'],
  async guardDelete(doc) {
    if ((await Course.exists({ programme: doc._id })) || (await Student.exists({ programme: doc._id }))) {
      throw ApiError.conflict('This programme has courses or students. Deactivate it instead of deleting.');
    }
  },
});
const courses = resource({
  Model: Course, label: 'course', fields: ['programme', 'name', 'description', 'order', 'active', 'lecturers'], filterFields: ['programme'],
  async guardDelete(doc) {
    if (await Module.exists({ course: doc._id })) throw ApiError.conflict('Remove or move this course\'s modules first.');
  },
});
const modules = resource({
  Model: Module, label: 'module', fields: ['course', 'name', 'description', 'order'], filterFields: ['course'],
  async guardDelete(doc) {
    if (await Lesson.exists({ module: doc._id })) throw ApiError.conflict('Remove this module\'s lessons first.');
  },
});
const batches = resource({
  Model: Batch, label: 'batch', fields: ['programme', 'name', 'startDate', 'status'], filterFields: ['programme', 'status'], populate: 'programme',
  async guardDelete(doc) {
    if ((await Student.exists({ batch: doc._id })) || (await LecturePublication.exists({ batch: doc._id }))) {
      throw ApiError.conflict('This batch has students or lectures. Close it instead of deleting.');
    }
  },
});

// Full tree for the school-setup screen.
async function tree(_req, res) {
  const [progs, crs, mods, lessons] = await Promise.all([
    Programme.find().sort('name').lean(), Course.find().sort('order name').lean(),
    Module.find().sort('order name').lean(), Lesson.find().select('title order module course').sort('order').lean(),
  ]);
  ok(res, progs.map((p) => ({
    ...p,
    courses: crs.filter((c) => String(c.programme) === String(p._id)).map((c) => ({
      ...c,
      modules: mods.filter((m) => String(m.course) === String(c._id)).map((m) => ({
        ...m, lessons: lessons.filter((l) => String(l.module) === String(m._id)),
      })),
    })),
  })));
}

// Batch members and progress overview.
async function batchMembers(req, res) {
  const members = await Student.find({ batch: req.params.id }).select('fullName studentNumber state studyMode lastActivityAt').sort('fullName').lean();
  ok(res, members);
}

module.exports = { programmes, courses, modules, batches, tree, batchMembers };
