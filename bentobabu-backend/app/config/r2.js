/**
 * Cloudflare R2 S3-Compatible Object Storage Service
 * Handles presigned PUT generation, HeadObject verification, and lifecycle deletions.
 */

const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { validateEnv } = require('./env');

let mockR2Client = null;

/**
 * Configure S3 Client pointing to Cloudflare R2 S3-compatible API
 */
const getR2Client = () => {
  if (mockR2Client) return mockR2Client;

  const env = validateEnv();
  const accountId = env.r2AccountId;

  return new S3Client({
    region: env.r2Region || 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
  });
};

/**
 * Allows automated test suites to mock R2 S3Client
 */
const setMockR2Client = (mock) => {
  mockR2Client = mock;
};

/**
 * Generate a short-lived presigned PUT URL for direct browser-to-R2 upload
 * @param {Object} params
 * @param {string} params.objectKey - Target object key in R2
 * @param {string} params.contentType - MIME type (e.g. video/mp4)
 * @param {number} [params.contentLength] - Expected file size in bytes
 * @param {number} [params.expiresIn=600] - Expiry in seconds
 * @returns {Promise<string>} Presigned URL
 */
const generatePresignedUploadUrl = async ({
  objectKey,
  contentType = 'video/mp4',
  contentLength,
  expiresIn = 600,
}) => {
  const env = validateEnv();
  const client = getR2Client();

  if (mockR2Client && mockR2Client.generatePresignedUploadUrl) {
    return mockR2Client.generatePresignedUploadUrl({ objectKey, contentType, contentLength, expiresIn });
  }

  const commandParams = {
    Bucket: env.r2BucketName,
    Key: objectKey,
    ContentType: contentType,
  };

  if (contentLength && typeof contentLength === 'number') {
    commandParams.ContentLength = contentLength;
  }

  const command = new PutObjectCommand(commandParams);
  return getSignedUrl(client, command, { expiresIn });
};

/**
 * Verifies existence and metadata of an uploaded object in R2 via HeadObject
 * @param {string} objectKey
 * @returns {Promise<{ exists: boolean, sizeBytes: number, contentType: string, eTag: string }>}
 */
const verifyObject = async (objectKey) => {
  const env = validateEnv();
  const client = getR2Client();

  if (mockR2Client && mockR2Client.verifyObject) {
    return mockR2Client.verifyObject(objectKey);
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: env.r2BucketName,
      Key: objectKey,
    });
    const res = await client.send(command);

    return {
      exists: true,
      sizeBytes: res.ContentLength || 0,
      contentType: res.ContentType || '',
      eTag: res.ETag || '',
      lastModified: res.LastModified,
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false, sizeBytes: 0, contentType: '', eTag: '' };
    }
    throw error;
  }
};

/**
 * Delete an object from R2
 * @param {string} objectKey
 * @returns {Promise<boolean>}
 */
const deleteObject = async (objectKey) => {
  const env = validateEnv();
  const client = getR2Client();

  if (mockR2Client && mockR2Client.deleteObject) {
    return mockR2Client.deleteObject(objectKey);
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: env.r2BucketName,
      Key: objectKey,
    });
    await client.send(command);
    return true;
  } catch (err) {
    console.error(`[R2] Error deleting object ${objectKey}:`, err);
    return false;
  }
};

/**
 * Formats public delivery URL using configured custom domain or base URL
 * @param {string} objectKey
 * @returns {string} Public URL
 */
const getPublicUrl = (objectKey) => {
  if (!objectKey) return '';
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) {
    return objectKey;
  }

  const env = validateEnv();
  const baseUrl = (env.r2PublicBaseUrl || '').replace(/\/$/, '');
  const cleanKey = objectKey.replace(/^\//, '');

  if (!baseUrl) {
    // Fallback S3-compatible path if public base URL is unset
    return `https://${env.r2BucketName}.${env.r2AccountId}.r2.cloudflarestorage.com/${cleanKey}`;
  }

  return `${baseUrl}/${cleanKey}`;
};

/**
 * Retrieves basic bucket usage statistics
 * @returns {Promise<{ objectCount: number, totalSizeBytes: number, estimatedGB: number }>}
 */
const getUsage = async () => {
  const env = validateEnv();
  const client = getR2Client();

  if (mockR2Client && mockR2Client.getUsage) {
    return mockR2Client.getUsage();
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: env.r2BucketName,
      MaxKeys: 1000,
    });
    const res = await client.send(command);

    let totalSizeBytes = 0;
    const contents = res.Contents || [];
    for (const item of contents) {
      totalSizeBytes += item.Size || 0;
    }

    const estimatedGB = Number((totalSizeBytes / (1024 * 1024 * 1024)).toFixed(3));

    return {
      objectCount: contents.length,
      isTruncated: !!res.IsTruncated,
      totalSizeBytes,
      estimatedGB,
      freeTierLimitGB: 10,
      usagePercent: Number(((estimatedGB / 10) * 100).toFixed(1)),
    };
  } catch (err) {
    console.warn('[R2] Could not fetch bucket metrics:', err.message);
    return {
      objectCount: 0,
      totalSizeBytes: 0,
      estimatedGB: 0,
      freeTierLimitGB: 10,
      usagePercent: 0,
    };
  }
};

module.exports = {
  getR2Client,
  setMockR2Client,
  generatePresignedUploadUrl,
  verifyObject,
  deleteObject,
  getPublicUrl,
  getUsage,
};
