// Shared helpers for the hardening harness.
// Login via UI (shares cookies with page.request), then API calls with
// Referer/Origin/X-CSRFToken headers so Django CSRF accepts them.
const path = require('path');

const BASE = 'https://demo.leaguesphere.app';
const DEMO_ADMIN = { username: 'admin@demo.local', password: 'DemoAdmin123!' };

const pad = (n) => String(n).padStart(2, '0');
// Server runs Europe/Berlin (UTC+2 in summer) — scorecard + liveticker filter
// by server-local today, so use this when a gameday must appear "today".
function serverToday() {
  const berlin = new Date(Date.now() + 2 * 3600 * 1000);
  return `${berlin.getUTCFullYear()}-${pad(berlin.getUTCMonth() + 1)}-${pad(berlin.getUTCDate())}`;
}

async function login(browser, creds = DEMO_ADMIN) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE + '/login/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('input[name="username"]', creds.username);
  await page.fill('input[name="password"]', creds.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);
  if (!page.url().includes('/gamedays')) throw new Error(`login failed for ${creds.username}: ${page.url()}`);
  const csrf = (await context.cookies()).find((c) => c.name === 'csrftoken')?.value || '';
  return { context, page, csrf, url: page.url() };
}

// api(page, csrf, method, path, data) -> {status, text, json}
async function api(page, csrf, method, p, data) {
  const headers = { Referer: BASE + '/', Origin: BASE, 'X-CSRFToken': csrf };
  const m = method.toLowerCase();
  let res;
  if (m === 'get') res = await page.request.get(BASE + p, { headers });
  else if (m === 'delete') res = await page.request.delete(BASE + p, { headers });
  else res = await page.request[m](BASE + p, { data, headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* html error page */ }
  return { status: res.status(), text, json };
}

// Small result aggregator used by the scenario scripts.
function makeRunner() {
  const results = [];
  const collect = { pageErrors: [], badResponses: [] };
  return {
    collect,
    attach(page) {
      page.on('pageerror', (e) => collect.pageErrors.push(String(e).slice(0, 300)));
      page.on('response', (res) => {
        if (res.status() >= 400) collect.badResponses.push(`${res.status()} ${res.request().method()} ${res.url().slice(0, 150)}`);
      });
    },
    async run(id, title, fn, runDir) {
      const r = { id, title, status: 'PASS', detail: '', shots: [] };
      const shot = async (name) => {
        const p = path.join(runDir, 'shots', name);
        await page.screenshot({ path: p });
        return `shots/${name}`;
      };
      try { await fn({ ...r, shot, api }); r.detail ||= 'completed; see run dir'; }
      catch (e) { r.status = 'FAIL'; r.detail = String(e.message).slice(0, 600); }
      Object.assign(r, { pageErrors: [...collect.pageErrors], badResponses: [...collect.badResponses] });
      results.push(r);
      return r;
    },
    results,
  };
}

module.exports = { BASE, DEMO_ADMIN, serverToday, login, api, makeRunner };