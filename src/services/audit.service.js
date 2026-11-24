const ActivityLog = require('../models/ActivityLog');

/** Record an important action. Never throws: auditing must not break the request. */
async function logActivity({ actor, action, entityType, entityId, summary, meta, ip }) {
  try {
    await ActivityLog.create({
      actor: actor?._id || actor?.id,
      actorName: actor?.name || (actor ? undefined : 'system'),
      actorRole: actor?.role || (actor ? undefined : 'system'),
      action, entityType, entityId: entityId ? String(entityId) : undefined, summary, meta, ip,
    });
  } catch (error) {
    console.error('Activity log failed:', error.message);
  }
}

const fromRequest = (req) => ({ actor: req.user, ip: req.ip });

module.exports = { logActivity, fromRequest };
