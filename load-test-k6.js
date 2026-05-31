import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const errorCounter = new Counter('http_error_count');

const BASE_URL = __ENV.TARGET_HOST || 'https://www.leaguesphere.app';

const endpoints = [
  '/gamedays/',
  '/leaguetable/dffl/',
  '/officials/team/all/list/',
  '/gamedays/gameday/718/',
];

export const options = {
  stages: [
    { duration: '1m', target: 1 },   // 1 VU for 1 minute
    { duration: '1m', target: 2 },   // 2 VU for 1 minute
    { duration: '1m', target: 3 },   // 3 VU for 1 minute
    { duration: '1m', target: 4 },   // 4 VU for 1 minute
    { duration: '1m', target: 5 },   // 5 VU for 1 minute
    { duration: '1m', target: 6 },   // 6 VU for 1 minute
    { duration: '1m', target: 7 },   // 7 VU for 1 minute
    { duration: '1m', target: 8 },   // 8 VU for 1 minute
    { duration: '1m', target: 9 },   // 9 VU for 1 minute
    { duration: '1m', target: 10 },  // 10 VU for 1 minute
  ],
  ext: {
    loadimpact: {
      projectID: 3542522,
      name: 'LeagueSphere Load Test',
    },
  },
};

export default function () {
  // Pick random endpoint for this iteration
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = BASE_URL + endpoint;

  const response = http.get(url);

  // Check response status
  const isSuccess = check(response, {
    'status is 2xx or 3xx': (r) => r.status >= 200 && r.status < 400,
  });

  // Track errors
  if (!isSuccess) {
    errorRate.add(1);
    errorCounter.add(1);
  } else {
    errorRate.add(0);
  }

  // Small sleep to distribute requests
  sleep(0.1);
}
