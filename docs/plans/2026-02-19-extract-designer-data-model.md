# Extract Designer Data Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract `designer_data` from Gameday model into dedicated GamedayDesignerState model while maintaining API compatibility and zero frontend changes.

**Architecture:** Create new GamedayDesignerState model with OneToOneField to Gameday. Update all code to use the new model directly. Remove old `designer_data` field from Gameday model. Single-phase deployment (no production data exists).

**Tech Stack:** Django 5.2+, Django REST Framework, pytest, MySQL

---

## Implementation Tasks

### Task 1: Create GamedayDesignerState Model

**Files:**
- Modify: `gamedays/models.py` (add new model after Gameday class)
- Test: `gamedays/tests/test_designer_state.py` (new file)

**Step 1: Write the failing test for model creation**

Create `gamedays/tests/test_designer_state.py`:

```python
from django.test import TestCase
from django.contrib.auth.models import User
from gamedays.models import Gameday, GamedayDesignerState


class GamedayDesignerStateModelTests(TestCase):
    def setUp(self):
        self.gameday = Gameday.objects.create(
            name="Test Gameday",
            date="2026-03-01"
        )
        self.user = User.objects.create_user(username="testuser")

    def test_create_designer_state(self):
        """Test creating a designer state for a gameday."""
        state_data = {
            "nodes": [{"id": "1", "type": "game"}],
            "edges": [],
            "globalTeams": []
        }

        designer_state = GamedayDesignerState.objects.create(
            gameday=self.gameday,
            state_data=state_data,
            last_modified_by=self.user
        )

        self.assertEqual(designer_state.gameday, self.gameday)
        self.assertEqual(designer_state.state_data, state_data)
        self.assertEqual(designer_state.last_modified_by, self.user)
        self.assertIsNotNone(designer_state.created_at)
        self.assertIsNotNone(designer_state.updated_at)

    def test_one_to_one_relationship(self):
        """Test that gameday has one-to-one relationship with designer state."""
        state_data = {"nodes": [], "edges": [], "globalTeams": []}

        GamedayDesignerState.objects.create(
            gameday=self.gameday,
            state_data=state_data
        )

        # Access via related_name
        self.assertTrue(hasattr(self.gameday, 'designer_state'))
        self.assertEqual(self.gameday.designer_state.state_data, state_data)
```

**Step 2: Run test to verify it fails**

Run: `pytest gamedays/tests/test_designer_state.py -v`

Expected: FAIL with "ImportError: cannot import name 'GamedayDesignerState'"

**Step 3: Implement GamedayDesignerState model**

In `gamedays/models.py`, add after the Gameday class:

```python
class GamedayDesignerState(models.Model):
    """Visual designer state for draft gamedays."""

    gameday = models.OneToOneField(
        Gameday,
        on_delete=models.CASCADE,
        related_name='designer_state',
        primary_key=True
    )

    state_data = models.JSONField(
        default=dict,
        help_text="React Flow designer state (nodes, edges, teams)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_modified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        db_table = 'gamedays_designer_state'

    def __str__(self):
        return f"Designer state for {self.gameday}"
```

**Step 4: Run test to verify it passes**

Run: `pytest gamedays/tests/test_designer_state.py -v`

Expected: FAIL with "no such table: gamedays_designer_state" (need migration)

**Step 5: Create migration**

Run:
```bash
python manage.py makemigrations gamedays -n gamedaydesignerstate
```

Expected: Creates migration file `gamedays/migrations/00XX_gamedaydesignerstate.py`

**Step 6: Run migration and verify tests pass**

Run:
```bash
MYSQL_HOST=10.185.182.207 MYSQL_DB_NAME=test_db MYSQL_USER=user MYSQL_PWD=user SECRET_KEY=test-secret-key python manage.py migrate
pytest gamedays/tests/test_designer_state.py -v
```

Expected: Both tests PASS

**Step 7: Commit model and tests**

```bash
git add gamedays/models.py gamedays/tests/test_designer_state.py gamedays/migrations/
git commit -m "feat(gamedays): add GamedayDesignerState model

- Add GamedayDesignerState with OneToOneField to Gameday
- Store designer state_data as JSONField
- Track created_at, updated_at, last_modified_by
- Add tests for model creation and one-to-one relationship

Related to Phase 1 of designer_data extraction"
```

---

### Task 2: Add Cascade Delete Test

**Files:**
- Modify: `gamedays/tests/test_designer_state.py` (add test)

**Step 1: Write the failing test for cascade delete**

Add to `gamedays/tests/test_designer_state.py`:

```python
def test_cascade_delete_when_gameday_deleted(self):
    """Test that designer state is deleted when gameday is deleted."""
    state_data = {"nodes": [], "edges": [], "globalTeams": []}

    GamedayDesignerState.objects.create(
        gameday=self.gameday,
        state_data=state_data
    )

    gameday_id = self.gameday.pk
    self.gameday.delete()

    # Designer state should be deleted via CASCADE
    self.assertFalse(
        GamedayDesignerState.objects.filter(gameday_id=gameday_id).exists()
    )
```

**Step 2: Run test to verify it passes**

Run: `pytest gamedays/tests/test_designer_state.py::GamedayDesignerStateModelTests::test_cascade_delete_when_gameday_deleted -v`

Expected: PASS (CASCADE is already configured in model)

**Step 3: Commit test**

```bash
git add gamedays/tests/test_designer_state.py
git commit -m "test(gamedays): add cascade delete test for GamedayDesignerState"
```

---

### Task 3: Add One-to-One Constraint Test

**Files:**
- Modify: `gamedays/tests/test_designer_state.py` (add test)

**Step 1: Write the failing test for one-to-one constraint**

Add to `gamedays/tests/test_designer_state.py`:

```python
from django.db import IntegrityError

def test_one_to_one_constraint_enforcement(self):
    """Test that only one designer state can exist per gameday."""
    state_data = {"nodes": [], "edges": [], "globalTeams": []}

    # Create first designer state
    GamedayDesignerState.objects.create(
        gameday=self.gameday,
        state_data=state_data
    )

    # Attempt to create second designer state for same gameday
    with self.assertRaises(IntegrityError):
        GamedayDesignerState.objects.create(
            gameday=self.gameday,
            state_data={"nodes": [{"id": "2"}]}
        )
```

**Step 2: Run test to verify it passes**

Run: `pytest gamedays/tests/test_designer_state.py::GamedayDesignerStateModelTests::test_one_to_one_constraint_enforcement -v`

Expected: PASS (OneToOneField enforces constraint)

**Step 3: Commit test**

```bash
git add gamedays/tests/test_designer_state.py
git commit -m "test(gamedays): add one-to-one constraint test for GamedayDesignerState"
```

---

### Task 4: Update GamedaySerializer - Read Logic

**Files:**
- Modify: `gamedays/api/serializers.py` (update GamedaySerializer.get_designer_data)
- Test: `gamedays/api/tests/test_designer_state_api.py` (new file)

**Step 1: Write the failing test for reading designer data**

Create `gamedays/api/tests/test_designer_state_api.py`:

```python
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from gamedays.models import Gameday, GamedayDesignerState


class GamedayDesignerStateAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass"
        )
        self.client.force_authenticate(user=self.user)

        self.gameday = Gameday.objects.create(
            name="Test Gameday",
            date="2026-03-01"
        )

    def test_read_designer_data_from_new_model(self):
        """Test reading designer_data from new GamedayDesignerState model."""
        state_data = {
            "nodes": [{"id": "1", "type": "game"}],
            "edges": [{"id": "e1", "source": "1", "target": "2"}],
            "globalTeams": [{"id": "t1", "name": "Team A"}]
        }

        GamedayDesignerState.objects.create(
            gameday=self.gameday,
            state_data=state_data
        )

        response = self.client.get(f'/api/gamedays/{self.gameday.pk}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['designer_data'], state_data)

    def test_read_designer_data_when_none_exists(self):
        """Test reading designer_data returns None when no state exists."""
        response = self.client.get(f'/api/gamedays/{self.gameday.pk}/')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['designer_data'])
```

**Step 2: Run test to verify it fails**

Run: `pytest gamedays/api/tests/test_designer_state_api.py -v`

Expected: FAIL - serializer not updated to read from new model

**Step 3: Update GamedaySerializer.get_designer_data to use new model**

In `gamedays/api/serializers.py`, find `GamedaySerializer` and update the `get_designer_data` method:

```python
def get_designer_data(self, instance):
    """Read from new GamedayDesignerState model."""
    if hasattr(instance, 'designer_state'):
        return instance.designer_state.state_data
    return None
```

**Step 4: Run test to verify it passes**

Run: `pytest gamedays/api/tests/test_designer_state_api.py -v`

Expected: Both tests PASS

**Step 5: Commit serializer read logic**

```bash
git add gamedays/api/serializers.py gamedays/api/tests/test_designer_state_api.py
git commit -m "feat(gamedays): update serializer to read from new designer state model

- Update GamedaySerializer.get_designer_data to read from GamedayDesignerState
- Add API tests for read path and None case

Part of designer_data extraction refactoring"
```

---

### Task 5: Update GamedaySerializer - Write Logic

**Files:**
- Modify: `gamedays/api/serializers.py` (update GamedaySerializer.update)
- Modify: `gamedays/api/tests/test_designer_state_api.py` (add tests)

**Step 1: Write the failing test for write logic**

Add to `gamedays/api/tests/test_designer_state_api.py`:

```python
def test_update_designer_data_creates_new_model(self):
    """Test PATCH creates GamedayDesignerState when it doesn't exist."""
    state_data = {
        "nodes": [{"id": "3", "type": "field"}],
        "edges": [],
        "globalTeams": [{"id": "t2", "name": "Team B"}]
    }

    response = self.client.patch(
        f'/api/gamedays/{self.gameday.pk}/',
        {'designer_data': state_data},
        format='json'
    )

    self.assertEqual(response.status_code, 200)

    # Verify new model was created
    self.gameday.refresh_from_db()
    self.assertTrue(hasattr(self.gameday, 'designer_state'))
    self.assertEqual(self.gameday.designer_state.state_data, state_data)
    self.assertEqual(self.gameday.designer_state.last_modified_by, self.user)

def test_update_designer_data_updates_existing_model(self):
    """Test PATCH updates existing GamedayDesignerState."""
    initial_data = {"nodes": [{"id": "4"}], "edges": [], "globalTeams": []}
    updated_data = {"nodes": [{"id": "5"}], "edges": [], "globalTeams": []}

    # Create initial state
    GamedayDesignerState.objects.create(
        gameday=self.gameday,
        state_data=initial_data
    )

    response = self.client.patch(
        f'/api/gamedays/{self.gameday.pk}/',
        {'designer_data': updated_data},
        format='json'
    )

    self.assertEqual(response.status_code, 200)

    # Verify new model was updated
    self.gameday.refresh_from_db()
    self.gameday.designer_state.refresh_from_db()
    self.assertEqual(self.gameday.designer_state.state_data, updated_data)
    self.assertEqual(self.gameday.designer_state.last_modified_by, self.user)

def test_update_designer_data_with_none_does_nothing(self):
    """Test PATCH without designer_data doesn't create model."""
    response = self.client.patch(
        f'/api/gamedays/{self.gameday.pk}/',
        {'name': 'Updated Name'},  # No designer_data in request
        format='json'
    )

    self.assertEqual(response.status_code, 200)

    # Verify no model was created
    self.assertFalse(hasattr(self.gameday, 'designer_state'))
```

**Step 2: Run test to verify it fails**

Run: `pytest gamedays/api/tests/test_designer_state_api.py::GamedayDesignerStateAPITests::test_update_designer_data_creates_new_model -v`

Expected: FAIL - update method not implemented

**Step 3: Implement write logic in GamedaySerializer.update**

In `gamedays/api/serializers.py`, find or add the `update` method in `GamedaySerializer`:

```python
from gamedays.models import GamedayDesignerState

def update(self, instance, validated_data):
    """Update gameday and create/update designer state."""
    # Check if designer_data is in the request (use initial_data, not validated_data)
    designer_data = self.initial_data.get('designer_data')

    if designer_data is not None:
        # Create or update GamedayDesignerState
        if hasattr(instance, 'designer_state'):
            # Update existing
            state = instance.designer_state
            state.state_data = designer_data
            state.last_modified_by = self.context['request'].user
            state.save()
        else:
            # Create new
            GamedayDesignerState.objects.create(
                gameday=instance,
                state_data=designer_data,
                last_modified_by=self.context['request'].user
            )

    return super().update(instance, validated_data)
```

**Step 4: Run test to verify it passes**

Run: `pytest gamedays/api/tests/test_designer_state_api.py -v`

Expected: All tests PASS (including the 3 new write tests)

**Step 5: Commit write logic**

```bash
git add gamedays/api/serializers.py gamedays/api/tests/test_designer_state_api.py
git commit -m "feat(gamedays): add write logic for designer_data to new model

- Update GamedaySerializer.update to write to GamedayDesignerState
- Create GamedayDesignerState if doesn't exist
- Update existing GamedayDesignerState if exists
- Track last_modified_by user
- Add API tests for create, update, and no-op cases

Part of designer_data extraction refactoring"
```

---

### Task 6: Update publish() Action

**Files:**
- Modify: `gamedays/api/views.py` (update GamedayViewSet.publish)
- Modify: `gamedays/api/tests/test_designer_state_api.py` (add tests)

**Step 1: Write the failing test for publish with new model**

Add to `gamedays/api/tests/test_designer_state_api.py`:

```python
def test_publish_reads_from_new_model(self):
    """Test publish action reads designer_data from new model."""
    state_data = {
        "nodes": [
            {"id": "game1", "type": "game", "data": {"label": "Game 1"}}
        ],
        "edges": [],
        "globalTeams": []
    }

    GamedayDesignerState.objects.create(
        gameday=self.gameday,
        state_data=state_data
    )

    response = self.client.post(f'/api/gamedays/{self.gameday.pk}/publish/')

    # Should succeed (not 400 error about missing designer state)
    self.assertIn(response.status_code, [200, 201])

def test_publish_fails_when_no_designer_data(self):
    """Test publish action fails when no designer_data exists."""
    response = self.client.post(f'/api/gamedays/{self.gameday.pk}/publish/')

    self.assertEqual(response.status_code, 400)
    self.assertIn('No designer state found', response.data['detail'])
```

**Step 2: Run test to verify it fails**

Run: `pytest gamedays/api/tests/test_designer_state_api.py::GamedayDesignerStateAPITests::test_publish_reads_from_new_model -v`

Expected: FAIL - publish() not updated to read from new model

**Step 3: Update publish() action to use new model**

In `gamedays/api/views.py`, find `GamedayViewSet.publish()` method and update it:

```python
@action(detail=True, methods=["post"])
def publish(self, request, pk=None):
    gameday = self.get_object()

    # Read from new model
    if not hasattr(gameday, 'designer_state'):
        return Response(
            {"detail": "No designer state found for this gameday."},
            status=status.HTTP_400_BAD_REQUEST
        )

    designer_data = gameday.designer_state.state_data

    if not designer_data:
        return Response(
            {"detail": "No designer state found for this gameday."},
            status=status.HTTP_400_BAD_REQUEST
        )

    nodes = designer_data.get("nodes", [])

    # ... rest of publish logic unchanged ...

    # ... return response ...
```

**Step 4: Run test to verify it passes**

Run: `pytest gamedays/api/tests/test_designer_state_api.py -v`

Expected: All tests PASS (including 2 new publish tests)

**Step 5: Commit publish action update**

```bash
git add gamedays/api/views.py gamedays/api/tests/test_designer_state_api.py
git commit -m "feat(gamedays): update publish() to read from new designer state model

- Read designer_data from GamedayDesignerState
- Add API tests for success and error cases

Part of designer_data extraction refactoring"
```

---

### Task 7: Update GamedayService

**Files:**
- Modify: `gamedays/service/gameday_service.py` (update get_resolved_designer_data)
- Modify: `gamedays/tests/test_designer_state.py` (add service tests)

**Step 1: Write the failing test for service layer**

Add to `gamedays/tests/test_designer_state.py`:

```python
from gamedays.service.gameday_service import GamedayService

class GamedayServiceDesignerDataTests(TestCase):
    def setUp(self):
        self.gameday = Gameday.objects.create(
            name="Test Gameday",
            date="2026-03-01"
        )

    def test_get_resolved_designer_data_from_new_model(self):
        """Test service reads from new model."""
        state_data = {
            "nodes": [{"id": "n1", "type": "game"}],
            "edges": [{"id": "e1"}],
            "globalTeams": []
        }

        GamedayDesignerState.objects.create(
            gameday=self.gameday,
            state_data=state_data
        )

        service = GamedayService.create(self.gameday.pk)
        result = service.get_resolved_designer_data()

        self.assertEqual(result['nodes'], state_data['nodes'])
        self.assertEqual(result['edges'], state_data['edges'])

    def test_get_resolved_designer_data_returns_empty_when_none(self):
        """Test service returns empty structure when no data exists."""
        service = GamedayService.create(self.gameday.pk)
        result = service.get_resolved_designer_data()

        self.assertEqual(result, {"nodes": [], "edges": []})
```

**Step 2: Run test to verify it fails**

Run: `pytest gamedays/tests/test_designer_state.py::GamedayServiceDesignerDataTests -v`

Expected: FAIL - service not updated to read from new model

**Step 3: Update GamedayService.get_resolved_designer_data to use new model**

In `gamedays/service/gameday_service.py`, find `get_resolved_designer_data()` method:

```python
def get_resolved_designer_data(self, gameday_pk=None):
    """Get resolved designer data from GamedayDesignerState."""
    try:
        gameday = self.gameday if not gameday_pk else Gameday.objects.get(pk=gameday_pk)

        # Read from new model
        if not hasattr(gameday, 'designer_state'):
            return {"nodes": [], "edges": []}

        data = gameday.designer_state.state_data

        if not data:
            return {"nodes": [], "edges": []}

        # ... resolution logic unchanged (process data) ...

        return data
    except Gameday.DoesNotExist:
        return {"nodes": [], "edges": []}
```

**Step 4: Run test to verify it passes**

Run: `pytest gamedays/tests/test_designer_state.py::GamedayServiceDesignerDataTests -v`

Expected: Both tests PASS

**Step 5: Commit service layer update**

```bash
git add gamedays/service/gameday_service.py gamedays/tests/test_designer_state.py
git commit -m "feat(gamedays): update service to read from new designer state model

- Update get_resolved_designer_data to read from GamedayDesignerState
- Add service layer tests for read path and empty case

Part of designer_data extraction refactoring"
```

---

### Task 8: Run Full Test Suite

**Files:**
- None (verification step)

**Step 1: Run complete backend test suite**

Run:
```bash
MYSQL_HOST=10.185.182.207 \
MYSQL_DB_NAME=test_db \
MYSQL_USER=user \
MYSQL_PWD=user \
SECRET_KEY=test-secret-key \
pytest -v
```

Expected: All tests PASS (except 7 Moodle API tests which require credentials)

**Step 2: Verify test count**

Expected test count: ~302 passing tests + 7 new tests for GamedayDesignerState = ~309 passing

**Step 3: If failures, debug and fix**

If any tests fail, investigate and fix before proceeding. Common issues:
- Missing imports in serializers/views
- Incorrect field names
- Missing migration

**Step 4: Commit any fixes**

```bash
git add <fixed-files>
git commit -m "fix(gamedays): resolve test failures for designer_data extraction"
```

---

### Task 9: Manual Verification

**Files:**
- None (manual verification)

**Step 1: Start development server**

Run:
```bash
MYSQL_HOST=10.185.182.207 \
MYSQL_DB_NAME=test_db \
MYSQL_USER=user \
MYSQL_PWD=user \
SECRET_KEY=test-secret-key \
python manage.py runserver --insecure
```

**Step 2: Test API endpoints manually**

Using curl or Postman:

1. Create a gameday with designer_data:
```bash
curl -X POST http://localhost:8000/api/gamedays/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Manual Test", "date": "2026-03-15", "designer_data": {"nodes": [], "edges": [], "globalTeams": []}}'
```

2. Verify dual-write by checking database:
```sql
SELECT id, name, designer_data FROM gamedays_gameday WHERE name = 'Manual Test';
SELECT gameday_id, state_data FROM gamedays_designer_state;
```

Both should contain the same data.

3. Update designer_data:
```bash
curl -X PATCH http://localhost:8000/api/gamedays/{id}/ \
  -H "Content-Type: application/json" \
  -d '{"designer_data": {"nodes": [{"id": "1"}], "edges": [], "globalTeams": []}}'
```

4. Verify both storage locations updated.

**Step 3: Document verification results**

Create verification notes in commit message for next step.

---

### Task 10: Remove Old designer_data Field

**Files:**
- Modify: `gamedays/models.py` (remove designer_data field from Gameday)
- Create: Migration to remove field

**Step 1: Verify all code uses new model**

Run:
```bash
# Search for any remaining references to old field
grep -r "designer_data" gamedays/ --exclude-dir=migrations --exclude-dir=__pycache__
```

Expected: Should only find references in test files and model definition

**Step 2: Remove designer_data field from Gameday model**

In `gamedays/models.py`, find and remove the `designer_data` field:

```python
class Gameday(models.Model):
    # ... other fields ...
    # designer_data = models.JSONField(null=True, blank=True)  # DELETE THIS LINE
```

**Step 3: Create migration to remove field**

Run:
```bash
python manage.py makemigrations gamedays -n remove_designer_data
```

Expected: Creates migration file removing `designer_data` field

**Step 4: Run migration and verify tests pass**

Run:
```bash
MYSQL_HOST=10.185.182.207 \
MYSQL_DB_NAME=test_db \
MYSQL_USER=user \
MYSQL_PWD=user \
SECRET_KEY=test-secret-key \
python manage.py migrate

pytest gamedays/tests/ -v
```

Expected: Migration runs successfully, all tests pass

**Step 5: Commit field removal**

```bash
git add gamedays/models.py gamedays/migrations/
git commit -m "refactor(gamedays): remove old designer_data field from Gameday

- Remove designer_data JSONField from Gameday model
- Add migration to remove field from database
- All code now uses GamedayDesignerState model

Completes designer_data extraction refactoring"
```

---

### Task 11: Update Documentation

**Files:**
- Create: `docs/architecture/designer-data-extraction.md`

**Step 1: Create architecture documentation**

Create `docs/architecture/designer-data-extraction.md`:

```markdown
# Designer Data Extraction

## Overview

Extracted `designer_data` from `Gameday` model into dedicated `GamedayDesignerState` model for better separation of concerns.

## Architecture

### Models

**GamedayDesignerState**
- OneToOneField to Gameday (CASCADE delete)
- JSONField `state_data` for React Flow designer state
- Audit fields: `created_at`, `updated_at`, `last_modified_by`

**Why Separate Model?**
- Isolates draft/visual state from core game day data
- Enforces one-to-one relationship at database level
- Enables audit trail (who modified, when)
- Cleaner domain separation

### Data Flow

**Write Path:**
- API receives PATCH with `designer_data`
- Serializer creates/updates GamedayDesignerState
- Tracks last_modified_by user

**Read Path:**
- Serializer reads from `gameday.designer_state.state_data`
- Returns None if no designer state exists

### Components Updated

1. **gamedays/models.py**
   - Added `GamedayDesignerState` model
   - Removed `designer_data` field from Gameday

2. **gamedays/api/serializers.py** - GamedaySerializer
   - `get_designer_data()`: Read from new model
   - `update()`: Create/update new model

3. **gamedays/api/views.py** - GamedayViewSet
   - `publish()`: Read from new model

4. **gamedays/service/gameday_service.py**
   - `get_resolved_designer_data()`: Read from new model

## API Compatibility

**Zero frontend changes required.** API contract unchanged:
- GET `/api/gamedays/{id}/` returns `designer_data` field
- PATCH `/api/gamedays/{id}/` accepts `designer_data` field
- POST `/api/gamedays/{id}/publish/` uses designer data

## Testing

- Unit tests: `gamedays/tests/test_designer_state.py`
- API tests: `gamedays/api/tests/test_designer_state_api.py`
- Full coverage of model, serializer, views, and service layer
```

**Step 2: Commit documentation**

```bash
git add docs/architecture/designer-data-extraction.md
git commit -m "docs: add designer data extraction architecture documentation"
```

---

### Task 12: Final Verification and Code Review

**Files:**
- None (verification)

**Step 1: Run full test suite one final time**

Run:
```bash
MYSQL_HOST=10.185.182.207 \
MYSQL_DB_NAME=test_db \
MYSQL_USER=user \
MYSQL_PWD=user \
SECRET_KEY=test-secret-key \
pytest --cov=gamedays --cov-report=term-missing -v
```

Expected: All tests pass with good coverage on modified files

**Step 2: Check code formatting**

Run:
```bash
black gamedays/
```

Expected: "All done! ✨"

**Step 3: Review changes**

Run:
```bash
git log --oneline --graph
git diff origin/master
```

Verify:
- All commits follow conventional commit format
- No debug code or print statements
- No commented-out code
- Clean diff
- Old `designer_data` field removed from Gameday model

**Step 4: Push feature branch**

```bash
git push -u origin feature/extract-designer-data-model
```

---

## Implementation Complete ✅

**What was accomplished:**
- ✅ Created GamedayDesignerState model with OneToOneField to Gameday
- ✅ Added migrations (create model, remove old field)
- ✅ Updated serializer to read/write new model
- ✅ Updated views to read from new model
- ✅ Updated service layer to read from new model
- ✅ Removed old `designer_data` field from Gameday
- ✅ Comprehensive test coverage (model, API, service)
- ✅ Documentation

**Next Steps:**
1. Create PR and get code review
2. Deploy to production
3. Run migrations

**API Compatibility:** ✅ Zero frontend changes required. API contract unchanged.

**Deployment:** ✅ Single-phase deployment. No production data to migrate.
