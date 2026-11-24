// Used when Cloudinary credentials are not configured (local development / tests).
// Nothing is uploaded or deleted; calls are recorded in memory so tests can assert on them.
function createMockProvider() {
  const deleted = [];
  return {
    name: 'mock',
    isMock: true,
    deleted,
    getUploadParams({ folder, resourceType = 'image', deliveryType = 'upload' }) {
      return {
        provider: 'mock', uploadUrl: 'about:blank', cloudName: 'mock', apiKey: 'mock',
        timestamp: Math.round(Date.now() / 1000), signature: 'mock-signature', folder, resourceType, type: deliveryType,
      };
    },
    async deleteAsset({ publicId, resourceType }) {
      deleted.push({ publicId, resourceType });
      return { ok: true, raw: 'mock' };
    },
    signedPlaybackUrl({ publicId, format = 'mp4' }) {
      return `https://mock.invalid/video/${encodeURIComponent(publicId)}.${format}`;
    },
    async usage() {
      return { plan: 'mock', credits: null, storage: null, bandwidth: null, transformations: null };
    },
  };
}
module.exports = { createMockProvider };
