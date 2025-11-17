# LeagueSphere User Manual - Screenshot Checklist

This document provides a quick reference checklist of all screenshots needed for the standalone HTML user manual based on the user journey scenarios.

**Total Screenshots Needed:** 55+

---

## Checklist Format

- [ ] **Screenshot ID** - Brief description

---

## 1. Authentication & Navigation (4 Screenshots)

- [ ] **SC-001** - Login page with form fields and "Login" button
- [ ] **SC-002** - Home/dashboard page with welcome message
- [ ] **SC-003** - Navigation menu/header (top navigation bar with dropdown menus)
- [ ] **SC-004** - Mobile navigation (hamburger menu, collapsed nav)

---

## 2. Scenario 1: Create Gameday & Schedule Games (7 Screenshots)

- [ ] **SC-005** - Gamedays list view showing existing gamedays filtered by season/league
- [ ] **SC-006** - Create Gameday form (empty state with all fields)
- [ ] **SC-007** - Completed Create Gameday form with sample data filled in
- [ ] **SC-008** - Success message after gameday creation
- [ ] **SC-009** - Add Games form/wizard (first game being added)
- [ ] **SC-010** - Game schedule after adding multiple games (showing games in time slots)
- [ ] **SC-011** - Gameday detail view with complete schedule (all games visible)

---

## 3. Scenario 2: Team Manager - Roster Management (9 Screenshots)

- [ ] **SC-012** - Team Manager dashboard showing team selection
- [ ] **SC-013** - Team list view (multiple teams)
- [ ] **SC-014** - Team detail page (team info + roster section)
- [ ] **SC-015** - Add Player form (empty state)
- [ ] **SC-016** - Add Player form (completed with sample player data)
- [ ] **SC-017** - Success message after player added
- [ ] **SC-018** - Roster list showing multiple players (name, number, position, photo)
- [ ] **SC-019** - Bulk upload CSV dialog/interface
- [ ] **SC-020** - Player eligibility status list (showing pass card, verification status)

---

## 4. Scenario 3: Passcheck - Player Eligibility Check (7 Screenshots)

- [ ] **SC-021** - Passcheck home/welcome screen
- [ ] **SC-022** - Gameday selection dropdown
- [ ] **SC-023** - Team selection (Home Team / Away Team toggle)
- [ ] **SC-024** - Team roster for passcheck (list of players to check in)
- [ ] **SC-025** - Player detail card during check-in (large photo, verification fields)
- [ ] **SC-026** - Roster with check-in status (showing checked/unchecked players)
- [ ] **SC-027** - Team check-in complete summary (X players checked in)

---

## 5. Scenario 4: Scorecard - Live Game Scoring (10 Screenshots)

- [ ] **SC-028** - Scorecard home/game selection screen
- [ ] **SC-029** - Live game scorecard view (score display, team names, quarter)
- [ ] **SC-030** - Touchdown recording dialog (team selection, player dropdown)
- [ ] **SC-031** - Score display after touchdown (updated score shown)
- [ ] **SC-032** - Extra point/conversion dialog (type selection, player selection)
- [ ] **SC-033** - Score after extra point recorded
- [ ] **SC-034** - Statistics entry interface (showing stat entry controls)
- [ ] **SC-035** - Player statistics view (showing accumulated stats)
- [ ] **SC-036** - Halftime summary view (score, stats, quarter end)
- [ ] **SC-037** - Final score display (end of game, final score shown)
- [ ] **SC-038** - Game summary/statistics after submission (complete game recap)

---

## 6. Scenario 5: Liveticker - Live Game Viewing (7 Screenshots)

- [ ] **SC-039** - Liveticker home showing active games
- [ ] **SC-040** - Game selection list (today's active/upcoming games)
- [ ] **SC-041** - Live game ticker display (score, quarter, time remaining)
- [ ] **SC-042** - Play-by-play feed (chronological game events)
- [ ] **SC-043** - Game statistics view (team stats - passing, rushing, defense)
- [ ] **SC-044** - Player statistics detail (individual player stats)
- [ ] **SC-045** - League Table view (standings with W-L-T, percentage)

---

## 7. Scenario 6: Officials Management (7 Screenshots)

- [ ] **SC-046** - Officials home/dashboard
- [ ] **SC-047** - Officials list view (table of officials with certifications)
- [ ] **SC-048** - Officials filtered list (by certification or status)
- [ ] **SC-049** - Official profile view (photo, license, history, assignments)
- [ ] **SC-050** - Officials assignment form for a game (position fields)
- [ ] **SC-051** - Referee dropdown selection (showing available officials)
- [ ] **SC-052** - Game with assigned officials (showing all three positions filled)
- [ ] **SC-053** - Email notification dialog (preview of email to send)

---

## 8. Scenario 7: League Table & Standings (6 Screenshots)

- [ ] **SC-054** - League table home/overall standings
- [ ] **SC-055** - Division standings (after selecting specific division)
- [ ] **SC-056** - Team detail view (selected team information)
- [ ] **SC-057** - Team game log (showing all games with results)
- [ ] **SC-058** - Season statistical leaders (passing yards, receiving, TDs, defense)
- [ ] **SC-059** - Playoff seeding bracket (showing seeds and matchups)

---

## 9. Scenario 8: Pre-Game Preparation (8 Screenshots)

- [ ] **SC-060** - Team manager dashboard with game schedule section
- [ ] **SC-061** - Upcoming games view (next scheduled game details)
- [ ] **SC-062** - Roster with availability status (playing/injured/unavailable)
- [ ] **SC-063** - Player availability update dialog
- [ ] **SC-064** - Player eligibility status page (showing pass card validity)
- [ ] **SC-065** - Equipment checklist view (pre-game items to verify)
- [ ] **SC-066** - Roster report (formatted PDF/printable version)
- [ ] **SC-067** - Send game reminder dialog (message preview)

---

## Additional Supporting Screenshots (Optional but Recommended)

- [ ] **SC-068** - Error message example (validation error on form)
- [ ] **SC-069** - Confirmation dialog example (delete confirmation)
- [ ] **SC-070** - Loading state (spinner during data fetch)
- [ ] **SC-071** - Empty state (no games scheduled yet)
- [ ] **SC-072** - Ineligible player warning (suspension/eligibility issue)
- [ ] **SC-073** - Mobile view - Team Manager (responsive layout)
- [ ] **SC-074** - Mobile view - Liveticker (responsive layout)
- [ ] **SC-075** - Print preview (example of printable scorecard)

---

## Device-Specific Screenshots

### Desktop (Primary - 1024px+)
- All main flow screenshots should show desktop view
- Include full navigation bar
- Show multi-column layouts where applicable
- Demonstrate keyboard focus states

### Tablet (Secondary - 768px-1023px)
- Key screenshots showing responsive behavior
- Show any layout changes from desktop
- Demonstrate touch interactions

### Mobile (Tertiary - 320px-767px)
- Critical user flows (passcheck, scorecard, liveticker)
- Show single-column layout
- Demonstrate hamburger menu
- Show touch-friendly buttons

---

## Screenshot Organization for Manual

### Section 1: Getting Started
- SC-001: Login page
- SC-002: Home page
- SC-003: Navigation menu
- SC-004: Mobile menu (optional)

### Section 2: Managing Gamedays
- SC-005 through SC-011

### Section 3: Managing Teams & Players
- SC-012 through SC-020

### Section 4: Player Eligibility (Passcheck)
- SC-021 through SC-027

### Section 5: Live Game Scoring
- SC-028 through SC-038

### Section 6: Following Games Live
- SC-039 through SC-045

### Section 7: Managing League Officials
- SC-046 through SC-053

### Section 8: Viewing League Standings
- SC-054 through SC-059

### Section 9: Pre-Game Checklist
- SC-060 through SC-067

### Appendix: UI Elements & Error States
- SC-068 through SC-075

---

## Capture Tips & Standards

### Image Quality
- Resolution: Minimum 1280x720 for desktop screenshots
- Format: PNG with transparent backgrounds (for UI elements)
- Compression: Optimized for web (under 500KB per image)
- DPI: 96 DPI (screen resolution)

### Annotations
- Use red rectangles/arrows to highlight clickable elements
- Add numbered callouts for multi-step processes
- Include keyboard shortcut hints where applicable
- Highlight important data/results

### Consistency
- Use same test data across all screenshots (team names, player names, dates)
- Maintain consistent browser zoom level (100%)
- Use same device/resolution for all desktop screenshots
- Use same device for all mobile screenshots

### Scenarios to Capture
- **Happy path:** Standard successful workflows
- **Success states:** Confirmation messages, updated UI
- **Input examples:** Forms filled with realistic sample data
- **Results:** Data display after actions (tables, lists, statistics)
- **Error handling:** Validation messages, warnings, ineligibility notices

---

## Data Consistency Across Screenshots

### Teams (Use consistently)
- Bumble Bees
- Thunder Hawks
- Fire Foxes
- Eagles

### Players (Use consistently)
- James Smith #12 (QB)
- David Williams #5 (WR)
- Maria Johnson #3 (WR)
- Sarah Brown #7 (QB)
- Michael Torres (Thunder Hawks QB)
- Thomas Green (DB)
- Jessica Harris (DB)

### Dates
- Gameday Date: 11/14/2024 (consistent across all scenarios)
- Game Times: 6:00 PM, 6:30 PM, 7:00 PM (consistent pattern)
- Season: Fall 2024

### Leagues/Divisions
- Competitive Division
- Recreational Division

### Officials (Sample)
- John Martinez (Head Referee)
- Susan Lee (Head Referee)
- Maria Garcia (Line Judge)
- James Wilson (Line Judge)
- David Park (Scorekeeper)

---

## Browser & Platform Matrix

### Browsers to Test
- Chrome (Desktop & Mobile)
- Firefox (Desktop)
- Safari (Desktop & iPad/Mobile)
- Edge (Desktop)

### Devices
- Desktop: 1920x1080 (primary)
- Tablet: 1024x768 (iPad landscape)
- Mobile: 375x812 (iPhone 12 size)

### Special Cases
- Passcheck: iPad in portrait or landscape
- Scorecard: Laptop/tablet during game
- Liveticker: iPhone/Android phone
- Team Manager: Desktop primary
- League Table: All devices

---

## Annotation Standards

### Highlighting Important Elements
- Use semi-transparent red overlay for button to click
- Use arrow with number for multi-step sequence
- Use box with label for input fields
- Use checkmark for completed/verified items

### Text Callouts
1. Action labels: "Click 'Save'"
2. Section labels: "Gameday Details Section"
3. Status labels: "Status: Complete ✓"
4. Warning labels: "⚠️ Player Suspended"

### Keyboard Shortcuts (where applicable)
- "Ctrl+S to save"
- "Enter to confirm"
- "Esc to cancel"

---

## Release Notes for Screenshots

**Version:** LeagueSphere v5.2.x
**Screenshot Date:** [Capture date]
**Browser Version:** [Browser used]
**Mobile OS Version:** [iOS/Android version if mobile]

All screenshots were captured in a clean development environment with test data and should be updated when:
- UI significantly changes
- New features are added
- Responsive design is modified
- Branding/colors change

---

## File Naming Convention

Use format: `SC-###-[feature]-[state].png`

Examples:
- `SC-001-login-page.png`
- `SC-029-scorecard-live-game.png`
- `SC-054-league-table-standings.png`
- `SC-024-passcheck-roster-list.png`

---

## Priority Tiers

### Tier 1 - CRITICAL (Must have)
- SC-001, SC-002, SC-003
- SC-005, SC-007, SC-010
- SC-021, SC-024, SC-026
- SC-028, SC-031, SC-038
- SC-039, SC-041, SC-045
- SC-054, SC-057

### Tier 2 - IMPORTANT (Should have)
- SC-006, SC-008, SC-009, SC-011
- SC-012, SC-015, SC-018, SC-019, SC-020
- SC-022, SC-023, SC-025, SC-027
- SC-029, SC-030, SC-032, SC-033, SC-034, SC-035, SC-036, SC-037
- SC-040, SC-042, SC-043, SC-044
- SC-046, SC-049, SC-050, SC-051, SC-052, SC-053
- SC-055, SC-056, SC-058, SC-059

### Tier 3 - NICE-TO-HAVE (Would enhance manual)
- SC-004
- SC-013, SC-014, SC-016, SC-017
- SC-060, SC-061, SC-062, SC-063, SC-064, SC-065, SC-066, SC-067
- SC-068 through SC-075 (error states, mobile views, appendix)

---

## Status Tracking

| Screenshot | Needed | Captured | Reviewed | Annotated | Status |
|-----------|--------|----------|----------|-----------|--------|
| SC-001 | ✓ | [ ] | [ ] | [ ] | pending |
| SC-002 | ✓ | [ ] | [ ] | [ ] | pending |
| SC-003 | ✓ | [ ] | [ ] | [ ] | pending |
| ... | ... | ... | ... | ... | ... |

---

## Next Steps After Screenshot Capture

1. **Review Phase:** Quality check all screenshots
2. **Annotation Phase:** Add labels, arrows, highlights
3. **Integration Phase:** Place in HTML manual with descriptions
4. **Testing Phase:** Verify all links/references are correct
5. **Accessibility Phase:** Add alt-text, captions, descriptions
6. **Final Review:** Check for consistency across manual

---

## Document Version

- **Version:** 1.0
- **Created:** 2024-11-07
- **Status:** Ready for screenshot capture
- **Last Updated:** 2024-11-07

