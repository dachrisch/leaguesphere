# Passcheck v2 Field App Implementation Plan

> **For the agent:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Ship a field-ready passcheck UI (`/field/`) that a referee can run one-handed on a phone — one tap per player, big pass photo, jersey numbers from the roster, and an offline outbox that survives a dead network — **while the old passcheck keeps running unchanged alongside it**.

**Architecture:** A new Django app `field` serving one Vite/React app (the shell that the scorecard joins in M2). It reads and writes the existing `/api/passcheck/` endpoints; the passcheck UI itself moves out of `passcheck/src`. The old `/passcheck/` routes stay untouched and reachable, so a gameday can be switched back without a deployment. Backend work hardens what the old UI trusted the client for: roster validation, idempotent writes, one writing device, and permission-checked photos.

**Tech Stack:** Django 5 + DRF + Knox, MySQL, React 18 + TypeScript + Vite, Vitest + Testing Library, IndexedDB outbox, service worker.

**Design source:** interactive mock `https://app.docstash.ai/fqayek` (private DocStash doc, `Passcheck v2 · Feld-Mock`) — every screen in this plan matches it. Roadmap context: Flagline §04 (module `passcheck`, slices M1–M3).

**Out of scope for this plan:** the scorecard in the same shell (M2), push (M4), Leitstand board (M4), fan pages (M5), native apps, photo *upload* UI (admin + management command here; teammanager slice in M1.5), captain records in the match report (M3).

---

## Pre-flight audit (2026-10-26)

Verified against commit `c8e19c3f` on branch `feat/passcheck-v2-field-app`.
**Where this section conflicts with a task below, this section wins.**

### Baseline results (Task 0)

| Check | Result |
|---|---|
| `pytest passcheck` (documented command, MySQL) | **Blocked here**: no MySQL on `127.0.0.1:3306`, and `pytest.ini` points at `league_manager.settings.dev` (MySQL). |
| `pytest passcheck --ds=test_settings` (SQLite) | **32 passed** in this worktree, using the repo's existing `.venv` at `/root/dev/dachrisch/leaguesphere/.venv` (after `uv pip install django-webtest==1.9.14` into it). |
| `uv sync --extra test` in a fresh worktree | **Fails on this host**: musl platform, `playwright==1.62.0` has no musllinux wheel. Use the shared `.venv` above, or install the test deps without Playwright. |
| `npm --prefix passcheck run test:run` | **14 files / 110 passed, 1 skipped** |
| `npm --prefix passcheck run eslint` | **0 errors** |
| `python scripts/check_scope_coverage.py` | **OK** (1799 tracked files, 78 job rules) |

Toolchain notes: Node 24.18.1 / npm 11.12.1, Python 3.14.8. The worktree uses a symlink
`passcheck/node_modules → /root/dev/dachrisch/leaguesphere/passcheck/node_modules`; `field/node_modules`
must be installed from its own lockfile.

### Corrections that change tasks

1. **Test files and style (Tasks 1, 2, 8).** There is no `passcheck/tests/test_api.py` or `test_service.py`, and no `auth_client` / `gameday` / `roster_entry` pytest fixtures. The real files are `passcheck/tests/api/test_views.py` and `passcheck/tests/service/test_passcheck_service.py`; they use `django.test.TestCase` + `DbSetup*` factories and DRF `APIClient`. Write new tests in that style (new modules are fine, e.g. `passcheck/tests/api/test_roster_write.py`).
2. **Validation belongs in the service, not the view (Tasks 1–2).** Add `validate_roster()` and call it at the top of `create_roster_and_passcheck_verification()` inside the transaction; only the `RosterValidationError → 400` mapping happens in the view. Task 1's view-only wiring would be undone by Task 2 anyway.
3. **`validate_roster()` must tolerate a missing `EligibilityRule`.** Existing service tests create gamedays with no rule; an unconditional `EligibilityRule.objects.get(...)` breaks 5 existing tests with `DoesNotExist`. Use `.filter(league=...).first()` and skip the strength checks when no rule is configured (the GET endpoint already 404s in that case).
4. **Photo URL, id and permission (Task 3).**
   - The API is mounted at `/api/passcheck/`, so the route is `/api/passcheck/photos/...`, not `/api/photos/...`.
   - The roster's `id` is `Playerlist.pk` (`RosterSerializer`), **not** `Player.pk`. Take `playerlist_id` and `gameday_id` in the path: `/api/passcheck/photos/<int:playerlist_id>/gameday/<int:gameday_id>`.
   - Permission cannot depend on a `PlayerlistGameday` row: the field app shows photos *before* the first save, so that row does not exist yet. Rule: staff, or `user.username` is `Gameinfo.officials` for that gameday **and** the playerlist belongs to a team playing that gameday (home/away) or to one of that team's `TeamRelationship.additional_teams`.
   - **Photos must not live under `MEDIA_ROOT`.** `container/nginx.conf` serves `/media/` directly (no auth, `expires 7d`), so `upload_to="passcheck/photos"` would leak consent-protected photos and defeat P4. Use a private root (`PASS_PHOTO_ROOT`, e.g. `FileSystemStorage(location=...)`) outside `MEDIA_URL`.
   - Return the stored MIME type (Pillow/Python `mimetypes`), not a hardcoded `image/jpeg`.
5. **An `<img src>` cannot send the Knox token (Task 7).** Photos are authenticated with `Authorization: Token …` from `localStorage`; a plain `<img src={photoUrl(id)}>` request is unauthenticated and gets 401. Fetch the photo with axios as a blob (`responseType: "blob"`) and render `URL.createObjectURL(blob)` (revoke on unmount), or introduce a short-lived signed URL.
6. **Deployment wiring is missing (Task 4).** `/field/` would ship without JS in staging/production unless:
   - `container/nginx.Dockerfile` gets a `field` node-builder stage + `COPY --from=... /field-app/static /static`;
   - `container/start_dev_server.sh` adds `field` to both hardcoded app lists;
   - `.gitignore` ignores `field/static/field/js/*.js` / `*.css` (Vite output is not committed, same as the other apps);
   - `release-please-config.json` (extra-files) and `scripts/check_version_sequence.py` (`VERSION_FILES`) learn about `field/package.json`, with a version matching the root;
   - `field/package-lock.json` is committed (`npm ci` / `node/install-packages`).
7. **CI shard (Task 4).** `run-python-core` only runs `league_manager/tests/ share/tests/ home/tests/ dbaccess/tests/`. Mapping `field/.*\.py` to it would run **none** of `field/tests/`. Map field Python to `run-python-designer` and add `field/tests/` to that shard's `paths` (it already runs passcheck). Drop the `field/migrations/.* → run-migrations` rule unless field actually gains a `migrations/` directory.
8. **Service worker (Task 9).** Do not precache `/api/passcheck/games`: it is a per-user, Knox-authenticated response, and a cached copy survives logout and goes stale across devices. Cache only the shell; keep the roster snapshot in IndexedDB keyed by gameday (and drop it on logout).
9. **Docs/help paths (Task 10).** Plan convention is `docs/topics/planning/current/`, not `docs/plans/`. Feature docs are flat files next to `passcheck-roster-privacy.md` (e.g. `docs/topics/features/passcheck-field-app.md`) unless a full feature folder is created. The help topic needs all of: `league_manager/help/registry.py`, `league_manager/help/content/<slug>.de.md`, a screenshot in `league_manager/static/help/img/`, and a line in `templates/llms-full.txt` (`test_help.py` enforces all four).
10. **Stack facts.** The repo runs **Django 6.0.8**, **React 19.2**, **TypeScript 6** — not Django 5 / React 18.
11. **Task 2 snippet bug.** `all_relevant_team_ids` is used before it is defined in the proposed function body; keep the existing computation at the top.
12. **Sibling plan overlap.** `docs/topics/planning/current/2026-10-26-scorecard-v2.md` proposes a separate `scorecard_v2` app/shell at `/scorecard/v2/`, while this plan calls `field/` "the shell the scorecard joins in M2". Decide which is true before M2; it does not block M1, but the roadmap text should not promise both.

### Resolved pre-flight decisions (2026-10-26)

| # | Decision | Resolution |
|---|---|---|
| O1 | Photo contract | `GET /api/passcheck/photos/<playerlist_id>/gameday/<gameday_id>`; private storage outside `MEDIA_ROOT`; the client fetches blobs with the Knox token (see corrections 4–5). |
| O2 | Plan location | Moved to `docs/topics/planning/current/2026-10-26-passcheck-v2-field-app.md`; README link fixed. |
| O3 | Hardening | Roster `PUT` gets a permission check (staff, or the officials team of a game on that gameday, today only) plus unique constraints with dedupe migrations. |
| O4 | Device recovery | Staff-only `manage.py reset_passcheck_device` (management command). |

### Backend batch status

| Task | Status | Commit |
|---|---|---|
| 1 Roster validation + `PUT` permission | done | `38609ec1` |
| 2 Atomic/idempotent write + device lock + constraints + reset | done | `416f3817` |
| 3 Private photos + permission-checked endpoint + import | done | `a3a0a562` |

Deviations from the task text below (the task text is kept for history):

- Tests live in `passcheck/tests/api/test_roster_write.py`,
  `passcheck/tests/service/test_verification_write.py`,
  `passcheck/tests/api/test_photos.py` and
  `passcheck/tests/test_import_pass_photos.py` (repo `TestCase` + factories, no
  pytest fixtures).
- `validate_roster()` lives in `PasscheckServicePlayers` and runs inside
  `create_roster_and_passcheck_verification()`; the view only maps errors.
  A missing `EligibilityRule` skips the strength checks (legacy gamedays/tests).
- `all_relevant_team_ids()` now follows `TeamRelationship.team → additional_teams`
  (the old code read the reverse accessor, so an extra team's rows were never
  deleted/validated under the main team).
- Photo route is
  `GET /api/passcheck/photos/<playerlist_id>/gameday/<gameday_id>`; storage is
  `PASS_PHOTO_ROOT` (outside `MEDIA_ROOT`, mounted as its own `pass-photos`
  volume); the response uses the stored MIME type, `no-store` and `nosniff`.
- `client_id` must be a UUID; an invalid one is a `400` (`errors.client_id`).
  `device_id` is trimmed/truncated to 64 chars.
- The unique constraints ship with dedupe migrations (keep newest row per key).

---

## Decisions locked before Task 1

| # | Decision | Rationale |
|---|---|---|
| P1 | **Kader = season `Playerlist` + server-side binding.** No pre-confirmed gameday squad in this plan. | `PlayerlistGameday` is written *by* the passcheck today (`passcheck_service.py:381`), so it cannot be the source of truth for the roster. A pre-confirmed squad is a teammanager feature needed by the scorecard in M2 — not a blocker for a correct passcheck. |
| P2 | **The server validates the roster it receives** (membership, eligibility date, jersey 0–99, unique per team and gameday, min/max strength) and rejects with `400` + field errors. | Today `PUT /api/passcheck/roster/…` accepts whatever the client sends (`api/views.py:78`). Free-text jerseys are safe only if the server says no. |
| P3 | **One writing device per team and gameday, for v2 clients**, enforced server-side via `device_id`; only a request that declares a *different* device gets `409`. | Roadmap D1. Without it a stale phone can overwrite a finished check; without the client check the old app would be locked out (see below). |
| P4 | **A photo is served only if `photo_consent_at` is set** and the requester is an official of that gameday. | Roadmap D2. No consent, no bytes — not "served but hidden in the UI". |
| P5 | **No feature switch.** `/field/` is opt-in by URL until M3, `/passcheck/` stays default. | Rollback per gameday without deployment, as promised in the roadmap. |
| P6 | **Only the officiating team may write a roster.** `PUT /api/passcheck/roster/…` accepts staff, or a user whose team is `Gameinfo.officials` for a game on that gameday involving the target team, on that gameday's date. | Today any authenticated user can write any team (`views.py:91`). Parallel operation does not require that hole. |
| P7 | **Uniqueness is enforced in the database**: one verification per `(team, gameday)` and one gameday roster row per `(playerlist, gameday)`. Migrations dedupe existing rows first. | `update_or_create` on an unconstrained table can produce duplicates under a race; the API then starts raising `MultipleObjectsReturned`. |
| P8 | **Pass photos live outside `MEDIA_ROOT`** and are served only by the permission-checked endpoint. | nginx serves `/media/` unauthenticated with `expires 7d`; `MEDIA_ROOT` storage would leak consent-protected photos. |

---

## Parallel operation (non-negotiable)

The old app keeps running and keeps working while v2 is in the field. That constrains the build more than any screen does:

1. **One dataset, two UIs.** Both write `PlayerlistGameday` + `PasscheckVerification`. v2 adds no state that v1 cannot read: a team checked in v1 opens in v2 as checked, and the reverse.
2. **`/api/passcheck/` stays backward compatible.** New request fields are optional; a request without `client_id`/`device_id` is a legacy write and is accepted (atomic, last write wins). The `GET` responses gain no field a client must understand and lose none.
3. **Device binding applies to v2 clients only** (P3). `409` is raised only when the incoming request declares a `device_id` different from the stored one. The old app cannot declare one, so it is never locked out — the unbound writer is the accepted risk of running both, and the field test still uses one device per team.
4. **`/passcheck/` stays the default entry.** v2 is opt-in by link (`/field/`); the old app gains an additive "Feld-Ansicht" link, nothing is rewritten in place, no route changes.
5. **The v2 service worker never controls the old app.** It is served from `/field/sw.js` (Django view, `Service-Worker-Allowed: /field/`), scoped to `/field/`, and precaches only field assets. `/passcheck/` must have **no** service worker controller — a cached shell there would be a silent regression on a UI we promised not to touch.
6. **Both bundles are built and tested in CI.** `passcheck_js` stays as-is; `field_js` is added. A v2 change may not turn the old app's build red.

---

### Task 0: Baseline verification

**Files:** none (verification only).

**Step 1: Confirm the worktree is clean**

Run: `git status -sb`
Expected: no modified files, no untracked files outside `docs/`.

**Step 2: Backend baseline for the touched shard**

Run: `pytest passcheck -q` (needs the LXC test DB, see `passcheck/CLAUDE.md`)
Expected: PASS. If the DB is unavailable, record the blocker and start with the frontend tasks (5–8).

**Step 3: Frontend baseline**

Run: `npm --prefix passcheck run test:run && npm --prefix passcheck run eslint`
Expected: tests PASS, ESLint **zero** errors (CI blocks merge).

**Step 4: Scope-coverage baseline**

Run: `python scripts/check_scope_coverage.py`
Expected: PASS. Every new `field/` path must be added to `.circleci/scope-mapping.txt` in Task 4 or this check fails.

---

### Task 1: Server-side roster binding (backend, TDD)

**Files:**
- Modify: `passcheck/service/passcheck_service.py` (`PasscheckServicePlayers`: add `validate_roster()`, raise `RosterValidationError`)
- Modify: `passcheck/api/views.py:91-98` (`PasscheckRosterAPIView.put`: catch `RosterValidationError` → `400` with `{"errors": {...}}`)
- Test: `passcheck/tests/test_api.py` (new class `TestRosterWriteValidation`)

**Step 1: Write the failing tests**

```python
@pytest.mark.django_db
class TestRosterWriteValidation:
    def test_rejects_player_outside_the_team_roster(self, auth_client, gameday, other_player):
        resp = auth_client.put(
            f"/api/passcheck/roster/{team.pk}/gameday/{gameday.pk}",
            {"official_name": "M. Weber", "roster": [{"id": other_player.pk, "jersey_number": 7}]},
            format="json",
        )
        assert resp.status_code == 400
        assert str(other_player.pk) in resp.json()["errors"]

    def test_rejects_duplicate_jersey_numbers(self, auth_client, gameday, roster_entry):
        payload = [{"id": roster_entry.pk, "jersey_number": 12}] * 2
        resp = auth_client.put(url, {"official_name": "M. Weber", "roster": payload}, format="json")
        assert resp.status_code == 400
        assert "bereits vergeben" in resp.json()["errors"]

    def test_rejects_jersey_out_of_range(self, auth_client, gameday, roster_entry):
        resp = auth_client.put(url, {"official_name": "M. Weber", "roster": [{"id": roster_entry.pk, "jersey_number": 100}]}, format="json")
        assert resp.status_code == 400

    def test_rejects_below_minimum_player_strength(self, auth_client, gameday, roster_entry):
        resp = auth_client.put(url, {"official_name": "M. Weber", "roster": []}, format="json")
        assert resp.status_code == 400
        assert "Mindestspielstärke" in resp.json()["errors"]["team"]

    def test_rejects_player_joined_after_gameday(self, auth_client, gameday, late_entry):
        resp = auth_client.put(url, {"official_name": "M. Weber", "roster": [{"id": late_entry.pk, "jersey_number": 9}]}, format="json")
        assert resp.status_code == 400

    def test_accepts_a_legacy_payload_without_client_id(self, auth_client, gameday, eleven_entries):
        # byte-for-byte what RosterOverview.onSubmitRoster() sends today:
        # no client_id, no device_id, official_name + note + roster
        resp = auth_client.put(url, {"official_name": "M. Weber", "note": None, "roster": eleven_entries}, format="json")
        assert resp.status_code == 200
```

**Step 2: Run to verify they fail**

Run: `pytest passcheck/tests/test_api.py::TestRosterWriteValidation -q`
Expected: FAIL — today the endpoint returns `200` for all of them.

**Step 3: Implement `validate_roster()`**

```python
class RosterValidationError(Exception):
    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__("invalid roster")


# in PasscheckServicePlayers
def validate_roster(self, team_id, gameday, roster) -> dict:
    errors = {}
    team_ids = list(
        Team.objects.get(pk=team_id).relationship_additional_teams.values_list("team__id", flat=True)
    ) + [team_id]
    allowed = {
        p.pk: p
        for p in Playerlist.objects.filter(team_id__in=team_ids)
        .filter(joined_on__lte=gameday.date)
        .filter(Q(left_on__isnull=True) | Q(left_on__gt=gameday.date))
    }
    seen = {}
    for entry in roster:
        pid = entry.get("id")
        if pid not in allowed:
            errors[str(pid)] = "Nicht im Kader dieses Spieltags."
            continue
        jersey = entry.get("jersey_number")
        if not isinstance(jersey, int) or not 0 <= jersey <= 99:
            errors[str(pid)] = "Trikotnummer muss zwischen 0 und 99 liegen."
            continue
        if jersey in seen:
            errors[str(pid)] = f"Trikotnummer #{jersey} ist bereits vergeben."
            continue
        seen[jersey] = pid
    rule = EligibilityRule.objects.get(league=gameday.league)
    if rule.minimum_player_strength and len(seen) < rule.minimum_player_strength:
        errors["team"] = (
            f"Mindestspielstärke {rule.minimum_player_strength} nicht erreicht "
            f"({len(seen)} geprüft)."
        )
    if rule.maximum_player_strength and len(seen) > rule.maximum_player_strength:
        errors["team"] = f"Maximalspielstärke {rule.maximum_player_strength} überschritten."
    return errors
```

Wire it into the view so a bad payload never reaches `_create_roster()` (which deletes first — see Task 2).

**Step 4: Run to verify they pass**

Run: `pytest passcheck/tests/test_api.py::TestRosterWriteValidation -q`
Expected: PASS.

**Step 5: Commit**

```bash
git add passcheck/service/passcheck_service.py passcheck/api/views.py passcheck/tests/test_api.py
git commit -m "feat(passcheck): validate submitted roster on write"
```

---

### Task 2: Idempotent, transactional write with device binding (backend, TDD)

**Files:**
- Modify: `passcheck/models.py` (`PasscheckVerification`: `client_id`, `device_id`)
- Create: `passcheck/migrations/00xx_passcheckverification_client_id.py` (`python manage.py makemigrations passcheck`)
- Modify: `passcheck/service/passcheck_service.py:381` (atomic, retry-safe, `409` on a different v2 device)
- Test: `passcheck/tests/test_service.py` (`TestIdempotentVerification`)

**Step 1: Write the failing tests**

```python
def test_same_client_id_twice_creates_one_verification(...):
    svc.create_roster_and_passcheck_verification(team.pk, gameday.pk, user, payload(cid="3f6c..."))
    svc.create_roster_and_passcheck_verification(team.pk, gameday.pk, user, payload(cid="3f6c..."))
    assert PasscheckVerification.objects.filter(gameday=gameday).count() == 1

def test_second_v2_device_is_rejected(...):
    svc.create_roster_and_passcheck_verification(..., payload(cid="a", device="A"))
    with pytest.raises(DeviceConflictError):
        svc.create_roster_and_passcheck_verification(..., payload(cid="b", device="B"))

def test_rejected_payload_keeps_the_previous_roster(...):
    # a failing PUT must not delete the existing PlayerlistGameday rows
    svc.create_roster_and_passcheck_verification(..., good_payload)
    with pytest.raises(RosterValidationError):
        svc.create_roster_and_passcheck_verification(..., payload_with_bad_jersey)
    assert PlayerlistGameday.objects.filter(gameday=gameday, playerlist__team=team).count() == len(good_payload)

def test_legacy_write_without_device_or_client_id_still_works(...):
    # the old app sends neither id — it must never be rejected for that
    svc.create_roster_and_passcheck_verification(team.pk, gameday.pk, user, legacy_payload())
    assert PasscheckVerification.objects.filter(gameday=gameday, team=team).exists()

def test_legacy_write_after_a_v2_write_is_accepted(...):
    # unbound writer overwrites, it is not blocked (accepted risk of parallel operation)
    svc.create_roster_and_passcheck_verification(..., payload(cid="a", device="A"))
    svc.create_roster_and_passcheck_verification(..., legacy_payload())
    assert PasscheckVerification.objects.get(gameday=gameday, team=team).device_id == ""
```

**Step 2: Run to verify they fail**

Run: `pytest passcheck/tests/test_service.py -q`
Expected: FAIL — no `client_id` field, no atomicity, and `_create_roster` deletes before validating.

**Step 3: Implement**

```python
# passcheck/models.py — both fields optional, so a v1 write keeps working
client_id = models.UUIDField(null=True, blank=True, unique=True)
device_id = models.CharField(max_length=64, blank=True, default="")


# passcheck/service/passcheck_service.py
@transaction.atomic
def create_roster_and_passcheck_verification(self, team_id, gameday_id, user, data):
    gameday = Gameday.objects.select_for_update().get(pk=gameday_id)
    errors = self.validate_roster(team_id, gameday, data["roster"])  # Task 1
    if errors:
        raise RosterValidationError(errors)

    existing = PasscheckVerification.objects.filter(team_id=team_id, gameday=gameday).first()
    client_id = data.get("client_id")
    device_id = (data.get("device_id") or "").strip()
    if existing and client_id and str(existing.client_id) == str(client_id):
        return existing                       # retry of the same write — no-op
    if existing and device_id and existing.device_id and existing.device_id != device_id:
        raise DeviceConflictError(device_id)  # D1, v2 clients only

    PlayerlistGameday.objects.filter(
        playerlist__team__in=all_relevant_team_ids, gameday=gameday
    ).delete()
    self._create_roster(gameday_id, data["roster"])
    return self._create_passcheck_verification(
        gameday_id, team_id, user, data.get("official_name"), data.get("note"),
        client_id=client_id, device_id=device_id,
    )
```

Order matters: validate → idempotency/device → delete → write, all inside the transaction. A request without `device_id` is a legacy write: it never triggers `409` and stores `device_id=""`.

**Step 4: Run**

Run: `pytest passcheck -q`
Expected: PASS (including the existing service tests).

**Step 5: Commit**

```bash
git commit -am "feat(passcheck): make the verification write atomic and idempotent"
```

---

### Task 3: Pass photo model and permission-checked endpoint (backend, TDD)

**Files:**
- Modify: `gamedays/models.py:419` (`Person`: `photo`, `photo_updated_at`, `photo_consent_at`)
- Create: `gamedays/migrations/00xx_person_photo.py`
- Create: `passcheck/api/photo_views.py`, wire in `passcheck/api/urls.py` as `photos/<int:player_id>`
- Test: `passcheck/tests/test_photos.py`
- Create: `passcheck/management/commands/import_pass_photos.py` (bulk import by pass number for the field test)

**Step 1: Write the failing tests**

```python
def test_photo_requires_consent(api_client, player_without_consent):
    assert api_client.get(f"/api/photos/{player_without_consent.pk}").status_code == 404

def test_photo_is_forbidden_for_another_officials_team(client_with_token_of_other_team, player):
    assert client.get(f"/api/photos/{player.pk}").status_code == 403

def test_photo_response_is_not_cacheable(client_of_gameday_official, player):
    resp = client.get(f"/api/photos/{player.pk}")
    assert resp.status_code == 200
    assert resp["Cache-Control"] == "no-store"
    assert resp["X-Content-Type-Options"] == "nosniff"
```

**Step 2: Run to verify they fail**

Run: `pytest passcheck/tests/test_photos.py -q`
Expected: FAIL — route does not exist (`404` from the URL resolver, not from the view).

**Step 3: Implement**

```python
photo = models.ImageField("Passfoto", upload_to="passcheck/photos", blank=True, null=True)
photo_updated_at = models.DateTimeField(null=True, blank=True)
photo_consent_at = models.DateTimeField(null=True, blank=True)


class PassPhotoAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, player_id):
        player = get_object_or_404(Player.objects.select_related("person"), pk=player_id)
        person = player.person
        if not person.photo or not person.photo_consent_at:
            raise NotFound("Kein Passfoto hinterlegt.")
        if not request.user.is_staff and not self._is_official_for_player(request.user, player):
            raise PermissionDenied("Foto nur für Offizielle des Spieltags.")
        response = FileResponse(person.photo.open("rb"), content_type="image/jpeg")
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
```

`_is_official_for_player()`: the user's team (`request.user.username`, as today) is `Gameinfo.officials` on a gameday where the player has a `PlayerlistGameday` row. Reuse the lookup from `PasscheckService.get_officiating_games()` rather than writing a second query.

**Step 4: Run**

Run: `pytest passcheck/tests/test_photos.py -q`
Expected: PASS.

**Step 5: Commit**

```bash
git add gamedays passcheck
git commit -m "feat(passcheck): serve pass photos to gameday officials only"
```

---

### Task 4: `field` app + Vite scaffold + CI wiring

**Files:**
- Create: `field/__init__.py`, `field/apps.py`, `field/views.py` (`TemplateView`), `field/urls.py`, `field/templates/field/index.html`
- Create: `field/package.json`, `field/vite.config.mts`, `field/tsconfig.json`, `field/eslint.config.mjs`, `field/vitest.config.mts`, `field/src/main.tsx`, `field/src/App.tsx`
- Modify: `league_manager/settings/base.py` (`INSTALLED_APPS += ["field"]`), `league_manager/urls.py:170` (add `path("field/", include("field.urls"))`)
- Modify: `passcheck/menu.py:34` (additive menu item „Feld-Ansicht“ → `/field/`, old item stays)
- Modify: `.circleci/config.yml` (parameter `run-field`), `.circleci/continue.yml` (job `field_js` mirroring `passcheck_js:332`, workflow entry), `.circleci/scope-mapping.txt`
- Test: `field/src/__tests__/app.test.tsx` (renders the shell headline)

**Step 1: Copy the passcheck build shape**

`field/vite.config.mts` copies `passcheck/vite.config.mts` (IIFE, `outDir: 'static/field/js'`, entry `field.js`, dev port 3004, `/api` proxy) — the IIFE detail is load-bearing: the Django template loads a classic `<script>`, and `import.meta` in an ES bundle breaks the mount.

**Step 2: Add the CI wiring**

`.circleci/scope-mapping.txt`:

```
# --- field (v2 field app, passcheck first) ---
field/.* run-field true
field/.* run-build-frontend true
field/.*\.py run-python-core true
field/.*\.py run-build-backend true
field/migrations/.* run-migrations true
```

Add `run-field` to the `\.circleci/.*` "validate everything" block and to the parameters in `config.yml`; add job `field_js` (node 24.17, `npm --prefix field/ run test:run / typecheck / eslint:junit / build`) and the workflow entry `- field_js: filters: "(pipeline.parameters.run-field == true)"`. **`passcheck_js` stays untouched** — both frontends must be green.

**Step 3: Verify the scope net**

Run: `python scripts/check_scope_coverage.py`
Expected: PASS — no untracked path without a rule.

**Step 4: Verify the build and the empty page**

Run: `npm --prefix field install && npm --prefix field run build`
Expected: `field/static/field/js/field.js` exists.
Run: `python manage.py runserver`, open `http://127.0.0.1:8000/field/`
Expected: shell renders, console clean.

**Step 5: Commit**

```bash
git add field .circleci league_manager
git commit -m "feat(field): scaffold the v2 field app"
```

---

### Task 5: API client and games screen

**Files:**
- Create: `field/src/api/client.ts` (axios, Knox token from `localStorage.token`, `401` → redirect to the login URL), `field/src/api/passcheck.ts` (`fetchGames`, `fetchRoster`, `saveRoster`)
- Create: `field/src/screens/GamesScreen.tsx`, `field/src/components/GameCard.tsx`
- Test: `field/src/screens/__tests__/GamesScreen.test.tsx` (status per team: `offen`, `x/y`, `geprüft`; tap calls `onOpen`)

**Step 1: Failing test** — render with two games (one verified, one open), assert `geprüft` and `offen` chips and that a team row fires `onOpen(gameId, teamId)`.

**Step 2: Run** — `npm --prefix field run test:run` → FAIL (module missing).

**Step 3: Implement** — token handling copies `passcheck/src/utils/api.ts:55-73`; no new auth flow. The screen reads `GET /api/passcheck/games` (today's gameday) and derives the per-team state from `isChecked`; no client-side invention of state.

**Step 4: Run** → PASS.

**Step 5: Commit** — `feat(field): games screen`.

---

### Task 6: Roster screen — one tap, undo, timer

**Files:**
- Create: `field/src/screens/RosterScreen.tsx`, `field/src/hooks/useSessionTimer.ts`, `field/src/components/PlayerRow.tsx`, `field/src/components/UndoBar.tsx`
- Test: `field/src/screens/__tests__/RosterScreen.test.tsx` (tap checks; undo within 5 s restores; `Ø s/Spieler` updates; blocked player opens the record instead of checking)

**Step 1: Failing test**

```tsx
it('checks a player with one tap and undoes it', async () => {
  render(<RosterScreen ... />);
  await user.click(screen.getByRole('button', { name: /Jonas Brenner/ }));
  expect(screen.getByText(/1 von 14/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Rückgängig/ }));
  expect(screen.getByText(/0 von 14/)).toBeInTheDocument();
});
```

**Step 2: Run** → FAIL.

**Step 3: Implement** — the state machine is the mock's: `checks`, `undo {playerId, expiresAt}`, `durations[]`; the row is a `div[role=button]` with a nested photo button and a nested jersey chip (three targets, no nested `<button>`); warn/block players open the record sheet instead of toggling.

**Step 4: Run** → PASS, plus `typecheck` and `eslint`.

**Step 5: Commit** — `feat(field): roster screen with one-tap check and undo`.

---

### Task 7: Player record — photo, rules, jersey picker

**Files:**
- Create: `field/src/sheets/PlayerSheet.tsx`, `field/src/components/PhotoViewer.tsx`
- Modify: `field/src/api/passcheck.ts` (`photoUrl(playerId)`)
- Test: `field/src/sheets/__tests__/PlayerSheet.test.tsx` (blocked → no confirm button; warn → confirm allowed; jersey stepper skips numbers already checked; photo viewer hidden until tapped)

**Step 1–2:** failing test → FAIL.

**Step 3: Implement** — number state per player (`Record<playerId, number>`), stepper skips numbers of checked teammates, photo `<img src={photoUrl(id)}>` with `referrerPolicy="no-referrer"`; the viewer states `Cache-Control: no-store` in its caption, matching what the endpoint actually sends.

**Step 4:** PASS.

**Step 5: Commit** — `feat(field): player record with photo and jersey picker`.

---

### Task 8: Verification sheet, save, `409` surfacing

**Files:**
- Create: `field/src/sheets/VerificationSheet.tsx`, `field/src/sheets/DoneSheet.tsx`
- Test: `field/src/sheets/__tests__/VerificationSheet.test.tsx` (min strength blocks save; empty official blocks save; server `400` shows per-player errors; `409` explains the second device)

**Step 1–2:** failing test → FAIL.

**Step 3: Implement** — save sends `{official_name, note, roster, client_id, device_id}`; `client_id` is `crypto.randomUUID()` per save attempt (reused on retry, regenerated on a new save); `400` errors map onto rows and re-open the sheet; `409` renders "Gerät B …" copy.

**Step 4:** PASS.

**Step 5: Commit** — `feat(field): verification sheet with server error mapping`.

---

### Task 9: Offline — shell cache, IndexedDB outbox, sync

**Files:**
- Create: `field/public/sw.js`, `field/src/offline/outbox.ts` (`enqueue`, `list`, `flush`), `field/src/offline/registerSW.ts`
- Modify: `field/src/screens/RosterScreen.tsx` (banner + counter), `field/src/sheets/DoneSheet.tsx` (offline variant)
- Test: `field/src/offline/__tests__/outbox.test.ts` (enqueue survives a reload; flush sends once and keeps the entry on failure; a replayed entry with the same `client_id` is a no-op)

**Step 1: Failing test**

```ts
it('flushes once and keeps the entry when the request fails', async () => {
  await enqueue(payload({ clientId: 'c1' }));
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
  await expect(flush(save)).resolves.toEqual({ sent: 0, pending: 1 });
  await expect(flush(save)).resolves.toEqual({ sent: 1, pending: 0 });
  expect(save).toHaveBeenCalledTimes(2);
});
```

**Step 2:** FAIL.

**Step 3: Implement** — the service worker is **not** a static file: `field/urls.py` serves it at `/field/sw.js` via a `FileResponse` with `Content-Type: text/javascript` and `Service-Worker-Allowed: /field/`, so `register('/field/sw.js', { scope: '/field/' })` is legal. It precaches the field shell + `/api/passcheck/games` (never `/passcheck/`, never `/static/passcheck/`); navigation inside the scope falls back to the cached `index.html`; the outbox is an IndexedDB store (`idb-keyval`) keyed by `client_id`; flush is single-flight; `online` triggers flush; a non-empty outbox disables the finalize CTA and shows the counter.

**Step 4:** PASS; manual check with DevTools offline: reload the app, check two players, save, come back online, one verification in the DB.

**Step 5: Commit** — `feat(field): offline shell and outbox`.

---

### Task 10: Help topic, field-test protocol, acceptance evidence

**Files:**
- Create: `docs/topics/features/passcheck/field-app.md` (user-facing: what changes on the field, photo privacy, offline badge)
- Create: an in-app help topic per `.opencode/skills/add-help-topic/SKILL.md` (short, German, with one screenshot)
- Modify: `docs/topics/features/README.md`, `docs/topics/planning/README.md` (mark this plan done/move to history)
- Test: manual field protocol below.

**Field protocol (M1 evidence):**

1. One referee, one phone, one real gameday team with 14 players.
2. Start the timer in the app at the first player, stop at the last; record `Ø s/Spieler` from the header.
3. Toggle airplane mode after the 5th player; finish the roster; save; reconnect; confirm exactly one `PasscheckVerification` and identical stats in the match report.
4. Open the same gameday on a second phone with the same token → expect read-only.

**Acceptance mapping**

| Roadmap evidence (M1/M3) | Covered by |
|---|---|
| 14 players in under two minutes | Task 6 (`Ø s/Spieler`) + field protocol step 2 |
| Photo only for the logged-in official, no cache | Task 3 tests + Task 7 viewer |
| Three taps per touchdown / no keyboard in the flow | Task 6–8 (no free-text inputs outside official name) |
| Zero lost entries on a dead network | Task 2 idempotency + Task 9 outbox |
| Two pitches, two devices, one writer | Task 2 `device_id` `409` + Task 9 |
| Return to the old UI per gameday | P5 (`/passcheck/` untouched) |
| The old app still works, in parallel | Task 1 legacy test, Task 2 legacy write tests, Task 11 side-by-side check |

---

### Task 11: Entry points and the side-by-side check

**Files:**
- Modify: `passcheck/src/components/GameOverview.tsx` (per-game link „Feld-Ansicht“ → `/field/?gameday=<id>`; additive, no behaviour change)
- Modify: `field/src/screens/GamesScreen.tsx` (link back to `/passcheck/`)
- Modify: `field/templates/field/index.html` (`<meta name="robots" content="noindex">` while in beta)
- Test: `passcheck/src/components/__tests__/GameOverview.test.tsx` (link rendered per game), `field/src/screens/__tests__/GamesScreen.test.tsx` (back link)

**Step 1: Write the failing tests** — one asserts the v1 game card renders the link with the gameday id, one asserts the v2 screen links back.

**Step 2: Run** — `npm --prefix passcheck run test:run` and `npm --prefix field run test:run` → FAIL.

**Step 3: Implement** — deep link `/field/?gameday=<id>` preselects the gameday; the old app's link is additive; nothing else in `passcheck/src` changes.

**Step 4: Run both suites** — both PASS, `eslint` zero on both.

**Step 5: Manual side-by-side check (part of the field protocol)**

1. Check three players in `/passcheck/` for team X, gameday Y; open `/field/` for the same team → 3 of N checked.
2. Check two more in `/field/`, save; open `/passcheck/` → same roster, same numbers.
3. In the browser console on `/passcheck/`: `navigator.serviceWorker.controller` → `null`.
4. Kill the network in `/field/`, save, reload → entry is still in the outbox; `/passcheck/` unaffected.

**Step 6: Commit** — `feat(field): link the two passcheck UIs`.

---

## Risks and how this plan handles them

- **The roster is still "what the club typed in", not a confirmed squad.** Accepted for M1; the scorecard slice (M2) has to introduce the confirmed `PlayerlistGameday` and then `is_selected` must switch from "row exists" to an explicit `is_checked` flag. Note this in the M2 design doc *before* the scorecard work starts — it is a data-model fork, not a UI detail.
- **`PlayerlistGameday` has no unique constraint on `(gameday, jersey)`.** Task 1 enforces it in the service under `select_for_update` on the gameday; a DB constraint needs a denormalised `team_id` and is deliberately deferred.
- **Photo storage on the app server.** Media lives in `MEDIA_ROOT`; no CDN, no signed URLs. That is acceptable only because the endpoint is permission-checked and `no-store`; revisit if photos grow beyond the pilot.
- **Two UIs can overwrite each other.** The write is a full replace; v1 has no device concept, so a v1 save after a v2 save wins silently. Accepted for the pilot (one device per team, one UI per team at a time); if that stops being true, add an `updated_at`/`If-Match` guard for both clients.
- **A service worker with the wrong scope would poison the old app.** Mitigated by serving `sw.js` under `/field/`, the `Service-Worker-Allowed` header, and an explicit "no controller on `/passcheck/`" check in Task 11.
- **The offline cache can serve a stale roster.** Precache is keyed by gameday and refreshed on open while online; the UI shows the roster's fetch time, and the server remains authoritative on save (409/400 wins over local state).
