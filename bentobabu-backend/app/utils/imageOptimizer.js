/**
 * Image Upload & Optimization Pipeline
 * Uses Multer memory storage and Sharp for strict validation, resizing, and WebP compression.
 */

const multer = require('multer');
const sharp = require('sharp');

// Allowed image MIME types and extensions
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp']);

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_DIMENSION = 6000; // 6000 x 6000 px max original dimensions
const TARGET_MAX_DIMENSION = 1800; // Resize fit inside 1800 x 1800 px
const WEBP_QUALITY = 84; // Quality 84 balance for food textures
const ENCODER_EFFORT = 4; // CPU encoder effort

/**
 * Multer file filter to reject unsupported MIME types upfront
 */
const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return cb(
      new Error(`Unsupported file type: ${file.mimetype}. Only JPEG, PNG, and WebP images are allowed.`),
      false
    );
  }
  cb(null, true);
};

/**
 * Multer memory storage middleware
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 4, // Max 4 images per product
  },
  fileFilter,
});

/**
 * Validates, rotates, resizes, and converts an image buffer to WebP
 * @param {Buffer} buffer - Original image buffer from Multer
 * @returns {Promise<{ buffer: Buffer, info: { width: number, height: number, format: string, sizeBytes: number, originalBytes: number } }>}
 */
const optimizeImage = async (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid or missing image buffer.');
  }

  // 1. Validate actual image content & format via Sharp
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    throw new Error('Corrupted or invalid image file. Content could not be decoded.');
  }

  if (!metadata || !metadata.format || !ALLOWED_FORMATS.has(metadata.format.toLowerCase())) {
    throw new Error(
      `Unsupported image format: ${metadata?.format || 'unknown'}. Only JPEG, PNG, and WebP are accepted.`
    );
  }

  // 2. Enforce dimension limits
  if (
    (metadata.width && metadata.width > MAX_DIMENSION) ||
    (metadata.height && metadata.height > MAX_DIMENSION)
  ) {
    throw new Error(
      `Image dimensions (${metadata.width}x${metadata.height}) exceed the maximum allowed size of ${MAX_DIMENSION}x${MAX_DIMENSION} pixels.`
    );
  }

  // 3. Process image: EXIF auto-rotation, strip metadata, resize fit-inside, convert to WebP
  const optimizedBuffer = await sharp(buffer)
    .rotate() // Automatically orient based on EXIF
    .resize({
      width: TARGET_MAX_DIMENSION,
      height: TARGET_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true, // Never upscale smaller images
    })
    .webp({
      quality: WEBP_QUALITY,
      effort: ENCODER_EFFORT,
    })
    .toBuffer();

  const finalMeta = await sharp(optimizedBuffer).metadata();

  return {
    buffer: optimizedBuffer,
    info: {
      width: finalMeta.width || metadata.width || 0,
      height: finalMeta.height || metadata.height || 0,
      format: 'webp',
      sizeBytes: optimizedBuffer.length,
      originalBytes: buffer.length,
    },
  };
};

module.exports = {
  upload,
  optimizeImage,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};
