// tests/load/load-test-helpers/auth.js

import http from 'k6/http';
import { check, fail } from 'k6';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function login(username, password) {
  /**
   * Login to LeagueSphere via API and return authenticated session
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Object} {cookies, token, csrfToken} for authenticated requests
   */

  // Login via API
  const loginRes = http.post(
    `${BASE_URL}/accounts/auth/login/`,
    JSON.stringify({
      username: username,
      password: password,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  console.log(`Login request to: ${BASE_URL}/api/auth/login/`);
  console.log(`Login response status: ${loginRes.status}`);
  console.log(`Login response body: ${loginRes.body}`);

  check(loginRes, {
    'login succeeds': (r) => r.status === 200,
  }) || fail(`Login failed: ${loginRes.status} - ${loginRes.body}`);

  const data = loginRes.json();
  const token = data.token;

  // Get CSRF token from API
  const csrfRes = http.get(`${BASE_URL}/api/gamedays/`, {
    headers: { Authorization: `Token ${token}` },
  });

  const csrfToken = csrfRes.headers['X-CSRFToken'] || '';

  return {
    token: token,
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
