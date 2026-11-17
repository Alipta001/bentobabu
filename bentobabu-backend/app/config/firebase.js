/**
 * Firebase Admin SDK Singleton Initialization & Configuration
 * Provides secure server-side Firebase Cloud Messaging (FCM) messaging client.
 */

const admin = require('firebase-admin');

let firebaseApp = null;
let isConfigured = false;
let initError = null;
let mockMessagingInstance = null;

const setMessagingMock = (mock) => {
  mockMessagingInstance = mock;
};

const initializeFirebaseAdmin = () => {
  if (firebaseApp) {
    return { app: firebaseApp, isConfigured };
  }

  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  let privateKey = process.env.FCM_PRIVATE_KEY;

  if (privateKey) {
    // Handle escaped newlines from environment variable strings (Render, Heroku, .env)
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const hasCredentials = Boolean(projectId && clientEmail && privateKey);

  if (process.env.NODE_ENV === 'production' && !hasCredentials) {
    const missing = [];
    if (!projectId) missing.push('FCM_PROJECT_ID');
    if (!clientEmail) missing.push('FCM_CLIENT_EMAIL');
    if (!privateKey) missing.push('FCM_PRIVATE_KEY');
    initError = new Error(
      `[FirebaseAdmin] Required FCM configuration missing in production: ${missing.join(', ')}`
    );
    console.warn(initError.message);
  }

  if (hasCredentials) {
    try {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      isConfigured = true;
      console.log('[FirebaseAdmin] Initialized successfully with service account credential.');
    } catch (err) {
      initError = err;
      console.error('[FirebaseAdmin] Initialization error:', err.message);
    }
  } else {
    // In development or test mode, log clear diagnostic without crashing server
    console.log('[FirebaseAdmin] Running in development/test dry-run mode (FCM credentials not set).');
  }

  return { app: firebaseApp, isConfigured };
};

const getFirebaseAdminApp = () => {
  if (!firebaseApp && !initError) {
    initializeFirebaseAdmin();
  }
  return firebaseApp;
};

const isFirebaseConfigured = () => {
  if (mockMessagingInstance) return true;
  if (!firebaseApp && !initError) {
    initializeFirebaseAdmin();
  }
  return isConfigured;
};

const getMessaging = () => {
  if (mockMessagingInstance) return mockMessagingInstance;
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return admin.messaging(app);
};

module.exports = {
  initializeFirebaseAdmin,
  getFirebaseAdminApp,
  isFirebaseConfigured,
  getMessaging,
  setMessagingMock,
};
