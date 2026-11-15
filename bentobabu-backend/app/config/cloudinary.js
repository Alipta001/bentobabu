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
 * Upload an in-memory buffer to Cloudinary
 * @param {Buffer} buffer - Pre-optimized WebP buffer
 * @param {Object} options - Upload options (folder, public_id, tags)
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const client = mockCloudinary || configureCloudinary();
    const defaultOptions = {
      resource_type: 'image',
      format: 'webp',
      unique_filename: true,
      overwrite: false,
      folder: 'bentobabu/products',
      ...options,
    };

    if (mockCloudinary && mockCloudinary.uploader?.upload_stream) {
      const stream = mockCloudinary.uploader.upload_stream(defaultOptions, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
      stream.end(buffer);
      return;
    }

    const uploadStream = client.uploader.upload_stream(defaultOptions, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve(result);
    });

    uploadStream.end(buffer);
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

module.exports = {
  configureCloudinary,
  setMockCloudinary,
  uploadBuffer,
  deleteAsset,
  getUsage,
  getDeliveryUrl,
  DELIVERY_PRESETS,
};
