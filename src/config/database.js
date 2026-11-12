const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDatabase() {
  if (!env.mongodbUri) {
    console.warn('MongoDB is not configured; database-backed features are unavailable.');
    return false;
  }

  await mongoose.connect(env.mongodbUri);
  console.info('MongoDB connected.');
  return true;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.info('MongoDB disconnected.');
  }
}

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error.message);
});

module.exports = { connectDatabase, disconnectDatabase };
