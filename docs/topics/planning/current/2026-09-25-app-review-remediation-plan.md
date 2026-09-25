# LeagueSphere App Review: Remediation Plan

**Date:** 2026-09-25
**Status:** Proposed
**Source:** Two independent code reviews of the whole app group (Django backend, five React apps, container and CI config), merged and re-prioritized. Findings come from reading code and running `black --check`; no tests were run and nothing was changed on the app itself.

Read this top to bottom. Phases are ordered by risk first, then effort. Each item says **what** is wrong, **where** it lives, **how** to fix it and **how to prove it**. Effort is S (under an hour), M (half a day), L (a day or more).

---

## Priority overview

| # | Item | Category | Severity | Effort | Phase |
|---|------|----------|----------|--------|-------|
| 1 | Clickjacking: `X_FRAME_OPTIONS = "ALLOWALL"` is an invalid value, browsers ignore it | Security | High | S | 1 |
| 2 | Prod cookies not HTTPS-only, no HSTS, no SSL redirect | Security | High | S | 1 |
| 3 | nginx sends joke headers but no security headers | Security | High | S | 1 |
| 4 | Stored XSS: pandas `to_html(escape=False)` + `\|safe` in five places | Security | High | M | 2 |
| 5 | Middleware order: maintenance middleware hits the DB before the DB guard runs | Reliability | High | S | 1 |
| 6 | Login has no brute-force protection | Security | Medium | S | 2 |
| 7 | `mark_safe()` on strings built from CSV rows and exception text | Security | Medium | S | 2 |
| 8 | CORS open to every origin, deprecated setting name | Security | Medium | S | 1 |
| 9 | DB silently falls back to `user`/`user`@`127.0.0.1` when env vars are missing | Reliability | Medium | S | 1 |
| 10 | `LocMemCache` with 6 gunicorn workers: six caches that disagree | Reliability / Perf | Medium | M | 3 |
| 11 | League standings recomputed with pandas per uncached request | Performance | Medium | M | 3 |
| 12 | Journey event API skips validation, unbounded JSON, no retention | API / Reliability | Medium | S | 2 |
| 13 | Public rosters expose name, pass number and join date, and sit in the sitemap | Privacy | Medium | S (decision) | 2 |
| 14 | `black` required by CLAUDE.md but 136 files fail and CI never runs it | Process | Medium | M | 4 |
| 15 | CLAUDE.md and README link eight docs that no longer exist | Docs | Medium | S | 4 |
| 16 | Repo root clutter: loose scripts, analysis MDs, four AI instruction files | Hygiene | Medium | M | 4 |
| 17 | Config drift: Django version, bumpversion, `packages.find`, env var names, dead GH workflows | Hygiene | Low | S | 4 |
| 18 | Five frontend toolchains, drifting deps, hook lint suppressions, `no-explicit-any` file | Frontend | Medium | L | 5 |
| 19 | Django nits: double route mount, GET that mutates, unused log handler, `SET_DEFAULT=1`, bare `except` | Code quality | Low | S | 5 |
| 20 | Tests: `assertNumQueries` in 14 of 199 files, 795-line `journey/tests.py`, `--capture=no` in addopts | Testing | Low | M | 5 |

---

## Phase 1: Settings and edge hardening (one PR, no behaviour risk)

Goal: close every High that is a config change. Target: a single PR touching `league_manager/settings/base.py`, `league_manager/settings/prod.py`, `league_manager/settings/stage.py` and the three nginx confs.

### 1.1 Fix `X_FRAME_OPTIONS` (item 1)
- **Where:** `league_manager/settings/base.py:230`, under `# ToDo deleteMe`.
- **Why:** `ALLOWALL` is not a valid value (only `DENY` and `SAMEORIGIN` are). Browsers drop the header, nginx adds nothing, so any site can iframe `/admin/`, the scorecard or passcheck and clickjack a logged-in staff user.
- **How:** Delete the line so Django's default `DENY` applies. If a view genuinely must be embedded, decorate that one view with `@xframe_options_exempt` or `@xframe_options_sameorigin`.
- **Verify:** `curl -I https://stage.leaguesphere.app/` shows `X-Frame-Options: DENY`. Add a test that requests `/` and asserts the header.

### 1.2 Secure cookies, HSTS and SSL redirect in prod and stage (item 2)
- **Where:** `prod.py` and `stage.py` set `SECURE_PROXY_SSL_HEADER` but nothing else. Only `demo.py` sets the cookie flags.
- **How:** Add to both files:
  ```python
  SESSION_COOKIE_SECURE = True
  CSRF_COOKIE_SECURE = True
  SECURE_SSL_REDIRECT = True
  SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # start at 30 days, raise to a year once stable
  SECURE_HSTS_INCLUDE_SUBDOMAINS = True
  SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
  ```
  Exclude `/health/` from the SSL redirect with `SECURE_REDIRECT_EXEMPT = [r"^health/"]` if the container healthcheck hits it over plain HTTP.
- **Verify:** `DJANGO_SETTINGS_MODULE=league_manager.settings.prod python manage.py check --deploy` reports no cookie or HSTS warnings. Deploy to stage first and confirm login still works behind Traefik.

### 1.3 Security headers in nginx (item 3)
- **Where:** `container/nginx.conf:18-20`, `container/nginx.demo.conf:18-20`, `container/nginx.staging.conf:18-20`.
- **How:** Keep the coffee joke. Add in the same `location /` block:
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  ```
  Leave `X-Frame-Options` and HSTS to Django (1.1, 1.2) so there is one owner per header. A Content-Security-Policy is a follow-up: 42 jsdelivr and 2 unpkg references plus 17 templates with inline scripts need SRI hashes or nonces first.
- **Verify:** `curl -I` on stage after deploy via `./container/deploy.sh stage`. Add `container/test-compose-network.sh` style check if practical.

### 1.4 Swap the middleware order (item 5)
- **Where:** `league_manager/settings/base.py:50-51`.
- **Why:** `MaintenanceModeMiddleware` calls `SiteConfiguration.objects.first()` on a cache miss with no try/except. With the DB down and a cold cache (every worker after a restart), it raises `OperationalError` and the user sees a 500. `DatabaseGuardMiddleware`, which exists precisely for that case, never runs.
- **How:** Put `DatabaseGuardMiddleware` above `MaintenanceModeMiddleware`. Also wrap the config lookup in the maintenance middleware in a `try/except OperationalError` that falls back to `scope: off`, so it is safe regardless of order.
- **Verify:** Test with a mocked `connection.cursor` raising `OperationalError`: request `/` and assert a redirect to `/database-error/`, not a 500.

### 1.5 Tighten CORS (item 8)
- **Where:** `base.py:13`, `CORS_ORIGIN_ALLOW_ALL = True`.
- **How:** Replace with `CORS_ALLOWED_ORIGINS = [...]` listing the real front-end origins per environment (`prod.py`, `stage.py`, `demo.py`, `dev.py`). Credentials stay disabled.
- **Verify:** Preflight from an unlisted origin returns no `Access-Control-Allow-Origin`.

### 1.6 Fail loudly on missing DB config (item 9)
- **Where:** `base.py`, `DATABASES` defaults to `user`/`user`@`127.0.0.1`.
- **How:** Keep the defaults for `dev.py` and `test_sqlite.py` only. In `base.py` read the env vars without defaults; in `prod.py` and `stage.py` assert they are set (or use `os.environ[...]` so a `KeyError` stops startup). Same for `SECRET_KEY`: prod should refuse to start without one.
- **Verify:** Starting prod settings without `MYSQL_HOST` raises at import time.

### 1.7 Small settings cleanups (part of item 19)
- Remove the duplicate `django.template.context_processors.request` (`base.py:81` and `:84`).
- Remove the unused `debug.log` file handler in `LOGGING` (`base.py:214`), or attach it to a logger on purpose.
- Delete the commented-out `DEBUG_DATE` and toolbar toggles in `dev.py`.

**Phase 1 done when:** `check --deploy` is clean for prod, stage shows the new headers, all existing tests pass, and the PR is under about 60 changed lines.

---

## Phase 2: Escaping, validation and access decisions

### 2.1 Stop rendering unescaped HTML from user-controlled names (item 4)
- **Where:** `gamedays/views.py:142`, `:228`, `:473`, `gamedays/service/tournament_service.py:114`, `matchreport/constants.py:30`, all `"escape": False` passed to pandas `to_html`, then `|safe` in `gamedays/templates/gamedays/statistics/league_statistics.html` and `matchreport/templates/matchreport/gameday_detail.html`.
- **Why:** Player and team names flow into those tables. A team manager (non-staff, via passcheck) can set a player name to `<img src=x onerror=...>` and it executes on the public league statistics page and in the staff match report.
- **How (TDD):**
  1. Write a test that creates a player named `<script>alert(1)</script>`, renders the statistics view and asserts the raw tag is **not** in the response body.
  2. Remove `"escape": False` everywhere. If some columns need markup (links, badges), build those cells with `django.utils.html.format_html` so only the markup is trusted and the data is escaped.
  3. Keep `|safe` only where the string is now guaranteed to come from `format_html`.
- **Verify:** The new tests pass; visually check the statistics and match report pages on stage.

### 2.2 Escape the officials import messages (item 7)
- **Where:** `officials/views.py:325`, `:390`, `:690` (`messages.success(..., mark_safe(created_entries))`, `mark_safe(f"{summary}<br>{detail}")`).
- **Why:** The strings contain official names from the DB and exception messages that echo CSV cell content (for example a `ValueError` from `int("<b>x</b>")`). Staff-only, so low reach, but it is a real stored/reflected XSS path.
- **How:** Build the message with `format_html_join("<br>", "{}", ((line,) for line in lines))` instead of string concatenation plus `mark_safe`.
- **Verify:** Test that an uploaded row containing `<b>` produces an escaped `&lt;b&gt;` in the message.

### 2.3 Rate-limit password logins (item 6)
- **Where:** `/login/` and `/admin/login/` are plain Django views (`league_manager/urls.py`); DRF's `AnonRateThrottle` covers only the API.
- **How:** Either add `django-axes` (`AXES_FAILURE_LIMIT = 5`, `AXES_COOLOFF_TIME = 1` hour, lock by username + IP) or add `limit_req_zone` in nginx for those two paths. Prefer `django-axes` because it also covers `/api/accounts/auth/login/` and logs attempts. Do this after Phase 3 if you pick axes, because it needs a shared cache to count across workers.
- **Verify:** Six wrong passwords in a row returns a lockout response; the test suite includes one such test.

### 2.4 Validate journey events (item 12)
- **Where:** `journey/views.py:19` (`JourneyEventViewSet.create` reads `request.data` directly).
- **How:** Run `self.get_serializer(data=request.data)` and `is_valid(raise_exception=True)` before creating. Add a `max_length` and an allow-list of `event_name` values, cap `metadata` size (for example 4 KB) in the serializer, and add a management command that deletes events older than 90 days.
- **Verify:** POST without `event_name` returns 400, not 500. Oversized metadata returns 400.

### 2.5 Decide on roster privacy (item 13)
- **Where:** `passcheck/templates/passcheck/roster_list.html:68-72`, `league_manager/sitemaps.py:155` (`PasscheckTeamSitemap`).
- **Why:** Anonymous visitors and search engines see first name, last name, pass number and join date of every player.
- **How:** This is a product decision, not a code bug. Options, cheapest first: (a) show the pass number column only when `is_user_or_staff`; (b) drop rosters from the sitemap and add `noindex`; (c) gate the whole roster behind login. Record the decision in `docs/topics/features/`.
- **Verify:** Anonymous GET of a roster page no longer contains pass numbers (if a or c).

**Phase 2 done when:** every `escape=False` and `mark_safe` call site has a test proving escaping, logins lock out, journey POSTs validate, and the roster decision is documented.

---

## Phase 3: Shared cache and server-side result caching

### 3.1 Replace `LocMemCache` with Redis (item 10)
- **Where:** `base.py:62`; gunicorn runs `-w 6 --threads 2` in `deployed/docker-compose.yaml:42` and the demo and staging compose files.
- **Why:** Six workers means six private caches. Effects today: `AnonRateThrottle` "120/min" is really about 720/min; `/clear-cache/` clears one worker in six; maintenance mode can be on in one worker and off in another; the DB guard status is per worker; every cached value is rebuilt six times and lost on each deploy.
- **How:**
  1. Add a `redis` service to the three compose files (`deployed/docker-compose*.yaml`) with a named volume and a healthcheck, via the container repo's Ansible flow, never by hand on the server.
  2. Set `CACHES["default"]["BACKEND"] = "django.core.cache.backends.redis.RedisCache"` with `LOCATION` from `REDIS_URL`; keep `LocMemCache` in `dev.py` and `test_sqlite.py`.
  3. Add `REDIS_URL` to `.env_template` and `deployed/ls.env.staging.template`.
- **Verify:** On stage, toggle maintenance mode and confirm every request sees it immediately; hit `/clear-cache/` and confirm the ETag-based views recompute. Confirm throttle counts are shared by exceeding 120 anonymous requests per minute.

### 3.2 Cache computed standings and list payloads (item 11)
- **Where:** `league_table/api/views.py` (`LeagueTableAPIView.get` rebuilds a pandas DataFrame per request that lacks a matching ETag); the same pattern fits `GamedayViewSet.list` and the journey progress feed.
- **How:** The ETag function already knows when data changed. Use the ETag string as the cache key: on a miss, compute, `cache.set(etag, payload, 3600)`; on a hit, return the stored JSON. Wrap this in a small helper in `league_manager/utils/` so the three endpoints share it. Only meaningful once 3.1 is in, otherwise it is six caches again.
- **Verify:** Test with `assertNumQueries`: the second request with the same ETag runs only the ETag query. Run `k6 run load-test-k6.js` before and after and compare p95 in the Grafana k6 dashboard.
