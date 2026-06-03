# Scroll Collapse Animation Design
**Date:** 2026-06-03  
**Feature:** Smooth collapse/expand animation for metadata and team pool on scroll

## Overview
Add smooth height animation to the team pool card when collapsing/expanding on scroll, matching the metadata accordion's existing animation behavior.

## Current State
- **Scroll listener**: `ListDesignerApp` detects scroll position on `.list-designer-app__content`
  - Collapses when `scrollTop > 50px` → sets `isRowCollapsed = true`
  - Expands when `scrollTop <= 50px` → sets `isRowCollapsed = false`
- **Metadata accordion**: Uses React Bootstrap's `Accordion` with `forceCollapsed={isCollapsed}`
  - Provides smooth animation automatically via Bootstrap's Collapse mechanism
- **Team pool card**: Conditionally renders body with `{!isCollapsed && (...)}`
  - No animation — body instantly appears/disappears

## Problem
Team pool card collapse is visually jarring compared to the smooth metadata accordion animation. Users expect consistent animation across both collapsed components.

## Solution
Wrap the team pool card body in React Bootstrap's `Collapse` component to enable smooth height animation.

### Implementation Details

**File: `gameday_designer/src/components/MetadataTeamPoolRow.tsx`**

1. Import `Collapse` from React Bootstrap
2. Replace conditional rendering:
   ```typescript
   // Before
   {!isCollapsed && (
     <Card.Body>
       <GlobalTeamTable {...props} />
     </Card.Body>
   )}
   
   // After
   <Collapse in={!isCollapsed}>
     <Card.Body>
       <GlobalTeamTable {...props} />
     </Card.Body>
   </Collapse>
   ```

3. Add CSS for smooth transition (in `MetadataTeamPoolRow.css`):
   ```css
   .team-pool-card .card-body {
     transition: all 0.35s ease-in-out;
   }
   ```

**File: `gameday_designer/src/components/MetadataTeamPoolRow.css`**
- Add transition timing to match Bootstrap's accordion animation speed
- Ensure `overflow: hidden` is set on card-body for clean animation

### Behavior
- Scroll down > 50px: Team pool card smoothly collapses to header-only
- Scroll up ≤ 50px: Team pool card smoothly expands to show content
- Animation matches metadata accordion style ("small animation")
- No changes to scroll detection or state management logic

### Testing
- Verify smooth animation during scroll (manual browser testing)
- Confirm collapse/expand timing matches metadata accordion
- Check that card content is fully hidden when collapsed
- Verify no layout shifts during animation

## Dependencies
- React Bootstrap (already in use for Accordion/Collapse)
- Existing `isRowCollapsed` state from `ListDesignerApp`
- Existing `MetadataTeamPoolRow` component structure

## No Breaking Changes
- Public API unchanged (same props)
- Visual-only enhancement
- No state management changes needed
