# Gameday Designer Feature Adoption Tracking

**Date:** 2026-05-06  
**Author:** Claude Code  
**Status:** Draft  
**Scope:** Add tiered event tracking to gameday_designer and integrate adoption metrics into journey_dashboard

---

## Overview

This spec defines a tiered event tracking system to measure feature adoption of the gameday designer. The system will track user journeys from opening the designer through creating, editing, and publishing gamedays, with special attention to advanced feature usage (templates, import/export, global teams, officials).

Data will be visualized in the journey_dashboard with mixed event timelines and funnel analysis to show adoption patterns and conversion rates.

---

## Event Taxonomy

### Basic Level
Events that indicate entry into the gameday designer.

| Event | Trigger | Metadata |
|-------|---------|----------|
| `gameday_designer_opened` | User navigates to `/gameday/<id>` | `gameday_id`, `session_id` |

### Core Level
Events that represent key user actions in the designer.

| Event | Trigger | Metadata |
|-------|---------|----------|
| `gameday_created` | User clicks "Create New Gameday" button | `gameday_id`, `gameday_name` |
| `gameday_published` | User confirms publish in PublishConfirmationModal | `gameday_id`, `game_count`, `stage_count` |
| `gameday_edited` | User makes structural changes (add/remove/modify game, stage, or field) | `gameday_id`, `edit_type` (e.g., "game_added", "stage_deleted", "team_assigned"), `element_id` |

### Advanced Level
Events that indicate adoption of premium/complex features.

| Event | Trigger | Metadata |
|-------|---------|----------|
| `template_library_opened` | User clicks "Use Template" or opens TemplateLibraryModal | `gameday_id` |
| `template_used` | User applies a template to gameday | `gameday_id`, `template_name`, `template_id` |
| `import_executed` | User imports gameday from file via handleImport | `gameday_id`, `import_source` (e.g., "file", "clipboard") |
| `export_executed` | User exports gameday via handleExport | `gameday_id`, `export_format` (e.g., "json") |
| `global_team_added` | User creates a global team via handleAddGlobalTeam | `gameday_id`, `team_name` |
| `officials_group_added` | User creates an officials group via handleAddOfficialsGroup | `gameday_id`, `group_name` |

---

## Frontend Instrumentation

### Locations for trackEvent Calls

**ListDesignerApp.tsx (main component)**
- **useEffect on mount:** Track `gameday_designer_opened` with gameday_id
- **Create handler:** Track `gameday_created` when new gameday created
- **Publish handler (PublishConfirmationModal):** Track `gameday_published` with game/stage counts

**useDesignerController.ts (handlers)**
- **handleUpdateNode:** Track `gameday_edited` with edit_type (e.g., "game_modified")
- **handleAddGlobalTeam:** Track `global_team_added` with team_name
- **handleAddOfficialsGroup:** Track `officials_group_added` with group_name
- **handleImport:** Track `import_executed` with import_source
- **handleExport:** Track `export_executed` with export_format

**TemplateLibraryModal.tsx**
- **Modal open:** Track `template_library_opened`
- **Apply template:** Track `template_used` with template_name and template_id

---

## Backend: No Changes Required

The existing `/api/journey/events/` endpoint and Journey/JourneyEvent models already handle event storage. No backend modifications needed — frontend just calls existing `trackEvent()` function.

---

## Dashboard Integration

### Journey Dashboard Enhancement

Extend `journey_dashboard` to display gameday designer adoption:

**1. Event Timeline Filter**
- Add toggle/dropdown to filter by feature: "All", "Gameday Designer", "Passcheck", "Scorecard"
- When "Gameday Designer" selected, show only `gameday_*` and `template_*` events

**2. Funnel View**
- New visualization component: `GamedayFunnel.tsx`
- Show conversion flow:
  ```
  gameday_designer_opened (100%)
    ├─ gameday_created (X%)
    │   ├─ gameday_edited (Y%)
    │   │   └─ gameday_published (Z%)
    │   └─ gameday_published (without edit)
    └─ (no action - dropped)
  ```
- Include advanced feature adoption as side branches:
  - template_library_opened → template_used → gameday_published
  - import_executed → gameday_published

**3. Adoption Metrics Card**
- Display summary stats:
  - "Designer Opens: X unique users"
  - "Publish Rate: Y% (published / opened)"
  - "Template Adoption: Z% (template_used / opened)"

---

## Data Flow

```
User Action in Gameday Designer
    ↓
trackEvent() called with event_name + metadata
    ↓
POST /api/journey/events/ (via existing endpoint)
    ↓
Django stores in JourneyEvent model
    ↓
Journey Dashboard queries and visualizes
    ↓
User sees adoption metrics and funnel
```

---

## Success Criteria

- ✅ All 10 event types fire correctly when their triggers occur
- ✅ Event metadata is logged (gameday_id, edit_type, template_name, etc.)
- ✅ Journey Dashboard displays filtered event timeline for gameday designer
- ✅ Funnel visualization shows conversion rates (opened → created → published)
- ✅ Adoption metrics card displays meaningful summary stats
- ✅ Tests verify events are tracked and can be queried from JourneyEvent model

---

## Scope Notes

- **Out of scope:** Real-time analytics, event deduplication logic, event sampling/filtering
- **Out of scope:** Mobile-specific tracking (assumes desktop editor usage)
- **Future:** More granular funnel stages, heatmaps of feature usage, A/B testing integration

---

## Files to Modify

### Frontend (gameday_designer)
- `src/components/ListDesignerApp.tsx` — add basic & core event tracking
- `src/hooks/useDesignerController.ts` — add advanced feature tracking
- `src/modals/TemplateLibraryModal.tsx` — add template tracking

### Dashboard (journey_dashboard)
- `src/components/UserTimeline.tsx` (or new file) — add gameday designer event filter
- `src/components/GamedayFunnel.tsx` — new component for funnel visualization
- `src/components/AdoptionMetrics.tsx` — new component for summary stats
- `src/utils/api.ts` — add helper to query gameday designer events

### Tests
- `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx` — verify events fire
- `journey_dashboard/src/__tests__/GamedayFunnel.test.tsx` — test funnel calculations
- Backend: `journey/tests.py` — add test to verify event persistence

---

## Implementation Order

1. **Phase 1:** Instrument gameday_designer with trackEvent calls (basic + core)
2. **Phase 2:** Instrument advanced features (templates, import/export, global teams)
3. **Phase 3:** Build journey dashboard components (timeline filter, funnel, metrics)
4. **Phase 4:** Integration testing and dashboard verification
