# Scroll Collapse Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add smooth collapse/expand animation to the team pool card when scrolling, matching the metadata accordion's existing animation behavior.

**Architecture:** Replace the team pool card's conditional body rendering with React Bootstrap's `Collapse` component (which enables automatic height animation). The scroll detection and `isCollapsed` state logic remain unchanged in `ListDesignerApp` — this is purely a visual enhancement to the `MetadataTeamPoolRow` component.

**Tech Stack:** React, React Bootstrap (Collapse component), CSS transitions

---

## Task 1: Add Collapse Import and Update Team Pool Body Rendering

**Files:**
- Modify: `gameday_designer/src/components/MetadataTeamPoolRow.tsx:1-180`

- [ ] **Step 1: Read the current MetadataTeamPoolRow.tsx file**

This shows the current conditional rendering pattern for the team pool card body.

- [ ] **Step 2: Add Collapse import from react-bootstrap**

At the top of `MetadataTeamPoolRow.tsx`, add to the React Bootstrap imports:
```typescript
import { Card, Button, Collapse } from 'react-bootstrap';
```

- [ ] **Step 3: Replace conditional rendering with Collapse component**

Find this section (around line 154):
```typescript
{!isCollapsed && (
  <Card.Body>
    <GlobalTeamTable
      teams={globalTeams}
      groups={globalTeamGroups}
      highlightedElement={highlightedElement}
      onAddGroup={onAddGlobalTeamGroup}
      onUpdateGroup={onUpdateGlobalTeamGroup}
      onDeleteGroup={onDeleteGlobalTeamGroup}
      onReorderGroup={onReorderGlobalTeamGroup}
      onAddTeam={onAddGlobalTeam}
      onUpdate={onUpdateGlobalTeam}
      onDelete={onDeleteGlobalTeam}
      onReplace={onReplaceGlobalTeam}
      onReorder={onReorderGlobalTeam}
      onShowTeamSelection={onShowTeamSelection}
      getTeamUsage={getTeamUsage}
      allNodes={allNodes}
      readOnly={readOnly}
    />
  </Card.Body>
)}
```

Replace with:
```typescript
<Collapse in={!isCollapsed}>
  <Card.Body>
    <GlobalTeamTable
      teams={globalTeams}
      groups={globalTeamGroups}
      highlightedElement={highlightedElement}
      onAddGroup={onAddGlobalTeamGroup}
      onUpdateGroup={onUpdateGlobalTeamGroup}
      onDeleteGroup={onDeleteGlobalTeamGroup}
      onReorderGroup={onReorderGlobalTeamGroup}
      onAddTeam={onAddGlobalTeam}
      onUpdate={onUpdateGlobalTeam}
      onDelete={onDeleteGlobalTeam}
      onReplace={onReplaceGlobalTeam}
      onReorder={onReorderGlobalTeam}
      onShowTeamSelection={onShowTeamSelection}
      getTeamUsage={getTeamUsage}
      allNodes={allNodes}
      readOnly={readOnly}
    />
  </Card.Body>
</Collapse>
```

- [ ] **Step 4: Verify the file has valid TypeScript syntax**

Run: `cd gameday_designer && npm run eslint src/components/MetadataTeamPoolRow.tsx`

Expected: No errors related to the Collapse import or component usage.

- [ ] **Step 5: Commit the import and template change**

```bash
cd /home/cda/dev/leaguesphere
git add gameday_designer/src/components/MetadataTeamPoolRow.tsx
git commit -m "feat: wrap team pool card body in Collapse component for animation

Replace conditional rendering with React Bootstrap Collapse to enable
smooth height animation on collapse/expand during scroll.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add CSS Transitions for Smooth Animation

**Files:**
- Modify: `gameday_designer/src/components/MetadataTeamPoolRow.css:50-55`

- [ ] **Step 1: Read the current team pool card body styles**

Check the section starting at line 50 in MetadataTeamPoolRow.css.

- [ ] **Step 2: Add transition to the card-body selector**

Find this section:
```css
.team-pool-card .card-body {
  flex: 1;
  min-height: 0;
  padding: 1rem;
  overflow: hidden;
}
```

Update to:
```css
.team-pool-card .card-body {
  flex: 1;
  min-height: 0;
  padding: 1rem;
  overflow: hidden;
  transition: all 0.35s ease-in-out;
}
```

This matches Bootstrap's accordion animation timing (0.35s) and easing.

- [ ] **Step 3: Verify CSS syntax is valid**

Run: `cd gameday_designer && npm run eslint src/components/MetadataTeamPoolRow.css 2>&1 | head -20`

Expected: No errors or warnings about the CSS file (or only warnings unrelated to card-body).

- [ ] **Step 4: Commit the CSS change**

```bash
cd /home/cda/dev/leaguesphere
git add gameday_designer/src/components/MetadataTeamPoolRow.css
git commit -m "style: add smooth transition to team pool card collapse animation

Match metadata accordion animation timing (0.35s ease-in-out) for
consistent visual behavior on scroll-triggered collapse/expand.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Verify Component Renders Correctly in Browser

**Files:**
- No file modifications; verification only

- [ ] **Step 1: Start the dev server (if not already running)**

Run: `cd gameday_designer && npm run dev > /dev/null 2>&1 &`

- [ ] **Step 2: Navigate to the gameday designer in the browser**

Open: `http://localhost:3001/designer/3`

- [ ] **Step 3: Test collapse animation on scroll down**

Scroll down in the main content area. You should see:
- The metadata accordion smoothly collapses to header-only at scroll > 50px
- The team pool card smoothly collapses to header-only at the same threshold
- Both animations should take ~0.35s and look visually identical

Expected: Smooth, coordinated collapse animation without jarring layout shifts.

- [ ] **Step 4: Test expand animation on scroll up**

Scroll back up to the top. You should see:
- Both cards smoothly expand to show their full content
- Animation should complete within ~0.35s

Expected: Smooth expand animation matching the collapse animation.

- [ ] **Step 5: Verify no visual regressions**

Check:
- Card headers are always visible and clickable
- Content is completely hidden when collapsed (no overflow)
- Card spacing and layout remain correct
- No console errors in the browser DevTools

Expected: Clean UI with no visual glitches.

---

## Task 4: Run Tests to Ensure No Regressions

**Files:**
- Test: `gameday_designer/src/components/__tests__/MetadataTeamPoolRow.test.tsx`

- [ ] **Step 1: Run the MetadataTeamPoolRow tests**

Run: `cd gameday_designer && npm run test:run -- MetadataTeamPoolRow.test.tsx --no-coverage 2>&1 | tail -30`

Expected: All tests pass. If any tests fail, they should be related to the Collapse component import or rendering.

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd gameday_designer && npm run test:run --no-coverage 2>&1 | tail -50`

Expected: All tests pass. Output should show no new failures.

- [ ] **Step 3: No commit needed**

The changes are backward-compatible. No test updates required since the component's public API and props remain the same. The Collapse component handles rendering automatically.

---

## Task 5: Verify Linting Passes

**Files:**
- No modifications; verification only

- [ ] **Step 1: Run ESLint on the modified component**

Run: `cd gameday_designer && npm run eslint src/components/MetadataTeamPoolRow.tsx`

Expected: PASS with no errors.

- [ ] **Step 2: Run ESLint on the CSS file**

Run: `cd gameday_designer && npm run eslint src/components/MetadataTeamPoolRow.css`

Expected: PASS with no errors (or only unrelated warnings).

- [ ] **Step 3: No commit needed**

If linting passed, the code is clean.

---

## Summary

**Changes Made:**
1. ✅ Added `Collapse` import from React Bootstrap
2. ✅ Wrapped team pool card body in `<Collapse in={!isCollapsed}>`
3. ✅ Added CSS transition timing to card-body
4. ✅ Verified smooth animation in browser
5. ✅ Confirmed all tests pass and no regressions

**Total Commits:** 2 (component change + CSS change)

**Result:** Team pool card now smoothly collapses/expands on scroll, matching metadata accordion animation style.
