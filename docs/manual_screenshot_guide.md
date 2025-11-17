# Manual Screenshot Capture Guide for LeagueSphere User Manual

**Date**: 2025-11-07
**Status**: Ready for Manual Capture
**Environment**: http://localhost:8000
**Admin Login**: admin / admin123

## Overview

This guide provides step-by-step instructions for manually capturing screenshots for the LeagueSphere user manual. Screenshots are organized by priority and feature area.

## Browser Setup

### Recommended Configuration

1. **Browser**: Google Chrome (already running)
2. **Viewport Size**: 1440x900 (desktop-first application)
3. **Zoom Level**: 100% (default)
4. **Extensions**: Disable ad blockers and screenshot extensions that might interfere
5. **Language**: German (application default)

### Chrome Screenshot Method

**Option 1: Chrome DevTools (Recommended)**
1. Press `F12` to open DevTools
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open Command Palette
3. Type "screenshot" and select:
   - **"Capture full size screenshot"** - For full page captures
   - **"Capture screenshot"** - For visible viewport only
4. Screenshot saves to your Downloads folder
5. Move to appropriate directory

**Option 2: GNOME Screenshot Tool**
1. Press `PrtScn` for full screen
2. Press `Alt+PrtScn` for active window only
3. Select area if needed
4. Save to appropriate directory

### Viewport Configuration

To set exact viewport size in Chrome:
1. Open DevTools (F12)
2. Click "Toggle device toolbar" icon (or `Ctrl+Shift+M`)
3. Select "Responsive" from device dropdown
4. Set dimensions: **1440 x 900**
5. Keep this active for all screenshots

## Screenshot Organization

### Directory Structure

```
/home/cda/dev/leaguesphere/media/usermanual/screenshots/
├── common/           # Homepage, navigation, login
├── gamedays/         # Gameday management
├── passcheck/        # Player pass checking
├── officials/        # Officials management
├── liveticker/       # Live game ticker
├── scorecard/        # Game scoring
├── league_table/     # Standings and statistics
├── teammanager/      # Team management
└── accounts/         # User accounts
```

### Naming Convention

- Format: `{section}_{description}.png`
- Use lowercase with underscores
- Be descriptive but concise
- Examples:
  - `gamedays_list_overview.png`
  - `passcheck_team_selection.png`
  - `officials_signup_form.png`

## Phase 2: HIGH PRIORITY Screenshots (Target: 18-20)

### A. Common/Navigation (4 screenshots)

#### 1. Homepage/Dashboard
- **Filename**: `common/homepage_dashboard.png`
- **URL**: http://localhost:8000/
- **Login Required**: No
- **Description**: Main landing page showing gameday list
- **What to show**:
  - Navigation bar with logo
  - List of upcoming and past gamedays
  - "Neuer Spieltag" (New Gameday) button
  - Footer

#### 2. Main Navigation Menu
- **Filename**: `common/navigation_menu.png`
- **URL**: http://localhost:8000/
- **Login Required**: Yes (admin / admin123)
- **Description**: Main navigation menu when logged in
- **What to show**:
  - Full navigation bar
  - All menu items (Gamedays, Officials, Passcheck, etc.)
  - User profile/logout dropdown

#### 3. Login Page
- **Filename**: `common/login_page.png`
- **URL**: http://localhost:8000/accounts/login/
- **Login Required**: No (logout first if needed)
- **Description**: User login page
- **What to show**:
  - Login form (username/password fields)
  - "Login" button
  - Google OAuth button (if visible)

#### 4. User Manual Index
- **Filename**: `common/user_manual_index.png`
- **URL**: http://localhost:8000/manual/
- **Login Required**: No
- **Description**: User manual table of contents
- **What to show**:
  - Manual navigation/sidebar
  - Table of contents
  - First section content

---

### B. Gamedays Module (7 screenshots)

#### 5. Gamedays List Overview
- **Filename**: `gamedays/gamedays_list_overview.png`
- **URL**: http://localhost:8000/
- **Login Required**: No
- **Description**: Overview of all gamedays
- **What to show**:
  - List of all gamedays (6 in sample data)
  - Gameday names, dates, locations
  - Status indicators
  - Upcoming and past gamedays

#### 6. Gameday Detail View
- **Filename**: `gamedays/gameday_detail_view.png`
- **URL**: http://localhost:8000/ → Click on "München Tournament - Finale"
- **Login Required**: No
- **Description**: Detailed view of a finished gameday
- **What to show**:
  - Gameday header (name, date, location)
  - Game schedule/results
  - Standings tables
  - Field assignments

#### 7. Gameday Creation Wizard - Step 1
- **Filename**: `gamedays/gameday_create_step1.png`
- **URL**: http://localhost:8000/ → Click "Neuer Spieltag"
- **Login Required**: Yes (admin / admin123)
- **Description**: First step of gameday creation
- **What to show**:
  - Basic information form
  - Name, date, league fields
  - Address/location fields
  - "Weiter" (Next) button

**Sample Data to Enter**:
- Name: "Test Spieltag Herbst"
- Date: Pick a future date
- League: Select "Bundesliga"
- Address: "Sportpark München, München"

#### 8. Gameday Creation Wizard - Step 2
- **Filename**: `gamedays/gameday_create_step2.png`
- **URL**: Continue from Step 1
- **Login Required**: Yes (admin / admin123)
- **Description**: Field groups and schedule configuration
- **What to show**:
  - Field groups configuration
  - Number of fields selection
  - Team assignment
  - Schedule generation options

#### 9. Gameday Creation Wizard - Step 3
- **Filename**: `gamedays/gameday_create_step3.png`
- **URL**: Continue from Step 2
- **Login Required**: Yes (admin / admin123)
- **Description**: Gameday format selection
- **What to show**:
  - Format options (6-2, 7-2, etc.)
  - Game duration settings
  - Final confirmation
  - "Erstellen" (Create) button

#### 10. Edit Existing Gameday
- **Filename**: `gamedays/gameday_edit_form.png`
- **URL**: http://localhost:8000/ → Click edit icon on "Spieltag Nord - Runde 1"
- **Login Required**: Yes (admin / admin123)
- **Description**: Edit form for existing gameday
- **What to show**:
  - Editable gameday fields
  - Save/cancel buttons
  - Populated form fields

#### 11. Individual Game Detail
- **Filename**: `gamedays/game_detail_view.png`
- **URL**: From gameday detail → Click on a specific game
- **Login Required**: No
- **Description**: Single game detail view
- **What to show**:
  - Game teams
  - Score/result
  - Officials assigned
  - Game time/field

---

### C. Passcheck Module (7 screenshots)

**Note**: Passcheck may show empty rosters if no player data exists. If rosters are empty, note this in the screenshot inventory.

#### 12. Passcheck Main Interface
- **Filename**: `passcheck/passcheck_main_interface.png`
- **URL**: http://localhost:8000/passcheck/
- **Login Required**: Yes (admin / admin123)
- **Description**: React app main view
- **What to show**:
  - Passcheck app header
  - Game/gameday selection dropdown
  - Team selection area
  - Pass input field

#### 13. Gameday Selection
- **Filename**: `passcheck/gameday_selection.png`
- **URL**: http://localhost:8000/passcheck/
- **Login Required**: Yes (admin / admin123)
- **Description**: Select gameday for pass checking
- **What to show**:
  - Dropdown menu open showing gamedays
  - Select "Berlin Cup - Vorrunde" (today's gameday)

#### 14. Team Roster Selection
- **Filename**: `passcheck/team_roster_selection.png`
- **URL**: Continue from gameday selection
- **Login Required**: Yes (admin / admin123)
- **Description**: Team and roster selection
- **What to show**:
  - Team dropdown
  - Roster display (may be empty)
  - Player list area

#### 15. Pass Number Check (Success State)
- **Filename**: `passcheck/pass_check_success.png`
- **URL**: In passcheck app, enter a valid pass number
- **Login Required**: Yes (admin / admin123)
- **Description**: Successful pass eligibility check
- **What to show**:
  - Pass number input field (with example number)
  - Green checkmark/success indicator
  - Player eligibility confirmed

**Note**: If no players exist, this screenshot may not be possible. Document as "NOT CAPTURED - No player data" in inventory.

#### 16. Pass Number Check (Failure State)
- **Filename**: `passcheck/pass_check_failure.png`
- **URL**: In passcheck app, enter an invalid pass number
- **Login Required**: Yes (admin / admin123)
- **Description**: Failed pass eligibility check
- **What to show**:
  - Pass number input field
  - Red X/failure indicator
  - Error message

#### 17. All Players List
- **Filename**: `passcheck/players_list_overview.png`
- **URL**: http://localhost:8000/passcheck/players/
- **Login Required**: Yes (admin / admin123)
- **Description**: List of all registered players
- **What to show**:
  - Player table (may be empty)
  - Search/filter options
  - Add player button

#### 18. Player Creation Form
- **Filename**: `passcheck/player_create_form.png`
- **URL**: http://localhost:8000/passcheck/players/create/
- **Login Required**: Yes (admin / admin123)
- **Description**: Create new player form
- **What to show**:
  - Player form fields (name, pass number, team)
  - Form validation
  - Save button

**Sample Data to Enter**:
- First Name: "Max"
- Last Name: "Mustermann"
- Pass Number: "12345"
- Team: Select "Berlin Adler"

---

## Phase 3: MEDIUM PRIORITY Screenshots (Target: 12-15)

### D. Officials Module (5 screenshots)

#### 19. Officials Overview
- **Filename**: `officials/officials_list_overview.png`
- **URL**: http://localhost:8000/officials/
- **Login Required**: No
- **Description**: Officials list grouped by association
- **What to show**:
  - Officials list (may be sparse)
  - Association grouping
  - Official names and credentials

#### 20. Officials Signup Form
- **Filename**: `officials/signup_gameday_selection.png`
- **URL**: http://localhost:8000/officials/signup/
- **Login Required**: Yes (admin / admin123)
- **Description**: Gameday selection for official signup
- **What to show**:
  - Gameday selection dropdown
  - Signup form
  - Available positions

#### 21. Game Official Appearances
- **Filename**: `officials/game_appearances_list.png`
- **URL**: http://localhost:8000/officials/appearances/
- **Login Required**: Yes (admin / admin123)
- **Description**: List of all official game assignments
- **What to show**:
  - Table of game assignments
  - Official names, games, dates
  - Filter options

#### 22. Gameday Officials View
- **Filename**: `officials/gameday_officials_assigned.png`
- **URL**: Navigate to "Stuttgart Cup - Tag 1" gameday detail
- **Login Required**: No
- **Description**: Officials assigned to gameday
- **What to show**:
  - Officials table for gameday
  - Assigned positions
  - Game assignments

#### 23. External Games Reporting
- **Filename**: `officials/external_games_form.png`
- **URL**: http://localhost:8000/officials/external/
- **Login Required**: Yes (admin / admin123)
- **Description**: External game reporting interface
- **What to show**:
  - External game form
  - Date, teams, location fields
  - Submit button

---

### E. Liveticker Module (4 screenshots)

#### 24. Liveticker Main View
- **Filename**: `liveticker/liveticker_main_view.png`
- **URL**: http://localhost:8000/liveticker/
- **Login Required**: No
- **Description**: React app with live game events stream
- **What to show**:
  - Liveticker header
  - Game event stream
  - Live updates area
  - Division/team filters

#### 25. Game Selection
- **Filename**: `liveticker/game_selection.png`
- **URL**: http://localhost:8000/liveticker/
- **Login Required**: No
- **Description**: Select game for live updates
- **What to show**:
  - Gameday dropdown
  - Game selection from "Berlin Cup - Vorrunde"
  - Team names and scores

#### 26. Play-by-Play Updates
- **Filename**: `liveticker/play_by_play_view.png`
- **URL**: In liveticker, after selecting a game
- **Login Required**: No
- **Description**: Detailed play-by-play for specific game
- **What to show**:
  - Game header (teams, score)
  - Event timeline
  - Touchdown, conversion, turnover events
  - Timestamp for each event

#### 27. Division Filtering
- **Filename**: `liveticker/division_filtering.png`
- **URL**: http://localhost:8000/liveticker/
- **Login Required**: No
- **Description**: Filter view by division/team
- **What to show**:
  - Filter dropdown open
  - Division selection ("Bundesliga", "Regionalliga", etc.)
  - Filtered results

---

### F. Scorecard Module (5 screenshots)

#### 28. Scorecard Main Interface
- **Filename**: `scorecard/scorecard_main_interface.png`
- **URL**: http://localhost:8000/scorecard/
- **Login Required**: Yes (admin / admin123)
- **Description**: React app game selection for scoring
- **What to show**:
  - Scorecard header
  - Gameday selection
  - Game selection dropdown
  - Start game button

#### 29. Game Selection
- **Filename**: `scorecard/game_selection.png`
- **URL**: http://localhost:8000/scorecard/
- **Login Required**: Yes (admin / admin123)
- **Description**: Select game to score
- **What to show**:
  - Gameday dropdown open
  - "Berlin Cup - Vorrunde" selected
  - List of games
  - Team names

#### 30. Score Entry Interface
- **Filename**: `scorecard/score_entry_form.png`
- **URL**: After selecting game in scorecard
- **Login Required**: Yes (admin / admin123)
- **Description**: Score entry form with controls
- **What to show**:
  - Team names and current scores
  - Touchdown buttons
  - Extra point / 2-point conversion buttons
  - Safety, turnover buttons
  - Score increment/decrement controls

#### 31. Game Clock Management
- **Filename**: `scorecard/game_clock_controls.png`
- **URL**: In scorecard during active game
- **Login Required**: Yes (admin / admin123)
- **Description**: Game clock controls
- **What to show**:
  - Clock display (time remaining)
  - Start/pause/stop buttons
  - Halftime button
  - Quarter/half indicator

#### 32. Play Recording
- **Filename**: `scorecard/play_recording_form.png`
- **URL**: In scorecard, click "Record play" or similar
- **Login Required**: Yes (admin / admin123)
- **Description**: Record individual plays
- **What to show**:
  - Play type selection (touchdown, safety, etc.)
  - Player selection
  - Yardage input
  - Submit/cancel buttons

---

### G. League Table Module (3 screenshots)

#### 33. League Standings Table
- **Filename**: `league_table/standings_overview.png`
- **URL**: http://localhost:8000/standings/
- **Login Required**: No
- **Description**: League standings table
- **What to show**:
  - Teams list with wins/losses/ties
  - Points for/against
  - Win percentage
  - League/division filter

#### 34. Schedule Overview
- **Filename**: `league_table/schedule_overview.png`
- **URL**: http://localhost:8000/schedules/
- **Login Required**: No
- **Description**: All game schedules overview
- **What to show**:
  - Schedule table
  - Dates, teams, locations
  - Results for completed games
  - Upcoming games

#### 35. League Statistics
- **Filename**: `league_table/league_statistics.png`
- **URL**: http://localhost:8000/statistics/ (or navigate from standings)
- **Login Required**: No
- **Description**: League statistics tables
- **What to show**:
  - Offensive/defensive statistics
  - Top performers
  - Team rankings

---

## Phase 4: LOW-MEDIUM PRIORITY Screenshots (Target: 8-10)

### H. Teammanager Module (5 screenshots)

#### 36. All Teams Overview
- **Filename**: `teammanager/teams_list_overview.png`
- **URL**: http://localhost:8000/teams/
- **Login Required**: No
- **Description**: List of all teams
- **What to show**:
  - Team table with 27 teams
  - Team names, associations, leagues
  - Search/filter options

#### 37. Team Detail View
- **Filename**: `teammanager/team_detail_view.png`
- **URL**: http://localhost:8000/teams/ → Click "Berlin Adler"
- **Login Required**: No
- **Description**: Single team detail view
- **What to show**:
  - Team name and logo
  - Team information (association, league)
  - Roster table (may be empty)
  - Team statistics

#### 38. Edit Team Form
- **Filename**: `teammanager/team_edit_form.png`
- **URL**: From team detail → Click edit
- **Login Required**: Yes (admin / admin123)
- **Description**: Team edit form
- **What to show**:
  - Editable team fields
  - Logo upload
  - Association/league selection
  - Save/cancel buttons

#### 39. Player Detail in Team Context
- **Filename**: `teammanager/player_team_detail.png`
- **URL**: From team roster → Click player (if exists)
- **Login Required**: No
- **Description**: Player detail within team
- **What to show**:
  - Player information
  - Team affiliation
  - Player statistics
  - Gameday history

**Note**: May not be possible if no players exist.

#### 40. CSV Player Upload
- **Filename**: `teammanager/csv_upload_interface.png`
- **URL**: http://localhost:8000/teams/{team_id}/upload/
- **Login Required**: Yes (admin / admin123)
- **Description**: CSV upload for bulk player creation
- **What to show**:
  - File upload field
  - CSV template link/download
  - Upload instructions
  - Submit button

---

### I. Accounts Module (3 screenshots)

#### 41. User Profile Page
- **Filename**: `accounts/user_profile_view.png`
- **URL**: http://localhost:8000/accounts/profile/
- **Login Required**: Yes (admin / admin123)
- **Description**: User profile page
- **What to show**:
  - User information
  - Email, name fields
  - Associated teams/roles
  - Edit profile button

#### 42. Profile Edit Form
- **Filename**: `accounts/profile_edit_form.png`
- **URL**: http://localhost:8000/accounts/profile/edit/
- **Login Required**: Yes (admin / admin123)
- **Description**: Edit user profile
- **What to show**:
  - Editable user fields
  - Email, password change
  - Save/cancel buttons

#### 43. Google OAuth Login
- **Filename**: `accounts/google_oauth_login.png`
- **URL**: http://localhost:8000/accounts/login/
- **Login Required**: No (logout first)
- **Description**: Google OAuth integration
- **What to show**:
  - Google login button
  - Standard login form
  - OAuth integration UI

---

## Capture Process Checklist

### Before Starting
- [ ] Login to admin account (admin / admin123)
- [ ] Set browser viewport to 1440x900 using DevTools
- [ ] Clear browser cache
- [ ] Ensure Django server is running at http://localhost:8000
- [ ] Test database is populated with sample data

### During Capture
- [ ] Follow screenshot order (HIGH priority first)
- [ ] Check page is fully loaded before capturing
- [ ] Ensure no loading spinners visible
- [ ] Verify screenshot clarity before moving to next
- [ ] Save to correct directory with correct filename
- [ ] Note any screenshots that cannot be captured

### Quality Checks
- [ ] Screenshot is clear and readable
- [ ] UI elements fully rendered
- [ ] No browser chrome visible (address bar, bookmarks)
- [ ] Consistent viewport size (1440x900)
- [ ] Proper filename convention followed
- [ ] Saved in correct directory

### After Each Section
- [ ] Review all screenshots in section
- [ ] Verify filenames match guide
- [ ] Check image file sizes (< 500 KB ideal)
- [ ] Note any missing screenshots

---

## Troubleshooting

### Issue: Empty Rosters/Players in Passcheck
**Solution**:
1. Navigate to Django Admin: http://localhost:8000/admin/
2. Go to Passcheck → Players
3. Create 5-10 sample players manually
4. Assign to different teams
5. Re-capture passcheck screenshots

### Issue: No Live Events in Liveticker
**Solution**:
1. Use Scorecard to create live events first
2. Select "Berlin Cup - Vorrunde" gameday (today's date)
3. Record touchdowns, conversions, etc.
4. View in Liveticker immediately after

### Issue: Empty League Table/Standings
**Solution**:
1. Check if games have results entered
2. Navigate to finished gamedays and verify scores
3. League table auto-calculates from game results

### Issue: Screenshot Too Large (> 500 KB)
**Solution**:
1. Use Chrome DevTools screenshot (better compression)
2. Or use ImageMagick to resize after capture:
   ```bash
   convert input.png -resize 1440x900 -quality 85 output.png
   ```

---

## Post-Capture Tasks

After completing all screenshots:

1. **Count Total Screenshots**
   ```bash
   find /home/cda/dev/leaguesphere/media/usermanual/screenshots/ -name "*.png" | wc -l
   ```

2. **Review Image Sizes**
   ```bash
   du -sh /home/cda/dev/leaguesphere/media/usermanual/screenshots/*/
   ```

3. **Create Screenshot Inventory** (see next section)

4. **Backup Screenshots**
   ```bash
   tar -czf screenshots_backup_$(date +%Y%m%d).tar.gz /home/cda/dev/leaguesphere/media/usermanual/screenshots/
   ```

---

## Expected Outcome

**Target**: 30-41 screenshots total
- **HIGH Priority**: 18-20 screenshots (Common, Gamedays, Passcheck)
- **MEDIUM Priority**: 12-15 screenshots (Officials, Liveticker, Scorecard, League Table)
- **LOW-MEDIUM Priority**: 8-10 screenshots (Teammanager, Accounts)

**Minimum Acceptable**: 20 screenshots (all HIGH priority completed)

**Ideal**: 35-40 screenshots (HIGH + most MEDIUM priority completed)

---

## Quick Reference: Priority URLs

### HIGH Priority (Must Capture)
- http://localhost:8000/ (Homepage)
- http://localhost:8000/accounts/login/ (Login)
- http://localhost:8000/manual/ (User Manual)
- http://localhost:8000/passcheck/ (Passcheck App)

### MEDIUM Priority (Should Capture)
- http://localhost:8000/officials/ (Officials)
- http://localhost:8000/liveticker/ (Liveticker)
- http://localhost:8000/scorecard/ (Scorecard)
- http://localhost:8000/standings/ (League Table)

### LOW Priority (Nice to Have)
- http://localhost:8000/teams/ (Teams)
- http://localhost:8000/accounts/profile/ (Profile)

---

## Notes

- Some screenshots may not be possible if player/official data is missing
- Document any missing screenshots in the inventory
- Estimate time: 4-6 hours for complete capture
- Take breaks to avoid fatigue and maintain quality

**Start with HIGH priority screenshots and work your way down!**
