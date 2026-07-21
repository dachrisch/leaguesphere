# Gameday Designer Tour A cross-page redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the onboarding "Tour A" (manual build) start point from the designer page to the dashboard, walk the user through actually creating a gameday, then continue on the designer page through metadata → team pool → fields → publish, with resume support if the user leaves mid-tour.

**Architecture:** Two coordinated, page-local `react-joyride` (via the existing `DesignerTour` wrapper) instances — one on `GamedayDashboard`, one on `ListDesignerApp` — linked by the existing `useTourSeen('manual_build')` hook (seen/unseen) and a new `localStorage['gd_tour_manual_build_gameday_id']` key (which gameday the in-progress tour belongs to, for resume).

**Tech Stack:** React 19, TypeScript, react-joyride 3.2.0, Vitest + Testing Library, i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-20-gameday-designer-onboarding-tour-cross-page-design.md` (read this first — it has the full rationale for every decision below, including three corrections found during planning: the resume check must call `gamedayApi.getGameday`, not check the `has_designer_state`-filtered dashboard list; the Team Pool step must target the header "Add Group" button in `MetadataTeamPoolRow.tsx`, not the per-group button that doesn't exist on a brand-new gameday; the Fields step must use `[data-testid="add-field-button"]`, not `#add-field-button`, which has never matched anything).
- All new tour step targets use `[data-testid="..."]` attribute selectors — never a bare `#id` selector (see spec's Fields-step note on why).
- All new user-facing copy goes through `useTypedTranslation` with both `de` and `en` entries in `src/i18n/locales/{de,en}/ui.json` — matching every other string in this app.
- `npm run eslint` must be clean and `npm run build` must succeed after every task (this repo's CI blocks merge on lint errors).
- Run all commands from the `gameday_designer/` directory.

---

### Task 1: `DesignerTour` — add `requireRealAction` prop

**Files:**
- Modify: `gameday_designer/src/onboarding/DesignerTour.tsx`
- Test: `gameday_designer/src/onboarding/__tests__/DesignerTour.test.tsx`

**Interfaces:**
- Produces: `DesignerTourProps.requireRealAction?: boolean` (default `false`). When `true`, the underlying `<Joyride>`'s `options.buttons` omits `'primary'` (the Next/Last control), leaving only `'back'`, `'close'`, `'skip'`. When `false`/omitted, behavior is unchanged from today (`['back', 'close', 'skip', 'primary']`).

- [ ] **Step 1: Write the failing test**

Extend the `react-joyride` mock in the test file to also capture the `options` prop, and add a new test asserting `requireRealAction` removes `'primary'`.

Replace the top of `gameday_designer/src/onboarding/__tests__/DesignerTour.test.tsx` (imports through the mock declaration) with:

```tsx
import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DesignerTour from '../DesignerTour';
import { trackEvent } from '../../trackEvent';

vi.mock('../../trackEvent', () => ({ trackEvent: vi.fn() }));

let capturedCallback: ((data: unknown) => void) | undefined;
let capturedOptions: { buttons?: string[] } | undefined;

vi.mock('react-joyride', () => ({
  __esModule: true,
  Joyride: (props: { onEvent: (data: unknown) => void; options?: { buttons?: string[] } }) => {
    capturedCallback = props.onEvent;
    capturedOptions = props.options;
    return null;
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' },
}));

describe('DesignerTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = undefined;
    capturedOptions = undefined;
  });
```

Add this new test inside the `describe('DesignerTour', ...)` block, after the existing three `it(...)` blocks (before the closing `});` of the `describe`):

```tsx
  it('omits the primary (Next) button when requireRealAction is true', () => {
    render(
      <DesignerTour
        tourId="manual_build"
        steps={[{ target: '[data-testid="create-gameday-button"]', content: 'Create one' }]}
        run={true}
        onFinish={() => {}}
        requireRealAction
      />
    );

    expect(capturedOptions?.buttons).toEqual(['back', 'close', 'skip']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/onboarding/__tests__/DesignerTour.test.tsx`
Expected: FAIL — `capturedOptions?.buttons` is `['back', 'close', 'skip', 'primary']` (the `requireRealAction` prop doesn't exist yet, so it has no effect), not `['back', 'close', 'skip']`.

- [ ] **Step 3: Implement `requireRealAction`**

Replace the full contents of `gameday_designer/src/onboarding/DesignerTour.tsx` with:

```tsx
import { useCallback } from 'react';
import { EventData, Joyride, STATUS, Step } from 'react-joyride';
import { trackEvent } from '../trackEvent';

interface DesignerTourProps {
  tourId: string;
  steps: Step[];
  run: boolean;
  onFinish: () => void;
  requireRealAction?: boolean;
}

function DesignerTour({ tourId, steps, run, onFinish, requireRealAction = false }: DesignerTourProps) {
  const handleJoyrideEvent = useCallback(
    (data: EventData) => {
      const { status, type, index } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        const eventName =
          status === STATUS.FINISHED
            ? `gd_tour_${tourId}_completed`
            : `gd_tour_${tourId}_skipped`;
        trackEvent(eventName, { step_index: index });
        onFinish();
        return;
      }

      if (type === 'step:after') {
        trackEvent(`gd_tour_${tourId}_step_completed`, {
          step_id: steps[index]?.target ?? '',
          step_index: index,
        });
      }
    },
    [tourId, steps, onFinish]
  );

  return (
    <Joyride
      steps={steps}
      run={run}
      onEvent={handleJoyrideEvent}
      continuous
      options={{
        buttons: requireRealAction ? ['back', 'close', 'skip'] : ['back', 'close', 'skip', 'primary'],
        showProgress: true,
      }}
      locale={{
        back: 'Zurück',
        next: 'Weiter',
        nextWithProgress: 'Weiter ({current} von {total})',
        skip: 'Überspringen',
        last: 'Fertig',
      }}
    />
  );
}

export default DesignerTour;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/onboarding/__tests__/DesignerTour.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/DesignerTour.tsx src/onboarding/__tests__/DesignerTour.test.tsx
git commit -m "feat(gameday_designer): add requireRealAction to DesignerTour"
```

---

### Task 2: Consolidate `ListDesignerApp`'s designer-page tour to 4 steps

**Files:**
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx`
- Modify: `gameday_designer/src/components/MetadataTeamPoolRow.tsx`
- Modify: `gameday_designer/src/i18n/locales/en/ui.json`
- Modify: `gameday_designer/src/i18n/locales/de/ui.json`
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp-tour.test.tsx` (new)

**Interfaces:**
- Consumes: `DesignerTour` (unchanged public interface from Task 1 — `requireRealAction` not used here).
- Produces: `tourASteps` — 4 entries, targets `[data-testid="gameday-metadata-header"]`, `[data-testid="add-team-group-button"]`, `[data-testid="add-field-button"]`, `[data-testid="publish-schedule-button"]`, in that order. `handleTourAFinish` now also clears `localStorage['gd_tour_manual_build_gameday_id']` (the key Task 3 writes).

- [ ] **Step 1: Add the new `data-testid` the Team Pool step needs**

In `gameday_designer/src/components/MetadataTeamPoolRow.tsx`, find this block (the always-rendered header "Add Group" button — not the conditional empty-state one in `GlobalTeamTable.tsx`):

```tsx
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={handleAddGroupHeader}
                  className="btn-adaptive"
                  title={t('ui:tooltip.addGroup')}
                >
```

Replace with:

```tsx
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={handleAddGroupHeader}
                  className="btn-adaptive"
                  title={t('ui:tooltip.addGroup')}
                  data-testid="add-team-group-button"
                >
```

- [ ] **Step 2: Write the failing test**

Create `gameday_designer/src/components/__tests__/ListDesignerApp-tour.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import ListDesignerApp from '../ListDesignerApp';
import { useDesignerController } from '../../hooks/useDesignerController';
import { useFlowState } from '../../hooks/useFlowState';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GamedayProvider } from '../../context/GamedayContext';
import i18n from '../../i18n/testConfig';
import type { Step } from 'react-joyride';

vi.mock('../../hooks/useDesignerController', () => ({
  useDesignerController: vi.fn(),
}));

vi.mock('../../hooks/useFlowState', () => ({
  useFlowState: vi.fn(),
}));

vi.mock('../../api/gamedayApi', () => ({
  gamedayApi: {
    getGameday: vi.fn().mockResolvedValue({}),
    getGamedayGames: vi.fn().mockResolvedValue([]),
    updateGameResult: vi.fn().mockResolvedValue({}),
    updateGameResultDetail: vi.fn().mockResolvedValue({}),
    listSeasons: vi.fn().mockResolvedValue([]),
    listLeagues: vi.fn().mockResolvedValue([]),
    getDesignerState: vi.fn().mockResolvedValue({ state_data: null }),
    updateDesignerState: vi.fn().mockResolvedValue({}),
    getTemplates: vi.fn().mockResolvedValue([]),
    saveTemplate: vi.fn(),
    publish: vi.fn().mockResolvedValue({}),
    patchGameday: vi.fn().mockResolvedValue({}),
    deleteGameday: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../trackEvent', () => ({
  trackEvent: vi.fn(),
}));

const capturedProps: Record<string, { steps: Step[]; onFinish: () => void }> = {};
vi.mock('../../onboarding/DesignerTour', () => ({
  default: (props: { tourId: string; steps: Step[]; onFinish: () => void }) => {
    capturedProps[props.tourId] = { steps: props.steps, onFinish: props.onFinish };
    return null;
  },
}));

const defaultFlowState = {
  nodes: [],
  edges: [],
  fields: [],
  globalTeams: [],
  globalTeamGroups: [],
  metadata: null,
  saveTrigger: 0,
  canUndo: false,
  canRedo: false,
  stats: { fieldCount: 0, gameCount: 0, teamCount: 0 },
  exportState: vi.fn().mockReturnValue({ nodes: [], edges: [], fields: [], globalTeams: [], globalTeamGroups: [] }),
  importState: vi.fn(),
};

const defaultMockReturn = {
  metadata: {
    id: 1,
    name: 'Test Gameday',
    date: '2026-05-01',
    start: '10:00',
    format: '6_2',
    author: 1,
    address: 'Test Field',
    season: 1,
    league: 1,
    status: 'DRAFT',
  },
  ui: {
    highlightedElement: null,
    expandedFieldIds: new Set<string>(),
    expandedStageIds: new Set<string>(),
    showTournamentModal: false,
    canExport: true,
    hasData: true,
    isLoading: false,
    notifications: [],
  },
  validation: { isValid: true, errors: [], warnings: [], issueCount: 0 },
  flowState: {
    nodes: [],
    edges: [],
    fields: [],
    globalTeams: [],
    globalTeamGroups: [],
    exportState: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
  },
  handlers: {
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue({}),
    dismissNotification: vi.fn(),
    addNotification: vi.fn(),
  },
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
  stats: { gameCount: 0, teamCount: 0, fieldCount: 0 },
};

describe('ListDesignerApp tour', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    for (const key of Object.keys(capturedProps)) delete capturedProps[key];
    localStorage.clear();
    (useFlowState as Mock).mockReturnValue(defaultFlowState);
    (useDesignerController as Mock).mockReturnValue(defaultMockReturn);
  });

  const renderApp = () =>
    render(
      <GamedayProvider>
        <MemoryRouter initialEntries={['/designer/1']}>
          <Routes>
            <Route path="/designer/:id" element={<ListDesignerApp />} />
          </Routes>
        </MemoryRouter>
      </GamedayProvider>
    );

  it('passes the 4 consolidated steps, in order, to the manual_build tour', () => {
    renderApp();
    const steps = capturedProps.manual_build.steps;
    expect(steps.map((s) => s.target)).toEqual([
      '[data-testid="gameday-metadata-header"]',
      '[data-testid="add-team-group-button"]',
      '[data-testid="add-field-button"]',
      '[data-testid="publish-schedule-button"]',
    ]);
  });

  it('clears the resume localStorage key when the manual_build tour finishes', () => {
    localStorage.setItem('gd_tour_manual_build_gameday_id', '1');
    renderApp();
    capturedProps.manual_build.onFinish();
    expect(localStorage.getItem('gd_tour_manual_build_gameday_id')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ListDesignerApp-tour.test.tsx`
Expected: FAIL — the first test fails because `tourASteps` still has 5 old targets; the second fails because `handleTourAFinish` doesn't touch `localStorage` yet.

- [ ] **Step 4: Implement the consolidated steps and resume-key clearing**

In `gameday_designer/src/components/ListDesignerApp.tsx`, replace:

```tsx
  const handleTourAFinish = useCallback(() => {
    markTourASeen();
  }, [markTourASeen]);
```

with:

```tsx
  const handleTourAFinish = useCallback(() => {
    markTourASeen();
    localStorage.removeItem('gd_tour_manual_build_gameday_id');
  }, [markTourASeen]);
```

Replace:

```tsx
  const tourASteps = [
    { target: '#add-field-button', content: t('ui:tour.manual_build.add_field'), placement: 'bottom' as const },
    { target: '[data-testid="add-stage-button"]', content: t('ui:tour.manual_build.add_stage'), placement: 'bottom' as const },
    { target: '[data-testid="add-team-button"]', content: t('ui:tour.manual_build.add_team'), placement: 'right' as const },
    { target: '[data-testid="add-game-button"]', content: t('ui:tour.manual_build.add_game'), placement: 'bottom' as const },
    { target: '[data-testid="flow-toolbar"]', content: t('ui:tour.manual_build.toolbar'), placement: 'bottom' as const },
  ];
```

with:

```tsx
  const tourASteps = [
    { target: '[data-testid="gameday-metadata-header"]', content: t('ui:tour.manual_build.metadata'), placement: 'bottom' as const },
    { target: '[data-testid="add-team-group-button"]', content: t('ui:tour.manual_build.team_pool'), placement: 'left' as const },
    { target: '[data-testid="add-field-button"]', content: t('ui:tour.manual_build.fields'), placement: 'bottom' as const },
    { target: '[data-testid="publish-schedule-button"]', content: t('ui:tour.manual_build.publish'), placement: 'left' as const },
  ];
```

- [ ] **Step 5: Update translation copy**

In `gameday_designer/src/i18n/locales/en/ui.json`, replace:

```json
    "manual_build": {
      "add_field": "Click here to add a playing field where games will be scheduled.",
      "add_stage": "Add a stage within the field to organize games into rounds or groups.",
      "add_team": "Build your team pool — these are the teams that will be assigned to games.",
      "add_game": "Add a game to this stage. You can connect teams or use placeholders for later.",
      "toolbar": "Use these tools to import/export your schedule, undo/redo changes, and publish the gameday."
    },
```

with:

```json
    "manual_build": {
      "metadata": "Give your gameday a name, date, and league — you can always change these later.",
      "team_pool": "Add the teams that will play. Create a group, then add each team to it.",
      "fields": "Add a field, then add stages and games inside it to build out your schedule.",
      "publish": "Once your schedule is ready, publish it to make it visible to teams and officials."
    },
```

In `gameday_designer/src/i18n/locales/de/ui.json`, replace:

```json
    "manual_build": {
      "add_field": "Klicke hier, um ein Spielfeld hinzuzufügen, auf dem Spiele geplant werden.",
      "add_stage": "Füge eine Phase innerhalb des Feldes hinzu, um Spiele in Runden oder Gruppen zu organisieren.",
      "add_team": "Erstelle deinen Team-Pool — diese Teams werden den Spielen zugeordnet.",
      "add_game": "Füge ein Spiel zu dieser Phase hinzu. Du kannst Teams verbinden oder Platzhalter für später verwenden.",
      "toolbar": "Nutze diese Tools, um deinen Spielplan zu importieren/exportieren, Änderungen rückgängig zu machen und den Spieltag zu veröffentlichen."
    },
```

with:

```json
    "manual_build": {
      "metadata": "Gib deinem Spieltag einen Namen, ein Datum und eine Liga — du kannst das später jederzeit ändern.",
      "team_pool": "Füge die teilnehmenden Teams hinzu. Erstelle eine Gruppe und füge ihr die Teams hinzu.",
      "fields": "Füge ein Spielfeld hinzu und darin Phasen und Spiele, um deinen Spielplan aufzubauen.",
      "publish": "Wenn dein Spielplan fertig ist, veröffentliche ihn, damit Teams und Offizielle ihn sehen können."
    },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ListDesignerApp-tour.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no existing test asserts on the old `tourASteps` targets or the old translation keys (verified during planning; only `DesignerTour.test.tsx` and `useTourSeen.test.ts` reference tour internals, and neither depends on `ListDesignerApp`'s specific step content).

- [ ] **Step 8: Commit**

```bash
git add src/components/ListDesignerApp.tsx src/components/MetadataTeamPoolRow.tsx \
  src/components/__tests__/ListDesignerApp-tour.test.tsx \
  src/i18n/locales/en/ui.json src/i18n/locales/de/ui.json
git commit -m "feat(gameday_designer): consolidate designer-page tour to 4 steps"
```

---

### Task 3: `GamedayDashboard` — dashboard tour step + resume support

**Files:**
- Modify: `gameday_designer/src/components/dashboard/GamedayDashboard.tsx`
- Modify: `gameday_designer/src/i18n/locales/en/ui.json`
- Modify: `gameday_designer/src/i18n/locales/de/ui.json`
- Test: `gameday_designer/src/components/dashboard/__tests__/GamedayDashboard-tour.test.tsx` (new)

**Interfaces:**
- Consumes: `DesignerTour` with `requireRealAction` (Task 1); `useTourSeen('manual_build')` (existing, same hook `ListDesignerApp` uses); `gamedayApi.getGameday(id: number): Promise<Gameday>` (existing); the `gd_tour_manual_build_gameday_id` `localStorage` key that Task 2's `handleTourAFinish` clears.
- Produces: `data-testid="create-gameday-button"` on the header Create button; the resume-check effect (navigates to `/designer/{id}` for a valid stored draft, otherwise clears the stale id); the create-step tour instance.

This task has two TDD sub-cycles in one file: the resume-check effect first, then the create-step tour that depends on the state it introduces (the two are too coupled to review independently — the tour's render condition needs the resume-check's state to exist, and neither compiles cleanly without the other, since an unused `showCreateTour` would fail `npm run eslint`).

#### Sub-cycle A: resume-check effect

- [ ] **Step 1: Write the failing tests**

Create `gameday_designer/src/components/dashboard/__tests__/GamedayDashboard-tour.test.tsx`:

```tsx
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GamedayDashboard from '../GamedayDashboard';
import { GamedayProvider } from '../../../context/GamedayContext';
import i18n from '../../../i18n/testConfig';
import { gamedayApi } from '../../../api/gamedayApi';
import type { GamedayListEntry, PaginatedResponse, Gameday } from '../../../types';
import type { Step } from 'react-joyride';

vi.mock('../../../api/gamedayApi', () => ({
  gamedayApi: {
    listGamedays: vi.fn(),
    createGameday: vi.fn(),
    deleteGameday: vi.fn().mockResolvedValue({}),
    listSeasons: vi.fn().mockResolvedValue([]),
    listLeagues: vi.fn().mockResolvedValue([]),
    getGameday: vi.fn(),
  },
}));

vi.mock('../../../trackEvent', () => ({
  trackEvent: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null, pathname: '/' }),
  };
});

const capturedTourProps: { steps?: Step[]; requireRealAction?: boolean; onFinish?: () => void; run?: boolean } = {};
vi.mock('../../../onboarding/DesignerTour', () => ({
  default: (props: { steps: Step[]; requireRealAction?: boolean; onFinish: () => void; run: boolean }) => {
    Object.assign(capturedTourProps, props);
    return null;
  },
}));

const RESUME_KEY = 'gd_tour_manual_build_gameday_id';

const emptyResponse: PaginatedResponse<GamedayListEntry> = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const draftGameday: Gameday = {
  id: 42,
  name: 'Resumable Gameday',
  date: '2026-07-20',
  start: '10:00',
  format: '6_2',
  author: 1,
  address: '',
  season: 1,
  league: 1,
  status: 'DRAFT',
};

describe('GamedayDashboard tour', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    localStorage.clear();
    for (const key of Object.keys(capturedTourProps)) delete (capturedTourProps as Record<string, unknown>)[key];
    (gamedayApi.listGamedays as ReturnType<typeof vi.fn>).mockResolvedValue(emptyResponse);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderDashboard = async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <GamedayProvider>
          <GamedayDashboard />
        </GamedayProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  };

  it('navigates straight to the designer when a valid draft resume id is stored', async () => {
    localStorage.setItem(RESUME_KEY, '42');
    (gamedayApi.getGameday as ReturnType<typeof vi.fn>).mockResolvedValue(draftGameday);

    await renderDashboard();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/designer/42'));
  });

  it('clears the resume id when the stored gameday is no longer a draft', async () => {
    localStorage.setItem(RESUME_KEY, '42');
    (gamedayApi.getGameday as ReturnType<typeof vi.fn>).mockResolvedValue({ ...draftGameday, status: 'PUBLISHED' });

    await renderDashboard();

    await waitFor(() => expect(gamedayApi.getGameday).toHaveBeenCalledWith(42));
    expect(mockNavigate).not.toHaveBeenCalledWith('/designer/42');
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it('clears the resume id when the stored gameday no longer exists', async () => {
    localStorage.setItem(RESUME_KEY, '42');
    (gamedayApi.getGameday as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('404'));

    await renderDashboard();

    await waitFor(() => expect(localStorage.getItem(RESUME_KEY)).toBeNull());
    expect(mockNavigate).not.toHaveBeenCalledWith('/designer/42');
  });

  it('does not call getGameday when no resume id is stored', async () => {
    await renderDashboard();
    await waitFor(() => expect(gamedayApi.listGamedays).toHaveBeenCalled());
    expect(gamedayApi.getGameday).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/__tests__/GamedayDashboard-tour.test.tsx`
Expected: FAIL on all 4 — `GamedayDashboard` doesn't call `getGameday`, doesn't navigate based on a stored id, and doesn't mock-render `DesignerTour` from this file's mock yet (the real `DesignerTour` renders via the global `react-joyride` mock, unaffected either way, but `getGameday`/`navigate` assertions fail).

- [ ] **Step 3: Implement the resume-check effect**

In `gameday_designer/src/components/dashboard/GamedayDashboard.tsx`, add these two imports alongside the existing ones (after `import { trackEvent } from '../../trackEvent';`):

```tsx
import { useTourSeen } from '../../onboarding/useTourSeen';
import DesignerTour from '../../onboarding/DesignerTour';
```

Add this module-level constant right after the imports, before the `GamedayDeletePlaceholder` component:

```tsx
const RESUME_STORAGE_KEY = 'gd_tour_manual_build_gameday_id';
```

Inside the `GamedayDashboard` component, immediately after the existing `hasTriggeredInitialDelete` ref declaration:

```tsx
  const hasTriggeredInitialDelete = useRef(false);
```

add:

```tsx
  const { seen: tourASeen, loading: tourALoading, markSeen: markTourASeen } = useTourSeen('manual_build');
  const [showCreateTour, setShowCreateTour] = useState(false);

  useEffect(() => {
    if (tourALoading || tourASeen) return;

    const storedId = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!storedId) {
      setShowCreateTour(true);
      return;
    }

    let cancelled = false;
    gamedayApi
      .getGameday(parseInt(storedId, 10))
      .then((gameday) => {
        if (cancelled) return;
        if (gameday.status === 'DRAFT') {
          navigate(`/designer/${gameday.id}`);
        } else {
          localStorage.removeItem(RESUME_STORAGE_KEY);
          setShowCreateTour(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(RESUME_STORAGE_KEY);
        setShowCreateTour(true);
      });

    return () => {
      cancelled = true;
    };
  }, [tourALoading, tourASeen, navigate]);
```

- [ ] **Step 4: Run tests to verify Sub-cycle A passes**

Run: `npx vitest run src/components/dashboard/__tests__/GamedayDashboard-tour.test.tsx`
Expected: The 4 resume-check tests PASS. (`showCreateTour`/`setShowCreateTour` are assigned but not yet read anywhere else — this will show as an unused-variable lint error until Sub-cycle B consumes it below; don't run `npm run eslint` until Sub-cycle B is done.)

#### Sub-cycle B: create-step tour

- [ ] **Step 5: Write the failing tests**

Add these tests inside the same `describe('GamedayDashboard tour', ...)` block, after the 4 existing tests:

```tsx
  it('adds a testid to the header Create Gameday button', async () => {
    await renderDashboard();
    expect(screen.getByTestId('create-gameday-button')).toBeInTheDocument();
  });

  it('runs the create-step tour, pointed at the Create Gameday button, when unseen and nothing to resume', async () => {
    await renderDashboard();
    await waitFor(() => expect(capturedTourProps.run).toBe(true));
    expect(capturedTourProps.requireRealAction).toBe(true);
    expect(capturedTourProps.steps?.[0]).toMatchObject({ target: '[data-testid="create-gameday-button"]' });
  });

  it('stores the resume id when a gameday is created while the create-step tour is active', async () => {
    (gamedayApi.createGameday as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 7, name: 'x' });
    (gamedayApi.listSeasons as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    (gamedayApi.listLeagues as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);

    await renderDashboard();
    await waitFor(() => expect(capturedTourProps.run).toBe(true));

    fireEvent.click(screen.getByTestId('create-gameday-button'));

    await waitFor(() => expect(localStorage.getItem(RESUME_KEY)).toBe('7'));
  });

  it('does not store a resume id when creating a gameday after the tour is already seen', async () => {
    vi.mocked(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, event_name: 'gd_tour_manual_build_completed', metadata: {}, created_at: '2026-07-19T00:00:00Z' }],
    });
    (gamedayApi.createGameday as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 8, name: 'x' });
    (gamedayApi.listSeasons as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    (gamedayApi.listLeagues as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);

    await renderDashboard();
    await waitFor(() => expect(capturedTourProps.run).toBe(false));

    fireEvent.click(screen.getByTestId('create-gameday-button'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/designer/8'));
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it('hides the create-step tour once it is marked seen via onFinish (skip)', async () => {
    await renderDashboard();
    await waitFor(() => expect(capturedTourProps.run).toBe(true));

    act(() => {
      capturedTourProps.onFinish?.();
    });

    await waitFor(() => expect(capturedTourProps.run).toBe(false));
  });
```

- [ ] **Step 6: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/dashboard/__tests__/GamedayDashboard-tour.test.tsx`
Expected: FAIL on the 5 new tests — no `create-gameday-button` testid yet, no `DesignerTour` instance rendered on the dashboard yet, `handleCreateGameday` doesn't write to `localStorage` yet.

- [ ] **Step 7: Implement the create-step tour**

In `gameday_designer/src/components/dashboard/GamedayDashboard.tsx`, find the header Create button:

```tsx
            <Button variant="primary" onClick={handleCreateGameday}>
              <i className="bi bi-plus-lg me-2"></i>
              {t('ui:button.createGameday')}
            </Button>
```

Replace with:

```tsx
            <Button variant="primary" onClick={handleCreateGameday} data-testid="create-gameday-button">
              <i className="bi bi-plus-lg me-2"></i>
              {t('ui:button.createGameday')}
            </Button>
```

In `handleCreateGameday`, find:

```tsx
      const newGameday = await gamedayApi.createGameday({
        name: defaultName,
        date: `${yyyy}-${mm}-${dd}`,
        start: '10:00',
        format: '6_2',
        author: 1, // TODO: Use actual user ID
        address: '',
        season: seasons[0].id,
        league: leagues[0].id,
      });

      // Track gameday created event
      trackEvent('gameday_created', {
```

Replace with:

```tsx
      const newGameday = await gamedayApi.createGameday({
        name: defaultName,
        date: `${yyyy}-${mm}-${dd}`,
        start: '10:00',
        format: '6_2',
        author: 1, // TODO: Use actual user ID
        address: '',
        season: seasons[0].id,
        league: leagues[0].id,
      });

      if (showCreateTour && !tourASeen) {
        localStorage.setItem(RESUME_STORAGE_KEY, String(newGameday.id));
      }

      // Track gameday created event
      trackEvent('gameday_created', {
```

Add the step list as a component-level `const`, right before the `return (` of `GamedayDashboard` (alongside other pre-render derived values):

```tsx
  const dashboardTourSteps = [
    { target: '[data-testid="create-gameday-button"]', content: t('ui:tour.manual_build.create'), placement: 'bottom' as const },
  ];
```

Find the end of the component's JSX:

```tsx
      </div>
      <NotificationToast notifications={notifications} onClose={dismissNotification} />
    </Container>
  );
};

export default GamedayDashboard;
```

Replace with:

```tsx
      </div>
      <NotificationToast notifications={notifications} onClose={dismissNotification} />
      <DesignerTour
        tourId="manual_build"
        steps={dashboardTourSteps}
        run={showCreateTour && !tourASeen}
        onFinish={markTourASeen}
        requireRealAction
      />
    </Container>
  );
};

export default GamedayDashboard;
```

- [ ] **Step 8: Add the `create` translation key**

In `gameday_designer/src/i18n/locales/en/ui.json`, replace:

```json
    "manual_build": {
      "metadata": "Give your gameday a name, date, and league — you can always change these later.",
```

with:

```json
    "manual_build": {
      "create": "Click \"Create Gameday\" to set up your first schedule.",
      "metadata": "Give your gameday a name, date, and league — you can always change these later.",
```

In `gameday_designer/src/i18n/locales/de/ui.json`, replace:

```json
    "manual_build": {
      "metadata": "Gib deinem Spieltag einen Namen, ein Datum und eine Liga — du kannst das später jederzeit ändern.",
```

with:

```json
    "manual_build": {
      "create": "Klicke auf „Spieltag erstellen“, um deinen ersten Spielplan einzurichten.",
      "metadata": "Gib deinem Spieltag einen Namen, ein Datum und eine Liga — du kannst das später jederzeit ändern.",
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/GamedayDashboard-tour.test.tsx`
Expected: PASS (9 tests total).

- [ ] **Step 10: Run the full suite and lint**

Run: `npx vitest run`
Expected: PASS. This also confirms `GamedayDashboard.test.tsx` and `GamedayDashboard-coverage.test.tsx` still pass unmodified — they never set the `gd_tour_manual_build_gameday_id` localStorage key, so the resume-check effect's `getGameday` branch never fires, and they render before the Create button's `data-testid` addition changes its accessible name (it doesn't).

Run: `npm run eslint`
Expected: clean — no unused-variable errors (`showCreateTour` is now read in the `run` prop and in `handleCreateGameday`).

- [ ] **Step 11: Regenerate i18n types and build**

Run: `npm run i18n:types && npm run build`
Expected: both succeed; `src/i18n/types.d.ts` picks up the new `tour.manual_build.create` key.

- [ ] **Step 12: Commit**

```bash
git add src/components/dashboard/GamedayDashboard.tsx \
  src/components/dashboard/__tests__/GamedayDashboard-tour.test.tsx \
  src/i18n/locales/en/ui.json src/i18n/locales/de/ui.json src/i18n/types.d.ts
git commit -m "feat(gameday_designer): start Tour A on the dashboard with resume support"
```

---

### Task 4: Manual end-to-end verification

Not a TDD cycle — a checklist to actually drive the feature in a browser before calling this done, per this project's own verification practice. Reuse the `devpreview` login and the Django (`127.0.0.1:8000`) + Vite dev servers already running from earlier in this session (or restart them per `container/docs/leaguesphere-environments.md` / `leaguesphere/CLAUDE.md` if they've been stopped).

- [ ] **Step 1:** Rebuild the frontend: `npm run build` (or confirm `npm run watch` picked up the changes if already running).
- [ ] **Step 2:** As a *different* test user than one already marked "seen" (or clear `gd_tour_manual_build_completed`/`_skipped` `JourneyEvent` rows for the test user, or use a fresh staff account), visit `http://localhost:8000/gamedays/gameday/design/` — confirm the tour starts immediately, pointed at "Create Gameday," with no visible "Next" button (only Skip).
- [ ] **Step 3:** Click the real "Create Gameday" button (not a tour control) — confirm it navigates to the new gameday's designer page and the tour auto-continues, now pointed at the metadata accordion header.
- [ ] **Step 4:** Click through Next on Metadata → Team Pool ("Add Group" button) → Fields ("Add Field" button) → Publish, confirming each beacon anchors to the correct element and the progress counter reads correctly in German (switch language to `de` and confirm e.g. "Weiter (2 von 4)" on the Team Pool step — 4 total, since these designer-page steps are one independent `DesignerTour` instance separate from the dashboard's single step, which has no "Next" button and so shows no progress counter at all).
- [ ] **Step 5:** Click "Fertig"/"Last" on the Publish step — confirm the tour doesn't reappear on a fresh dashboard visit for that same user.
- [ ] **Step 6:** Resume check: as a fresh unseen user, click Create Gameday, then immediately navigate back to the dashboard (browser back button or re-visiting the dashboard URL) without interacting further. Confirm the dashboard silently redirects straight back into that same draft gameday's designer page (check the URL / gameday name) rather than showing the create-step tour again.
- [ ] **Step 7:** Confirm the existing "?" replay button (on the designer page header) still only replays the 4 designer-page steps, and does not navigate back to the dashboard or show the create step.
- [ ] **Step 8:** Confirm Tour B (the post-publish "save as template" nudge) still fires normally after publishing — unaffected by this change.

If any step surfaces a real bug, fix it, add a regression test to the relevant task's test file above, and re-run that task's verification steps before committing the fix.
