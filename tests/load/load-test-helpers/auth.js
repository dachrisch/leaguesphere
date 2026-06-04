// tests/load/load-test-helpers/auth.js

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function login(username, password) {
  /**
   * Login to LeagueSphere and return authenticated session
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Object} {cookies, csrfToken} for authenticated requests
   */

  // Step 1: Fetch login page to get CSRF token
  const loginPageRes = http.get(`${BASE_URL}/login/`);
  check(loginPageRes, {
    'login page loads': (r) => r.status === 200,
  });

  // Extract CSRF token from HTML
  const csrfMatch = loginPageRes.body.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : '';

  // Step 2: POST login credentials
  const loginRes = http.post(
    `${BASE_URL}/login/`,
    {
      username: username,
      password: password,
      csrfmiddlewaretoken: csrfToken,
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      redirect: 'follow',
    }
  );

  check(loginRes, {
    'login succeeds': (r) => r.status === 200 || r.status === 302,
  });

  return {
    cookies: loginRes.cookies,
    csrfToken: csrfToken,
  };
}

export function getCSRFTokenFromAPI(cookies) {
  /**
   * Fetch CSRF token from API endpoint (for authenticated requests)
   * @param {Object} cookies - Authenticated session cookies
   * @returns {string} CSRF token
   */
  const res = http.get(`${BASE_URL}/api/gamedays/`, { cookies: cookies });

  // Try to extract from response headers or use stored token
  const cookieHeader = res.headers['Set-Cookie'] || '';
  const csrfMatch = cookieHeader.match(/csrftoken=([^;]+)/);

  return csrfMatch ? csrfMatch[1] : '';
}
