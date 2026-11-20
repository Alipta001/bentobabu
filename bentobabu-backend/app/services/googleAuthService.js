const { OAuth2Client } = require('google-auth-library');
const { validateEnv } = require('../config/env');

let verifierOverride = null;

class GoogleAuthService {
  /**
   * For deterministic unit and integration testing: allows mocking the token verifier
   */
  static setGoogleVerifierMock(mockFn) {
    verifierOverride = mockFn;
  }

  /**
   * Verifies a Google ID token (JWT) using Google Identity Services / google-auth-library.
   * Performs cryptographic signature verification, audience validation, issuer check,
   * expiration check, and extracts verified claims.
   *
   * @param {string} idToken - The raw Google ID token string from GIS frontend
   * @returns {Promise<{ googleId: string, email: string, name: string, givenName?: string, familyName?: string, picture?: string, emailVerified: boolean }>}
   */
  static async verifyIdToken(idToken) {
    if (verifierOverride) {
      return verifierOverride(idToken);
    }

    if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
      const err = new Error('Missing or invalid Google ID token');
      err.statusCode = 400;
      throw err;
    }

    const cleanToken = idToken.trim();
    const env = validateEnv();
    const clientId = env.googleClientId;

    if (!clientId) {
      const err = new Error('Google authentication is not configured on the server');
      err.statusCode = 500;
      throw err;
    }

    const client = new OAuth2Client(clientId);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: cleanToken,
        audience: clientId,
      });
    } catch (verifyErr) {
      const err = new Error(`Google token verification failed: ${verifyErr.message}`);
      err.statusCode = 401;
      throw err;
    }

    const payload = ticket.getPayload();
    if (!payload) {
      const err = new Error('Empty payload in Google ID token');
      err.statusCode = 401;
      throw err;
    }

    // Verify issuer
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      const err = new Error(`Invalid Google token issuer: ${payload.iss}`);
      err.statusCode = 401;
      throw err;
    }

    // Verify sub
    if (!payload.sub || typeof payload.sub !== 'string') {
      const err = new Error('Missing sub identifier in Google ID token');
      err.statusCode = 401;
      throw err;
    }

    // Verify email
    if (!payload.email || typeof payload.email !== 'string') {
      const err = new Error('Missing email in Google ID token');
      err.statusCode = 400;
      throw err;
    }

    // Verify email_verified
    const isEmailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!isEmailVerified) {
      const err = new Error('Google email address is not verified');
      err.statusCode = 403;
      throw err;
    }

    return {
      googleId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: (payload.name || payload.given_name || payload.email.split('@')[0] || 'Customer').trim(),
      givenName: payload.given_name || '',
      familyName: payload.family_name || '',
      picture: payload.picture || null,
      emailVerified: true,
    };
  }
}

module.exports = { GoogleAuthService };
