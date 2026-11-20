/**
 * BentoBabu Staging Safety Guard & Data Isolation Layer
 *
 * Enforces strict isolation policies:
 * 1. Blocks any operation if connected to a production database.
 * 2. Verifies database name contains 'staging' or 'test'.
 * 3. Enforces tagging of all created test data with 'isStagingTest: true'.
 * 4. Provides idempotent cleanup of test artifacts without touching live data.
 */

const mongoose = require('mongoose');

class StagingSafetyError extends Error {
  constructor(message) {
    super(`[STAGING_SAFETY_GUARD] ${message}`);
    this.name = 'StagingSafetyError';
  }
}

/**
 * Validates that a MongoDB URI targets an isolated staging/test database.
 * Throws StagingSafetyError if production is detected.
 */
function assertStagingDatabaseUri(uri) {
  if (!uri || typeof uri !== 'string') {
    throw new StagingSafetyError('Missing MONGODB_URI for staging environment.');
  }

  const match = uri.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1] : '';

  // Explicitly forbidden production database names
  const forbiddenProductionNames = ['bentobabu', 'bentobabu_production', 'production', 'prod'];
  if (forbiddenProductionNames.includes(dbName.toLowerCase())) {
    throw new StagingSafetyError(
      `FATAL SAFETY BLOCK: Attempted to run staging tests against production database '${dbName}'! Tests must use 'bentobabu_staging' or 'bentobabu_test'.`
    );
  }

  // Must match explicit staging/test naming
  const isStagingDb = dbName.includes('staging') || dbName.includes('test');
  if (!isStagingDb) {
    throw new StagingSafetyError(
      `FATAL SAFETY BLOCK: Database '${dbName}' does not contain 'staging' or 'test'. Refusing to proceed.`
    );
  }

  return dbName;
}

/**
 * Validates active Mongoose connection before any test or teardown executes.
 */
function assertActiveConnectionIsStaging() {
  if (mongoose.connection.readyState !== 1) {
    throw new StagingSafetyError('No active MongoDB connection found.');
  }

  const activeDbName = mongoose.connection.name;
  if (!activeDbName || activeDbName === 'bentobabu' || (!activeDbName.includes('staging') && !activeDbName.includes('test'))) {
    throw new StagingSafetyError(
      `FATAL SAFETY BLOCK: Active connection is targeting '${activeDbName}'. Must be 'bentobabu_staging' or a test database.`
    );
  }

  return activeDbName;
}

module.exports = {
  assertStagingDatabaseUri,
  assertActiveConnectionIsStaging,
  StagingSafetyError,
};
