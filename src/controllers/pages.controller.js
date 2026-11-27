const Page = require('../models/Page');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');
const { slugify } = require('../utils/slug');
const { logActivity, fromRequest } = require('../services/audit.service');

async function publicOne(req, res) {
  const page = await Page.findOne({ slug: req.params.slug, isPublished: true }).lean();
  if (!page) throw ApiError.notFound('Page not found');
  ok(res, page);
}

async function publicList(req, res) {
  ok(res, await Page.find({ isPublished: true }).select('slug title excerpt').sort('title').lean());
}

const adminList = async (_req, res) => ok(res, await Page.find().sort('title').lean());

async function create(req, res) {
  const body = req.body || {};
  const slug = body.slug ? slugify(body.slug) : slugify(body.title || '');
  if (!slug) throw ApiError.badRequest('slug or title is required');
  const exists = await Page.findOne({ slug });
  if (exists) throw ApiError.conflict('A page with that slug already exists');
  const page = await Page.create({
    slug,
    title: body.title,
    content: body.content || '',
    excerpt: body.excerpt || '',
    isPublished: Boolean(body.isPublished),
    meta: body.meta || {},
  });
  await logActivity({ ...fromRequest(req), action: 'page.created', entityType: 'page', entityId: page._id, summary: `Created page "${page.title}"` });
  created(res, page);
}

async function getOne(req, res) {
  const page = await Page.findById(req.params.id).lean();
  if (!page) throw ApiError.notFound('Page not found');
  ok(res, page);
}

async function update(req, res) {
  const page = await Page.findById(req.params.id);
  if (!page) throw ApiError.notFound('Page not found');
  const body = req.body || {};
  if (body.slug) page.slug = slugify(body.slug);
  if (body.title !== undefined) page.title = body.title;
  if (body.content !== undefined) page.content = body.content;
  if (body.excerpt !== undefined) page.excerpt = body.excerpt;
  if (body.isPublished !== undefined) page.isPublished = Boolean(body.isPublished);
  if (body.meta !== undefined) page.meta = body.meta;
  await page.save();
  await logActivity({ ...fromRequest(req), action: 'page.updated', entityType: 'page', entityId: page._id, summary: `Updated page "${page.title}"` });
  ok(res, page);
}

async function remove(req, res) {
  const page = await Page.findByIdAndDelete(req.params.id);
  if (!page) throw ApiError.notFound('Page not found');
  await logActivity({ ...fromRequest(req), action: 'page.deleted', entityType: 'page', entityId: page._id, summary: `Deleted page "${page.title}"` });
  ok(res, null, 'Deleted');
}

module.exports = { publicList, publicOne, adminList, create, getOne, update, remove };
