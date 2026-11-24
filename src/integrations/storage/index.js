const { env } = require('../../config/env');
const { createCloudinaryProvider } = require('./cloudinary.provider');
const { createMockProvider } = require('./mock.provider');

let provider;

function getStorage() {
  if (provider) return provider;
  const { cloudinary, isConfigured } = require('../cloudinary');
  if (env.storage.provider !== 'mock' && isConfigured) {
    provider = createCloudinaryProvider(cloudinary, {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    });
  } else {
    provider = createMockProvider();
  }
  return provider;
}

// Lets tests inject a provider.
function setStorage(custom) { provider = custom; }

// Asset folders. A server-side prefix check stops clients from registering arbitrary public IDs.
const FOLDERS = Object.freeze({
  lectureVideo: 'avom/lectures',
  ngoImage: 'avom/ngo',
  radioAudio: 'avom/radio/audio',
  radioCover: 'avom/radio/covers',
  siteImage: 'avom/site',
});

module.exports = { getStorage, setStorage, FOLDERS };
