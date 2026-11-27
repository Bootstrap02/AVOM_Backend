const NgoPost = require('../models/NgoPost');
const AudioEpisode = require('../models/AudioEpisode');
const Page = require('../models/Page');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated, parsePage, pageMeta } = require('../utils/respond');
const { slugify } = require('../utils/slug');
const { contentExpiry } = require('../services/logic');
const { getStorage, FOLDERS } = require('../integrations/storage');
const settings = require('../services/settings.service');
const { logActivity, fromRequest } = require('../services/audit.service');
const { escapeHtml } = require('../templates/emailTemplates');
const { env } = require('../config/env');

const publicFilter = (now = new Date()) => ({
  status: 'published', publishedAt: { $lte: now },
  $or: [{ pinned: true }, { expiresAt: null }, { expiresAt: { $gt: now } }], // date-checked, so correct even if the job is late
});

// Only accept assets under our own folders so clients cannot register arbitrary public IDs.
function cleanAsset(asset, folder) {
  if (!asset || !asset.publicId) return undefined;
  if (!String(asset.publicId).startsWith(`${folder}/`)) throw ApiError.badRequest('Unexpected upload location');
  return { provider: getStorage().name, publicId: asset.publicId, secureUrl: asset.secureUrl, resourceType: asset.resourceType, format: asset.format, bytes: asset.bytes, duration: asset.duration, deletionStatus: 'none' };
}

function adminResource({ Model, label, expiryKey, applyBody, populateList: _populateList }) {
  return {
    async list(req, res) {
      const { page, limit, skip } = parsePage(req.query);
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.kind) filter.kind = req.query.kind;
      const [items, total] = await Promise.all([Model.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(), Model.countDocuments(filter)]);
      paginated(res, items, pageMeta(page, limit, total));
    },
    async getOne(req, res) {
      const doc = await Model.findById(req.params.id).lean();
      if (!doc) throw ApiError.notFound(`${label} not found`);
      ok(res, doc);
    },
    async create(req, res) {
      const doc = new Model({ createdBy: req.user._id });
      applyBody(doc, req.body);
      await doc.save();
      await logActivity({ ...fromRequest(req), action: `${label}.created`, entityType: label, entityId: doc._id, summary: `Created ${label} "${doc.title}"` });
      created(res, doc);
    },
    async update(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      applyBody(doc, req.body);
      await doc.save();
      ok(res, doc);
    },
    // Publishing starts the expiry clock (default 100 days audio / 200 days NGO). Both are editable.
    async publish(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      if (label === 'radio' && !doc.audio?.publicId) throw ApiError.unprocessable('Upload the audio before publishing');
      const publishedAt = req.body.publishedAt ? new Date(req.body.publishedAt) : new Date();
      const days = await settings.get(expiryKey);
      doc.status = 'published';
      doc.publishedAt = publishedAt;
      doc.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : contentExpiry(publishedAt, days);
      doc.warningSentAt = undefined;
      await doc.save();
      await logActivity({ ...fromRequest(req), action: `${label}.published`, entityType: label, entityId: doc._id, summary: `Published "${doc.title}"` });
      ok(res, doc, 'Published');
    },
    async unpublish(req, res) {
      const doc = await Model.findByIdAndUpdate(req.params.id, { status: 'unpublished' }, { new: true });
      if (!doc) throw ApiError.notFound(`${label} not found`);
      ok(res, doc, 'Unpublished');
    },
    // Pin = "keep": pinned content is never expired automatically.
    async pin(req, res) {
      const doc = await Model.findByIdAndUpdate(req.params.id, { pinned: Boolean(req.body.pinned) }, { new: true });
      if (!doc) throw ApiError.notFound(`${label} not found`);
      ok(res, doc, doc.pinned ? 'Pinned. This will not expire.' : 'Unpinned');
    },
    async setExpiry(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      if (doc.status === 'expired') throw ApiError.conflict('Expired content has had its files removed');
      doc.expiresAt = new Date(req.body.expiresAt);
      doc.warningSentAt = undefined;
      await doc.save();
      ok(res, doc);
    },
    async remove(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      // Remove stored files first; if that fails the record stays so nothing is orphaned silently.
      const assets = label === 'radio'
        ? [[doc.audio, 'video'], [doc.cover, 'image']]
        : [[doc.cover, 'image'], ...(doc.gallery || []).map((g) => [g, 'image'])];
      for (const [asset, resourceType] of assets) {
        if (asset?.publicId && asset.deletionStatus !== 'deleted') {
          const result = await getStorage().deleteAsset({ publicId: asset.publicId, resourceType });
          if (!result.ok) throw ApiError.conflict('Could not remove the stored file. Please try again.');
        }
      }
      await doc.deleteOne();
      await logActivity({ ...fromRequest(req), action: `${label}.deleted`, entityType: label, entityId: doc._id, summary: `Deleted "${doc.title}"` });
      ok(res, null, 'Deleted');
    },
  };
}

const ngo = adminResource({
  Model: NgoPost, label: 'ngo', expiryKey: 'expiry.ngoDays',
  applyBody(doc, b) {
    ['kind', 'title', 'excerpt', 'body', 'eventDate'].forEach((f) => { if (b[f] !== undefined) doc[f] = b[f]; });
    if (b.title) doc.slug = `${slugify(b.title)}-${String(doc._id).slice(-5)}`;
    if (b.cover !== undefined) doc.cover = cleanAsset(b.cover, FOLDERS.ngoImage);
    if (b.gallery !== undefined) doc.gallery = (b.gallery || []).map((g) => cleanAsset(g, FOLDERS.ngoImage)).filter(Boolean);
  },
});

const radio = adminResource({
  Model: AudioEpisode, label: 'radio', expiryKey: 'expiry.audioDays',
  applyBody(doc, b) {
    ['title', 'description', 'spotifyUrl', 'externalLinks'].forEach((f) => { if (b[f] !== undefined) doc[f] = b[f]; });
    if (b.audio !== undefined) doc.audio = cleanAsset(b.audio, FOLDERS.radioAudio);
    if (b.cover !== undefined) doc.cover = cleanAsset(b.cover, FOLDERS.radioCover);
  },
});

const pages = adminResource({
  Model: Page, label: 'page', expiryKey: null,
  applyBody(doc, b) {
    ['title', 'content', 'excerpt', 'isPublished', 'meta'].forEach((f) => { if (b[f] !== undefined) doc[f] = b[f]; });
  },
});

// ---- Public ----
async function publicPagesList(_req, res) {
  const items = await Page.find({ isPublished: true }).select('slug title content excerpt meta').sort('slug').lean();
  ok(res, items);
}

async function publicPageOne(req, res) {
  const doc = await Page.findOne({ slug: req.params.slug, isPublished: true }).select('slug title content excerpt meta').lean();
  if (!doc) throw ApiError.notFound('Page not found');
  ok(res, doc);
}
const publicCard = (d) => ({
  id: d._id, slug: d.slug, kind: d.kind, title: d.title, excerpt: d.excerpt, eventDate: d.eventDate,
  cover: d.cover?.secureUrl, publishedAt: d.publishedAt, pinned: d.pinned,
});

async function publicNgoList(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 12 });
  const filter = publicFilter();
  if (req.query.kind) filter.kind = req.query.kind;
  const [items, total] = await Promise.all([
    NgoPost.find(filter).sort('-pinned -publishedAt').skip(skip).limit(limit).lean(), NgoPost.countDocuments(filter),
  ]);
  paginated(res, items.map(publicCard), pageMeta(page, limit, total));
}

async function publicNgoOne(req, res) {
  const key = req.params.key;
  const filter = { ...publicFilter(), ...(/^[a-f0-9]{24}$/i.test(key) ? { _id: key } : { slug: key }) };
  const doc = await NgoPost.findOne(filter).lean();
  if (!doc) throw ApiError.notFound('Not found');
  ok(res, { ...publicCard(doc), body: doc.body, gallery: (doc.gallery || []).map((g) => g.secureUrl) });
}

async function publicGallery(_req, res) {
  const posts = await NgoPost.find({ ...publicFilter(), 'gallery.0': { $exists: true } }).sort('-publishedAt').limit(30).lean();
  ok(res, posts.flatMap((p) => p.gallery.map((g) => ({ url: g.secureUrl, post: p.title, slug: p.slug }))).filter((g) => g.url));
}

const episodeCard = (e) => ({
  id: e._id, title: e.title, description: e.description, audioUrl: e.audio?.secureUrl, duration: e.audio?.duration,
  cover: e.cover?.secureUrl, publishedAt: e.publishedAt, spotifyUrl: e.spotifyUrl, externalLinks: e.externalLinks,
});

async function publicRadioList(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 12 });
  const filter = publicFilter();
  const [items, total, cfg] = await Promise.all([
    AudioEpisode.find(filter).sort('-publishedAt').skip(skip).limit(limit).lean(), AudioEpisode.countDocuments(filter),
    settings.getMany(['radio.schedule', 'radio.liveStreamUrl', 'radio.spotifyShowUrl']),
  ]);
  res.json({ success: true, message: 'OK', data: items.map(episodeCard), meta: { ...pageMeta(page, limit, total), schedule: cfg['radio.schedule'], liveStreamUrl: cfg['radio.liveStreamUrl'], spotifyShowUrl: cfg['radio.spotifyShowUrl'] } });
}

async function publicRadioLatest(_req, res) {
  const latest = await AudioEpisode.findOne(publicFilter()).sort('-publishedAt').lean();
  ok(res, latest ? episodeCard(latest) : null);
}

// Podcast feed: one source for Spotify, Apple Podcasts and other apps.
async function podcastFeed(_req, res) {
  const episodes = await AudioEpisode.find(publicFilter()).sort('-publishedAt').limit(100).lean();
  const site = env.clientUrl;
  const items = episodes.filter((e) => e.audio?.secureUrl).map((e) => `
    <item>
      <title>${escapeHtml(e.title)}</title>
      <description>${escapeHtml(e.description || '')}</description>
      <pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>
      <guid isPermaLink="false">${e._id}</guid>
      <enclosure url="${escapeHtml(e.audio.secureUrl)}" length="${e.audio.bytes || 0}" type="audio/mpeg"/>
      ${e.audio.duration ? `<itunes:duration>${Math.round(e.audio.duration)}</itunes:duration>` : ''}
    </item>`).join('');
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>AVOM Divine Dew Broadcast</title>
    <link>${escapeHtml(site)}</link>
    <language>en</language>
    <description>Messages from Apostle Victor Ogagaoghene Ministries.</description>
    <itunes:author>AVOM</itunes:author>${items}
  </channel>
</rss>`);
}

module.exports = { ngo, radio, pages, publicNgoList, publicNgoOne, publicGallery, publicRadioList, publicRadioLatest, podcastFeed, publicPagesList, publicPageOne };
