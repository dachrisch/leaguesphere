# Officials Remember-Me Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "Angemeldet bleiben" (remember-me) to the officials gameday sign-up so a returning official skips re-typing their Moodle password, without weakening authentication.

**Architecture:** After a *successful* Moodle password auth we mint a high-entropy token (`selector:validator`), persist it hashed in a new `MoodleRememberToken` model, and set it in a hardened cookie. On return, `OfficialSignUpListView` restores `official_id` from a valid cookie (rotating the token, sliding the 30-day expiry) instead of redirecting to login. A logout view revokes it. The Moodle password login and the admin-token/license-sync paths are untouched.

**Tech Stack:** Django 5.2, pytest + pytest-django, django-webtest (`WebTest`) for view tests, factory-boy, MariaDB test DB (LXC).

## Global Constraints

- **Do NOT remove or bypass the Moodle password login.** `MoodleService.login()` → `MoodleApi.confirm_user_auth()` must succeed before any token is minted.
- **Do NOT use `settings.MOODLE_WSTOKEN` (admin token) for identity/auth.** It stays reserved for the license/officials sync.
- **License / eligibility / sign-up limits are unchanged** — still enforced by `OfficialSignupService`.
- Token lifetime: **30 days, sliding** — rotate token + reset `expires_at` to `now + 30 days` on every successful auto-login.
- Store only the **sha256 hash** of the validator; the raw validator lives only in the cookie. Compare with `hmac.compare_digest` (constant-time).
- Cookie: name `officials_remember`; `HttpOnly`, `SameSite="Lax"`, `secure = not settings.DEBUG`, `max_age = 30 days`, `path = "/officials/gameday/sign-up/"`.
- Remember-me is **opt-in, default off**. Unchecked box → today's exact behaviour (10-min session only).
- **Do NOT add `assert_num_queries` assertions** — they are order-dependent under pytest-xdist in this repo and flake on CI.

## Test DB prerequisite (run once before any `pytest`)

```bash
cd leaguesphere
./container/spinup_test_db.sh --fresh
export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
```

Backend tests require this MariaDB instance. If a test aborts with `Team.DoesNotExist`, re-run `spinup_test_db.sh --fresh`.

## File Structure

- `officials/models.py` — **modify**: add `MoodleRememberToken` model.
- `officials/migrations/XXXX_moodlerembertoken.py` — **create** (generated).
- `officials/service/remember_me.py` — **create**: `RememberMeService` (issue/restore/revoke/prune) + `RestoreResult` + `REMEMBER_ME_MAX_AGE`.
- `officials/forms.py` — **modify**: add `remember_me` field to `MoodleLoginForm`.
- `officials/views.py` — **modify**: cookie constants/helpers, `MoodleLoginView.post`, `OfficialSignUpListView.get`, new `OfficialSignOutView`.
- `officials/urls.py` — **modify**: add logout route.
- `officials/templates/officials/signup/sign_up_list.html` — **modify**: add logout link.
- `officials/tests/service/test_remember_me.py` — **create**: service unit tests.
- `officials/tests/test_views.py` — **modify**: view tests.

---

### Task 1: `MoodleRememberToken` model + migration

**Files:**
- Modify: `officials/models.py`
- Create: `officials/migrations/XXXX_moodlerembertoken.py` (generated)
- Test: `officials/tests/service/test_remember_me.py`

**Interfaces:**
- Consumes: `Official` (existing model).
- Produces: `MoodleRememberToken(selector, validator_hash, official, created_at, expires_at)` with method `is_expired() -> bool`. FK `official` uses `on_delete=CASCADE` (deleting an Official purges its tokens — this is the "official still exists" guarantee).

- [ ] **Step 1: Write the failing test**

Add to a new file `officials/tests/service/test_remember_me.py`:

```python
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from officials.models import MoodleRememberToken, Official
from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials


class TestMoodleRememberTokenModel(TestCase):
    def setUp(self):
        DbSetupOfficials().create_officials_and_team()
        self.official = Official.objects.first()

    def test_is_expired_reflects_expires_at(self):
        past = MoodleRememberToken.objects.create(
            selector="sel-past",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        future = MoodleRememberToken.objects.create(
            selector="sel-future",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() + timedelta(days=1),
        )
        assert past.is_expired() is True
        assert future.is_expired() is False

    def test_deleting_official_cascade_deletes_tokens(self):
        MoodleRememberToken.objects.create(
            selector="sel-cascade",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.official.delete()
        assert MoodleRememberToken.objects.filter(selector="sel-cascade").count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest officials/tests/service/test_remember_me.py -v`
Expected: FAIL — `ImportError: cannot import name 'MoodleRememberToken'`.

- [ ] **Step 3: Add the model**

In `officials/models.py`, add near the other officials models (after `Official`). Add `from django.utils import timezone` to the imports if not already present:

```python
class MoodleRememberToken(models.Model):
    selector = models.CharField(max_length=64, unique=True, db_index=True)
    validator_hash = models.CharField(max_length=64)
    official = models.ForeignKey(Official, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)

    objects: QuerySet = models.Manager()

    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    def __str__(self):
        return f"MoodleRememberToken({self.selector[:8]}… -> official {self.official_id})"
```

- [ ] **Step 4: Generate the migration**

Run: `python manage.py makemigrations officials`
Expected: creates `officials/migrations/XXXX_moodlerembertoken.py` adding one model.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest officials/tests/service/test_remember_me.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add officials/models.py officials/migrations/ officials/tests/service/test_remember_me.py
git commit -m "feat(officials): add MoodleRememberToken model (#1478)"
```

---

### Task 2: `RememberMeService` (issue / restore / revoke / prune)

**Files:**
- Create: `officials/service/remember_me.py`
- Test: `officials/tests/service/test_remember_me.py` (append)

**Interfaces:**
- Consumes: `MoodleRememberToken`, `Official`.
- Produces:
  - `REMEMBER_ME_MAX_AGE: timedelta` (30 days)
  - `RestoreResult(official_id: int | None, cookie_value: str | None, matched: bool)` (dataclass)
  - `RememberMeService.issue(official_id: int) -> str` (returns `"selector:validator"`)
  - `RememberMeService.restore(cookie_value: str | None) -> RestoreResult` (rotates + slides expiry on hit; `matched=True` whenever a row for the selector existed, so the caller knows to clear a now-invalid cookie)
  - `RememberMeService.revoke(cookie_value: str | None) -> None`
  - `RememberMeService.prune_expired() -> int`

- [ ] **Step 1: Write the failing tests**

Append to `officials/tests/service/test_remember_me.py`:

```python
from officials.models import MoodleRememberToken  # already imported above
from officials.service.remember_me import RememberMeService, REMEMBER_ME_MAX_AGE


class TestRememberMeService(TestCase):
    def setUp(self):
        DbSetupOfficials().create_officials_and_team()
        self.official = Official.objects.first()

    def test_issue_persists_only_the_hash_not_the_raw_validator(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector, validator = cookie.split(":", 1)
        token = MoodleRememberToken.objects.get(selector=selector)
        assert token.official_id == self.official.pk
        assert token.validator_hash != validator
        assert validator not in token.validator_hash
        assert token.expires_at > timezone.now()

    def test_restore_returns_official_id_for_valid_cookie(self):
        cookie = RememberMeService.issue(self.official.pk)
        result = RememberMeService.restore(cookie)
        assert result.official_id == self.official.pk
        assert result.cookie_value is not None

    def test_restore_rotates_validator_and_slides_expiry(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        original = MoodleRememberToken.objects.get(selector=selector)
        original_hash = original.validator_hash

        result = RememberMeService.restore(cookie)

        rotated = MoodleRememberToken.objects.get(selector=selector)
        assert rotated.validator_hash != original_hash
        assert result.cookie_value != cookie
        assert result.cookie_value.split(":", 1)[0] == selector
        # the returned cookie must itself restore successfully
        assert RememberMeService.restore(result.cookie_value).official_id == self.official.pk

    def test_restore_misses_on_none_or_malformed(self):
        assert RememberMeService.restore(None).official_id is None
        assert RememberMeService.restore("no-colon").official_id is None
        assert RememberMeService.restore(None).matched is False

    def test_restore_misses_on_unknown_selector(self):
        result = RememberMeService.restore("unknown:whatever")
        assert result.official_id is None
        assert result.matched is False

    def test_restore_misses_on_tampered_validator(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        result = RememberMeService.restore(f"{selector}:tampered")
        assert result.official_id is None
        assert result.matched is True  # row existed → caller clears cookie

    def test_restore_deletes_and_misses_on_expired(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        MoodleRememberToken.objects.filter(selector=selector).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        result = RememberMeService.restore(cookie)
        assert result.official_id is None
        assert result.matched is True
        assert MoodleRememberToken.objects.filter(selector=selector).count() == 0

    def test_revoke_deletes_the_row(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        RememberMeService.revoke(cookie)
        assert MoodleRememberToken.objects.filter(selector=selector).count() == 0

    def test_prune_expired_removes_only_expired(self):
        live = RememberMeService.issue(self.official.pk)
        stale = RememberMeService.issue(self.official.pk)
        stale_selector = stale.split(":", 1)[0]
        MoodleRememberToken.objects.filter(selector=stale_selector).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        deleted = RememberMeService.prune_expired()
        assert deleted == 1
        assert RememberMeService.restore(live).official_id == self.official.pk
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest officials/tests/service/test_remember_me.py::TestRememberMeService -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'officials.service.remember_me'`.

- [ ] **Step 3: Implement the service**

Create `officials/service/remember_me.py`:

```python
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

from officials.models import MoodleRememberToken

REMEMBER_ME_MAX_AGE = timedelta(days=30)


def _hash(validator: str) -> str:
    return hashlib.sha256(validator.encode()).hexdigest()


@dataclass
class RestoreResult:
    official_id: int | None
    cookie_value: str | None
    matched: bool


_MISS = RestoreResult(official_id=None, cookie_value=None, matched=False)


class RememberMeService:
    @staticmethod
    def issue(official_id: int) -> str:
        selector = secrets.token_hex(16)
        validator = secrets.token_urlsafe(32)
        MoodleRememberToken.objects.create(
            selector=selector,
            validator_hash=_hash(validator),
            official_id=official_id,
            expires_at=timezone.now() + REMEMBER_ME_MAX_AGE,
        )
        return f"{selector}:{validator}"

    @staticmethod
    def restore(cookie_value: str | None) -> RestoreResult:
        if not cookie_value or ":" not in cookie_value:
            return _MISS
        selector, _, validator = cookie_value.partition(":")
        token = MoodleRememberToken.objects.filter(selector=selector).first()
        if token is None:
            return _MISS
        matched_miss = RestoreResult(official_id=None, cookie_value=None, matched=True)
        if not hmac.compare_digest(token.validator_hash, _hash(validator)):
            return matched_miss
        if token.is_expired():
            token.delete()
            return matched_miss
        # Local validity: FK CASCADE guarantees the Official still exists.
        new_validator = secrets.token_urlsafe(32)
        token.validator_hash = _hash(new_validator)
        token.expires_at = timezone.now() + REMEMBER_ME_MAX_AGE
        token.save(update_fields=["validator_hash", "expires_at"])
        return RestoreResult(
            official_id=token.official_id,
            cookie_value=f"{selector}:{new_validator}",
            matched=True,
        )

    @staticmethod
    def revoke(cookie_value: str | None) -> None:
        if not cookie_value or ":" not in cookie_value:
            return
        selector = cookie_value.split(":", 1)[0]
        MoodleRememberToken.objects.filter(selector=selector).delete()

    @staticmethod
    def prune_expired() -> int:
        deleted, _ = MoodleRememberToken.objects.filter(
            expires_at__lte=timezone.now()
        ).delete()
        return deleted
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest officials/tests/service/test_remember_me.py -v`
Expected: PASS (all model + service tests).

- [ ] **Step 5: Commit**

```bash
git add officials/service/remember_me.py officials/tests/service/test_remember_me.py
git commit -m "feat(officials): add RememberMeService issue/restore/revoke (#1478)"
```

---

### Task 3: Login form checkbox + `MoodleLoginView` mints the cookie

**Files:**
- Modify: `officials/forms.py`
- Modify: `officials/views.py`
- Test: `officials/tests/test_views.py` (append to `TestMoodleLogin`)

**Interfaces:**
- Consumes: `RememberMeService.issue`, `REMEMBER_ME_MAX_AGE`.
- Produces (module-level in `officials/views.py`, used by Tasks 4 & 5):
  - `MOODLE_REMEMBER_COOKIE = "officials_remember"`
  - `REMEMBER_COOKIE_PATH = "/officials/gameday/sign-up/"`
  - `_set_remember_cookie(response, value) -> None`
  - `_delete_remember_cookie(response) -> None`
- `MoodleLoginForm` gains `remember_me = BooleanField(required=False)`.

- [ ] **Step 1: Write the failing tests**

Append to `TestMoodleLogin` in `officials/tests/test_views.py`. Add the import `from officials.views import MOODLE_LOGGED_IN_USER, MOODLE_REMEMBER_COOKIE` (extend the existing `from officials.views import MOODLE_LOGGED_IN_USER` line):

```python
    @patch.object(MoodleService, "login")
    def test_login_with_remember_me_sets_cookie(self, moodle_login_mock: MagicMock):
        moodle_login_mock.return_value = 7
        response = self.app.get(reverse(OFFICIALS_MOODLE_LOGIN))
        response.form["username"] = "valid username"
        response.form["password"] = "secret password"
        response.form["remember_me"] = True
        response = response.form.submit()
        assert MOODLE_REMEMBER_COOKIE in response.client.cookies

    @patch.object(MoodleService, "login")
    def test_login_without_remember_me_sets_no_cookie(self, moodle_login_mock: MagicMock):
        moodle_login_mock.return_value = 7
        response = self.app.get(reverse(OFFICIALS_MOODLE_LOGIN))
        response.form["username"] = "valid username"
        response.form["password"] = "secret password"
        response = response.form.submit()
        assert MOODLE_REMEMBER_COOKIE not in response.client.cookies
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest "officials/tests/test_views.py::TestMoodleLogin" -v`
Expected: FAIL — `ImportError` on `MOODLE_REMEMBER_COOKIE` (and, once importable, the cookie assertion fails).

- [ ] **Step 3: Add the form field**

In `officials/forms.py`, add to `MoodleLoginForm`:

```python
    remember_me = forms.BooleanField(
        required=False,
        label="Angemeldet bleiben",
    )
```

- [ ] **Step 4: Add cookie constants/helpers and mint on login**

In `officials/views.py`, add near the top (after `MOODLE_LOGGED_IN_USER`):

```python
from officials.service.remember_me import RememberMeService, REMEMBER_ME_MAX_AGE

MOODLE_REMEMBER_COOKIE = "officials_remember"
REMEMBER_COOKIE_PATH = "/officials/gameday/sign-up/"


def _set_remember_cookie(response, value):
    response.set_cookie(
        MOODLE_REMEMBER_COOKIE,
        value,
        max_age=int(REMEMBER_ME_MAX_AGE.total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path=REMEMBER_COOKIE_PATH,
    )


def _delete_remember_cookie(response):
    response.delete_cookie(MOODLE_REMEMBER_COOKIE, path=REMEMBER_COOKIE_PATH)
```

Then rewrite the success branch of `MoodleLoginView.post` (currently lines ~347-356) to build the redirect, set the cookie when opted in, and return it:

```python
            if form.is_valid():
                username = form.cleaned_data["username"]
                password = form.cleaned_data["password"]
                moodle_service = MoodleService()
                official_id = moodle_service.login(username, password)
                request.session[MOODLE_LOGGED_IN_USER] = official_id

                from officials.urls import OFFICIALS_SIGN_UP_LIST

                response = redirect(reverse(OFFICIALS_SIGN_UP_LIST))
                if form.cleaned_data.get("remember_me"):
                    _set_remember_cookie(
                        response, RememberMeService.issue(official_id)
                    )
                return response
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest "officials/tests/test_views.py::TestMoodleLogin" -v`
Expected: PASS (existing 2 + new 2).

- [ ] **Step 6: Commit**

```bash
git add officials/forms.py officials/views.py officials/tests/test_views.py
git commit -m "feat(officials): mint remember-me cookie on opt-in login (#1478)"
```

---

### Task 4: `OfficialSignUpListView` auto-restore from cookie

**Files:**
- Modify: `officials/views.py` (`OfficialSignUpListView.get`)
- Test: `officials/tests/test_views.py` (`TestOfficialSignUpListView`)

**Interfaces:**
- Consumes: `RememberMeService.restore`, `MOODLE_REMEMBER_COOKIE`, `_set_remember_cookie`, `_delete_remember_cookie`, `MOODLE_LOGGED_IN_USER`.
- Produces: no new public symbols; behaviour change only.

- [ ] **Step 1: Write the failing tests**

Add to `TestOfficialSignUpListView` in `officials/tests/test_views.py`. Extend imports with `MOODLE_REMEMBER_COOKIE` (done in Task 3) and add `from officials.service.remember_me import RememberMeService`, `from officials.models import Official` (already imported), `from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials` (already imported), and `from django.test import Client`:

```python
    def test_valid_cookie_restores_session_without_redirect(self):
        DbSetupOfficials().create_officials_and_team()
        official = Official.objects.first()
        cookie = RememberMeService.issue(official.pk)
        client = Client()
        client.cookies[MOODLE_REMEMBER_COOKIE] = cookie

        response = client.get(reverse(OFFICIALS_SIGN_UP_LIST))

        assert response.status_code == HTTPStatus.OK
        assert client.session.get(MOODLE_LOGGED_IN_USER) == official.pk

    def test_valid_cookie_is_rotated_on_restore(self):
        DbSetupOfficials().create_officials_and_team()
        official = Official.objects.first()
        cookie = RememberMeService.issue(official.pk)
        client = Client()
        client.cookies[MOODLE_REMEMBER_COOKIE] = cookie

        response = client.get(reverse(OFFICIALS_SIGN_UP_LIST))

        rotated = response.cookies[MOODLE_REMEMBER_COOKIE].value
        assert rotated != cookie

    def test_expired_cookie_redirects_and_clears_cookie(self):
        DbSetupOfficials().create_officials_and_team()
        official = Official.objects.first()
        cookie = RememberMeService.issue(official.pk)
        from officials.models import MoodleRememberToken
        from django.utils import timezone
        from datetime import timedelta
        MoodleRememberToken.objects.filter(
            selector=cookie.split(":", 1)[0]
        ).update(expires_at=timezone.now() - timedelta(seconds=1))
        client = Client()
        client.cookies[MOODLE_REMEMBER_COOKIE] = cookie

        response = client.get(reverse(OFFICIALS_SIGN_UP_LIST))

        assert response.url == reverse(OFFICIALS_MOODLE_LOGIN)
        # cookie deletion is signalled by an expired/empty Set-Cookie
        assert response.cookies[MOODLE_REMEMBER_COOKIE].value == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest "officials/tests/test_views.py::TestOfficialSignUpListView" -v`
Expected: FAIL — `test_valid_cookie_*` redirect to login (302, no session) and `test_expired_cookie_*` has no `Set-Cookie` for the remember cookie.

- [ ] **Step 3: Implement auto-restore**

Replace the top of `OfficialSignUpListView.get` (currently lines ~365-373) so it attempts restore before redirecting, and defer the response so a rotated cookie can be attached:

```python
    def get(self, request, *args, **kwargs):
        from officials.urls import OFFICIALS_MOODLE_LOGIN

        official_id = request.session.get(MOODLE_LOGGED_IN_USER)
        restored_cookie = None
        if official_id is None:
            result = RememberMeService.restore(
                request.COOKIES.get(MOODLE_REMEMBER_COOKIE)
            )
            if result.official_id is not None:
                official_id = result.official_id
                request.session[MOODLE_LOGGED_IN_USER] = official_id
                restored_cookie = result.cookie_value
            else:
                response = redirect(reverse(OFFICIALS_MOODLE_LOGIN))
                if result.matched:
                    _delete_remember_cookie(response)
                return response
        if settings.DEBUG:
            request.session.set_expiry(600000)
        else:
            request.session.set_expiry(600)
```

Then, at the end of the method, replace `return render(request, self.template_name, context)` with:

```python
        response = render(request, self.template_name, context)
        if restored_cookie:
            _set_remember_cookie(response, restored_cookie)
        return response
```

(The existing `league`/`context` block in between is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest "officials/tests/test_views.py::TestOfficialSignUpListView" -v`
Expected: PASS (existing redirect test + 3 new).

- [ ] **Step 5: Commit**

```bash
git add officials/views.py officials/tests/test_views.py
git commit -m "feat(officials): auto-restore sign-up session from remember-me cookie (#1478)"
```

---

### Task 5: Logout view + route + template link

**Files:**
- Modify: `officials/views.py` (new `OfficialSignOutView`)
- Modify: `officials/urls.py`
- Modify: `officials/templates/officials/signup/sign_up_list.html`
- Test: `officials/tests/test_views.py` (new `TestOfficialSignOutView`)

**Interfaces:**
- Consumes: `RememberMeService.revoke`, `MOODLE_REMEMBER_COOKIE`, `_delete_remember_cookie`, `MOODLE_LOGGED_IN_USER`.
- Produces: `OfficialSignOutView`; url name `OFFICIALS_SIGN_OUT = "view-officials-sign-out"` at `gameday/sign-up/logout/`.

- [ ] **Step 1: Write the failing test**

Add a new class to `officials/tests/test_views.py` (add `OFFICIALS_SIGN_OUT` to the `from officials.urls import (...)` block):

```python
class TestOfficialSignOutView(TestCase):
    def test_logout_revokes_token_and_clears_cookie_and_session(self):
        DbSetupOfficials().create_officials_and_team()
        official = Official.objects.first()
        cookie = RememberMeService.issue(official.pk)
        from officials.models import MoodleRememberToken
        selector = cookie.split(":", 1)[0]
        client = Client()
        session = client.session
        session[MOODLE_LOGGED_IN_USER] = official.pk
        session.save()
        client.cookies[MOODLE_REMEMBER_COOKIE] = cookie

        response = client.get(reverse(OFFICIALS_SIGN_OUT))

        assert response.url == reverse(OFFICIALS_MOODLE_LOGIN)
        assert MoodleRememberToken.objects.filter(selector=selector).count() == 0
        assert client.session.get(MOODLE_LOGGED_IN_USER) is None
        assert response.cookies[MOODLE_REMEMBER_COOKIE].value == ""
```

Add these imports at the top of `officials/tests/test_views.py` if not already present: `from officials.service.remember_me import RememberMeService`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest "officials/tests/test_views.py::TestOfficialSignOutView" -v`
Expected: FAIL — `ImportError` on `OFFICIALS_SIGN_OUT`.

- [ ] **Step 3: Add the view**

In `officials/views.py`, add:

```python
class OfficialSignOutView(View):
    def get(self, request, *args, **kwargs):
        RememberMeService.revoke(request.COOKIES.get(MOODLE_REMEMBER_COOKIE))
        request.session.pop(MOODLE_LOGGED_IN_USER, None)
        messages.success(request, "Du wurdest abgemeldet.")

        from officials.urls import OFFICIALS_MOODLE_LOGIN

        response = redirect(reverse(OFFICIALS_MOODLE_LOGIN))
        _delete_remember_cookie(response)
        return response
```

- [ ] **Step 4: Add the route**

In `officials/urls.py`, add the name constant near the others:

```python
OFFICIALS_SIGN_OUT = "view-officials-sign-out"
```

Add `OfficialSignOutView` to the `from officials.views import (...)` block, and add the path (before the closing `]`):

```python
    path(
        "gameday/sign-up/logout/",
        OfficialSignOutView.as_view(),
        name=OFFICIALS_SIGN_OUT,
    ),
```

- [ ] **Step 5: Add the logout link to the template**

In `officials/templates/officials/signup/sign_up_list.html`, add a logout link (adapt placement to the existing markup — put it near the page heading/actions):

```html
<a class="btn btn-outline-secondary btn-sm" href="{% url 'view-officials-sign-out' %}">
    Abmelden
</a>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest "officials/tests/test_views.py::TestOfficialSignOutView" -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add officials/views.py officials/urls.py officials/templates/officials/signup/sign_up_list.html officials/tests/test_views.py
git commit -m "feat(officials): add remember-me logout view and link (#1478)"
```

---

### Task 6: Full-suite regression check for the officials app

**Files:** none (verification only).

- [ ] **Step 1: Run the officials test module**

Run: `pytest officials/tests/test_views.py officials/tests/service/test_remember_me.py -v`
Expected: PASS, no regressions in existing `TestMoodleLogin` / `TestOfficialSignUpListView` / `TestOfficialSignUpView`.

- [ ] **Step 2: Run the broader officials suite**

Run: `pytest officials -v`
Expected: PASS. (If a query-count assertion elsewhere flakes under xdist, re-run without `-n`; do not "fix" it here — see Global Constraints.)

- [ ] **Step 3: Confirm migration is present and applies**

Run: `python manage.py migrate officials`
Expected: applies the `MoodleRememberToken` migration cleanly.

---

## Self-Review

**Spec coverage:**
- Data model `MoodleRememberToken` (selector, hashed validator, official, created_at, expires_at) → Task 1. ✅
- Login checkbox "Angemeldet bleiben", default off → Task 3. ✅
- Mint hashed token + hardened cookie on successful auth + opt-in → Task 3 + service in Task 2. ✅
- Auto-login on return, rotate token, no password/Moodle call → Task 4 + `restore` in Task 2. ✅
- Expired/unknown/tampered tokens ignored + cookie cleared → Task 2 (`restore`) + Task 4 (view clears). ✅
- Explicit logout deletes token → Task 5. ✅
- 30-day sliding expiry, sha256 hash, constant-time compare, cookie attributes → Task 2 + Global Constraints + Task 3 helper. ✅
- Local DB validity check (official exists) → provided by FK `CASCADE` (Task 1) + verified in Task 1 test. ✅
- License/eligibility unchanged → no task touches `OfficialSignupService`. ✅
- Admin token never used for auth → no task touches `MOODLE_WSTOKEN`. ✅
- `prune_expired` housekeeping → Task 2.

**Placeholder scan:** No TBD/TODO; every code step shows real code and exact commands. ✅

**Type consistency:** `RememberMeService.issue/restore/revoke/prune_expired`, `RestoreResult(official_id, cookie_value, matched)`, `MOODLE_REMEMBER_COOKIE`, `REMEMBER_COOKIE_PATH`, `_set_remember_cookie`/`_delete_remember_cookie`, `REMEMBER_ME_MAX_AGE` are used consistently across Tasks 2–5. ✅

**Note:** The spec's *optional* current-license re-check on restore is intentionally omitted (YAGNI): FK `CASCADE` already removes tokens for deleted officials, and license eligibility is still enforced by `OfficialSignupService` at sign-up time.
