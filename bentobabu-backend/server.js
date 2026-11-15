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

// 1. Secure HTTP Headers
app.use(helmet());

// 2. CORS Configuration (Strict Production & Development Origins with Credentials)
const productionOrigins = [
  'https://bentobabu.com',
  'https://www.bentobabu.com',
  'https://admin.bentobabu.com',
  ...(env.frontendUrl && env.frontendUrl.startsWith('https://') ? [env.frontendUrl] : []),
  ...(env.adminFrontendUrl && env.adminFrontendUrl.startsWith('https://') ? [env.adminFrontendUrl] : []),
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter((o) => o.startsWith('https://'))
    : []),
];

const developmentOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3005',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3005',
  ...(env.frontendUrl && !env.frontendUrl.startsWith('https://') ? [env.frontendUrl] : []),
  ...(env.adminFrontendUrl && !env.adminFrontendUrl.startsWith('https://') ? [env.adminFrontendUrl] : []),
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
    // In development mode only, permit localhost ports 3000, 3001, and 3005
    if (!env.isProduction && /^http:\/\/(localhost|127\.0\.0\.1):(3000|3001|3005)$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'X-XSRF-Token'],
  exposedHeaders: ['Set-Cookie', 'X-CSRF-Token'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// 3. Request Body Parsers with Strict Size Limits
app.use(
  express.json({
    limit: '10kb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 4. Cookie Parser
app.use(cookieParser());

// 5. CSRF Protection for Cookie Authenticated Requests
app.use(csrfProtect);

// 6. Global Rate Limiting (Redis-backed with memory fallback)
app.use(globalRateLimiter);

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

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/videos', videoRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/delivery', deliveryRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/operations', orderOperationsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
app.use('/api/v1/admin/users', adminUserRoutes);
app.use('/api/v1/admin/inventory', inventoryRoutes);
app.use('/api/v1/admin/delivery', adminDeliveryRoutes);
app.use('/api/v1/admin/orders', adminOrderRoutes);
app.use('/api/v1/admin/settings', adminSettingsRoutes);
app.use('/api/v1/admin/notifications', adminNotificationRoutes);
app.use('/api/v1/admin/media', adminMediaRoutes);
app.use('/api/v1/admin/videos', adminVideoRoutes);

// 8. 404 Handler for Unknown Routes
app.use(notFoundHandler);

// 9. Centralized Error Handler
app.use(errorHandler);

let server = null;

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);

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

// Start Server only after MongoDB successfully connects
const startServer = async (port = env.port, host = env.host) => {
  try {
    console.log('[Server] Connecting to MongoDB and Redis...');
    await connectDB(env.mongoUri);
    await initRedis();
    const { OtpChallenge } = require('./app/models');
    await OtpChallenge.migrateSchema().catch(() => {});

    return new Promise((resolve, reject) => {
      server = app.listen(port, host, (err) => {
        if (err) return reject(err);
        const actualPort = server.address().port;
        console.log(`[Server] Bento Babu backend running on http://${host}:${actualPort} in ${process.env.NODE_ENV || 'development'} mode.`);
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
