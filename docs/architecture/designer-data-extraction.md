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
