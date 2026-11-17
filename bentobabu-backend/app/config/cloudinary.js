/**
 * Cloudinary Configuration & Delivery Service
 * Handles optimized image uploads and fixed-preset URL generation.
 */

const cloudinary = require('cloudinary').v2;
const { validateEnv } = require('./env');

let mockCloudinary = null;

/**
 * Configure Cloudinary with backend credentials
 */
const configureCloudinary = () => {
  if (mockCloudinary) return mockCloudinary;

  const env = validateEnv();
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });

  return cloudinary;
};

/**
 * Allows automated test suites to mock Cloudinary SDK
 */
const setMockCloudinary = (mock) => {
  mockCloudinary = mock;
};

/**
 * Safely formats Cloudinary errors while preserving original message and code
 * without leaking sensitive credentials
 */
const formatCloudinaryError = (error, cloudName = '') => {
  if (!error) return new Error('Unknown Cloudinary upload error');

  const rawMessage = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const httpCode = error.http_code || error.statusCode || null;
  const errorCode = error.code || null;

  const err = new Error();
  err.name = 'CloudinaryUploadError';
  err.originalMessage = rawMessage;
  err.originalCode = httpCode || errorCode;
  err.http_code = httpCode || (errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT' ? 503 : 500);

  const cleanCloudName = cloudName ? String(cloudName).trim() : '';

  if (rawMessage.includes('Invalid cloud_name') || rawMessage.includes('cloud_name mismatch')) {
    err.message = cleanCloudName
      ? `Cloudinary configuration error: The cloud_name '${cleanCloudName}' is invalid or does not match your Cloudinary account credentials. Please verify your Cloud Name in the Cloudinary Console (https://console.cloudinary.com) and update CLOUDINARY_CLOUD_NAME in bentobabu-backend/.env.`
      : `Cloudinary configuration error: Cloud name is missing or invalid. Please check CLOUDINARY_CLOUD_NAME in bentobabu-backend/.env.`;
    err.code = 'CLOUDINARY_INVALID_CLOUD_NAME';
    err.statusCode = 400;
  } else if (
    rawMessage.includes('Invalid credentials') ||
    rawMessage.includes('Invalid API key') ||
    rawMessage.includes('Must supply api_key') ||
    rawMessage.includes('Unknown API key') ||
    httpCode === 401
  ) {
    err.message = 'Cloudinary configuration error: Invalid API Key or Secret. Please verify CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in bentobabu-backend/.env.';
    err.code = 'CLOUDINARY_INVALID_CREDENTIALS';
    err.statusCode = 401;
  } else if (rawMessage.includes('Invalid Signature') || rawMessage.includes('Signature mismatch') || rawMessage.includes('signature')) {
    err.message = 'Cloudinary configuration error: Invalid upload signature. Please check your CLOUDINARY_API_SECRET.';
    err.code = 'CLOUDINARY_INVALID_SIGNATURE';
    err.statusCode = 401;
  } else if (
    rawMessage.includes('File size') ||
    rawMessage.includes('larger than maximum') ||
    rawMessage.includes('limit exceeded') ||
    rawMessage.includes('File too large')
  ) {
    err.message = 'Document upload failed: File size exceeds the maximum allowed upload limit.';
    err.code = 'CLOUDINARY_SIZE_LIMIT_EXCEEDED';
    err.statusCode = 400;
  } else if (
    rawMessage.includes('Unsupported file format') ||
    rawMessage.includes('Invalid image file') ||
    rawMessage.includes('Format is not supported') ||
    rawMessage.includes('not allowed')
  ) {
    err.message = 'Document upload failed: Unsupported file format or invalid media buffer.';
    err.code = 'CLOUDINARY_UNSUPPORTED_FORMAT';
    err.statusCode = 400;
  } else if (
    errorCode === 'ENOTFOUND' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ECONNRESET' ||
    rawMessage.includes('getaddrinfo') ||
    rawMessage.includes('timeout')
  ) {
    err.message = `Cloudinary network error: Unable to reach Cloudinary servers (${errorCode || 'timeout'}). Please check your network connection.`;
    err.code = 'CLOUDINARY_NETWORK_FAILURE';
    err.statusCode = 503;
  } else {
    err.message = `Cloudinary upload error: ${rawMessage}`;
    err.code = errorCode || 'CLOUDINARY_UPLOAD_ERROR';
    err.statusCode = httpCode || 500;
  }

  return err;
};

/**
 * Upload an in-memory buffer to Cloudinary
 * @param {Buffer} buffer - Pre-optimized WebP or document buffer
 * @param {Object} options - Upload options (folder, public_id, tags, resource_type)
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    let client;
    let cloudName = '';

    try {
      client = mockCloudinary || configureCloudinary();
      const cfg = client.config ? client.config() : {};
      cloudName = cfg.cloud_name || '';
      if (!cloudName) {
        try {
          const env = validateEnv();
          cloudName = env.cloudinaryCloudName || '';
        } catch {
          // ignore
        }
      }
    } catch (configErr) {
      return reject(configErr);
    }

    if (!buffer || !Buffer.isBuffer(buffer)) {
      const err = new Error('Invalid buffer provided for upload.');
      err.statusCode = 400;
      return reject(err);
    }

    const defaultOptions = {
      resource_type: 'image',
      format: 'webp',
      unique_filename: true,
      overwrite: false,
      folder: 'bentobabu/products',
      ...options,
    };

    if (mockCloudinary && mockCloudinary.uploader?.upload_stream) {
      try {
        const stream = mockCloudinary.uploader.upload_stream(defaultOptions, (error, result) => {
          try {
            if (error) {
              const formatted = formatCloudinaryError(error, cloudName);
              return reject(formatted);
            }
            resolve(result);
          } catch (cbErr) {
            reject(cbErr);
          }
        });
        if (stream && typeof stream.on === 'function') {
          stream.on('error', (streamErr) => {
            try {
              reject(formatCloudinaryError(streamErr, cloudName));
            } catch (cbErr) {
              reject(cbErr);
            }
          });
        }
        stream.end(buffer);
        return;
      } catch (mockErr) {
        return reject(mockErr);
      }
    }

    try {
      const uploadStream = client.uploader.upload_stream(defaultOptions, (error, result) => {
        try {
          if (error) {
            const formatted = formatCloudinaryError(error, cloudName);
            return reject(formatted);
          }
          resolve(result);
        } catch (cbErr) {
          reject(cbErr);
        }
      });

      uploadStream.on('error', (streamErr) => {
        try {
          const formatted = formatCloudinaryError(streamErr, cloudName);
          reject(formatted);
        } catch (cbErr) {
          reject(cbErr);
        }
      });

      uploadStream.end(buffer);
    } catch (streamInitErr) {
      return reject(formatCloudinaryError(streamInitErr, cloudName));
    }
  });
};

/**
 * Safely delete an asset from Cloudinary
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<Object>} Deletion result
 */
const deleteAsset = async (publicId) => {
  const client = mockCloudinary || configureCloudinary();
  if (!publicId) return { result: 'not_found' };
  return client.uploader.destroy(publicId, { invalidate: true });
};

/**
 * Retrieve account usage statistics
 * @returns {Promise<Object>} Usage metrics
 */
const getUsage = async () => {
  const client = mockCloudinary || configureCloudinary();
  if (client.api?.usage) {
    return client.api.usage();
  }
  return { storage: { usage: 0 }, bandwidth: { usage: 0 }, transformations: { usage: 0 } };
};

/**
 * Fixed delivery presets to strictly avoid transformation sprawl
 * Preset widths: thumbnail = 320, card = 640, detail = 1200
 */
const DELIVERY_PRESETS = {
  thumbnail: { width: 320, crop: 'limit', quality: 'auto' },
  card: { width: 640, crop: 'limit', quality: 'auto' },
  detail: { width: 1200, crop: 'limit', quality: 'auto' },
};

/**
 * Generate a transformation delivery URL using strictly fixed presets
 * @param {string} publicId - Cloudinary public ID or full URL
 * @param {'thumbnail'|'card'|'detail'} [preset='card'] - Delivery preset
 * @returns {string} Optimized URL
 */
const getDeliveryUrl = (publicId, preset = 'card') => {
  if (!publicId) return '';
  // If it's already an external non-Cloudinary URL, return as-is
  if (publicId.startsWith('http') && !publicId.includes('res.cloudinary.com')) {
    return publicId;
  }

  const client = mockCloudinary || configureCloudinary();
  const transformation = DELIVERY_PRESETS[preset] || DELIVERY_PRESETS.card;

  return client.url(publicId, {
    secure: true,
    transformation: [
      {
        width: transformation.width,
        crop: transformation.crop,
        quality: transformation.quality,
      },
    ],
  });
};

/**
 * Generate a short-lived signed access URL for private/authenticated Cloudinary documents
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} [options]
 * @param {number} [options.expiresInSeconds=900] - Expiration in seconds (default: 15 minutes)
 * @param {string} [options.resourceType='image'] - 'image' or 'auto' or 'raw'
 * @param {string} [options.type='authenticated'] - 'authenticated' or 'upload'
 * @returns {string} Short-lived signed URL
 */
const generateSignedDocumentUrl = (publicId, options = {}) => {
  if (!publicId) return '';
  if (publicId.startsWith('http') && !publicId.includes('res.cloudinary.com')) {
    return publicId;
  }

  const client = mockCloudinary || configureCloudinary();
  const expiresIn = options.expiresInSeconds || 15 * 60; // 15 minutes default
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const resourceType = options.resourceType || 'image';
  const type = options.type || 'authenticated';

  return client.url(publicId, {
    secure: true,
    sign_url: true,
    type,
    resource_type: resourceType,
    expires_at: expiresAt,
  });
};

module.exports = {
  configureCloudinary,
  setMockCloudinary,
  uploadBuffer,
  deleteAsset,
  getUsage,
  getDeliveryUrl,
  generateSignedDocumentUrl,
  DELIVERY_PRESETS,
};
