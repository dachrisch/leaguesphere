# LeagueSphere User Journey Scenarios - Quick Reference

This document provides a quick overview of the 8 user journey scenarios defined for the LeagueSphere manual.

---

## Overview

**Total Scenarios:** 8
**Total Steps:** 77
**Total Screenshots:** 55+
**Scope:** All major features and user workflows

---

## Scenario Summary Table

| # | Scenario | User Role | Duration | Frequency | Key Feature |
|---|----------|-----------|----------|-----------|------------|
| 1 | Create Gameday & Schedule Games | League Admin | 5-10 min | Weekly | Gamedays |
| 2 | Manage Team Roster | Team Manager | 10-15 min (init) | Ongoing | Team Manager |
| 3 | Player Eligibility Check (Passcheck) | Official/Scorekeeper | 5-10 min | Every game | Passcheck |
| 4 | Record Live Game Score | Scorekeeper | 40-60 min | Every game | Scorecard |
| 5 | View Live Games & Standings | Spectator | Variable | During games | Liveticker |
| 6 | Manage Officials & Assignments | Officials Manager | 15-20 min | Weekly | Officials |
| 7 | View Season Statistics | League Admin | 5-10 min | Weekly | League Table |
| 8 | Pre-Game Team Preparation | Team Manager | 10-15 min | Before game | Team Manager |

---

## Quick Feature Coverage Matrix

### Features by Scenario

| Feature | Scenario 1 | Scenario 2 | Scenario 3 | Scenario 4 | Scenario 5 | Scenario 6 | Scenario 7 | Scenario 8 |
|---------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|
| Gamedays | **●** | | | | | | | |
| Teams | | **●** | | | | | | **●** |
| Players | | **●** | **●** | **●** | **●** | | **●** | **●** |
| Passcheck | | | **●** | | | | | |
| Scorecard | | | | **●** | | | | |
| Liveticker | | | | | **●** | | | |
| League Table | | | | | **●** | | **●** | |
| Officials | **●** | | | | | **●** | | |
| Statistics | | **●** | | **●** | **●** | | **●** | **●** |

**Legend:** ● = Primary feature, Feature mentioned secondarily or in context

---

## Scenario Details

### Scenario 1: League Administrator Creates a New Gameday and Schedules Games

**Role:** League Administrator (staff/admin user)
**Context:** Setting up a gameday event with multiple games

**Key Actions:**
1. Login
2. Navigate to Gamedays
3. Create new gameday (fill form with season, league, date, time, location)
4. Add multiple games to schedule (for each game: time, field, teams, standing, stage)
5. View completed schedule
6. Assign officials to games

**Screenshots Needed:** 7
- Gamedays list view
- Create gameday form (empty)
- Create gameday form (filled)
- Success message
- Add games form
- Schedule with multiple games
- Gameday detail view

**Sample Data:**
- Gameday: "Week 5 - Fall Regular Season"
- Date: 11/14/2024
- Teams: Bumble Bees vs Thunder Hawks, Fire Foxes vs Eagles
- Fields: 1, 2, 3, 4

---

### Scenario 2: Team Manager Adds Players to Roster and Manages Eligibility

**Role:** Team Manager (team owner/admin)
**Context:** Building and maintaining team roster for current season

**Key Actions:**
1. Login as team manager
2. Navigate to Team Management
3. Select team
4. View team detail page
5. Add individual players (form: name, number, position, birth date, photo)
6. Bulk upload players (CSV file)
7. Manage player information (edit details)
8. View player eligibility status
9. Delete or transfer players

**Screenshots Needed:** 9
- Team manager dashboard
- Team list
- Team detail page
- Add player form (empty)
- Add player form (filled)
- Success message
- Roster list
- Bulk upload dialog
- Player eligibility list

**Sample Data:**
- Team: Bumble Bees
- Players: James Smith #12 (QB), David Williams #5 (WR), Maria Johnson #3 (WR)

---

### Scenario 3: Official Performs Player Eligibility Check (Passcheck)

**Role:** Official/Scorekeeper (at gameday)
**Context:** Verify player eligibility before games start

**Key Actions:**
1. Navigate to Passcheck app
2. Select gameday
3. Select team (home or away)
4. View team roster
5. Check players in (visual verification of photo + pass card)
6. Handle missing or ineligible players
7. Complete team check-in
8. Repeat for away team
9. Final verification summary

**Screenshots Needed:** 7
- Passcheck home
- Gameday selection dropdown
- Team selection
- Team roster list
- Player detail card (for verification)
- Roster with check-in status
- Check-in complete summary

**Sample Data:**
- Gameday: Week 5, 11/14/2024
- Teams: Bumble Bees vs Thunder Hawks
- Expected players: ~12 per team

---

### Scenario 4: Scorekeeper Records Live Game Score and Statistics

**Role:** Scorekeeper (at gameday)
**Context:** Record real-time scoring and game statistics

**Key Actions:**
1. Open Scorecard app
2. Select current game
3. Record touchdown (select team, player)
4. Record extra point (kick or conversion, player)
5. Record player statistics throughout game (completions, receptions, yards, TDs)
6. Manage game clock (quarter/halftime changes)
7. Record safety
8. Record additional scoring plays
9. End game
10. Review and submit game statistics

**Screenshots Needed:** 11
- Scorecard home/game selection
- Live score display
- Touchdown dialog
- Score after TD
- Extra point dialog
- Score after XP
- Statistics entry interface
- Player statistics view
- Halftime summary
- Final score display
- Game summary/statistics after submission

**Sample Data:**
- Game: Bumble Bees (7) vs Thunder Hawks (10)
- Scoring plays: 2 TDs, 2 XPs, 1 Safety
- Player stats tracked

---

### Scenario 5: Spectator Views Live Game Ticker and Standings

**Role:** Spectator (coach, player, parent, fan - viewing only)
**Context:** Follow live games and check standings

**Key Actions:**
1. Navigate to Liveticker
2. Select game to watch
3. View live game updates (current score, quarter, time)
4. Review play-by-play log
5. Check team statistics
6. View player statistics
7. Navigate to League Table
8. View division standings
9. View league schedule
10. Filter by team (if applicable)

**Screenshots Needed:** 7
- Liveticker home with active games
- Game selection list
- Live ticker display
- Play-by-play feed
- Game statistics view
- Player statistics detail
- League table/standings view

**Sample Data:**
- Active games during gameday
- Current scores and play-by-play entries
- Division standings with team records

---

### Scenario 6: Official Manages Game Officials and Certifications

**Role:** Officials Manager/Association Administrator
**Context:** Manage official roster, track certifications, assign to games

**Key Actions:**
1. Navigate to Officials Management
2. View officials list (all officials with certification levels)
3. Filter officials (by certification, license status)
4. View official profile (details, game history)
5. Assign officials to gameday
6. Select officials for each game position (head ref, line judge, scorekeeper)
7. Confirm all assignments
8. Send email notifications to assigned officials

**Screenshots Needed:** 8
- Officials dashboard/home
- Officials list
- Filtered officials list
- Official profile
- Officials assignment form
- Referee dropdown selection
- Game with assigned officials
- Email notification dialog

**Sample Data:**
- Officials: John Martinez, Susan Lee, Maria Garcia, James Wilson, David Park
- Certifications: Head Referee, Line Judge, Scorekeeper

---

### Scenario 7: League Administrator Views Season Statistics and League Table

**Role:** League Administrator
**Context:** Monitor season progress, view standings, prepare for playoffs

**Key Actions:**
1. Navigate to League Table
2. View overall standings
3. View division standings
4. View team statistics
5. View game log for team
6. View season leaders (statistical leaders)
7. View playoff seeding
8. Export or print reports

**Screenshots Needed:** 6
- League table home/overall standings
- Division standings (filtered)
- Team detail view
- Team game log
- Season statistical leaders
- Playoff seeding bracket

**Sample Data:**
- Standings with W-L-T records, win %, points for/against
- Division leaders and wildcard seeding

---

### Scenario 8: Team Manager Prepares Players for Game

**Role:** Team Manager
**Context:** Pre-game preparation, verify eligibility, remind players

**Key Actions:**
1. Login and navigate to team
2. Check upcoming game schedule
3. View team roster for next game
4. Mark players as available/unavailable/injured
5. Check player eligibility status
6. Request missing documentation from players
7. Review equipment requirements
8. Generate game roster report
9. Send game reminder to team
10. Confirm game preparation complete

**Screenshots Needed:** 8
- Team manager dashboard
- Upcoming games view
- Roster with availability status
- Player availability update dialog
- Player eligibility status page
- Equipment checklist
- Roster report (printable version)
- Send game reminder dialog

**Sample Data:**
- Team: Bumble Bees
- Next game: vs Thunder Hawks, 11/14/2024, 6:00 PM
- Player availability: Mix of playing, injured, unknown status

---

## Feature-to-Scenario Mapping

### Gamedays Feature
- **Scenario 1** - Create gameday, schedule games, assign officials

### Team Manager Feature
- **Scenario 2** - Roster management, player management
- **Scenario 8** - Pre-game preparation, availability tracking

### Passcheck Feature
- **Scenario 3** - Player eligibility verification before games

### Scorecard Feature
- **Scenario 4** - Live game scoring, statistics entry

### Liveticker Feature
- **Scenario 5** - Live game updates, standings viewing

### Officials Feature
- **Scenario 1** - Official assignment
- **Scenario 6** - Official management, certification tracking

### League Table Feature
- **Scenario 5** - Standings viewing
- **Scenario 7** - Comprehensive standings and statistics

### User Accounts Feature
- **Scenario 1, 2, 3, 4, 6** - Login required for all

---

## Sample Data Used Consistently

### Teams
- **Bumble Bees** (Competitive Division) - Central City
- **Thunder Hawks** (Competitive Division) - North Valley
- **Fire Foxes** (Recreational Division) - East Side
- **Eagles** (Recreational Division) - West End
- Dragons (additional team)
- Falcons (additional team)

### Key Players
- **James Smith** #12 (QB) - Bumble Bees - Born 01/15/1990
- **David Williams** #5 (WR) - Bumble Bees - Born 03/22/1992
- **Maria Johnson** #3 (WR) - Bumble Bees - Born 07/18/1995
- **Sarah Brown** #7 (QB) - Bumble Bees - Born 09/10/1988
- **Michael Torres** (QB) - Thunder Hawks
- **Thomas Green** (DB) - Bumble Bees
- **Jessica Harris** (DB) - Thunder Hawks

### Season & Leagues
- **Season:** Fall 2024
- **Leagues:** Competitive Division, Recreational Division
- **Gameday Date:** 11/14/2024 (Week 5)
- **Game Time:** 6:00 PM (primary), 6:30 PM, 7:00 PM
- **Fields:** 1, 2, 3, 4 (Central Park)

### Officials
- **John Martinez** (Head Referee)
- **Susan Lee** (Head Referee)
- **Maria Garcia** (Line Judge)
- **James Wilson** (Line Judge)
- **David Park** (Scorekeeper)
- **Lisa Anderson** (Scorekeeper)

### Sample Game Scores
- Bumble Bees 7, Thunder Hawks 10 (Week 5 game)
- Final score: Thunder Hawks win

---

## Navigation Flows

### From Home Page
1. Gamedays → Create Gameday → Schedule Games
2. Team Manager → Select Team → Manage Roster → Player Eligibility
3. Passcheck → Select Game → Check in Players
4. Scorecard → Select Game → Record Score
5. Liveticker → View Games → Follow Live
6. League Table → View Standings → Team Details
7. Officials → Assign Officials → Send Notifications
8. User Profile → Account Settings → Logout

---

## Device & Platform Notes

### Passcheck (Scenario 3)
- **Primary Device:** iPad (tablet-first)
- **Orientation:** Portrait or landscape
- **Internet:** WiFi at field
- **Use Case:** Real-time player verification during game preparation

### Scorecard (Scenario 4)
- **Primary Device:** Laptop/tablet
- **Setup:** Booth or sideline
- **Internet:** WiFi at field
- **Use Case:** Live scoring during game

### Liveticker (Scenario 5)
- **Primary Device:** Smartphone
- **Orientation:** Portrait
- **Internet:** May be remote (internet-dependent)
- **Use Case:** Following games from distance

### Team Manager, Officials, League Table (All)
- **Primary Device:** Desktop/Laptop
- **Secondary:** Tablet (portrait/landscape)
- **Internet:** Reliable internet required
- **Use Case:** Administrative work, not field-based

---

## Screenshot Organization

### By Scenario
```
Screenshots organized in folders:
SC-001 to SC-004: Authentication & Navigation (4 images)
SC-005 to SC-011: Scenario 1 - Gamedays (7 images)
SC-012 to SC-020: Scenario 2 - Team Roster (9 images)
SC-021 to SC-027: Scenario 3 - Passcheck (7 images)
SC-028 to SC-038: Scenario 4 - Scorecard (11 images)
SC-039 to SC-045: Scenario 5 - Liveticker (7 images)
SC-046 to SC-053: Scenario 6 - Officials (8 images)
SC-054 to SC-059: Scenario 7 - League Table (6 images)
SC-060 to SC-067: Scenario 8 - Pre-Game (8 images)
```

### Naming Convention
`SC-###-[scenario]-[step].png`

Examples:
- `SC-005-gamedays-list.png`
- `SC-030-scorecard-touchdown-dialog.png`
- `SC-054-league-table-standings.png`

---

## Implementation Timeline

### Phase 1: Setup & Planning (1 day)
- Review all scenarios
- Set up test environment
- Create sample data
- Plan screenshot capture schedule

### Phase 2: Screenshot Capture (3-5 days)
- Capture desktop screenshots (1920x1080)
- Capture tablet screenshots (if applicable)
- Capture mobile screenshots (Passcheck, Scorecard, Liveticker)
- Annotate and optimize images

### Phase 3: Manual Assembly (3-5 days)
- Create HTML structure
- Write section introductions
- Place screenshots with descriptions
- Add navigation links

### Phase 4: QA & Polish (2-3 days)
- Test all links and navigation
- Verify accessibility
- Check mobile responsiveness
- Gather user feedback

### Phase 5: Deployment (1 day)
- Final review
- Deploy to hosting
- Create backup

---

## Cross-Reference Guide

### Document Relationships
- **user-journeys.md** ← Detailed step-by-step instructions
- **screenshot-checklist.md** ← Complete screenshot requirements and organization
- **MANUAL-CREATOR-GUIDE.md** ← Implementation instructions and templates
- **USER-JOURNEY-SUMMARY.md** ← This document (quick reference)

### When to Use Each Document

| Need | Document |
|------|----------|
| Understand what each scenario covers | USER-JOURNEY-SUMMARY.md (this doc) |
| Know exact steps for a scenario | user-journeys.md |
| Track screenshot progress | screenshot-checklist.md |
| Build the actual HTML manual | MANUAL-CREATOR-GUIDE.md |
| Quick reference during capture | USER-JOURNEY-SUMMARY.md (this doc) |

---

## Success Criteria

Manual is complete and successful when:

### Content
- [ ] All 8 scenarios documented
- [ ] All 77 steps covered
- [ ] All 55+ screenshots included
- [ ] Sample data consistent throughout
- [ ] Navigation flows clear

### Quality
- [ ] No broken links
- [ ] No missing screenshots
- [ ] Professional formatting
- [ ] Consistent styling
- [ ] Correct spelling/grammar

### Accessibility
- [ ] WCAG 2.1 AA compliant
- [ ] Alt-text on all images
- [ ] Keyboard navigable
- [ ] Screen reader compatible

### Usability
- [ ] Easy to understand
- [ ] Quick to load
- [ ] Mobile responsive
- [ ] Print friendly
- [ ] User feedback positive

---

## Version & Status

| Item | Details |
|------|---------|
| Version | 1.0 |
| Created | 2024-11-07 |
| Status | Ready for manual creation |
| Document Type | Quick Reference Guide |
| Audience | Manual creators, QA, product teams |

---

## Next Steps

1. **Read** this summary to understand all scenarios
2. **Review** user-journeys.md for detailed instructions
3. **Check** screenshot-checklist.md for organization
4. **Follow** MANUAL-CREATOR-GUIDE.md to build manual
5. **Validate** against this summary during creation

---

## Questions?

Refer to the appropriate document:
- Feature details → user-journeys.md
- Screenshot tracking → screenshot-checklist.md
- Implementation help → MANUAL-CREATOR-GUIDE.md
- Quick overview → This document (USER-JOURNEY-SUMMARY.md)

