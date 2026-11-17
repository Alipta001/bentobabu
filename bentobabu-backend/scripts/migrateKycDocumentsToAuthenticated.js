/**
 * Migration Script: Migrate existing Delivery Partner KYC Documents to Authenticated Storage
 *
 * Scans all DeliveryApplication documents in MongoDB and physically converts sensitive KYC documents
 * (idProof, drivingLicense, registrationCertificate, insurance) in Cloudinary from public ('upload')
 * delivery type to private/authenticated ('authenticated') storage via cloudinary.uploader.rename.
 *
 * Verifies authenticated existence via cloudinary.api.resource(publicId, { type: 'authenticated' })
 * before committing storageType: 'authenticated' to MongoDB.
 *
 * Usage:
 *   node scripts/migrateKycDocumentsToAuthenticated.js [--dry-run]
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const connectDB = require('../app/config/db');
const { DeliveryApplication } = require('../app/models');
const { configureCloudinary } = require('../app/config/cloudinary');

const isDryRun = process.argv.includes('--dry-run');

async function migrateDocuments(options = {}) {
  const dryRun = options.dryRun !== undefined ? options.dryRun : isDryRun;

  console.log(`\n===============================================================`);
  console.log(`  BentoBabu KYC Document Cloudinary Migration to Authenticated`);
  console.log(`  Mode: ${dryRun ? 'DRY-RUN (No physical changes committed)' : 'APPLIED (Physical Migration)'}`);
  console.log(`===============================================================\n`);

  await connectDB();
  const cloudinary = configureCloudinary();

  const applications = await DeliveryApplication.find({});
  console.log(`[Scan] Found ${applications.length} delivery application(s) to inspect.\n`);

  const stats = {
    applicationsScanned: applications.length,
    applicationsUpdated: 0,
    documentsInspected: 0,
    alreadyPrivate: 0,
    converted: 0,
    missingInCloudinary: 0,
    failed: 0,
    skipped: 0,
  };

  for (const app of applications) {
    let appModified = false;

    const docEntries = [
      { name: 'idProof', obj: app.documents?.idProof?.document },
      { name: 'drivingLicense', obj: app.documents?.drivingLicense },
      { name: 'registrationCertificate', obj: app.documents?.registrationCertificate },
      { name: 'insurance', obj: app.documents?.insurance },
    ];

    for (const { name, obj } of docEntries) {
      if (!obj) continue;

      const publicId = obj.publicId;
      if (!publicId) {
        stats.skipped += 1;
        continue;
      }

      // Skip local / mock / non-Cloudinary URIs
      if (publicId.startsWith('http') && !publicId.includes('res.cloudinary.com')) {
        stats.skipped += 1;
        continue;
      }

      stats.documentsInspected += 1;

      try {
        // Step 1: Check if already authenticated in Cloudinary
        let isAlreadyAuthenticated = false;
        try {
          await cloudinary.api.resource(publicId, { type: 'authenticated' });
          isAlreadyAuthenticated = true;
        } catch (authErr) {
          isAlreadyAuthenticated = false;
        }

        if (isAlreadyAuthenticated) {
          stats.alreadyPrivate += 1;
          console.log(`  [ALREADY AUTHENTICATED] App #${app.applicationNumber} - ${name} (${publicId})`);
          if (obj.storageType !== 'authenticated') {
            obj.storageType = 'authenticated';
            appModified = true;
          }
          continue;
        }

        // Step 2: Check if asset exists in public 'upload' storage
        let existsInUpload = false;
        try {
          await cloudinary.api.resource(publicId, { type: 'upload' });
          existsInUpload = true;
        } catch (pubErr) {
          existsInUpload = false;
        }

        if (!existsInUpload) {
          stats.missingInCloudinary += 1;
          console.warn(`  [MISSING IN CLOUDINARY] App #${app.applicationNumber} - ${name} (${publicId})`);
          continue;
        }

        // Asset found in upload storage: migrate to authenticated
        if (dryRun) {
          stats.converted += 1;
          console.log(`  [DRY-RUN WOULD CONVERT] App #${app.applicationNumber} - ${name} (${publicId}) -> authenticated`);
        } else {
          console.log(`  [MIGRATING] App #${app.applicationNumber} - ${name} (${publicId}) ...`);
          await cloudinary.uploader.rename(publicId, publicId, {
            type: 'upload',
            to_type: 'authenticated',
            overwrite: true,
          });

          // Verify authenticated delivery type
          await cloudinary.api.resource(publicId, { type: 'authenticated' });

          obj.storageType = 'authenticated';
          appModified = true;
          stats.converted += 1;
          console.log(`  [MIGRATED & VERIFIED] App #${app.applicationNumber} - ${name} (${publicId}) is now authenticated.`);
        }
      } catch (err) {
        stats.failed += 1;
        console.error(`  [FAILED] App #${app.applicationNumber} - ${name} (${publicId}): ${err.message}`);
      }
    }

    if (appModified && !dryRun) {
      await app.save();
      stats.applicationsUpdated += 1;
    }
  }

  console.log(`\n===============================================================`);
  console.log(`  Migration Summary`);
  console.log(`===============================================================`);
  console.log(`  Applications Scanned:        ${stats.applicationsScanned}`);
  console.log(`  Applications Updated (DB):   ${stats.applicationsUpdated}`);
  console.log(`  Documents Inspected:         ${stats.documentsInspected}`);
  console.log(`  Already Authenticated:       ${stats.alreadyPrivate}`);
  console.log(`  Converted to Authenticated:  ${stats.converted}`);
  console.log(`  Missing in Cloudinary:       ${stats.missingInCloudinary}`);
  console.log(`  Failed Conversions:          ${stats.failed}`);
  console.log(`  Skipped (non-Cloudinary):    ${stats.skipped}`);
  console.log(`  Execution Mode:              ${dryRun ? 'DRY-RUN (No changes applied)' : 'APPLIED'}`);
  console.log(`===============================================================\n`);

  if (!options.keepConnectionOpen) {
    await mongoose.disconnect();
    console.log('[Done] Database connection closed.');
  }

  return stats;
}

if (require.main === module) {
  migrateDocuments().catch((err) => {
    console.error('Fatal error during migration:', err);
    process.exit(1);
  });
}

module.exports = { migrateDocuments };
