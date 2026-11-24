const Faq = require('../models/Faq');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function publicList(req, res) {
  const filter = { published: true };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) {
    const rx = new RegExp(escapeRx(req.query.q), 'i');
    filter.$or = [{ question: rx }, { answer: rx }];
  }
  ok(res, await Faq.find(filter).sort('category order').lean());
}

const adminList = async (_req, res) => ok(res, await Faq.find().sort('category order').lean());
const create = async (req, res) => created(res, await Faq.create(pickFaq(req.body)));
function pickFaq(b) {
  return Object.fromEntries(['category', 'question', 'answer', 'order', 'published'].filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));
}
async function update(req, res) {
  const faq = await Faq.findByIdAndUpdate(req.params.id, pickFaq(req.body), { new: true });
  if (!faq) throw ApiError.notFound('FAQ not found');
  ok(res, faq);
}
async function remove(req, res) {
  if (!(await Faq.findByIdAndDelete(req.params.id))) throw ApiError.notFound('FAQ not found');
  ok(res, null, 'Deleted');
}

module.exports = { publicList, adminList, create, update, remove };
