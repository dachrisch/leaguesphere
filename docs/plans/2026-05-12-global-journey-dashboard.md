# Global Journey Dashboard Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the Journey Dashboard to show system-global adoption statistics across all users, with a reordered UI featuring feature-adoption cards, top actions, and a raw JSON event feed.

**Architecture:** 
- **Backend:** Update Django Rest Framework views to aggregate events globally (across all users) instead of per-session. Add a specific adoption metrics endpoint.
- **Frontend:** Refactor React components to use global data. Reorder the main layout to prioritize high-level adoption metrics, followed by recent top actions, and finally a raw JSON event feed.

**Tech Stack:** Django (DRF), React (TypeScript), CSS (Vanilla).

---

### Task 1: Backend Global Aggregation

**Files:**
- Modify: `journey/views.py`

**Step 1: Update `stats` action to be global**
Remove the user filter from the `stats` action to aggregate across all system events.

**Step 2: Add `adoption` action for global metrics**
Implement a new action that returns adoption metrics for multiple features (Gameday Designer, Passcheck, Scorecard).

**Step 3: Update `get_queryset` for global events**
Allow fetching events without journey filtering for the raw feed (restricted to staff).

### Task 2: Frontend Type and API Updates

**Files:**
- Modify: `journey_dashboard/src/types.ts`
- Modify: `journey_dashboard/src/utils/api.ts`

**Step 1: Update `types.ts`**
Add interfaces for `FeatureAdoptionData` and `GlobalAdoptionResponse`.

**Step 2: Update `utils/api.ts`**
Add `fetchGlobalAdoption` and update `fetchEvents` to support global fetching.

### Task 3: Feature Adoption Cards

**Files:**
- Modify: `journey_dashboard/src/components/AdoptionMetrics.tsx`

**Step 1: Refactor to display multi-feature cards**
Instead of just Gameday Designer, show one card per major feature (Gameday, Passcheck, Scorecard).

### Task 4: Global Event Feed

**Files:**
- Modify: `journey_dashboard/src/components/UserTimeline.tsx` (or refactor to `GlobalEventFeed.tsx`)

**Step 1: Refactor to raw JSON feed**
Remove filters and session selectors. Show a chronological list of events with raw JSON metadata.

### Task 5: Main Dashboard Assembly

**Files:**
- Modify: `journey_dashboard/src/App.tsx`

**Step 1: Reorder layout**
1. Feature Adoption Cards
2. Top Actions (7 Days)
3. Global Event Feed

**Step 2: Remove session loading logic**
Simplify the app state as everything is now global.

### Task 6: Verification and Polish

**Step 1: Run Backend Tests**
Run: `pytest journey/tests.py`

**Step 2: Run Frontend Build**
Run: `npm run build` in `journey_dashboard/`

**Step 3: Verify UI in browser**
Check the layout order and data correctness.
