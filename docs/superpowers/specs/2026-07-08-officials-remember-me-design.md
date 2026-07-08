# Remember-me for officials sign-up — design

- **Issue:** [#1478](https://github.com/dachrisch/leaguesphere/issues/1478)
- **Date:** 2026-07-08
- **Status:** Approved, ready for implementation planning

## Problem

Officials re-enter their Moodle username + password for every gameday sign-up, and
the prod session expires after 600 s (`officials/views.py`), so they authenticate
again and again. We want an opt-in **"Angemeldet bleiben"** that lets a returning
official skip re-typing their password.

## Invariants (do not violate)

- **The Moodle password login stays.** `MoodleApi.confirm_user_auth()` must succeed
  before anything is cached. We only remember identity *after* a successful auth.
- **The admin token (`settings.MOODLE_WSTOKEN`) is never used to identify or
  authenticate a visitor.** It stays reserved for the license/officials sync. An
  earlier proposal to resolve officials by email via the admin token was rejected as
  an impersonation hole.
- **License / eligibility / sign-up limits are unchanged** — still enforced downstream
  by `OfficialSignupService`. This feature only changes how identity is *remembered*
  between visits.

## Decisions

| Question | Decision |
|---|---|
| Token lifetime | **30 days, sliding** — each successful auto-login rotates the token and resets the 30-day clock. Idle cookies die 30 days after last use. |
| Re-verification on auto-login | **Local DB validity check** — confirm the `Official` still exists (and optionally has a current license) via local DB only. No Moodle call, no admin token. |
| Storage | **Dedicated model** with `selector` + hashed `validator` (split-token pattern). |
| Shared/public devices | Mitigated by opt-in checkbox, **default off**. |

## Architecture

### 1. Data model — `officials/models.py`

New `MoodleRememberToken`:

| field | type | notes |
|---|---|---|
| `selector` | `CharField(max_length=64, unique=True, db_index=True)` | random `secrets.token_hex(16)`; O(1) lookup key |
| `validator_hash` | `CharField(max_length=64)` | `sha256(validator)` hex — the **raw validator is never stored** |
| `official` | `ForeignKey(Official, on_delete=models.CASCADE)` | deleting an Official auto-purges its tokens; this *is* the "official still exists" guarantee |
| `created_at` | `DateTimeField(auto_now_add=True)` | |
| `expires_at` | `DateTimeField(db_index=True)` | expiry check + pruning |

The cookie value is `"{selector}:{validator}"`.

### 2. Service — `officials/service/remember_me.py` (`RememberMeService`)

All token logic and security live here so views stay thin and the behaviour is unit-testable.

- `issue(official_id) -> "selector:validator"`
  - mint `selector = secrets.token_hex(16)`, `validator = secrets.token_urlsafe(32)`
  - persist row with `validator_hash = sha256(validator)`, `expires_at = now + 30d`
  - return the raw `"selector:validator"` string for the cookie
- `restore(cookie_value) -> RestoreResult`
  - parse `selector:validator`; malformed → miss
  - look up by `selector`; not found → miss
  - **constant-time** compare `sha256(validator)` against `validator_hash`
    (`hmac.compare_digest`); mismatch → miss
  - expired (`expires_at <= now`) → miss (and delete row)
  - local validity check: FK guarantees the Official exists; optionally confirm a
    current local license. Invalid → miss (delete row)
  - **rotate**: generate a new `validator`, update `validator_hash`, reset
    `expires_at = now + 30d` (sliding); keep the same `selector`
  - return `official.pk` **and** the rotated `"selector:validator"` so the view
    re-sets the cookie
- `revoke(cookie_value)` — delete the row identified by `selector` (logout)
- `prune_expired()` — delete rows past `expires_at`; called lazily inside `restore`
  and exposed as a small management command for housekeeping

A miss returns a result that tells the caller to clear the cookie and fall back to
the login redirect.

### 3. View / form / template changes

- **`MoodleLoginForm`** (`officials/forms.py`): add
  `remember_me = forms.BooleanField(required=False, label="Angemeldet bleiben")`.
  Crispy renders it automatically — no manual markup needed in
  `moodle_login.html`.
- **`MoodleLoginView.post`**: on successful `MoodleService.login()` **and**
  `remember_me` checked → `RememberMeService.issue()` and set the cookie on the
  redirect response.
- **`OfficialSignUpListView.get`**: when the session has no `official_id`, try
  `RememberMeService.restore(cookie)` *before* redirecting.
  - success → set session `official_id`, write the rotated cookie, render the list
    (no password prompt, no Moodle call)
  - miss → clear the cookie, redirect to login (today's behaviour)
- **Logout**: new `OfficialSignOutView` at `gameday/sign-up/logout/` →
  `revoke()`, delete cookie, clear the `MOODLE_LOGGED_IN_USER` session key, redirect
  to login with a message. Add a logout link on `sign_up_list.html`.

**Cookie attributes:** `HttpOnly`, `SameSite="Lax"`, `secure = not settings.DEBUG`,
`max_age = 30 days`, `path = "/officials/gameday/sign-up/"` (scopes the cookie to
this flow only — covers list, login, add, cancel, logout).

### 4. Migration

One migration adding `MoodleRememberToken`.

## Testing (TDD)

**Service unit tests**
- raw validator is not persisted anywhere (only the hash)
- `restore` returns the official id for a valid, unexpired cookie
- `restore` misses on: expired token, unknown selector, tampered validator, malformed value
- rotation changes the stored `validator_hash` and extends `expires_at`
- `revoke` deletes the row
- deleting an `Official` cascade-deletes its tokens (validity check path)

**View tests**
- login with checkbox on → remember cookie set
- login with checkbox off → no cookie (unchanged 10-min-session behaviour)
- sign-up list with a valid cookie and no session → renders list without redirect, session populated, cookie rotated
- sign-up list with an expired/tampered cookie → redirect to login + cookie cleared
- logout → token row and cookie gone, subsequent visit redirects to login

**Note:** avoid `assert_num_queries` assertions in these tests — they are
order-dependent under pytest-xdist in this repo and cause flaky CI failures.

## Out of scope

- Removing or replacing the Moodle password login.
- Any use of the admin token for identity/auth.
- License validity, exam results, sign-up limits (existing services).
- Changes to the staff-facing Moodle license-sync report.
