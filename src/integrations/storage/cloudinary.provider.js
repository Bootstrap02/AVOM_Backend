// Cloudinary implementation of the storage provider contract.
// Contract: getUploadParams, deleteAsset, signedPlaybackUrl, usage. Business code never imports `cloudinary` directly.
function createCloudinaryProvider(cloudinary, { cloudName, apiKey, apiSecret }) {
  return {
    name: 'cloudinary',
    isMock: false,

    /** Params the admin app uses to upload directly (chunked) to Cloudinary without passing through Express. */
    getUploadParams({ folder, resourceType = 'image', deliveryType = 'upload' }) {
      const timestamp = Math.round(Date.now() / 1000);
      const toSign = { folder, timestamp, type: deliveryType };
      const signature = cloudinary.utils.api_sign_request(toSign, apiSecret);
      return {
        provider: 'cloudinary',
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        cloudName, apiKey, timestamp, signature, folder, resourceType, type: deliveryType,
      };
    },

    async deleteAsset({ publicId, resourceType = 'image', deliveryType = 'upload' }) {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType, type: deliveryType, invalidate: true,
      });
      // "not found" means it is already gone, which is the outcome we want.
      return { ok: result.result === 'ok' || result.result === 'not found', raw: result.result };
    },

    /** Signed URL for authenticated (private) video. */
    signedPlaybackUrl({ publicId, format = 'mp4' }) {
      return cloudinary.url(publicId, {
        resource_type: 'video', type: 'authenticated', sign_url: true, secure: true, format, quality: 'auto',
      });
    },

    async usage() {
      const u = await cloudinary.api.usage();
      return { plan: u.plan, credits: u.credits, storage: u.storage, bandwidth: u.bandwidth, transformations: u.transformations };
    },
  };
}

module.exports = { createCloudinaryProvider };
