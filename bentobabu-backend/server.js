const path = require('path');
const fs = require('fs');

const localEnvPath = path.resolve(__dirname, '.env');
if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath });
} else {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const { validateEnv } = require('./app/config/env');
const connectDB = require('./app/config/db');
const { initRedis, disconnectRedis, isRedisReady } = require('./app/config/redis');
const { errorHandler, notFoundHandler } = require('./app/middleware/errorHandler');
const { globalRateLimiter } = require('./app/middleware/rateLimiter');
const { csrfProtect } = require('./app/middleware/csrfMiddleware');

// Validate critical environment variables
const env = validateEnv();

const app = express();

// 0. Trust single reverse proxy hop (Render / Cloudflare) before registering rate limiters
// This ensures correct client IP identification via X-Forwarded-For and prevents ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// 1. Secure HTTP Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. CORS Configuration (Strict Production & Development Origins with Credentials)
const productionOrigins = [
  'https://bentobabu.com',
  'https://www.bentobabu.com',
  'https://admin.bentobabu.com',
  'https://delivery.bentobabu.com',
  ...(env.frontendUrl && env.frontendUrl.startsWith('https://') ? [env.frontendUrl] : []),
  ...(env.adminFrontendUrl && env.adminFrontendUrl.startsWith('https://') ? [env.adminFrontendUrl] : []),
  ...(env.deliveryFrontendUrl && env.deliveryFrontendUrl.startsWith('https://') ? [env.deliveryFrontendUrl] : []),
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter((o) => o.startsWith('https://'))
    : []),
];

const developmentOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3005',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3005',
  ...(env.frontendUrl && !env.frontendUrl.startsWith('https://') ? [env.frontendUrl] : []),
  ...(env.adminFrontendUrl && !env.adminFrontendUrl.startsWith('https://') ? [env.adminFrontendUrl] : []),
  ...(env.deliveryFrontendUrl && !env.deliveryFrontendUrl.startsWith('https://') ? [env.deliveryFrontendUrl] : []),
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter((o) => !o.startsWith('https://'))
    : []),
];

const allowedOrigins = Array.from(new Set(
  env.isProduction ? productionOrigins : [...productionOrigins, ...developmentOrigins]
)).filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, server-to-server health checks without origin header)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In development mode only, permit localhost ports 3000, 3001, 3002, and 3005
    if (!env.isProduction && /^http:\/\/(localhost|127\.0\.0\.1):(3000|3001|3002|3005)$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
    'X-XSRF-Token',
    'X-Auth-Context',
    'Idempotency-Key',
    'X-Idempotency-Key',
  ],
  exposedHeaders: ['Set-Cookie', 'X-CSRF-Token', 'X-Auth-Context'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// 3. Request Body Parsers with Strict Size Limits (1 MB for rich text, image metadata & JSON payloads)
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Cookie Parser
app.use(cookieParser());

// 5. CSRF Protection for Cookie Authenticated Requests
app.use(csrfProtect);

// 6. Global Rate Limiting (Redis-backed with memory fallback)
app.use(globalRateLimiter);

// 6b. Static Uploads (Local fallback for uploaded documents/media)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 6. Root & Health Check Routes
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BentoBabu API is running',
    version: '1.1.0',
    commit: process.env.RENDER_GIT_COMMIT || 'development',
    health: '/api/v1/health',
  });
});

app.get('/api/v1/health', (req, res) => {
  const dbStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const dbState = dbStates[mongoose.connection.readyState] || 'unknown';
  const isDbHealthy = mongoose.connection.readyState === 1;
  const isRedisHealthy = isRedisReady();
  const isHealthy = isDbHealthy;
  const redisStatus = isRedisHealthy
    ? 'connected'
    : (process.env.REDIS_ENABLED === 'false' ? 'disabled' : 'disconnected');

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? (isRedisHealthy || process.env.REDIS_ENABLED === 'false' ? 'healthy' : 'degraded_no_cache') : 'unhealthy',
    version: '1.1.0',
    commit: process.env.RENDER_GIT_COMMIT || 'development',
    uptime: Math.floor(process.uptime()),
    database: dbState,
    redis: redisStatus,
    environment: process.env.NODE_ENV || (env.isProduction ? 'production' : 'development'),
    timestamp: new Date().toISOString(),
  });
});

// 7. API Route Mounting
const authRoutes = require('./app/routes/authRoutes');
const categoryRoutes = require('./app/routes/categoryRoutes');
const productRoutes = require('./app/routes/productRoutes');
const addressRoutes = require('./app/routes/addressRoutes');
const cartRoutes = require('./app/routes/cartRoutes');
const deliveryRoutes = require('./app/routes/deliveryRoutes');
const couponRoutes = require('./app/routes/couponRoutes');
const orderRoutes = require('./app/routes/orderRoutes');
const paymentRoutes = require('./app/routes/paymentRoutes');
const orderOperationsRoutes = require('./app/routes/orderOperationsRoutes');
const adminDashboardRoutes = require('./app/routes/adminDashboardRoutes');
const adminUserRoutes = require('./app/routes/adminUserRoutes');
const inventoryRoutes = require('./app/routes/inventoryRoutes');
const adminDeliveryRoutes = require('./app/routes/adminDeliveryRoutes');
const adminOrderRoutes = require('./app/routes/adminOrderRoutes');
const adminSettingsRoutes = require('./app/routes/adminSettingsRoutes');
const notificationRoutes = require('./app/routes/notificationRoutes');
const adminNotificationRoutes = require('./app/routes/adminNotificationRoutes');
const adminMediaRoutes = require('./app/routes/mediaRoutes');
const videoRoutes = require('./app/routes/videoRoutes');
const adminVideoRoutes = require('./app/routes/adminVideoRoutes');
const deliveryOnboardingRoutes = require('./app/routes/deliveryOnboardingRoutes');
const adminDeliveryApplicationRoutes = require('./app/routes/adminDeliveryApplicationRoutes');
const deliveryPresenceRoutes = require('./app/routes/deliveryPresenceRoutes');
const adminDeliveryOperationsRoutes = require('./app/routes/adminDeliveryOperationsRoutes');
const dailyMenuRoutes = require('./app/routes/dailyMenuRoutes');
const supportRoutes = require('./app/routes/supportRoutes');
const adminSupportRoutes = require('./app/routes/adminSupportRoutes');
const reviewRoutes = require('./app/routes/reviewRoutes');
const adminReviewRoutes = require('./app/routes/adminReviewRoutes');
const settingsRoutes = require('./app/routes/settingsRoutes');
const serviceExpansionRoutes = require('./app/routes/serviceExpansionRoutes');
const adminServiceExpansionRoutes = require('./app/routes/adminServiceExpansionRoutes');

app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/service-expansion', serviceExpansionRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/menu', dailyMenuRoutes);
app.use('/api/v1/videos', videoRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/delivery/onboarding', deliveryOnboardingRoutes);
app.use('/api/v1/delivery/presence', deliveryPresenceRoutes);
app.use('/api/v1/delivery', deliveryRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/operations', orderOperationsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
app.use('/api/v1/admin/users', adminUserRoutes);
app.use('/api/v1/admin/inventory', inventoryRoutes);
app.use('/api/v1/admin/delivery-applications', adminDeliveryApplicationRoutes);
app.use('/api/v1/admin/delivery-operations', adminDeliveryOperationsRoutes);
app.use('/api/v1/admin/delivery', adminDeliveryRoutes);
app.use('/api/v1/admin/orders', adminOrderRoutes);
app.use('/api/v1/admin/settings', adminSettingsRoutes);
app.use('/api/v1/admin/notifications', adminNotificationRoutes);
app.use('/api/v1/admin/media', adminMediaRoutes);
app.use('/api/v1/admin/videos', adminVideoRoutes);
app.use('/api/v1/admin/reviews', adminReviewRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/admin/support', adminSupportRoutes);
app.use('/api/v1/admin/service-expansion', adminServiceExpansionRoutes);

// 8. 404 Handler for Unknown Routes
app.use(notFoundHandler);

// 9. Centralized Error Handler
app.use(errorHandler);

const { startReceiptWorker, stopReceiptWorker } = require('./app/utils/receiptQueue');

let server = null;

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);

  try {
    stopReceiptWorker();
  } catch (queueErr) {
    console.error('[ReceiptQueue] Error stopping receipt worker:', queueErr.message);
  }

  if (server) {
    server.close(async () => {
      console.log('[Server] HTTP server stopped accepting new connections.');
      try {
        await disconnectRedis();
        await mongoose.connection.close(false);
        console.log('[MongoDB] Database connection closed.');
        process.exit(0);
      } catch (err) {
        console.error('[Teardown] Error during teardown:', err.message);
        process.exit(1);
      }
    });

    // Force shutdown if cleanup hangs
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  } else {
    disconnectRedis().finally(() => process.exit(0));
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Process-level unhandled rejection & exception handlers to prevent unexpected process crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err.message, err.stack);
});

// Start Server only after MongoDB successfully connects
const startServer = async (port = env.port, host = env.host) => {
  try {
    console.log('[Server] Connecting to MongoDB and Redis...');
    await connectDB(env.mongoUri);
    await initRedis();
    const { OtpChallenge } = require('./app/models');
    await OtpChallenge.migrateSchema().catch(() => {});

    // Start durable receipt queue background worker & reconciliation
    try {
      startReceiptWorker();
    } catch (workerErr) {
      console.error('[ReceiptWorker] Failed to start receipt worker:', workerErr.message);
    }

    return new Promise((resolve, reject) => {
      server = app.listen(port, host, (err) => {
        if (err) return reject(err);
        const actualPort = server.address().port;
        const currentMode = process.env.NODE_ENV || 'development';
        console.log(`[Server] Bento Babu backend running on http://${host}:${actualPort} in ${currentMode} mode.`);
        if (currentMode !== 'production' && (process.env.RENDER || !['localhost', '127.0.0.1'].includes(host))) {
          console.warn(`[Server] WARNING: NODE_ENV is set to '${currentMode}'. Configure NODE_ENV=production in Render environment variables to enforce production security.`);
        }
        resolve(server);
      });
      server.on('error', reject);
    });
  } catch (err) {
    console.error('[Server] Startup failed. Server will not accept traffic:', err.message);
    process.exit(1);
  }
};

// Auto-start server if executed directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
