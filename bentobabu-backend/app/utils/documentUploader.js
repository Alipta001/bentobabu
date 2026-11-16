const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { uploadBuffer } = require('../config/cloudinary');
const { validateEnv } = require('../config/env');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB

const fileFilter = (req, file, cb) => {
  const mime = file.mimetype.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return cb(
      new Error(`Unsupported file format: ${file.mimetype}. Allowed formats: JPG, PNG, WEBP, PDF (max 10MB).`),
      false
    );
  }
  cb(null, true);
};

const documentUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
    files: 1,
  },
  fileFilter,
});

/**
 * Uploads a document buffer to Cloudinary (with local disk fallback for local development)
 * @param {Object} file - Multer file object
 * @param {string} documentCategory - category or field name (e.g. profilePhoto, drivingLicense, etc.)
 */
const uploadDocumentToCloudinary = async (file, documentCategory = 'general') => {
  if (!file || !file.buffer) {
    throw new Error('No document file buffer provided for upload.');
  }

  const env = validateEnv();
  const isPdf = file.mimetype.toLowerCase() === 'application/pdf';
  const cleanName = (file.originalname || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase();

  const options = {
    folder: 'bentobabu/delivery-documents',
    resource_type: isPdf ? 'auto' : 'image',
    tags: ['delivery-partner-document', documentCategory],
    unique_filename: true,
  };

  try {
    const result = await uploadBuffer(file.buffer, options);

    return {
      secureUrl: result.secure_url || result.url,
      publicId: result.public_id,
      fileName: cleanName,
      mimeType: file.mimetype,
      sizeBytes: file.size || file.buffer.length,
      uploadedAt: new Date(),
    };
  } catch (err) {
    // Optional opt-in local fallback if explicitly enabled
    if (process.env.ALLOW_LOCAL_DOCUMENT_FALLBACK === 'true') {
      console.warn(
        `[DocumentUploader] Cloudinary upload failed (${err.message || 'Error'}). Falling back to local disk storage.`
      );

      const uploadDir = path.join(process.cwd(), 'uploads', 'delivery-documents');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(cleanName) || (isPdf ? '.pdf' : '.jpg');
      const baseName = path.basename(cleanName, ext);
      const diskFileName = `${baseName}-${uniqueSuffix}${ext}`;
      const diskFilePath = path.join(uploadDir, diskFileName);

      fs.writeFileSync(diskFilePath, file.buffer);

      const port = env.port || 4000;
      const host = env.host === '0.0.0.0' ? '127.0.0.1' : env.host;
      const backendOrigin = process.env.BACKEND_URL || `http://${host}:${port}`;
      const localUrl = `${backendOrigin}/uploads/delivery-documents/${diskFileName}`;

      return {
        secureUrl: localUrl,
        publicId: `local_${uniqueSuffix}`,
        fileName: cleanName,
        mimeType: file.mimetype,
        sizeBytes: file.size || file.buffer.length,
        uploadedAt: new Date(),
      };
    }

    // Do not suppress genuine Cloudinary errors: rethrow formatted application error
    throw err;
  }
};

module.exports = {
  documentUploadMiddleware,
  uploadDocumentToCloudinary,
  MAX_DOCUMENT_SIZE,
  ALLOWED_MIME_TYPES,
};
