# Gameday Stage Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `stage in ("Vorrunde", "Hauptrunde")` string-matching that decides "does this game count toward the round-robin standings table" with an explicit `Gameinfo.stage_category` field, populated correctly by both game-creation paths (Gameday Designer and the legacy manual/JSON-template flow), fixing the `KeyError: "['win_points'] not in index"` 500 on `/api/gameday/<id>/details` and a related silent bug in `has_finalround()`.

**Architecture:** Add a `stage_category` column to `Gameinfo` (`preliminary | final | placement | custom`, mirroring the Designer's existing `StageCategory` enum). The Designer's `CanvasPublishService` writes it explicitly from the canvas stage node's `category`. The legacy `ScheduleCreator` (JSON-template path) writes it explicitly from a small name→category lookup table that mirrors the JSON templates' fixed vocabulary (`Vorrunde`/`Hauptrunde`/`Finalrunde`/`Zwischenrunde`). Any other write path (e.g. the free-text manual-entry form) falls back to that same lookup automatically via a `Gameinfo.save()` override — so the field is always populated regardless of which of the two flows created the row. `GamedayModelWrapper` (the single consumer) is rewired to filter on `stage_category` instead of literal stage names, and its legacy `_get_table()` fallback is fixed to emit the same `win_points` column name the newer `TieBreakerEngine` path already produces — closing a second, independent schema mismatch that also contributes to the crash. A data migration backfills all ~741 existing gamedays: Designer-published gamedays are backfilled from their preserved `GamedayDesignerState.state_data` JSON (recovering the organizer's real `category` choice), everything else via the legacy lookup table.

**Tech Stack:** Django 5.2, pandas, factory_boy/Django `TestCase` for tests, Django migrations (schema + data).

## Global Constraints

- Both creation paths (Designer, legacy manual/JSON-template) must produce a working `stage_category` at runtime — this is not a Designer-only fix.
- No behavior change for any gameday that currently renders a qualify table correctly (verified task-by-task against existing fixtures).
- Follow this repo's test-first, no-manual-production-edits policy: migration must be verified against a synced copy of prod data on the test box before it ever runs against prod (see Task 8). No manual DB edits on `lehel.xyz`.
- Data migrations in this codebase inline their own logic rather than importing current app code, since app code can change after the migration is written (see existing precedent `gamedays/migrations/0031_migrate_gameinfo_status_completed.py`). Task 3 follows this convention deliberately.

---

## File Structure

- `gamedays/service/stage_category.py` (**new**) — `StageCategory` (Django `TextChoices`: `PRELIMINARY`, `FINAL`, `PLACEMENT`, `CUSTOM`) and `derive_legacy_stage_category(stage_name: str) -> str`, the shared name→category heuristic. Pure module, no Django app dependency beyond `django.db.models`, so it can be imported from `gamedays/models.py` without circular imports.
- `gamedays/models.py` — `Gameinfo` gets a `stage_category` field and a `save()` override that fills it in from `derive_legacy_stage_category(self.stage)` whenever it's left blank (mirrors the existing `Season.save()` auto-slugify pattern already in this file).
- `gamedays/migrations/0040_gameinfo_stage_category.py` (**new**) — schema-only migration adding the column.
- `gamedays/migrations/0041_backfill_stage_category.py` (**new**) — data migration backfilling all existing rows.
- `gamedays/service/canvas_publish_service.py` — `CanvasPublishService.apply()` reads `category` off the stage node and writes it to `Gameinfo.stage_category` explicitly.
- `gamedays/management/schedule_manager.py` — `ScheduleCreator._create_gameinfo_and_gameresult()` writes `stage_category` explicitly via the shared helper.
- `gamedays/service/gameday_settings.py` — add `STAGE_CATEGORY = "stage_category"` and `WIN_POINTS` stays as-is; remove the now-dead `QUALIIFY_ROUND`/`MAIN_ROUND` constants (confirmed via grep: `gamedays/service/model_wrapper.py` is their only consumer).
- `gamedays/service/model_wrapper.py` — `has_finalround()`, `get_qualify_table()`, `_get_table()`, `get_team_by_qualify_for()` rewired to use `stage_category` / `WIN_POINTS` instead of literal stage names / `POINTS`.
- Tests: `gamedays/tests/service/test_stage_category.py` (new), `gamedays/tests/service/test_canvas_publish_service.py` (new — this service currently has zero test coverage), `gamedays/tests/management/test_schedule_manager.py` (extended), `gamedays/tests/service/test_model_wrapper.py` (extended), `gamedays/tests/api/test_views.py` (extended with the exact prod-crash regression case).

---

### Task 1: Shared `StageCategory` enum and legacy heuristic

**Files:**
- Create: `gamedays/service/stage_category.py`
- Test: `gamedays/tests/service/test_stage_category.py`

**Interfaces:**
- Produces: `StageCategory` (Django `TextChoices` with members `PRELIMINARY = "preliminary"`, `FINAL = "final"`, `PLACEMENT = "placement"`, `CUSTOM = "custom"` — values chosen to match the frontend's existing `StageCategory` type in `gameday_designer/src/types/flowchart.ts:160`). `derive_legacy_stage_category(stage_name: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
# gamedays/tests/service/test_stage_category.py
from django.test import SimpleTestCase

from gamedays.service.stage_category import StageCategory, derive_legacy_stage_category


class TestDeriveLegacyStageCategory(SimpleTestCase):
    def test_vorrunde_is_preliminary(self):
        assert derive_legacy_stage_category("Vorrunde") == StageCategory.PRELIMINARY

    def test_hauptrunde_is_preliminary(self):
        assert derive_legacy_stage_category("Hauptrunde") == StageCategory.PRELIMINARY

    def test_finalrunde_is_final(self):
        assert derive_legacy_stage_category("Finalrunde") == StageCategory.FINAL

    def test_zwischenrunde_is_placement(self):
        assert derive_legacy_stage_category("Zwischenrunde") == StageCategory.PLACEMENT

    def test_unknown_stage_name_is_custom(self):
        assert derive_legacy_stage_category("Liga") == StageCategory.CUSTOM
        assert derive_legacy_stage_category("FF BL") == StageCategory.CUSTOM
        assert derive_legacy_stage_category("") == StageCategory.CUSTOM
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python manage.py test gamedays.tests.service.test_stage_category -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'gamedays.service.stage_category'`

- [ ] **Step 3: Write minimal implementation**

```python
# gamedays/service/stage_category.py
from django.db import models


class StageCategory(models.TextChoices):
    """
    Mirrors the Designer's StageCategory type
    (gameday_designer/src/types/flowchart.ts:160). A stage's *display name*
    (e.g. "Liga", "Vorrunde", "Preliminary") is free text chosen by whoever
    builds the schedule; this is the separate, structured signal for
    "does this stage's games count toward the round-robin standings table".
    """

    PRELIMINARY = "preliminary", "Preliminary"
    FINAL = "final", "Final"
    PLACEMENT = "placement", "Placement"
    CUSTOM = "custom", "Custom"


_LEGACY_STAGE_NAME_TO_CATEGORY = {
    "Vorrunde": StageCategory.PRELIMINARY,
    "Hauptrunde": StageCategory.PRELIMINARY,
    "Finalrunde": StageCategory.FINAL,
    "Zwischenrunde": StageCategory.PLACEMENT,
}


def derive_legacy_stage_category(stage_name: str) -> str:
    """
    Best-effort category for gamedays created outside the Designer, where no
    structured category is available — only a free-text stage name. Mirrors
    the fixed vocabulary used by gamedays/management/schedules/*.json and the
    manual gameinfo-entry form (gamedays/forms.py).
    """
    return _LEGACY_STAGE_NAME_TO_CATEGORY.get(stage_name, StageCategory.CUSTOM)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && python manage.py test gamedays.tests.service.test_stage_category -v 2`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add gamedays/service/stage_category.py gamedays/tests/service/test_stage_category.py
git -C leaguesphere commit -m "feat(gamedays): add StageCategory enum and legacy stage-name heuristic"
```

---

### Task 2: `Gameinfo.stage_category` field + auto-derive fallback + schema migration

**Files:**
- Modify: `gamedays/models.py:1-6` (imports), `gamedays/models.py:163-201` (`Gameinfo` class)
- Create: `gamedays/migrations/0040_gameinfo_stage_category.py`
- Test: `gamedays/tests/test_models.py` (create if it doesn't already cover `Gameinfo`; otherwise add to the existing model test module — check with `find gamedays/tests -iname "test_models*"` first)

**Interfaces:**
- Consumes: `StageCategory`, `derive_legacy_stage_category` from Task 1 (`gamedays.service.stage_category`).
- Produces: `Gameinfo.stage_category` (str column, one of `StageCategory` values, never blank after `save()`).

- [ ] **Step 1: Write the failing test**

```python
# add to gamedays/tests/test_models.py (create the file if none exists for Gameinfo)
from django.test import TestCase

from gamedays.models import Gameinfo
from gamedays.service.stage_category import StageCategory
from gamedays.tests.setup_factories.factories import GameinfoFactory


class TestGameinfoStageCategoryAutoDerive(TestCase):
    def test_save_derives_category_from_known_legacy_stage_name(self):
        gi = GameinfoFactory(stage="Vorrunde")
        assert gi.stage_category == StageCategory.PRELIMINARY

    def test_save_derives_custom_for_unknown_stage_name(self):
        gi = GameinfoFactory(stage="Liga")
        assert gi.stage_category == StageCategory.CUSTOM

    def test_save_does_not_override_explicitly_set_category(self):
        gi = GameinfoFactory(stage="Liga", stage_category=StageCategory.PRELIMINARY)
        assert gi.stage_category == StageCategory.PRELIMINARY

        gi.refresh_from_db()
        assert gi.stage_category == StageCategory.PRELIMINARY
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python manage.py test gamedays.tests.test_models -v 2`
Expected: FAIL — `TypeError: 'stage_category' is an invalid keyword argument for this function` (field doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

Add the import near the top of `gamedays/models.py` (after the existing Django imports, line 5):

```python
from gamedays.service.stage_category import StageCategory, derive_legacy_stage_category
```

Add the field and `save()` override to `Gameinfo` (insert the field after `standing = models.CharField(max_length=100)` at `gamedays/models.py:181`, and add `save()` before `__str__` at `gamedays/models.py:197`):

```python
    standing = models.CharField(max_length=100)
    stage_category = models.CharField(
        max_length=20, choices=StageCategory.choices, blank=True, default=""
    )
```

```python
    def save(self, *args, **kwargs):
        if not self.stage_category:
            self.stage_category = derive_legacy_stage_category(self.stage)
        super().save(*args, **kwargs)

    def __str__(self):
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `cd leaguesphere && python manage.py makemigrations gamedays`
Expected output file: `gamedays/migrations/0040_gameinfo_stage_category.py`, dependency on `0039_alter_resourceurl_gameday_resourceurl_tournament_and_more`, a single `AddField` operation for `stage_category` (`CharField(max_length=20, blank=True, default="", choices=[...])`). Open the generated file and confirm it matches this shape — if Django names it something else, rename the file to `0040_gameinfo_stage_category.py` for clarity and fix the `Migration.dependencies`/class name accordingly.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd leaguesphere && python manage.py test gamedays.tests.test_models gamedays.tests.service.test_stage_category -v 2`
Expected: PASS (all tests, including Task 1's)

- [ ] **Step 6: Run the full gamedays test suite to check for regressions**

Run: `cd leaguesphere && python manage.py test gamedays -v 1`
Expected: PASS — every existing `GameinfoFactory(...)` call now transparently gets a derived `stage_category` through the new `save()` override; no existing test references the field, so none should break.

- [ ] **Step 7: Commit**

```bash
git -C leaguesphere add gamedays/models.py gamedays/migrations/0040_gameinfo_stage_category.py gamedays/tests/test_models.py
git -C leaguesphere commit -m "feat(gamedays): add Gameinfo.stage_category with auto-derive fallback"
```

---

### Task 3: Data migration — backfill `stage_category` for existing gamedays

**Files:**
- Create: `gamedays/migrations/0041_backfill_stage_category.py`
- Test: `gamedays/tests/migrations/test_backfill_stage_category.py` (new directory — create `gamedays/tests/migrations/__init__.py` too)

**Interfaces:**
- Consumes: nothing from app code (by convention, inlines its own copy of the category logic — see Global Constraints). Reads `GamedayDesignerState.state_data` (existing JSONField, shape: `{"nodes": [...], ...}`, stage nodes have `type == "stage"` and `data == {"name": ..., "category": ..., ...}` — confirmed against real prod data for gameday 844).
- Produces: every `Gameinfo` row gets a non-blank `stage_category`.

Backfill strategy, in order:
1. For gamedays that have a `GamedayDesignerState`: build a `{stage_name: category}` map from that gameday's `state_data["nodes"]` (nodes with `type == "stage"`), and apply it to that gameday's `Gameinfo` rows by matching on `stage`. If a `Gameinfo.stage` value isn't found in the map (shouldn't happen, but designer state and game rows are stored separately, so treat mismatches defensively), leave it for the fallback pass below.
2. Everything not resolved by step 1 (no designer state at all, or an unresolved name) falls back to the same literal-name lookup as `derive_legacy_stage_category` (Vorrunde/Hauptrunde → preliminary, Finalrunde → final, Zwischenrunde → placement, else → custom).

- [ ] **Step 1: Write the failing test**

```python
# gamedays/tests/migrations/__init__.py
```
(empty file, makes the directory a package)

```python
# gamedays/tests/migrations/test_backfill_stage_category.py
import importlib

from django.test import TestCase

from gamedays.models import Gameinfo, GamedayDesignerState
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import GameinfoFactory

_migration = importlib.import_module("gamedays.migrations.0041_backfill_stage_category")


class TestBackfillStageCategory(TestCase):
    def test_backfills_from_designer_state_when_present(self):
        gameday = DBSetup().create_empty_gameday()
        gi_preliminary = GameinfoFactory(gameday=gameday, stage="Liga")
        gi_final = GameinfoFactory(gameday=gameday, stage="Playoffs")
        # bypass the Task 2 save() fallback to simulate pre-migration data
        Gameinfo.objects.filter(pk__in=[gi_preliminary.pk, gi_final.pk]).update(
            stage_category=""
        )
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={
                "nodes": [
                    {
                        "type": "stage",
                        "data": {"name": "Liga", "category": "preliminary"},
                    },
                    {
                        "type": "stage",
                        "data": {"name": "Playoffs", "category": "final"},
                    },
                ]
            },
        )

        _migration.backfill_stage_category(apps_module=None, schema_editor=None)

        gi_preliminary.refresh_from_db()
        gi_final.refresh_from_db()
        assert gi_preliminary.stage_category == "preliminary"
        assert gi_final.stage_category == "final"

    def test_backfills_from_legacy_heuristic_when_no_designer_state(self):
        gameday = DBSetup().create_empty_gameday()
        gi = GameinfoFactory(gameday=gameday, stage="Hauptrunde")
        Gameinfo.objects.filter(pk=gi.pk).update(stage_category="")

        _migration.backfill_stage_category(apps_module=None, schema_editor=None)

        gi.refresh_from_db()
        assert gi.stage_category == "preliminary"

    def test_leaves_already_populated_rows_untouched(self):
        gameday = DBSetup().create_empty_gameday()
        gi = GameinfoFactory(gameday=gameday, stage="Liga")
        Gameinfo.objects.filter(pk=gi.pk).update(stage_category="custom")
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={
                "nodes": [
                    {"type": "stage", "data": {"name": "Liga", "category": "preliminary"}}
                ]
            },
        )

        _migration.backfill_stage_category(apps_module=None, schema_editor=None)

        gi.refresh_from_db()
        assert gi.stage_category == "custom"
```

Note: this test imports the migration module directly and calls its function with the *current* (non-historical) models — a deliberate simplification given this codebase has no existing migration-testing infrastructure (verified via `find . -path "*/tests/migrations*"` — none found, and existing data migrations like `0031_migrate_gameinfo_status_completed.py` have no dedicated tests either). It exercises the real backfill logic against real model behavior, which is what matters here; it does not exercise Django's historical-model machinery.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python manage.py test gamedays.tests.migrations.test_backfill_stage_category -v 2`
Expected: FAIL with `ModuleNotFoundError: No module named 'gamedays.migrations.0041_backfill_stage_category'`

- [ ] **Step 3: Write minimal implementation**

```python
# gamedays/migrations/0041_backfill_stage_category.py
from django.db import migrations

_LEGACY_STAGE_NAME_TO_CATEGORY = {
    "Vorrunde": "preliminary",
    "Hauptrunde": "preliminary",
    "Finalrunde": "final",
    "Zwischenrunde": "placement",
}


def _category_map_from_designer_state(state_data) -> dict:
    nodes = (state_data or {}).get("nodes", [])
    return {
        node["data"]["name"]: node["data"].get("category", "preliminary")
        for node in nodes
        if node.get("type") == "stage" and node.get("data", {}).get("name")
    }


def backfill_stage_category(apps_module, schema_editor):
    if apps_module is not None:
        Gameinfo = apps_module.get_model("gamedays", "Gameinfo")
        GamedayDesignerState = apps_module.get_model("gamedays", "GamedayDesignerState")
    else:
        # Allows direct unit testing against the current models (see
        # gamedays/tests/migrations/test_backfill_stage_category.py).
        from gamedays.models import Gameinfo, GamedayDesignerState

    for state in GamedayDesignerState.objects.all():
        name_to_category = _category_map_from_designer_state(state.state_data)
        if not name_to_category:
            continue
        rows = list(
            Gameinfo.objects.filter(gameday_id=state.gameday_id, stage_category="")
        )
        if not rows:
            continue
        to_update = []
        for row in rows:
            category = name_to_category.get(row.stage)
            if category:
                row.stage_category = category
                to_update.append(row)
        if to_update:
            Gameinfo.objects.bulk_update(to_update, ["stage_category"])

    remaining = list(Gameinfo.objects.filter(stage_category=""))
    for row in remaining:
        row.stage_category = _LEGACY_STAGE_NAME_TO_CATEGORY.get(row.stage, "custom")
    if remaining:
        Gameinfo.objects.bulk_update(remaining, ["stage_category"], batch_size=500)


def reverse_backfill_stage_category(apps_module, schema_editor):
    Gameinfo = apps_module.get_model("gamedays", "Gameinfo")
    Gameinfo.objects.update(stage_category="")


class Migration(migrations.Migration):
    dependencies = [
        ("gamedays", "0040_gameinfo_stage_category"),
    ]

    operations = [
        migrations.RunPython(
            backfill_stage_category,
            reverse_code=reverse_backfill_stage_category,
        ),
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && python manage.py test gamedays.tests.migrations.test_backfill_stage_category -v 2`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add gamedays/migrations/0041_backfill_stage_category.py gamedays/tests/migrations/
git -C leaguesphere commit -m "feat(gamedays): backfill stage_category from designer state and legacy heuristic"
```

---

### Task 4: `CanvasPublishService` writes `stage_category` from the Designer's stage node

**Files:**
- Modify: `gamedays/service/canvas_publish_service.py:40-62`
- Create: `gamedays/tests/service/test_canvas_publish_service.py` (this service currently has no tests at all)

**Interfaces:**
- Consumes: `StageCategory` from Task 1 (as a default fallback value only — the node data is trusted first).
- Produces: `Gameinfo.stage_category` set explicitly at publish time (bypasses the Task 2 auto-derive fallback for all Designer-published games going forward).

- [ ] **Step 1: Write the failing test**

```python
# gamedays/tests/service/test_canvas_publish_service.py
from django.test import TestCase

from gamedays.models import Gameinfo, GamedayDesignerState
from gamedays.service.canvas_publish_service import CanvasPublishService
from gamedays.service.stage_category import StageCategory
from gamedays.tests.setup_factories.db_setup import DBSetup


def _state_data_with_one_game(stage_category="preliminary"):
    return {
        "nodes": [
            {
                "id": "field-1",
                "type": "field",
                "data": {"type": "field", "name": "Feld 1", "order": 0},
            },
            {
                "id": "stage-1",
                "type": "stage",
                "parentId": "field-1",
                "data": {
                    "type": "stage",
                    "name": "Liga",
                    "category": stage_category,
                    "stageType": "STANDARD",
                },
            },
            {
                "id": "game-1",
                "type": "game",
                "parentId": "stage-1",
                "data": {
                    "type": "game",
                    "standing": "Tabelle",
                    "startTime": "10:00",
                    "homeTeamId": None,
                    "awayTeamId": None,
                    "official": None,
                },
            },
        ],
        "globalTeams": [],
    }


class TestCanvasPublishServiceStageCategory(TestCase):
    def test_apply_persists_preliminary_category_from_stage_node(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data=_state_data_with_one_game("preliminary")
        )

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.stage == "Liga"
        assert gi.stage_category == StageCategory.PRELIMINARY

    def test_apply_persists_final_category_from_stage_node(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data=_state_data_with_one_game("final")
        )

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.stage_category == StageCategory.FINAL

    def test_apply_defaults_to_preliminary_when_stage_node_has_no_category(self):
        state_data = _state_data_with_one_game("preliminary")
        del state_data["nodes"][1]["data"]["category"]
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.stage_category == StageCategory.PRELIMINARY
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python manage.py test gamedays.tests.service.test_canvas_publish_service -v 2`
Expected: FAIL on `test_apply_persists_final_category_from_stage_node` — `gi.stage_category` will be `"preliminary"` (Task 2's `derive_legacy_stage_category("Liga")` fallback, which maps unknown names to `"custom"` actually — check: `"Liga"` isn't in the legacy map, so it'll actually derive to `StageCategory.CUSTOM`, not `preliminary`). Confirm the actual failure mode by running the test rather than assuming; either way it will fail because the real per-node `category` isn't being read yet.

- [ ] **Step 3: Write minimal implementation**

In `gamedays/service/canvas_publish_service.py`, add the import at the top of the file:

```python
from gamedays.service.stage_category import StageCategory
```

Modify the loop body (`gamedays/service/canvas_publish_service.py:40-62`):

```python
        for node in game_nodes:
            data = node.get("data", {})
            stage_node = node_by_id.get(node.get("parentId"), {})
            field_node = node_by_id.get(stage_node.get("parentId", ""), {})

            field_num = field_node.get("data", {}).get("order", 0) + 1
            stage_name = stage_node.get("data", {}).get("name", "")
            stage_category = stage_node.get("data", {}).get(
                "category", StageCategory.PRELIMINARY
            )
            standing = data.get("standing", "")
            start_time = data.get("startTime") or str(self.gameday.start)

            officials = self._resolve_official(
                data.get("official"), global_teams, placeholder
            )

            gi = Gameinfo.objects.create(
                gameday=self.gameday,
                scheduled=start_time,
                field=field_num,
                stage=stage_name,
                stage_category=stage_category,
                standing=standing,
                officials=officials,
                status=Gameinfo.STATUS_PUBLISHED,
            )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && python manage.py test gamedays.tests.service.test_canvas_publish_service -v 2`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full gamedays test suite to check for regressions**

Run: `cd leaguesphere && python manage.py test gamedays -v 1`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C leaguesphere add gamedays/service/canvas_publish_service.py gamedays/tests/service/test_canvas_publish_service.py
git -C leaguesphere commit -m "feat(gamedays): persist designer stage category when publishing canvas"
```

---

### Task 5: Legacy `ScheduleCreator` writes `stage_category` explicitly

**Files:**
- Modify: `gamedays/management/schedule_manager.py:1-9` (imports), `gamedays/management/schedule_manager.py:198-208` (`_create_gameinfo_and_gameresult`)
- Modify: `gamedays/tests/management/test_schedule_manager.py` (extend `TestScheduleCreator`)

**Interfaces:**
- Consumes: `derive_legacy_stage_category` from Task 1.
- Produces: `Gameinfo.stage_category` set explicitly at creation time for every JSON-template-driven gameday (this makes the behavior explicit/testable here rather than relying silently on the Task 2 model-level fallback — same result, clearer intent at the call site that creates the authoritative legacy data).

- [ ] **Step 1: Write the failing test**

Add to `gamedays/tests/management/test_schedule_manager.py`, inside `class TestScheduleCreator(TestCase):` (after `test_schedule_created_for_4_teams`, which already exercises `Schedule("4_1", ...)` against `schedule_4_1.json` — confirmed via `gamedays/management/schedules/schedule_4_1.json` to use `"stage": "Hauptrunde"` for every game):

```python
    def test_schedule_created_sets_preliminary_stage_category_for_hauptrunde(self):
        gameday = DBSetup().create_empty_gameday()
        DBSetup().create_playoff_placeholder_teams()
        group_A = DBSetup().create_teams("A", 4)
        sc = ScheduleCreator(
            gameday=Gameday.objects.get(pk=gameday.pk),
            schedule=Schedule("4_1", [GroupSchedule("Group 1", None, group_A)]),
        )
        sc.create()
        gameinfo_set = Gameinfo.objects.filter(gameday_id=gameday.pk)
        assert gameinfo_set.count() == 6
        for gi in gameinfo_set:
            assert gi.stage == "Hauptrunde"
            assert gi.stage_category == "preliminary"

    def test_schedule_created_sets_final_stage_category_for_finalrunde(self):
        gameday = DBSetup().create_empty_gameday()
        DBSetup().create_playoff_placeholder_teams()
        groups = DBSetup().create_teams_for_6_2()  # mirrors existing 6_2-format tests in this file
        sc = ScheduleCreator(
            gameday=Gameday.objects.get(pk=gameday.pk),
            schedule=Schedule("6_2", groups),
        )
        sc.create()
        finalrunde_games = Gameinfo.objects.filter(
            gameday_id=gameday.pk, stage="Finalrunde"
        )
        assert finalrunde_games.exists()
        for gi in finalrunde_games:
            assert gi.stage_category == "final"
```

Before running: check the exact helper name this file already uses to build the two `GroupSchedule`s for the `"6_2"` format (see `gamedays/tests/management/test_schedule_manager.py:100-108`, `TestSchedule.test_schedule_throws_exception_format_and_groups_dont_fit`, which already constructs `Schedule("6_2", groups)` from two `GroupSchedule(...)` calls) — reuse that exact construction instead of a possibly-nonexistent `create_teams_for_6_2()` helper. Adjust the test to build `groups` the same way that existing test does before running it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd leaguesphere && python manage.py test gamedays.tests.management.test_schedule_manager.TestScheduleCreator -v 2`
Expected: both new tests currently PASS already for the `stage` assertions (unaffected) but the `stage_category` fields will already be correct too, because Task 2's `Gameinfo.save()` fallback derives it automatically even without this task's change. This task's own test therefore won't newly fail — that's expected and fine here since Task 2 already covers the runtime behavior generically. Skip asserting a "RED" step for this task; instead go straight to Step 3 and treat this task as making the derivation **explicit** at the call site rather than implicitly relying on the model fallback. Confirm the tests pass in Step 4 and move on — the real regression protection this task adds is against a future refactor of `Gameinfo.save()` removing the fallback.

- [ ] **Step 3: Write the implementation**

Add the import to `gamedays/management/schedule_manager.py` (top of file, after existing imports at line 9):

```python
from gamedays.service.stage_category import derive_legacy_stage_category
```

Modify `_create_gameinfo_and_gameresult` (`gamedays/management/schedule_manager.py:198-208`):

```python
    def _create_gameinfo_and_gameresult(self, game, field, scheduled):
        gameinfo = Gameinfo()
        gameinfo.gameday = self.gameday
        gameinfo.scheduled = scheduled
        gameinfo.stage = game.stage
        gameinfo.stage_category = derive_legacy_stage_category(game.stage)
        gameinfo.field = field
        gameinfo.standing = game.standing
        gameinfo.league_group = game.league_group
        gameinfo.officials = self._get_team(game.officials)
        gameinfo.save()
        self._create_gameresult(game, gameinfo)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd leaguesphere && python manage.py test gamedays.tests.management.test_schedule_manager -v 2`
Expected: PASS (all tests, including both new ones)

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add gamedays/management/schedule_manager.py gamedays/tests/management/test_schedule_manager.py
git -C leaguesphere commit -m "feat(gamedays): set stage_category explicitly in legacy schedule creation"
```

---

### Task 6: Rewire `GamedayModelWrapper` to use `stage_category` and fix the `win_points` schema mismatch

**Files:**
- Modify: `gamedays/service/gameday_settings.py:15-30` (add `STAGE_CATEGORY`, remove `QUALIIFY_ROUND`/`MAIN_ROUND`)
- Modify: `gamedays/service/model_wrapper.py:8-37` (imports), `:176` (`has_finalround`), `:183-201` (`get_qualify_table`), `:489-495` (`_get_table`), `:539-546` (`get_team_by_qualify_for`)
- Modify: `gamedays/tests/service/test_model_wrapper.py`

**Interfaces:**
- Consumes: `StageCategory` from Task 1, `Gameinfo.stage_category` from Task 2 (already flowing into `self._gameinfo`/`self._games_with_result` DataFrames automatically — `GamedayModelWrapper.__init__` builds `self._gameinfo` from `[f.name for f in Gameinfo._meta.local_fields]`, so the new field appears as a `"stage_category"` column with zero changes needed there).
- Produces: no change to `GamedayModelWrapper`'s public method signatures — `has_finalround()`, `get_qualify_table()`, `get_final_table()`, `get_qualify_team_by()`, `get_team_by_qualify_for()` keep the same signatures and return shapes consumers already rely on (`gamedays/api/views.py` needs **no changes**).

- [ ] **Step 1: Write the failing test — reproduce the exact prod crash**

Add to `gamedays/tests/service/test_model_wrapper.py`:

```python
    @patch("league_table.service.datatypes.LeagueConfigRuleset.from_ruleset")
    def test_get_qualify_table_for_designer_style_stage_name(
        self, mock_get_league_config_ruleset
    ):
        """
        Regression test for prod incident: gamedays published via the
        Designer with a stage named e.g. "Liga" (stage_category="preliminary")
        crashed with KeyError: "['win_points'] not in index" on
        /api/gameday/<id>/details?get=qualify, because the legacy fallback
        table used a "points" column while the view expects "win_points".
        """
        mock_get_league_config_ruleset.return_value = LEAGUE_TABLE_TEST_RULESET
        gameday = DBSetup().create_empty_gameday()
        LeagueSeasonConfigFactory(league=gameday.league, season=gameday.season)
        DBSetup().create_group(
            gameday=gameday,
            name="A",
            stage="Liga",
            standing="Tabelle",
            status="beendet",
            number_teams=3,
        )
        gmw = GamedayModelWrapper(gameday.pk)
        qualify_table = gmw.get_qualify_table()
        assert "win_points" in qualify_table.columns
```

Add a second test for the no-ruleset fallback path directly exercising the fixed `_get_table()`:

```python
    def test_get_table_uses_win_points_column(self):
        gameday = DBSetup().g62_qualify_finished()
        gmw = GamedayModelWrapper(gameday.pk)
        table = gmw._get_table()
        assert "win_points" in table.columns
        assert "points" not in table.columns
```

Add a test for the `has_finalround()` fix (Designer-created final-round games with a non-"Vorrunde" stage name now correctly detected):

```python
    def test_has_finalround_true_for_designer_style_final_category(self):
        gameday = DBSetup().create_empty_gameday()
        DBSetup().create_group(
            gameday=gameday, name="A", stage="Liga", standing="Tabelle", number_teams=3
        )
        DBSetup().create_group(
            gameday=gameday,
            name="B",
            stage="Playoffs",
            standing="Tabelle",
            number_teams=3,
        )
        Gameinfo.objects.filter(gameday=gameday, stage="Playoffs").update(
            stage_category="final"
        )
        gmw = GamedayModelWrapper(gameday.pk)
        assert gmw.has_finalround()
```

(This last test needs `from gamedays.models import Gameinfo` — already imported in this file per `gamedays/tests/service/test_model_wrapper.py:7`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere && python manage.py test gamedays.tests.service.test_model_wrapper -v 2`
Expected: `test_get_qualify_table_for_designer_style_stage_name` FAILs with `KeyError: 'win_points'` (reproducing the exact prod traceback from `gamedays/api/views.py:377`, one layer down at the `model_wrapper` level). `test_get_table_uses_win_points_column` FAILs — `"points"` is present, `"win_points"` is not. `test_has_finalround_true_for_designer_style_final_category` FAILs — `has_finalround()` returns `False` (the pre-existing silent bug).

- [ ] **Step 3: Update `gameday_settings.py`**

Remove (`gamedays/service/gameday_settings.py:28-29`):
```python
QUALIIFY_ROUND = "Vorrunde"
MAIN_ROUND = "Hauptrunde"
```

Add, near `STAGE = "stage"` (`gamedays/service/gameday_settings.py:24`):
```python
STAGE = "stage"
STAGE_CATEGORY = "stage_category"
```

- [ ] **Step 4: Update `model_wrapper.py` imports**

`gamedays/service/model_wrapper.py:7-37`, replace:
```python
from gamedays.models import Gameinfo, Gameresult, TeamLog
from gamedays.service.gameday_settings import (
    STANDING,
    TEAM_DESCRIPTION,
    POINTS,
    POINTS_HOME,
    POINTS_AWAY,
    PA,
    PF,
    GAMEINFO_ID,
    DIFF,
    SCHEDULED,
    FIELD,
    OFFICIALS_NAME,
    STAGE,
    HOME,
    AWAY,
    ID_AWAY,
    ID_HOME,
    ID_Y,
    QUALIIFY_ROUND,
    STATUS,
    SH,
    FH,
    FINISHED,
    GAME_FINISHED,
    IN_POSSESSION,
    IS_HOME,
    MAIN_ROUND,
    TEAM_ID,
)
```
with:
```python
from gamedays.models import Gameinfo, Gameresult, TeamLog
from gamedays.service.gameday_settings import (
    STANDING,
    TEAM_DESCRIPTION,
    POINTS,
    WIN_POINTS,
    POINTS_HOME,
    POINTS_AWAY,
    PA,
    PF,
    GAMEINFO_ID,
    DIFF,
    SCHEDULED,
    FIELD,
    OFFICIALS_NAME,
    STAGE,
    STAGE_CATEGORY,
    HOME,
    AWAY,
    ID_AWAY,
    ID_HOME,
    ID_Y,
    STATUS,
    SH,
    FH,
    FINISHED,
    GAME_FINISHED,
    IN_POSSESSION,
    IS_HOME,
    TEAM_ID,
)
from gamedays.service.stage_category import StageCategory
```
(`POINTS` stays imported — `get_team_aggregate_by()` at `gamedays/service/model_wrapper.py:548-559` still uses it independently and is out of scope for this task.)

- [ ] **Step 5: Fix `has_finalround()`**

`gamedays/service/model_wrapper.py:175-176`, replace:
```python
    def has_finalround(self):
        return QUALIIFY_ROUND in self._gameinfo[STAGE].values
```
with:
```python
    def has_finalround(self):
        return (
            self._gameinfo[STAGE_CATEGORY]
            .isin([StageCategory.FINAL, StageCategory.PLACEMENT])
            .any()
        )
```

- [ ] **Step 6: Fix `get_qualify_table()`**

`gamedays/service/model_wrapper.py:197`, replace:
```python
        games_with_result = games_with_result[(games_with_result[STAGE].isin([QUALIIFY_ROUND, MAIN_ROUND]))]
```
with:
```python
        games_with_result = games_with_result[
            games_with_result[STAGE_CATEGORY] == StageCategory.PRELIMINARY
        ]
```

- [ ] **Step 7: Fix `_get_table()`**

`gamedays/service/model_wrapper.py:489-495`, replace:
```python
    def _get_table(self):
        qualify_round = self._games_with_result[self._games_with_result[STAGE].isin([QUALIIFY_ROUND, MAIN_ROUND])]
        qualify_round = qualify_round.groupby([STANDING, TEAM_DESCRIPTION], as_index=False)
        qualify_round = qualify_round.agg({POINTS: 'sum', PF: 'sum', PA: 'sum', DIFF: 'sum', TEAM_ID: 'first'})
        qualify_round = qualify_round.sort_values(by=[POINTS, DIFF, PF, PA], ascending=False)
        qualify_round = qualify_round.sort_values(by=STANDING)
        return qualify_round
```
with:
```python
    def _get_table(self):
        qualify_round = self._games_with_result[
            self._games_with_result[STAGE_CATEGORY] == StageCategory.PRELIMINARY
        ]
        qualify_round = qualify_round.groupby([STANDING, TEAM_DESCRIPTION], as_index=False)
        qualify_round = qualify_round.agg({WIN_POINTS: 'sum', PF: 'sum', PA: 'sum', DIFF: 'sum', TEAM_ID: 'first'})
        qualify_round = qualify_round.sort_values(by=[WIN_POINTS, DIFF, PF, PA], ascending=False)
        qualify_round = qualify_round.sort_values(by=STANDING)
        return qualify_round
```

- [ ] **Step 8: Fix `get_team_by_qualify_for()`**

`gamedays/service/model_wrapper.py:539-546`, replace:
```python
    def get_team_by_qualify_for(self, place, index):
        qualify_standing_by_place = (
            self._get_table()
            .groupby(STANDING)
            .nth(place - 1)
            .sort_values(by=[POINTS, DIFF, PF, PA], ascending=False)
        )
        return qualify_standing_by_place.iloc[index][TEAM_DESCRIPTION]
```
with:
```python
    def get_team_by_qualify_for(self, place, index):
        qualify_standing_by_place = (
            self._get_table()
            .groupby(STANDING)
            .nth(place - 1)
            .sort_values(by=[WIN_POINTS, DIFF, PF, PA], ascending=False)
        )
        return qualify_standing_by_place.iloc[index][TEAM_DESCRIPTION]
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd leaguesphere && python manage.py test gamedays.tests.service.test_model_wrapper -v 2`
Expected: PASS — all pre-existing tests in this file (`test_has_finalround`, `test_get_qualify_table`, `test_get_qualify_table_with_main_round`, `test_empty_get_final_table`, `test_get_final_table`, `test_get_final_table_for_7_teams`, `test_get_final_table_for_main_round_is_empty`, `test_get_qualify_team_by`, `test_get_team_by_points`) plus the 3 new ones from Step 1. The pre-existing tests keep passing unchanged because every `DBSetup` factory helper they use (`create_group`, `create_finalround_game`) writes one of the four known legacy stage names, which Task 2's `Gameinfo.save()` fallback resolves to the exact same preliminary/final split the old `Vorrunde`/`Hauptrunde` vs. everything-else check produced (verified by tracing `g62_finalround()`, `create_main_round_gameday()`, `g62_qualify_finished()` against `derive_legacy_stage_category` during planning).

- [ ] **Step 10: Run the full gamedays test suite**

Run: `cd leaguesphere && python manage.py test gamedays -v 1`
Expected: PASS, no regressions anywhere else in the app.

- [ ] **Step 11: Commit**

```bash
git -C leaguesphere add gamedays/service/gameday_settings.py gamedays/service/model_wrapper.py gamedays/tests/service/test_model_wrapper.py
git -C leaguesphere commit -m "fix(gamedays): filter qualify/final tables by stage_category, fix win_points schema mismatch"
```

---

### Task 7: End-to-end regression test at the API layer

**Files:**
- Modify: `gamedays/tests/api/test_views.py`

**Interfaces:**
- Consumes: everything from Tasks 1–6. No production code changes in this task — pure regression coverage proving the original prod bug report (`Internal Server Error: /api/gameday/844/details`) is fixed end to end, through the real DRF view.

- [ ] **Step 1: Locate the existing `GamedayScheduleView` test coverage**

Run: `cd leaguesphere && grep -n "get=qualify\|GamedayScheduleView\|api-gameday-schedule" gamedays/tests/api/test_views.py`
Read whatever is found to match this task's test to the file's existing style (client setup, URL reversing, auth/login helpers already in use in that file).

- [ ] **Step 2: Write the failing test**

Add to `gamedays/tests/api/test_views.py` (adapt imports/login helper to match what Step 1 found):

```python
    @patch("league_table.service.datatypes.LeagueConfigRuleset.from_ruleset")
    def test_gameday_details_qualify_table_for_designer_stage_name_returns_200(
        self, mock_get_league_config_ruleset
    ):
        """
        Regression test for the prod incident where /api/gameday/<id>/details
        500'd with KeyError: "['win_points'] not in index" for any gameday
        whose stage name wasn't literally "Vorrunde" or "Hauptrunde" (e.g.
        Designer-published gamedays named "Liga").
        """
        mock_get_league_config_ruleset.return_value = LEAGUE_TABLE_TEST_RULESET
        gameday = DBSetup().create_empty_gameday()
        LeagueSeasonConfigFactory(league=gameday.league, season=gameday.season)
        DBSetup().create_group(
            gameday=gameday,
            name="A",
            stage="Liga",
            standing="Tabelle",
            status="beendet",
            number_teams=3,
        )

        response = self.client.get(
            reverse("api-gameday-schedule", kwargs={"pk": gameday.pk}),
            {"get": "qualify"},
        )

        assert response.status_code == 200
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd leaguesphere && python manage.py test gamedays.tests.api.test_views -v 2 -k test_gameday_details_qualify_table_for_designer_stage_name_returns_200`
Expected: FAIL before Task 6's fix is present; since Task 6 already landed in this plan's sequence, this should now PASS immediately — run it anyway as the final end-to-end confirmation, and if it fails, that means one of Tasks 1–6 has a gap that unit tests didn't catch (investigate before proceeding, don't patch this test to hide it).

- [ ] **Step 4: Confirm it passes**

Run: `cd leaguesphere && python manage.py test gamedays.tests.api.test_views -v 2`
Expected: PASS (full file, no regressions)

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add gamedays/tests/api/test_views.py
git -C leaguesphere commit -m "test(gamedays): end-to-end regression test for gameday details qualify-table 500"
```

---

### Task 8: Verify against synced prod data, then roll out

This task has no code changes — it's the verification gate before merge, per this repo's test-first / no-manual-production-edits policy (`container/CLAUDE.md`, `container/docs/leaguesphere-environments.md`).

- [ ] **Step 1: Run the full test suite locally**

Run: `cd leaguesphere && ./container/spinup_test_db.sh --fresh && python manage.py test`
Expected: full suite green.

- [ ] **Step 2: Sync real prod data into the stage stack, then the isolated test box**

```bash
cd container/ansible
./servyy.sh --tags ls.db.sync --limit lehel.xyz
./servyy-test.sh --tags ls.db.sync
```
(First-time test-box setup only, if the stage stack there isn't already provisioned: `./servyy-test.sh --tags ls.app.stage` before the sync tag.)

- [ ] **Step 3: Apply the migration against the synced copy and verify the backfill**

On `servyy-test.lxd`, run `python manage.py migrate gamedays` and then, in `python manage.py shell`, re-run the same read-only audit queries used during the original investigation against the now-migrated data:
```python
from gamedays.models import Gameinfo
print(Gameinfo.objects.exclude(stage_category="").count(), Gameinfo.objects.count())
# expect these equal — nothing left unbackfilled
print(list(Gameinfo.objects.filter(stage_category="preliminary", stage="Liga").values_list("gameday_id", flat=True).distinct()))
# expect the previously-crashing "Liga" gamedays (844, 845, 848, ...) to show up here as preliminary
```

- [ ] **Step 4: Hit the previously-crashing endpoints against the synced test box**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://<servyy-test-host>/api/gameday/844/details?get=qualify"
curl -s -o /dev/null -w "%{http_code}\n" "http://<servyy-test-host>/api/gameday/854/details?get=qualify"
```
Expected: `200` for both (previously `500` in prod logs).

- [ ] **Step 5: Merge to master**

Per `[LeagueSphere CI deploys on merge]` — merging to `master` triggers the existing CI pipeline which deploys to prod automatically. Do not deploy manually. Open the PR, get it reviewed, merge once green.

- [ ] **Step 6: Confirm in prod**

After the CI deploy completes:
```bash
ssh lehel.xyz "docker logs leaguesphere.app --since 10m 2>&1" | grep -c "win_points"
```
Expected: `0`. Also spot-check `curl -s -o /dev/null -w "%{http_code}\n" https://leaguesphere.app/api/gameday/844/details?get=qualify` (or via the browser) returns `200`.

---

## Self-Review Notes

- **Spec coverage:** Designer path (Task 4), legacy manual/JSON-template path (Task 5), shared fallback for any other/future path (Task 2's `save()` override), consumer fix (Task 6), backfill for existing data (Task 3), end-to-end proof (Task 7), safe rollout (Task 8). No gaps against the user's stated requirement that both creation paths work at runtime.
- **Known, explicitly out-of-scope follow-up:** `_get_table()`'s `WIN_POINTS` values are computed with the fixed legacy 2/1/0 scoring rule (`GamedayModelWrapper.__init__`, `tmp[POINTS] = np.where(...)`), not the per-league configurable `LeagueRuleset.league_points` that `TeamStatsEngine` (the `TieBreakerEngine` path) uses. This was already true before this plan (pre-existing `POINTS` column had the same fixed-rule limitation) and only matters for gamedays that hit the `_get_table()` fallback (no `LeagueSeasonConfig`/ruleset configured, or `league_table` app disabled). Not fixed here — flagged for a separate ticket since unifying the two point-calculation rules is a distinct architectural question, not part of the crash being fixed.
- **Placeholder scan:** no TBD/"add error handling"/similar found in the steps above; every step has concrete code or an exact command.
- **Type consistency:** `StageCategory` values (`"preliminary"`, `"final"`, `"placement"`, `"custom"`) used identically across Tasks 1, 2, 3, 4, 6, matching the frontend's existing `StageCategory` type. `derive_legacy_stage_category` signature (`str -> str`) consistent everywhere it's called (Tasks 2, 5). `STAGE_CATEGORY` constant (`"stage_category"`) matches the Django field name added in Task 2, used consistently in Task 6.
