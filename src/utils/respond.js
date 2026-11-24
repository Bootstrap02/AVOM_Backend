const ok = (res, data = null, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, message, data });
const created = (res, data = null, message = 'Created') => ok(res, data, message, 201);
const paginated = (res, items, meta, message = 'OK') =>
  res.status(200).json({ success: true, message, data: items, meta });

function parsePage(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });

module.exports = { ok, created, paginated, parsePage, pageMeta };
