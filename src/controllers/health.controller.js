const { env } = require('../config/env');
const { isConfigured: cloudinaryConfigured } = require('../integrations/cloudinary');
const { isConfigured: resendConfigured } = require('../integrations/resend');
const { isConfigured: paystackConfigured } = require('../integrations/paystack');

function getHealth(_request, response) {
  response.status(200).json({
    success: true,
    message: 'API is healthy',
    data: {
      status: 'ok',
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
      integrations: {
        mongodb: process.env.MONGODB_URI ? 'configured' : 'not_configured',
        cloudinary: cloudinaryConfigured ? 'configured' : 'not_configured',
        resend: resendConfigured ? 'configured' : 'not_configured',
        paystack: paystackConfigured ? 'configured' : 'not_configured',
      },
    },
  });
}

module.exports = { getHealth };
