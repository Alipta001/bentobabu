const mongoose = require('mongoose');

/**
 * Sanitizes MongoDB URI for logging to prevent credential leakage
 */
const sanitizeMongoUri = (uri) => {
  if (!uri) return 'undefined';
  try {
    return uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  } catch {
    return '***';
  }
};

/**
 * Connect to MongoDB with sanitized logging and connection failure handling
 */
const connectDB = async (uri) => {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const primaryUri = uri || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bentobabu';
  const localFallbackUri = 'mongodb://127.0.0.1:27017/bentobabu';
  const sanitizedUri = sanitizeMongoUri(primaryUri);

  try {
    const conn = await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 4000,
    });
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error(`[MongoDB] Connection failure connecting to ${sanitizedUri}:`, err.message);
    if (err.message && (err.message.includes('bad auth') || err.message.includes('Authentication failed'))) {
      console.error(`[MongoDB] 💡 Authentication Error: Check your MongoDB Atlas username and password in MONGODB_URI.`);
    } else if (err.message && (err.message.includes('querySrv') || err.message.includes('MongooseServerSelectionError') || err.message.includes('whitelist'))) {
      console.error(`[MongoDB] 💡 Network/Access Error: Ensure your current IP address is whitelisted in MongoDB Atlas (Network Access > IP Access List).`);
    }
    throw err;
  }
};

module.exports = connectDB;
