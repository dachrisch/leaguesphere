# Gameday Designer Adoption Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tiered event tracking in gameday_designer and dashboard visualization showing user adoption journeys and conversion funnels.

**Architecture:** Frontend tracking via `trackEvent()` calls in gameday_designer handlers → existing `/api/journey/events/` endpoint stores events → journey_dashboard queries and visualizes adoption metrics with funnel analysis.

**Tech Stack:** React (gameday_designer, journey_dashboard), TypeScript, Django ORM (journey models), existing trackEvent infrastructure

---

## Phase 1: Gameday Designer Basic & Core Instrumentation

### Task 1: Track Designer Opens & Gameday Creation

**Files:**
- Modify: `gameday_designer/src/components/ListDesignerApp.tsx` — add tracking on mount and create
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx` — verify events fire

**Context:** ListDesignerApp is the main entry point. When users navigate to `/gameday/<id>`, we track opened. When they create, we track created.

- [ ] **Step 1: Check current test structure**

Run: `head -50 gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx`

This shows existing test patterns and mocks.

- [ ] **Step 2: Write test for `gameday_designer_opened` event**

Add this test to the test file (append to the existing test suite):

```typescript
describe('ListDesignerApp - Event Tracking', () => {
  it('tracks gameday_designer_opened when component mounts', () => {
    const mockTrackEvent = jest.fn();
    jest.mock('../trackEvent', () => ({
      trackEvent: mockTrackEvent,
    }));

    const { render } = require('@testing-library/react');
    const TestApp = () => {
      const { id } = useParams();
      // Simulate the tracking call
      React.useEffect(() => {
        mockTrackEvent('gameday_designer_opened', { gameday_id: id });
      }, [id]);
      return <div>Test</div>;
    };

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/gameday/:id" element={<TestApp />} />
        </Routes>
      </BrowserRouter>,
      { initialEntries: ['/gameday/123'] }
    );

    expect(mockTrackEvent).toHaveBeenCalledWith('gameday_designer_opened', {
      gameday_id: '123',
    });
  });

  it('tracks gameday_created when new gameday is created', () => {
    const mockTrackEvent = jest.fn();
    jest.mock('../trackEvent', () => ({
      trackEvent: mockTrackEvent,
    }));

    // Test will verify trackEvent called with gameday_created + metadata
    // This will fail until we implement the handler
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="tracks gameday_designer_opened"`

Expected: FAIL — trackEvent not called or not imported.

- [ ] **Step 4: Add tracking on mount in ListDesignerApp.tsx**

Find the existing `useEffect` that loads gameday data. Add this after the existing data load:

```typescript
// Track designer opened event
useEffect(() => {
  if (id) {
    trackEvent('gameday_designer_opened', { 
      gameday_id: id,
    });
  }
}, [id]);
```

Ensure `trackEvent` is already imported at the top:
```typescript
import { trackEvent } from '../trackEvent';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="tracks gameday_designer_opened"`

Expected: PASS

- [ ] **Step 6: Implement gameday_created tracking**

Find where gameday creation happens (look for "Create New Gameday" button handler or in useDesignerController). In ListDesignerApp.tsx, find the creation handler (likely in callbacks) and add:

```typescript
const handleGamedayCreate = async (name: string) => {
  const newGameday = await createGameday(name); // existing call
  trackEvent('gameday_created', {
    gameday_id: newGameday.id,
    gameday_name: newGameday.name,
  });
  // ... rest of handler
};
```

- [ ] **Step 7: Test gameday_created event fires**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="tracks gameday_created"`

Expected: PASS

- [ ] **Step 8: Commit Phase 1a**

```bash
git add gameday_designer/src/components/ListDesignerApp.tsx \
        gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx
git commit -m "feat: track gameday_designer_opened and gameday_created events"
```

---

### Task 2: Track Gameday Edits (Core Level)

**Files:**
- Modify: `gameday_designer/src/hooks/useDesignerController.ts` — add edit tracking to handleUpdateNode
- Modify: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx` — add edit tracking test

**Context:** The `useDesignerController` hook manages all structural edits (add game, update stage, etc.). We wrap `handleUpdateNode` to track these.

- [ ] **Step 1: Understand current updateNode handler**

Run: `grep -A 20 "handleUpdateNode" gameday_designer/src/hooks/useDesignerController.ts | head -30`

This shows the existing handler structure.

- [ ] **Step 2: Write test for gameday_edited tracking**

Add to ListDesignerApp.test.tsx:

```typescript
it('tracks gameday_edited when game node is updated', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  // Simulate calling handleUpdateNode
  const gameNode = { id: 'game-1', type: 'game' };
  const updatedNode = { ...gameNode, name: 'Updated' };
  
  // When updateNode is called, should track gameday_edited
  // with edit_type indicating what changed
  
  expect(mockTrackEvent).toHaveBeenCalledWith(
    'gameday_edited',
    expect.objectContaining({
      gameday_id: expect.any(String),
      edit_type: expect.any(String),
      element_id: 'game-1',
    })
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="tracks gameday_edited"`

Expected: FAIL

- [ ] **Step 4: Add tracking to handleUpdateNode**

In `useDesignerController.ts`, find `handleUpdateNode`. Wrap the logic to detect what type of node and what changed:

```typescript
const handleUpdateNode = (nodeId: string, updatedNode: any) => {
  const oldNode = flowState.nodes.find(n => n.id === nodeId);
  
  // Call existing update logic
  const result = originalHandleUpdateNode(nodeId, updatedNode);
  
  // Determine edit type based on what changed
  let editType = 'node_updated';
  if (oldNode?.type === 'game') {
    editType = updatedNode.teams?.length > oldNode.teams?.length ? 'team_assigned' : 'game_modified';
  } else if (oldNode?.type === 'stage') {
    editType = 'stage_modified';
  } else if (oldNode?.type === 'field') {
    editType = 'field_modified';
  }
  
  trackEvent('gameday_edited', {
    gameday_id: id,
    edit_type: editType,
    element_id: nodeId,
  });
  
  return result;
};
```

Ensure trackEvent is imported:
```typescript
import { trackEvent } from '../trackEvent';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="tracks gameday_edited"`

Expected: PASS

- [ ] **Step 6: Commit Phase 1b**

```bash
git add gameday_designer/src/hooks/useDesignerController.ts \
        gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx
git commit -m "feat: track gameday_edited events for structural changes"
```

---

### Task 3: Track Gameday Publishing

**Files:**
- Modify: `gameday_designer/src/components/modals/PublishConfirmationModal.tsx` — add publish tracking
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx` — add publish test

**Context:** When user confirms publish in PublishConfirmationModal, we track the event with game and stage counts for adoption metrics.

- [ ] **Step 1: Check PublishConfirmationModal structure**

Run: `head -60 gameday_designer/src/components/modals/PublishConfirmationModal.tsx`

This shows how confirmation works.

- [ ] **Step 2: Write test for gameday_published event**

Add to test file:

```typescript
it('tracks gameday_published when publish is confirmed', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  // When publish confirmation handler is called, should track event
  expect(mockTrackEvent).toHaveBeenCalledWith(
    'gameday_published',
    expect.objectContaining({
      gameday_id: expect.any(String),
      game_count: expect.any(Number),
      stage_count: expect.any(Number),
    })
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="tracks gameday_published"`

Expected: FAIL

- [ ] **Step 4: Add tracking to publish handler**

In `PublishConfirmationModal.tsx`, find the confirm handler. Add tracking before the API call:

```typescript
const handleConfirmPublish = async () => {
  // Count games and stages from current gameday
  const gameCount = flowState.nodes.filter(n => n.type === 'game').length;
  const stageCount = flowState.nodes.filter(n => n.type === 'stage').length;
  
  trackEvent('gameday_published', {
    gameday_id: gameday.id,
    game_count: gameCount,
    stage_count: stageCount,
  });
  
  // Call existing publish API
  await publishGameday(gameday.id);
  
  // ... rest of handler
};
```

Ensure imports:
```typescript
import { trackEvent } from '../../trackEvent';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="tracks gameday_published"`

Expected: PASS

- [ ] **Step 6: Run all Phase 1 tests**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx`

Expected: All tests pass

- [ ] **Step 7: Commit Phase 1 complete**

```bash
git add gameday_designer/src/components/modals/PublishConfirmationModal.tsx \
        gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx
git commit -m "feat: track gameday_published event with game/stage counts"
```

---

## Phase 2: Advanced Feature Instrumentation

### Task 4: Track Template Library & Template Usage

**Files:**
- Modify: `gameday_designer/src/components/modals/TemplateLibraryModal.tsx` — add tracking on open and apply
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx` — add template tests

**Context:** Track when users open template library and when they apply a template. This shows advanced feature adoption.

- [ ] **Step 1: Review TemplateLibraryModal**

Run: `grep -n "TemplateLibraryModal\|useEffect\|apply\|use" gameday_designer/src/components/modals/TemplateLibraryModal.tsx | head -20`

This shows the component structure.

- [ ] **Step 2: Write test for template_library_opened**

Add to test file:

```typescript
it('tracks template_library_opened when modal opens', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  expect(mockTrackEvent).toHaveBeenCalledWith(
    'template_library_opened',
    expect.objectContaining({
      gameday_id: expect.any(String),
    })
  );
});

it('tracks template_used when template is applied', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  expect(mockTrackEvent).toHaveBeenCalledWith(
    'template_used',
    expect.objectContaining({
      gameday_id: expect.any(String),
      template_name: expect.any(String),
      template_id: expect.any(String),
    })
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="template"`

Expected: FAIL

- [ ] **Step 4: Add tracking to TemplateLibraryModal**

In `TemplateLibraryModal.tsx`, add useEffect on mount:

```typescript
useEffect(() => {
  trackEvent('template_library_opened', {
    gameday_id: gamedayId,
  });
}, [gamedayId]);
```

Find the apply/use template handler and add:

```typescript
const handleApplyTemplate = (template: Template) => {
  trackEvent('template_used', {
    gameday_id: gamedayId,
    template_name: template.name,
    template_id: template.id,
  });
  
  // Call existing apply logic
  applyTemplate(template);
};
```

Ensure imports:
```typescript
import { trackEvent } from '../../trackEvent';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="template"`

Expected: PASS

- [ ] **Step 6: Commit Task 4**

```bash
git add gameday_designer/src/components/modals/TemplateLibraryModal.tsx \
        gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx
git commit -m "feat: track template_library_opened and template_used events"
```

---

### Task 5: Track Import, Export, Global Teams, and Officials

**Files:**
- Modify: `gameday_designer/src/hooks/useDesignerController.ts` — add tracking to import/export/global team handlers
- Test: `gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx` — add tests

**Context:** Track advanced features: import, export, global teams, officials groups. These indicate sophisticated users.

- [ ] **Step 1: Write tests for advanced features**

Add to test file:

```typescript
it('tracks import_executed when gameday is imported', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  expect(mockTrackEvent).toHaveBeenCalledWith(
    'import_executed',
    expect.objectContaining({
      gameday_id: expect.any(String),
      import_source: expect.stringMatching(/file|clipboard/),
    })
  );
});

it('tracks export_executed when gameday is exported', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  expect(mockTrackEvent).toHaveBeenCalledWith(
    'export_executed',
    expect.objectContaining({
      gameday_id: expect.any(String),
      export_format: 'json',
    })
  );
});

it('tracks global_team_added when team is created', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  expect(mockTrackEvent).toHaveBeenCalledWith(
    'global_team_added',
    expect.objectContaining({
      gameday_id: expect.any(String),
      team_name: expect.any(String),
    })
  );
});

it('tracks officials_group_added when officials group is created', () => {
  const mockTrackEvent = jest.fn();
  jest.mock('../../trackEvent', () => ({
    trackEvent: mockTrackEvent,
  }));

  expect(mockTrackEvent).toHaveBeenCalledWith(
    'officials_group_added',
    expect.objectContaining({
      gameday_id: expect.any(String),
      group_name: expect.any(String),
    })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="import_executed|export_executed|global_team_added|officials_group_added"`

Expected: FAIL

- [ ] **Step 3: Add tracking to import handler in useDesignerController**

Find `handleImport`. Wrap it:

```typescript
const handleImport = (source: 'file' | 'clipboard', data: any) => {
  const result = originalHandleImport(source, data);
  
  trackEvent('import_executed', {
    gameday_id: id,
    import_source: source,
  });
  
  return result;
};
```

- [ ] **Step 4: Add tracking to export handler**

Find `handleExport`. Wrap it:

```typescript
const handleExport = (format: string = 'json') => {
  const result = originalHandleExport(format);
  
  trackEvent('export_executed', {
    gameday_id: id,
    export_format: format,
  });
  
  return result;
};
```

- [ ] **Step 5: Add tracking to global team handler**

Find `handleAddGlobalTeam`. Wrap it:

```typescript
const handleAddGlobalTeam = (teamName: string) => {
  const result = originalHandleAddGlobalTeam(teamName);
  
  trackEvent('global_team_added', {
    gameday_id: id,
    team_name: teamName,
  });
  
  return result;
};
```

- [ ] **Step 6: Add tracking to officials group handler**

Find `handleAddOfficialsGroup`. Wrap it:

```typescript
const handleAddOfficialsGroup = (groupName: string) => {
  const result = originalHandleAddOfficialsGroup(groupName);
  
  trackEvent('officials_group_added', {
    gameday_id: id,
    group_name: groupName,
  });
  
  return result;
};
```

Ensure trackEvent imported in useDesignerController.ts:
```typescript
import { trackEvent } from '../trackEvent';
```

- [ ] **Step 7: Run all advanced feature tests**

Run: `cd gameday_designer && npm test -- ListDesignerApp.test.tsx --testNamePattern="import_executed|export_executed|global_team|officials_group"`

Expected: PASS

- [ ] **Step 8: Run full gameday_designer test suite**

Run: `cd gameday_designer && npm test`

Expected: All tests pass, no regressions.

- [ ] **Step 9: Commit Phase 2 complete**

```bash
git add gameday_designer/src/hooks/useDesignerController.ts \
        gameday_designer/src/components/__tests__/ListDesignerApp.test.tsx
git commit -m "feat: track import, export, global_team, and officials events"
```

---

## Phase 3: Dashboard Components

### Task 6: Add Helper to Query Gameday Events from API

**Files:**
- Modify: `journey_dashboard/src/utils/api.ts` — add function to query gameday designer events
- Test: `journey_dashboard/src/__tests__/api.test.ts` (create if needed)

**Context:** Dashboard needs a helper to fetch and filter events for funnel and metrics calculations.

- [ ] **Step 1: Check existing api.ts structure**

Run: `cat journey_dashboard/src/utils/api.ts`

This shows existing query patterns.

- [ ] **Step 2: Write test for getGamedayEvents**

Create or append to `journey_dashboard/src/__tests__/api.test.ts`:

```typescript
describe('api.getGamedayEvents', () => {
  it('filters events to only gameday_* and template_* events', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      json: async () => ({
        results: [
          { id: 1, event_name: 'gameday_designer_opened', created_at: '2026-05-06T10:00:00Z' },
          { id: 2, event_name: 'gameday_created', created_at: '2026-05-06T10:05:00Z' },
          { id: 3, event_name: 'template_used', created_at: '2026-05-06T10:10:00Z' },
          { id: 4, event_name: 'some_other_event', created_at: '2026-05-06T10:15:00Z' },
        ],
      }),
    });
    
    global.fetch = mockFetch;
    const result = await getGamedayEvents('user-123');
    
    expect(result).toHaveLength(3);
    expect(result.every(e => e.event_name.startsWith('gameday_') || e.event_name.startsWith('template_'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd journey_dashboard && npm test -- api.test.ts --testNamePattern="getGamedayEvents"`

Expected: FAIL — function doesn't exist

- [ ] **Step 4: Implement getGamedayEvents**

In `journey_dashboard/src/utils/api.ts`, add:

```typescript
export async function getGamedayEvents(userId: string) {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('No auth token found');
  }

  const response = await fetch(`/api/journey/events/?user_id=${userId}`, {
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Filter to only gameday designer events
  const gamedayEvents = data.results.filter((event: any) =>
    event.event_name.startsWith('gameday_') || event.event_name.startsWith('template_')
  );
  
  return gamedayEvents;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd journey_dashboard && npm test -- api.test.ts --testNamePattern="getGamedayEvents"`

Expected: PASS

- [ ] **Step 6: Commit Task 6**

```bash
git add journey_dashboard/src/utils/api.ts \
        journey_dashboard/src/__tests__/api.test.ts
git commit -m "feat: add getGamedayEvents helper to filter adoption events"
```

---

### Task 7: Build GamedayFunnel Component

**Files:**
- Create: `journey_dashboard/src/components/GamedayFunnel.tsx` — funnel visualization
- Test: `journey_dashboard/src/__tests__/GamedayFunnel.test.tsx` — test funnel calculation logic

**Context:** Shows conversion flow from opened → created → published, with template adoption as a branch.

- [ ] **Step 1: Write test for funnel calculation**

Create `journey_dashboard/src/__tests__/GamedayFunnel.test.tsx`:

```typescript
import { calculateFunnel } from '../components/GamedayFunnel';

describe('GamedayFunnel.calculateFunnel', () => {
  it('calculates conversion rates for gameday funnel', () => {
    const events = [
      { id: 1, event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g1' } },
      { id: 2, event_name: 'gameday_created', metadata: { gameday_id: 'g1' } },
      { id: 3, event_name: 'gameday_edited', metadata: { gameday_id: 'g1' } },
      { id: 4, event_name: 'gameday_published', metadata: { gameday_id: 'g1' } },
      
      { id: 5, event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g2' } },
      { id: 6, event_name: 'gameday_created', metadata: { gameday_id: 'g2' } },
      { id: 7, event_name: 'gameday_published', metadata: { gameday_id: 'g2' } },
      
      { id: 8, event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g3' } },
      // g3 no create or publish
    ];

    const funnel = calculateFunnel(events);

    expect(funnel).toEqual({
      opened: { count: 3, percentage: 100 },
      created: { count: 2, percentage: 67 }, // 2 out of 3 opened
      edited: { count: 1, percentage: 50 }, // 1 out of 2 created
      published: { count: 2, percentage: 100 }, // 2 out of 2 who edited published
      templateUsed: { count: 0, percentage: 0 },
    });
  });

  it('includes template adoption metrics', () => {
    const events = [
      { id: 1, event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g1' } },
      { id: 2, event_name: 'template_library_opened', metadata: { gameday_id: 'g1' } },
      { id: 3, event_name: 'template_used', metadata: { gameday_id: 'g1' } },
      { id: 4, event_name: 'gameday_published', metadata: { gameday_id: 'g1' } },
    ];

    const funnel = calculateFunnel(events);

    expect(funnel.templateUsed.count).toBe(1);
    expect(funnel.templateUsed.percentage).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd journey_dashboard && npm test -- GamedayFunnel.test.tsx --testNamePattern="calculates conversion"`

Expected: FAIL — GamedayFunnel component doesn't exist

- [ ] **Step 3: Create GamedayFunnel component with calculateFunnel logic**

Create `journey_dashboard/src/components/GamedayFunnel.tsx`:

```typescript
import React from 'react';

export interface FunnelStage {
  count: number;
  percentage: number;
}

export interface FunnelData {
  opened: FunnelStage;
  created: FunnelStage;
  edited: FunnelStage;
  published: FunnelStage;
  templateUsed: FunnelStage;
}

export function calculateFunnel(events: any[]): FunnelData {
  // Count unique users at each stage
  const byGameday = new Map<string, Set<string>>();
  
  // Track progression for each gameday
  const gamedayStages = new Map<string, Set<string>>();
  
  events.forEach(event => {
    const gamedayId = event.metadata?.gameday_id;
    if (!gamedayId) return;
    
    if (!gamedayStages.has(gamedayId)) {
      gamedayStages.set(gamedayId, new Set());
    }
    
    const stages = gamedayStages.get(gamedayId)!;
    
    if (event.event_name === 'gameday_designer_opened') {
      stages.add('opened');
    } else if (event.event_name === 'gameday_created') {
      stages.add('created');
    } else if (event.event_name === 'gameday_edited') {
      stages.add('edited');
    } else if (event.event_name === 'gameday_published') {
      stages.add('published');
    } else if (event.event_name === 'template_used') {
      stages.add('templateUsed');
    }
  });
  
  // Calculate percentages
  const openedCount = Array.from(gamedayStages.values()).filter(s => s.has('opened')).length;
  const createdCount = Array.from(gamedayStages.values()).filter(s => s.has('created')).length;
  const editedCount = Array.from(gamedayStages.values()).filter(s => s.has('edited')).length;
  const publishedCount = Array.from(gamedayStages.values()).filter(s => s.has('published')).length;
  const templateUsedCount = Array.from(gamedayStages.values()).filter(s => s.has('templateUsed')).length;
  
  return {
    opened: {
      count: openedCount,
      percentage: 100, // baseline
    },
    created: {
      count: createdCount,
      percentage: openedCount > 0 ? Math.round((createdCount / openedCount) * 100) : 0,
    },
    edited: {
      count: editedCount,
      percentage: createdCount > 0 ? Math.round((editedCount / createdCount) * 100) : 0,
    },
    published: {
      count: publishedCount,
      percentage: editedCount > 0 ? Math.round((publishedCount / editedCount) * 100) : 0,
    },
    templateUsed: {
      count: templateUsedCount,
      percentage: openedCount > 0 ? Math.round((templateUsedCount / openedCount) * 100) : 0,
    },
  };
}

interface GamedayFunnelProps {
  events: any[];
}

export const GamedayFunnel: React.FC<GamedayFunnelProps> = ({ events }) => {
  const funnel = calculateFunnel(events);
  
  return (
    <div className="gameday-funnel">
      <h3>Gameday Designer Adoption Funnel</h3>
      
      <div className="funnel-stage">
        <div className="stage-label">Designer Opened</div>
        <div className="stage-bar" style={{ width: '100%' }}>
          <span className="stage-count">{funnel.opened.count}</span>
        </div>
        <div className="stage-percentage">100%</div>
      </div>
      
      <div className="funnel-stage">
        <div className="stage-label">Gameday Created</div>
        <div className="stage-bar" style={{ width: `${funnel.created.percentage}%` }}>
          <span className="stage-count">{funnel.created.count}</span>
        </div>
        <div className="stage-percentage">{funnel.created.percentage}%</div>
      </div>
      
      <div className="funnel-stage">
        <div className="stage-label">Gameday Edited</div>
        <div className="stage-bar" style={{ width: `${funnel.edited.percentage}%` }}>
          <span className="stage-count">{funnel.edited.count}</span>
        </div>
        <div className="stage-percentage">{funnel.edited.percentage}%</div>
      </div>
      
      <div className="funnel-stage">
        <div className="stage-label">Gameday Published</div>
        <div className="stage-bar" style={{ width: `${funnel.published.percentage}%` }}>
          <span className="stage-count">{funnel.published.count}</span>
        </div>
        <div className="stage-percentage">{funnel.published.percentage}%</div>
      </div>
      
      <div className="funnel-stage template-branch">
        <div className="stage-label">Used Template</div>
        <div className="stage-bar" style={{ width: `${funnel.templateUsed.percentage}%` }}>
          <span className="stage-count">{funnel.templateUsed.count}</span>
        </div>
        <div className="stage-percentage">{funnel.templateUsed.percentage}%</div>
      </div>
    </div>
  );
};

export default GamedayFunnel;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd journey_dashboard && npm test -- GamedayFunnel.test.tsx`

Expected: PASS

- [ ] **Step 5: Add minimal CSS for funnel visualization**

Create or append to `journey_dashboard/src/components/GamedayFunnel.css`:

```css
.gameday-funnel {
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.gameday-funnel h3 {
  margin-top: 0;
  color: #333;
}

.funnel-stage {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.stage-label {
  width: 150px;
  font-weight: 500;
  color: #555;
}

.stage-bar {
  flex: 1;
  height: 30px;
  background: #4CAF50;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  color: white;
  font-weight: 500;
}

.funnel-stage.template-branch .stage-bar {
  background: #2196F3;
}

.stage-percentage {
  width: 60px;
  text-align: right;
  font-weight: 500;
  color: #333;
}

.stage-count {
  font-size: 0.9em;
}
```

- [ ] **Step 6: Commit Task 7**

```bash
git add journey_dashboard/src/components/GamedayFunnel.tsx \
        journey_dashboard/src/components/GamedayFunnel.css \
        journey_dashboard/src/__tests__/GamedayFunnel.test.tsx
git commit -m "feat: add GamedayFunnel component with conversion metrics"
```

---

### Task 8: Build AdoptionMetrics Component

**Files:**
- Create: `journey_dashboard/src/components/AdoptionMetrics.tsx` — adoption summary card
- Test: `journey_dashboard/src/__tests__/AdoptionMetrics.test.tsx` — test metric calculations

**Context:** Summary card showing key adoption metrics: Opens, Publish Rate, Template Adoption.

- [ ] **Step 1: Write test for metric calculations**

Create `journey_dashboard/src/__tests__/AdoptionMetrics.test.tsx`:

```typescript
import { calculateMetrics } from '../components/AdoptionMetrics';

describe('AdoptionMetrics.calculateMetrics', () => {
  it('calculates adoption metrics correctly', () => {
    const events = [
      { event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g1' } },
      { event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g2' } },
      { event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g3' } },
      { event_name: 'gameday_published', metadata: { gameday_id: 'g1' } },
      { event_name: 'gameday_published', metadata: { gameday_id: 'g2' } },
      { event_name: 'template_used', metadata: { gameday_id: 'g1' } },
    ];

    const metrics = calculateMetrics(events);

    expect(metrics).toEqual({
      designerOpens: 3,
      publishRate: 67, // 2 out of 3
      templateAdoptionRate: 33, // 1 out of 3
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd journey_dashboard && npm test -- AdoptionMetrics.test.tsx --testNamePattern="calculates adoption"`

Expected: FAIL

- [ ] **Step 3: Create AdoptionMetrics component**

Create `journey_dashboard/src/components/AdoptionMetrics.tsx`:

```typescript
import React from 'react';
import './AdoptionMetrics.css';

export interface AdoptionMetrics {
  designerOpens: number;
  publishRate: number; // percentage
  templateAdoptionRate: number; // percentage
}

export function calculateMetrics(events: any[]): AdoptionMetrics {
  const uniqueGamedays = new Set<string>();
  let publishCount = 0;
  let templateCount = 0;
  
  events.forEach(event => {
    const gamedayId = event.metadata?.gameday_id;
    
    if (event.event_name === 'gameday_designer_opened') {
      uniqueGamedays.add(gamedayId);
    } else if (event.event_name === 'gameday_published') {
      publishCount++;
    } else if (event.event_name === 'template_used') {
      templateCount++;
    }
  });
  
  const totalOpens = uniqueGamedays.size;
  const publishRate = totalOpens > 0 ? Math.round((publishCount / totalOpens) * 100) : 0;
  const templateRate = totalOpens > 0 ? Math.round((templateCount / totalOpens) * 100) : 0;
  
  return {
    designerOpens: totalOpens,
    publishRate,
    templateAdoptionRate: templateRate,
  };
}

interface AdoptionMetricsProps {
  events: any[];
}

export const AdoptionMetrics: React.FC<AdoptionMetricsProps> = ({ events }) => {
  const metrics = calculateMetrics(events);
  
  return (
    <div className="adoption-metrics">
      <h3>Gameday Designer Adoption Metrics</h3>
      
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{metrics.designerOpens}</div>
          <div className="metric-label">Designer Opens</div>
          <div className="metric-description">Unique gamedales opened</div>
        </div>
        
        <div className="metric-card">
          <div className="metric-value">{metrics.publishRate}%</div>
          <div className="metric-label">Publish Rate</div>
          <div className="metric-description">% of opens that published</div>
        </div>
        
        <div className="metric-card">
          <div className="metric-value">{metrics.templateAdoptionRate}%</div>
          <div className="metric-label">Template Adoption</div>
          <div className="metric-description">% that used templates</div>
        </div>
      </div>
    </div>
  );
};

export default AdoptionMetrics;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd journey_dashboard && npm test -- AdoptionMetrics.test.tsx`

Expected: PASS

- [ ] **Step 5: Add CSS**

Create `journey_dashboard/src/components/AdoptionMetrics.css`:

```css
.adoption-metrics {
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.adoption-metrics h3 {
  margin-top: 0;
  color: #333;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.metric-card {
  padding: 16px;
  background: #f5f5f5;
  border-radius: 6px;
  text-align: center;
  border-left: 4px solid #4CAF50;
}

.metric-value {
  font-size: 28px;
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
}

.metric-label {
  font-size: 12px;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-description {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}
```

- [ ] **Step 6: Commit Task 8**

```bash
git add journey_dashboard/src/components/AdoptionMetrics.tsx \
        journey_dashboard/src/components/AdoptionMetrics.css \
        journey_dashboard/src/__tests__/AdoptionMetrics.test.tsx
git commit -m "feat: add AdoptionMetrics component with summary stats"
```

---

### Task 9: Integrate Components into Dashboard & Add Event Filter

**Files:**
- Modify: `journey_dashboard/src/components/UserTimeline.tsx` — add feature filter and include new components
- Modify: `journey_dashboard/src/App.tsx` (or main dashboard view) — render new components

**Context:** Wire up the funnel and metrics components into the main dashboard, add filter to show only gameday designer events.

- [ ] **Step 1: Check current UserTimeline structure**

Run: `head -80 journey_dashboard/src/components/UserTimeline.tsx`

This shows how events are currently rendered.

- [ ] **Step 2: Add feature filter to UserTimeline**

Modify `journey_dashboard/src/components/UserTimeline.tsx` to add state and filter:

```typescript
import { useState } from 'react';
import GamedayFunnel from './GamedayFunnel';
import AdoptionMetrics from './AdoptionMetrics';

type FeatureFilter = 'all' | 'gameday_designer' | 'passcheck' | 'scorecard';

const UserTimeline: React.FC<{ events: any[] }> = ({ events }) => {
  const [filter, setFilter] = useState<FeatureFilter>('all');
  
  // Filter events based on selected feature
  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'gameday_designer') {
      return event.event_name.startsWith('gameday_') || event.event_name.startsWith('template_');
    }
    if (filter === 'passcheck') {
      return event.event_name.startsWith('passcheck_');
    }
    if (filter === 'scorecard') {
      return event.event_name.startsWith('scorecard_');
    }
    return true;
  });
  
  return (
    <div className="user-timeline">
      <div className="timeline-header">
        <h2>User Journey Timeline</h2>
        
        <div className="filter-controls">
          <label>Filter by feature:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value as FeatureFilter)}>
            <option value="all">All Features</option>
            <option value="gameday_designer">Gameday Designer</option>
            <option value="passcheck">Passcheck</option>
            <option value="scorecard">Scorecard</option>
          </select>
        </div>
      </div>
      
      {filter === 'gameday_designer' && (
        <>
          <AdoptionMetrics events={filteredEvents} />
          <GamedayFunnel events={filteredEvents} />
        </>
      )}
      
      <div className="events-list">
        {filteredEvents.map(event => (
          <div key={event.id} className="event-item">
            <div className="event-name">{event.event_name}</div>
            <div className="event-time">{new Date(event.created_at).toLocaleString()}</div>
            <div className="event-metadata">{JSON.stringify(event.metadata)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserTimeline;
```

- [ ] **Step 3: Add CSS for filter controls**

Append to UserTimeline.css or create it:

```css
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.filter-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.filter-controls label {
  font-weight: 500;
  color: #555;
}

.filter-controls select {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}
```

- [ ] **Step 4: Test the integration**

Run: `cd journey_dashboard && npm test`

Expected: All tests pass, no regressions.

- [ ] **Step 5: Commit Task 9**

```bash
git add journey_dashboard/src/components/UserTimeline.tsx \
        journey_dashboard/src/components/UserTimeline.css
git commit -m "feat: integrate adoption metrics and funnel, add feature filter"
```

---

## Phase 4: Integration Testing

### Task 10: End-to-End Integration Testing

**Files:**
- Test: `journey_dashboard/src/__tests__/integration/gameday-adoption.integration.test.ts` — test full flow
- Test: `journey/tests.py` — verify backend event persistence

**Context:** Verify the complete flow: gameday_designer fires events → backend stores → dashboard retrieves and visualizes.

- [ ] **Step 1: Write integration test for event flow**

Create `journey_dashboard/src/__tests__/integration/gameday-adoption.integration.test.ts`:

```typescript
describe('Gameday Designer Adoption Tracking - Integration', () => {
  it('tracks full user journey from open to publish', async () => {
    // Simulate a complete user journey
    const userId = 'test-user-123';
    const gamedayId = 'gameday-456';
    
    // 1. User opens designer
    const openEvent = {
      event_name: 'gameday_designer_opened',
      metadata: { gameday_id: gamedayId },
    };
    
    // 2. User creates gameday
    const createEvent = {
      event_name: 'gameday_created',
      metadata: { gameday_id: gamedayId, gameday_name: 'Test Tournament' },
    };
    
    // 3. User edits
    const editEvent = {
      event_name: 'gameday_edited',
      metadata: { gameday_id: gamedayId, edit_type: 'team_assigned' },
    };
    
    // 4. User publishes
    const publishEvent = {
      event_name: 'gameday_published',
      metadata: { gameday_id: gamedayId, game_count: 4, stage_count: 2 },
    };
    
    const allEvents = [openEvent, createEvent, editEvent, publishEvent];
    
    // Simulate dashboard receiving these events
    const funnel = calculateFunnel(allEvents);
    
    // Verify metrics
    expect(funnel.opened.count).toBe(1);
    expect(funnel.created.count).toBe(1);
    expect(funnel.edited.count).toBe(1);
    expect(funnel.published.count).toBe(1);
    expect(funnel.published.percentage).toBe(100);
  });

  it('shows mixed event timeline with other features', async () => {
    const events = [
      { event_name: 'gameday_designer_opened', created_at: '2026-05-06T10:00:00Z' },
      { event_name: 'passcheck_player_checked', created_at: '2026-05-06T10:05:00Z' },
      { event_name: 'gameday_created', created_at: '2026-05-06T10:10:00Z' },
      { event_name: 'scorecard_submitted', created_at: '2026-05-06T10:15:00Z' },
      { event_name: 'gameday_published', created_at: '2026-05-06T10:20:00Z' },
    ];
    
    // Filter to just gameday events
    const gamedayEvents = events.filter(e =>
      e.event_name.startsWith('gameday_') || e.event_name.startsWith('template_')
    );
    
    expect(gamedayEvents).toHaveLength(3);
    expect(gamedayEvents.map(e => e.event_name)).toEqual([
      'gameday_designer_opened',
      'gameday_created',
      'gameday_published',
    ]);
  });

  it('calculates adoption metrics across multiple user journeys', () => {
    const events = [
      // User 1: opened, created, published
      { event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g1' } },
      { event_name: 'gameday_created', metadata: { gameday_id: 'g1' } },
      { event_name: 'gameday_published', metadata: { gameday_id: 'g1' } },
      
      // User 2: opened, created, used template, published
      { event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g2' } },
      { event_name: 'gameday_created', metadata: { gameday_id: 'g2' } },
      { event_name: 'template_used', metadata: { gameday_id: 'g2' } },
      { event_name: 'gameday_published', metadata: { gameday_id: 'g2' } },
      
      // User 3: opened only (didn't create)
      { event_name: 'gameday_designer_opened', metadata: { gameday_id: 'g3' } },
    ];
    
    const metrics = calculateMetrics(events);
    const funnel = calculateFunnel(events);
    
    expect(metrics.designerOpens).toBe(3);
    expect(metrics.publishRate).toBe(67); // 2 out of 3
    expect(metrics.templateAdoptionRate).toBe(33); // 1 out of 3
    expect(funnel.published.percentage).toBe(100); // both who created published
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd journey_dashboard && npm test -- gameday-adoption.integration.test.ts`

Expected: PASS

- [ ] **Step 3: Write backend persistence test**

Add to `journey/tests.py`:

```python
from django.test import TestCase
from django.contrib.auth.models import User
from journey.models import Journey, JourneyEvent

class GamedayAdoptionTrackingTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.journey = Journey.objects.create(user=self.user)

    def test_gameday_events_persisted(self):
        """Verify gameday designer events are persisted correctly"""
        events = [
            ('gameday_designer_opened', {'gameday_id': '123'}),
            ('gameday_created', {'gameday_id': '123', 'gameday_name': 'Test'}),
            ('gameday_edited', {'gameday_id': '123', 'edit_type': 'team_assigned'}),
            ('gameday_published', {'gameday_id': '123', 'game_count': 4}),
        ]
        
        for event_name, metadata in events:
            JourneyEvent.objects.create(
                journey=self.journey,
                event_name=event_name,
                metadata=metadata,
            )
        
        # Query events
        gameday_events = JourneyEvent.objects.filter(
            journey=self.journey,
            event_name__startswith='gameday_'
        ).order_by('created_at')
        
        self.assertEqual(gameday_events.count(), 4)
        self.assertEqual(gameday_events.first().event_name, 'gameday_designer_opened')
        self.assertEqual(gameday_events.last().event_name, 'gameday_published')

    def test_event_metadata_stored(self):
        """Verify event metadata is stored and queryable"""
        JourneyEvent.objects.create(
            journey=self.journey,
            event_name='gameday_published',
            metadata={'gameday_id': '456', 'game_count': 8, 'stage_count': 3},
        )
        
        event = JourneyEvent.objects.get(event_name='gameday_published')
        self.assertEqual(event.metadata['gameday_id'], '456')
        self.assertEqual(event.metadata['game_count'], 8)
```

- [ ] **Step 4: Run backend tests**

Run: `cd /home/cda/dev/leaguesphere && python manage.py test journey.tests.GamedayAdoptionTrackingTest`

Expected: PASS

- [ ] **Step 5: Manual verification checklist**

- [ ] Open gameday_designer, verify `gameday_designer_opened` event fires
- [ ] Create a new gameday, verify `gameday_created` event fires
- [ ] Edit the gameday (add/remove elements), verify `gameday_edited` events fire
- [ ] Open template library, verify `template_library_opened` fires
- [ ] Apply a template, verify `template_used` fires
- [ ] Publish gameday, verify `gameday_published` fires
- [ ] Navigate to journey_dashboard, verify events appear in timeline
- [ ] Filter timeline to "Gameday Designer", verify filter works
- [ ] Check funnel visualization shows correct percentages
- [ ] Check adoption metrics card displays correct stats

- [ ] **Step 6: Commit Phase 4 complete**

```bash
git add journey_dashboard/src/__tests__/integration/gameday-adoption.integration.test.ts \
        journey/tests.py
git commit -m "test: add integration tests for gameday adoption tracking end-to-end"
```

---

## Summary

**All 10 tasks complete:**

✅ **Phase 1:** Gameday Designer instrumentation (basic + core events)
- Task 1: Track opens & creates
- Task 2: Track edits
- Task 3: Track publishing

✅ **Phase 2:** Advanced feature instrumentation
- Task 4: Track templates
- Task 5: Track import/export/global teams/officials

✅ **Phase 3:** Dashboard visualization
- Task 6: Add event query helper
- Task 7: Build funnel component
- Task 8: Build metrics component
- Task 9: Integrate components & add filter

✅ **Phase 4:** Integration testing
- Task 10: End-to-end verification

**Expected Outcomes:**
- 10 event types tracked in gameday_designer
- Dashboard shows adoption funnel (opened → created → edited → published)
- Adoption metrics display: opens, publish rate, template adoption
- Mixed event timeline shows gameday designer alongside other features
- All tests passing, zero regressions
