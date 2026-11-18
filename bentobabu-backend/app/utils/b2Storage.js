/**
 * Backblaze B2 S3-Compatible Object Storage Service
 * Handles persistent storage, retrieval, and verification of PDF order receipts.
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { validateEnv } = require('../config/env');

let mockB2Client = null;

/**
 * Check whether Backblaze B2 is configured with necessary credentials.
 * @returns {boolean}
 */
const isB2Configured = () => {
  try {
    const env = validateEnv();
    return Boolean(
      env.b2Endpoint &&
      env.b2BucketName &&
      env.b2KeyId &&
      env.b2ApplicationKey
    );
  } catch (e) {
    return false;
  }
};

/**
 * Configure and return S3Client pointing to Backblaze B2 S3-compatible API.
 * @returns {S3Client}
 */
const getB2Client = () => {
  if (mockB2Client) return mockB2Client;

  const env = validateEnv();
  if (!isB2Configured()) {
    throw new Error(
      'Backblaze B2 storage is not configured. Missing B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID, or B2_APPLICATION_KEY.'
    );
  }

  return new S3Client({
    region: env.b2Region || 'us-east-005',
    endpoint: env.b2Endpoint,
    credentials: {
      accessKeyId: env.b2KeyId,
      secretAccessKey: env.b2ApplicationKey,
    },
    forcePathStyle: true,
  });
};

/**
 * Allows automated test suites to mock B2 S3Client
 * @param {Object|null} mock
 */
const setMockB2Client = (mock) => {
  mockB2Client = mock;
};

/**
 * Generate a deterministic, immutable storage key for an order receipt.
 * receipts/{year}/{month}/{orderId}/{orderNumber}.pdf
 *
 * @param {Object} order
 * @returns {string} objectKey
 */
const buildReceiptObjectKey = (order) => {
  const d = order.createdAt ? new Date(order.createdAt) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const orderId = String(order._id || order.id || 'order');
  const orderNumber = String(order.orderNumber || orderId).replace(/[^a-zA-Z0-9_-]/g, '_');

  return `receipts/${year}/${month}/${orderId}/${orderNumber}.pdf`;
};

/**
 * Upload a PDF or file buffer to Backblaze B2.
 *
 * @param {Object} params
 * @param {string} params.objectKey - Target object key in B2
 * @param {Buffer|Uint8Array|string} params.body - File content
 * @param {string} [params.contentType='application/pdf'] - MIME type
 * @param {string} [params.contentDisposition] - Content-Disposition header
 * @param {Object} [params.metadata={}] - Custom object metadata
 * @returns {Promise<{ objectKey: string, bucket: string, eTag: string, fileSize: number }>}
 */
const uploadFile = async ({
  objectKey,
  body,
  contentType = 'application/pdf',
  contentDisposition,
  metadata = {},
}) => {
  const env = validateEnv();
  const bucket = env.b2BucketName;

  if (mockB2Client && mockB2Client.uploadFile) {
    return mockB2Client.uploadFile({ objectKey, body, contentType, contentDisposition, metadata });
  }

  const client = getB2Client();
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

  const commandParams = {
    Bucket: bucket,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType,
    ContentLength: buffer.length,
    Metadata: metadata,
  };

  if (contentDisposition) {
    commandParams.ContentDisposition = contentDisposition;
  }

  const command = new PutObjectCommand(commandParams);
  const response = await client.send(command);

  return {
    objectKey,
    bucket,
    eTag: response.ETag ? response.ETag.replace(/"/g, '') : null,
    fileSize: buffer.length,
  };
};

/**
 * Retrieve a stored file from Backblaze B2.
 *
 * @param {string} objectKey
 * @returns {Promise<{ buffer: Buffer, contentType: string, contentLength: number, metadata: Object }>}
 */
const getFile = async (objectKey) => {
  const env = validateEnv();
  const bucket = env.b2BucketName;

  if (mockB2Client && mockB2Client.getFile) {
    return mockB2Client.getFile(objectKey);
  }

  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  const response = await client.send(command);
  const byteArray = await response.Body.transformToByteArray();
  const buffer = Buffer.from(byteArray);

  return {
    buffer,
    contentType: response.ContentType || 'application/pdf',
    contentLength: response.ContentLength || buffer.length,
    metadata: response.Metadata || {},
    lastModified: response.LastModified,
  };
};

/**
 * Verify whether an object exists in Backblaze B2 via HeadObject.
 *
 * @param {string} objectKey
 * @returns {Promise<{ exists: boolean, sizeBytes: number, contentType: string, eTag: string }>}
 */
const verifyObject = async (objectKey) => {
  const env = validateEnv();
  const bucket = env.b2BucketName;

  if (mockB2Client && mockB2Client.verifyObject) {
    return mockB2Client.verifyObject(objectKey);
  }

  try {
    const client = getB2Client();
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    const res = await client.send(command);

    return {
      exists: true,
      sizeBytes: res.ContentLength || 0,
      contentType: res.ContentType || 'application/pdf',
      eTag: res.ETag ? res.ETag.replace(/"/g, '') : '',
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false, sizeBytes: 0, contentType: '', eTag: '' };
    }
    throw error;
  }
};

/**
 * Delete an object from Backblaze B2.
 *
 * @param {string} objectKey
 * @returns {Promise<{ success: boolean, objectKey: string }>}
 */
const deleteFile = async (objectKey) => {
  const env = validateEnv();
  const bucket = env.b2BucketName;

  if (mockB2Client && mockB2Client.deleteFile) {
    return mockB2Client.deleteFile(objectKey);
  }

  const client = getB2Client();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });
  await client.send(command);

  return { success: true, objectKey };
};

/**
 * Generate a short-lived presigned GET download URL if needed.
 *
 * @param {string} objectKey
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string>}
 */
const getSignedDownloadUrl = async (objectKey, expiresIn = 3600) => {
  const env = validateEnv();
  const bucket = env.b2BucketName;

  if (mockB2Client && mockB2Client.getSignedDownloadUrl) {
    return mockB2Client.getSignedDownloadUrl(objectKey, expiresIn);
  }

  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  return getSignedUrl(client, command, { expiresIn });
};

module.exports = {
  isB2Configured,
  getB2Client,
  setMockB2Client,
  buildReceiptObjectKey,
  uploadFile,
  getFile,
  verifyObject,
  deleteFile,
  getSignedDownloadUrl,
};
