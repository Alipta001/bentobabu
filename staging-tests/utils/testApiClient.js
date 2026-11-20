/**
 * BentoBabu Staging Test API Client
 *
 * Lightweight, robust HTTP client for end-to-end integration and concurrency testing.
 * Supports cookie sessions, bearer tokens, CSRF tokens, and isolated role contexts.
 */

const http = require('http');

class TestApiClient {
  constructor(baseUrl = 'http://127.0.0.1:5050/api/v1') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cookies = new Map();
    this.csrfToken = null;
    this.authContext = null;
    this.bearerToken = null;
  }

  setBearerToken(token) {
    this.bearerToken = token;
    return this;
  }

  setAuthContext(context) {
    this.authContext = context;
    return this;
  }

  getCookieHeader() {
    if (this.cookies.size === 0) return '';
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  saveCookiesFromHeaders(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const h of headers) {
      const parts = h.split(';')[0].split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        this.cookies.set(key, val);
      }
    }
  }

  async fetchCsrfToken() {
    const res = await this.request('GET', '/auth/csrf-token');
    if (res.body?.data?.csrfToken) {
      this.csrfToken = res.body.data.csrfToken;
    }
    return this.csrfToken;
  }

  async login(identifier, password, authContext = 'customer') {
    this.authContext = authContext;
    await this.fetchCsrfToken();
    const res = await this.request('POST', '/auth/login', {
      identifier,
      password,
    });
    return res;
  }

  async request(method, path, body = null, customHeaders = {}) {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

    const headers = {
      'Content-Type': 'application/json',
      Connection: 'close',
      ...customHeaders,
    };

    if (this.authContext) {
      headers['X-Auth-Context'] = this.authContext;
    }

    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const postData = body ? JSON.stringify(body) : null;
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 5050,
          path: `${url.pathname}${url.search}`,
          method: method.toUpperCase(),
          headers,
          agent: false,
        },
        (res) => {
          this.saveCookiesFromHeaders(res.headers['set-cookie']);

          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });

          res.on('end', () => {
            let parsedBody = null;
            try {
              parsedBody = rawData ? JSON.parse(rawData) : null;
            } catch {
              parsedBody = rawData;
            }

            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsedBody,
              rawText: rawData,
            });
          });
        }
      );

      req.on('error', reject);

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  get(path, headers = {}) {
    return this.request('GET', path, null, headers);
  }

  post(path, body, headers = {}) {
    return this.request('POST', path, body, headers);
  }

  patch(path, body, headers = {}) {
    return this.request('PATCH', path, body, headers);
  }

  put(path, body, headers = {}) {
    return this.request('PUT', path, body, headers);
  }

  delete(path, body, headers = {}) {
    return this.request('DELETE', path, body, headers);
  }
}

module.exports = {
  TestApiClient,
};
