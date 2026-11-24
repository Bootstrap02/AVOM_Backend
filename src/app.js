const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const { env } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const apiRoutes = require('./routes');
const payments = require('./controllers/payments.controller');
const whatsapp = require('./controllers/whatsapp.controller');
const { notFound } = require('./middlewares/not-found');
const { errorHandler } = require('./middlewares/error-handler');

const app = express();
const allowedOrigins = new Set([env.clientUrl, env.adminUrl, ...env.extraOrigins]);

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Render/Vercel proxies: correct client IPs for rate limiting
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
  }),
);
app.use(compression());
// Paystack signs the raw body, so the webhook must be mounted before express.json().
app.post('/api/v1/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), payments.webhook);
app.get('/api/v1/whatsapp/webhook', whatsapp.verify);
app.post('/api/v1/whatsapp/webhook', express.raw({ type: '*/*', limit: '1mb' }), whatsapp.receive);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1500, // progress autosave (every ~15s) and shared church networks need headroom
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
);

app.get('/', (_request, response) => {
  response.json({ success: true, message: 'AVOM API', data: { health: '/api/v1/health' } });
});
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1', apiRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
