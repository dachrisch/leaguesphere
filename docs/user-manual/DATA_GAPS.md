# Test Data Gaps Report

**Date:** 7. November 2025
**Purpose:** Document missing or insufficient test data for comprehensive user manual screenshots

## Executive Summary

During screenshot capture for the user manual, several features showed empty states due to missing test data. While these empty states are useful for documentation, we also need screenshots showing these features with actual data for complete user manual coverage.

## Data Gaps Identified

### 1. Passcheck Feature

**URL:** `http://localhost:8000/passcheck/`

**Current State:**
- ✅ Successfully loaded
- ❌ Shows "Bitte ein Spiel auswählen:" (Please select a game)
- ❌ No games available in the selection list

**Screenshot Captured:**
- `SC-010-game-selection-empty.png` - Empty game selection

**Missing Data:**
- Games eligible for passcheck
- Active gamedays with scheduled games
- Games with status that allows passcheck

**Impact:**
- Cannot demonstrate:
  - Game selection workflow
  - Player passcheck interface
  - Transfer approval process
  - Eligibility status displays

**Recommendation for Test Data Enhancement:**
```python
# Need to create:
# - Gamedays with status allowing passcheck
# - Games assigned to those gamedays
# - Players with transfer/eligibility data
# - Moodle integration data (if available)
```

---

### 2. Scorecard Feature

**URL:** `http://localhost:8000/scorecard/`

**Current State:**
- ✅ Successfully loaded main menu
- ✅ Navigation works (Passcheck/Scorecard buttons)
- ❌ Shows "Keine Spieltage verfügbar" (No gamedays available)
- ❌ Cannot proceed to game scoring interface

**Screenshots Captured:**
- `SC-009-main-menu.png` - Main menu with buttons
- `SC-008-gameday-selection-empty.png` - Empty gameday selection

**Missing Data:**
- Gamedays configured for scorecard
- Games with teams assigned
- Active or scoreable games

**Impact:**
- Cannot demonstrate:
  - Gameday selection workflow
  - Game selection for scoring
  - Live scoring interface
  - Touchdown/PAT/Safety scoring
  - Real-time score updates
  - Game completion workflow

**Recommendation for Test Data Enhancement:**
```python
# Need to create:
# - Gamedays with today's date or recent dates
# - Games in "ready to score" status
# - Teams with rosters
# - Active scoring sessions
```

---

### 3. Liveticker Feature

**URL:** `http://localhost:8000/liveticker/`

**Current State:**
- ✅ Successfully loaded
- ❌ Shows "Aktuell finden keine Spiele statt." (Currently no games taking place)
- ❌ No games in progress or scheduled for today

**Screenshot Captured:**
- `SC-011-liveticker-no-games.png` - No active games message

**Missing Data:**
- Games scheduled for today
- Games in "in progress" status
- Live scoring data/events

**Impact:**
- Cannot demonstrate:
  - Live game ticker display
  - Real-time score updates
  - Play-by-play events
  - Multiple games view
  - Game status indicators

**Recommendation for Test Data Enhancement:**
```python
# Need to create:
# - Gameday with today's date
# - Games scheduled for today with start times
# - Games with status = "in_progress"
# - Scoring events (touchdowns, PATs, etc.)
# - Timeline of game events
```

---

### 4. Additional Missing Screenshots

While not data gaps, these features still need screenshots captured:

**Officials (Partially Complete):**
- ✅ SC-021: All assignments table
- ❌ SC-012: Schiedsrichteranmeldung (signup form)
- ❌ SC-015: Team overview (unclear what this refers to)

**Teammanager (Partially Complete):**
- ✅ SC-019: Team selection overview
- ✅ SC-020: Empty team roster
- ❌ SC-013: Teams list (different from SC-019?)

**Gamedays:**
- ❌ SC-006: Gameday detail with full schedule (pre-results)
- ❌ SC-017: Division-filtered gamedays list

**Navigation:**
- ✅ SC-014: Officials menu
- ✅ SC-016: Team menu
- ✅ SC-004: Orga menu

## Summary Table

| Feature | URL | Empty State Screenshot | Data Available | With Data Screenshot Needed |
|---------|-----|----------------------|----------------|---------------------------|
| Passcheck | /passcheck/ | ✅ SC-010 | ❌ No games | ✅ Yes |
| Scorecard | /scorecard/ | ✅ SC-008, SC-009 | ❌ No gamedays | ✅ Yes |
| Liveticker | /liveticker/ | ✅ SC-011 | ❌ No active games | ✅ Yes |
| Officials | /officials/ | ✅ SC-021 | ⚠️ Partial | ⚠️ Need signup form |
| Teammanager | /teammanager/ | ✅ SC-019, SC-020 | ⚠️ Partial | ⚠️ Need roster with players |
| Gamedays | /gamedays/ | ➖ | ✅ Yes | ⚠️ Need more variants |

## Recommendations

### Immediate Actions

1. **Enhance `populate_manager_test_data.py` script** to include:
   - Recent/today's gamedays
   - Games in various states (scheduled, in_progress, completed)
   - Player roster data for teams
   - Eligibility/transfer data for passcheck

2. **Create separate test data scenarios:**
   - Scenario 1: Active gameday with live games (for Liveticker)
   - Scenario 2: Gameday ready for scoring (for Scorecard)
   - Scenario 3: Games eligible for passcheck (for Passcheck)

3. **Document test data requirements** in script comments

### Test Data Enhancement Script Outline

```python
# scripts/populate_complete_test_data.py

def create_live_gameday_scenario():
    """
    Create gameday with games scheduled for TODAY
    - Status: in_progress
    - Multiple games at different times
    - Scoring events already recorded
    - For: Liveticker, Scorecard
    """
    pass

def create_passcheck_scenario():
    """
    Create games eligible for passcheck
    - Players with transfers
    - Eligibility statuses
    - For: Passcheck feature
    """
    pass

def create_complete_rosters():
    """
    Add players to team rosters
    - Jersey numbers
    - Positions
    - Eligibility data
    - For: Teammanager, Passcheck
    """
    pass

def create_officials_data():
    """
    Create official signup scenarios
    - Officials registered for gamedays
    - Assignments to games
    - For: Officials feature
    """
    pass
```

### Documentation Strategy

For features with missing data:

1. **Keep empty state screenshots** - They're valuable for showing edge cases
2. **Add warning notes in documentation** explaining current limitations
3. **Create "with data" versions** once test data is enhanced
4. **Use side-by-side comparisons** (empty vs populated) in documentation

## Next Steps

1. ✅ Document these gaps (this file)
2. ⏳ Share with development team / test data specialist
3. ⏳ Enhance test data population script
4. ⏳ Re-run screenshot capture for features with data
5. ⏳ Update documentation pages with both empty and populated states

## Appendix: Current Test Data Status

**From `populate_manager_test_data.py`:**
- ✅ 27 Teams created
- ✅ 18 Gamedays created
- ✅ Games assigned to gamedays
- ✅ 6 Users created
- ✅ Game results populated
- ❌ No player rosters
- ❌ No active games (today's date)
- ❌ No in-progress games
- ❌ No passcheck eligibility data
- ❌ No liveticker events
- ❌ No officials signup data

**Test Database:**
- Location: LXC container `servyy-test` at 10.185.182.207
- Database: `test_db`
- User: `user` / Password: `user`

## Conclusion

While we successfully captured 7 new screenshots showing empty states, comprehensive user manual coverage requires populated data states. The identified gaps are specific and actionable - a test data enhancement agent or script can address these systematically.

**Current Screenshot Count:** 18 total (11 from previous session + 7 from this session)
**Screenshots with populated data needed:** ~10-15 additional screenshots
