# LeagueSphere User Journey Scenarios

This document defines realistic user journey scenarios for the LeagueSphere flag football league management system. Each scenario represents a common use case and identifies screenshot capture points for the standalone HTML manual.

**Target Audience:** League organizers, team managers, officials, scorekeepers, and spectators

**Application Context:** LeagueSphere manages flag football leagues with gameday scheduling, live scoring, player eligibility, standings, and official management.

---

## Scenario 1: League Administrator Creates a New Gameday and Schedules Games

**User Role:** League Administrator (staff/admin user)
**Use Case:** Setting up a new gameday event with multiple games across different fields
**Duration:** 5-10 minutes
**Frequency:** Once per gameday (typically weekly)

### User Journey Steps

1. **Login to LeagueSphere**
   - Visit home page
   - Click "Login" button (top-right navigation)
   - Enter credentials (username/email and password)
   - Click "Login"
   - **SCREENSHOT:** Login page with form

2. **Navigate to Gamedays Management**
   - After login, see home page with welcome message
   - Click "Gamedays" in main navigation menu
   - See list of existing gamedays filtered by season/league
   - **SCREENSHOT:** Home page dashboard
   - **SCREENSHOT:** Gamedays list view with existing gamedays

3. **Create New Gameday**
   - Click "New Gameday" button (top-right or prominent CTA)
   - Form opens with fields:
     - Gameday Name (e.g., "Week 5 Fall Season 2024")
     - Season (dropdown: select "Fall 2024")
     - League (dropdown: select league)
     - Date (date picker: select gameday date)
     - Start Time (time picker: e.g., 6:00 PM)
     - Format (dropdown: select "6v6" or "7v7")
     - Address/Location (text area: field location/address)
   - **SCREENSHOT:** Create Gameday form (empty)

4. **Fill Gameday Details**
   - Administrator enters:
     - Name: "Week 5 - Fall Regular Season"
     - Season: "Fall 2024"
     - League: "Competitive Division"
     - Date: 11/14/2024
     - Start Time: 18:00 (6:00 PM)
     - Format: "6v6"
     - Address: "Central Park Field 1-4, Main Street"
   - **SCREENSHOT:** Completed gameday form
   - Click "Save" button
   - Success message appears: "Gameday created successfully"

5. **Add Games to Schedule**
   - See option "Add Games" or "Schedule Games"
   - Click "Game Schedule Wizard" or similar
   - Game 1 setup:
     - Time: 18:00 (6:00 PM)
     - Field: 1
     - Home Team: "Bumble Bees"
     - Away Team: "Thunder Hawks"
     - Stage: "Regular Season"
     - Standing: "Round 1"
   - **SCREENSHOT:** Add first game form
   - Click "Add Game"
   - Game 2 setup:
     - Time: 18:30 (6:30 PM)
     - Field: 2
     - Home Team: "Fire Foxes"
     - Away Team: "Eagles"
     - Stage: "Regular Season"
     - Standing: "Round 1"
   - Click "Add Game"
   - Game 3 setup (continue pattern for fields 3-4)
   - **SCREENSHOT:** Game schedule after adding multiple games
   - Click "Finish" or "Save All Games"

6. **Review Gameday**
   - See gameday detail view with all scheduled games
   - Verify game times, teams, and fields
   - **SCREENSHOT:** Gameday detail view with complete schedule

7. **Assign Officials (Optional)**
   - See "Assign Officials" option
   - Click to assign officials for each game
   - Select head referee, line judge, scorekeeper
   - **SCREENSHOT:** Officials assignment view

---

## Scenario 2: Team Manager Adds Players to Roster and Manages Eligibility

**User Role:** Team Manager (team owner/admin)
**Use Case:** Building and maintaining team roster for current season
**Duration:** 10-15 minutes initially, 2-5 minutes for updates
**Frequency:** Pre-season setup, then ongoing throughout season

### User Journey Steps

1. **Login as Team Manager**
   - Login with team manager credentials
   - **SCREENSHOT:** Login page

2. **Navigate to Team Management**
   - Click "Team Manager" in main navigation
   - See list of teams for current season
   - **SCREENSHOT:** Team list view

3. **Select Your Team**
   - Click on team name or "Edit" button
   - See team detail page with:
     - Team information (name, location, association)
     - Current roster
     - Team statistics
   - **SCREENSHOT:** Team detail page

4. **Add Players to Roster**
   - Click "Add Player" or "Create Player" button
   - Form opens with fields:
     - First Name
     - Last Name
     - Player Number
     - Position (QB, WR, RB, DB, etc.)
     - Birth Date
     - Email
     - Phone
     - Player Photo (upload avatar)
   - **SCREENSHOT:** Add player form (empty)
   - Fill in player details:
     - First Name: "James"
     - Last Name: "Smith"
     - Player Number: "12"
     - Position: "Quarterback"
     - Birth Date: 01/15/1990
     - Email: james.smith@email.com
     - Phone: (555) 123-4567
     - Upload photo
   - **SCREENSHOT:** Add player form (completed)
   - Click "Save Player"
   - Success message shown
   - Player appears in roster list

5. **Add Multiple Players (Bulk Upload)**
   - Click "Bulk Upload Players" or "Import CSV"
   - Download CSV template
   - Fill in player data in spreadsheet:
     ```
     First Name,Last Name,Number,Position,Birth Date,Email,Phone
     Maria,Johnson,5,Wide Receiver,03/22/1992,maria.j@email.com,(555) 234-5678
     David,Williams,8,Defensive Back,07/18/1995,d.williams@email.com,(555) 345-6789
     Sarah,Brown,3,Quarterback,09/10/1988,s.brown@email.com,(555) 456-7890
     ```
   - Upload CSV file
   - **SCREENSHOT:** Bulk upload modal
   - Review imported players
   - **SCREENSHOT:** Confirmation of imported players
   - Click "Confirm Import"

6. **Manage Player Information**
   - See roster with all players listed:
     - Player name, number, position, photo
     - Status (active, injured, transferred, etc.)
   - **SCREENSHOT:** Complete roster list
   - Click on player to edit details
   - Update player info (birth date, position change, etc.)
   - **SCREENSHOT:** Edit player form
   - Click "Save"

7. **View Player Eligibility Status**
   - Click "Player Pass Cards" or "Eligibility Check"
   - See list of players with eligibility status:
     - Player photo
     - Player name
     - Pass card issued (yes/no)
     - Photo verified (yes/no)
     - Registration status (active, inactive, suspended)
   - **SCREENSHOT:** Player eligibility list

8. **Delete or Transfer Player**
   - Click player's menu (three dots) or "More options"
   - See options: Edit, Delete, Transfer to another team
   - For transfer: Select destination team, confirm
   - **SCREENSHOT:** Player action menu
   - Player removed from roster or transferred

---

## Scenario 3: Official Performs Player Eligibility Check (Passcheck) at Game

**User Role:** Official/Scorekeeper (at gameday)
**Use Case:** Verify player eligibility and collect pass cards before game starts
**Duration:** 5-10 minutes pre-game (typically 30 min before start)
**Frequency:** Every game, both teams

### User Journey Steps

1. **Navigate to Passcheck Application**
   - Visit LeagueSphere at gameday (tablet/laptop at field)
   - Click "Passcheck" in main navigation
   - See welcome screen with gameday information
   - **SCREENSHOT:** Passcheck home screen

2. **Select Gameday**
   - Click "Select Gameday" or see current gameday auto-selected
   - Dropdown shows:
     - Today's gamedays
     - Team names participating
   - **SCREENSHOT:** Gameday selection

3. **Select Team**
   - Click "Home Team" or "Away Team" selector
   - Dropdown shows teams for this gameday
   - Select first team (e.g., "Bumble Bees")
   - **SCREENSHOT:** Team selection dropdown

4. **View Team Roster**
   - See list of players on roster with:
     - Player photo
     - Player name
     - Player number
     - Position
     - Registration status
     - Pass card photo (if exists)
   - **SCREENSHOT:** Team roster for passcheck

5. **Check Players In**
   - Players arrive at field with photo ID
   - For each player:
     - Click on player name or checkbox
     - System shows:
       - Large player photo
       - Pass card photo
       - Player number, position, name
       - Registration confirmation
     - Official verifies:
       - Player matches photos (visual verification)
       - Player is on roster
       - Registration status is active
       - No suspension flags
     - **SCREENSHOT:** Player detail with photo verification
     - Click "Verified" or green checkmark
     - Player marked as checked in
   - Repeat for all players attending game
   - **SCREENSHOT:** Roster with checked-in players marked

6. **Handle Missing Players**
   - If player not on roster:
     - Click "Add Player to Roster"
     - Search for player in league database
     - Select matching player
     - Confirm addition to roster for this game
     - Verify photo
     - **SCREENSHOT:** Add player to roster dialog
   - If player is ineligible (suspended):
     - See red warning flag
     - System shows suspension reason and end date
     - Cannot check player in
     - Notify team manager
     - **SCREENSHOT:** Ineligible player warning

7. **Complete Team Check-in**
   - See summary: "X players checked in out of Y on roster"
   - All required players verified
   - Click "Confirm Team Check-in" or "Done with Team"
   - **SCREENSHOT:** Team check-in complete

8. **Repeat for Away Team**
   - Select "Away Team" tab
   - Repeat steps 4-7 for visiting team
   - **SCREENSHOT:** Away team roster check-in

9. **Final Verification**
   - System shows both teams checked in
   - See any eligibility issues or warnings
   - Generate/print pass check report
   - **SCREENSHOT:** Passcheck completion summary

---

## Scenario 4: Scorekeeper Records Live Game Score and Statistics

**User Role:** Scorekeeper (at gameday, typically in booth/sideline)
**Use Case:** Record real-time scoring and game statistics during live play
**Duration:** Entire game (40-60 minutes)
**Frequency:** Every game

### User Journey Steps

1. **Open Scorecard Application**
   - Visit scorecard URL or navigate via main menu
   - See game selection screen
   - **SCREENSHOT:** Scorecard home/game selection

2. **Select Current Game**
   - Click on game from today's schedule:
     - "Bumble Bees vs Thunder Hawks - Field 1 at 6:00 PM"
   - See game detail screen with:
     - Team names and logos
     - Current score (0-0)
     - Quarter/period indicator
     - Clock (if applicable)
   - **SCREENSHOT:** Game scorecard view

3. **Record Touchdown**
   - First quarter: Bumble Bees score first TD
   - Click on team (Bumble Bees) to add score
   - Click "Touchdown" button (TD)
   - Choose which player scored: dropdown/search
   - Select "James Smith #12"
   - **SCREENSHOT:** Touchdown recording dialog
   - Enter assists if applicable
   - Click "Confirm" or "Save"
   - Score updates: Bumble Bees 6, Thunder Hawks 0
   - **SCREENSHOT:** Updated score display

4. **Record Extra Point**
   - After TD, team goes for extra point
   - Click "Extra Point" button
   - Choose type: "Kick (1pt)" or "Conversion (2pts)"
   - Select "Kick"
   - Select kicker: "Maria Johnson #5"
   - **SCREENSHOT:** Extra point dialog
   - Click "Good" (successful kick)
   - Score updates: Bumble Bees 7, Thunder Hawks 0
   - **SCREENSHOT:** Score after XP

5. **Record Player Statistics**
   - Throughout game, track individual stats:
     - Passing: completions, attempts, yards, TDs, interceptions
     - Receiving: receptions, yards, TDs
     - Rushing: attempts, yards, TDs
     - Defense: interceptions, sacks, flag pulls
   - Click "Add Statistic" or player-specific buttons
   - **SCREENSHOT:** Statistics entry interface
   - For example, QB "James Smith":
     - Throws completion: Select receiver "David Williams"
     - 15 yards
     - Click "Save Completion"
     - Stats update: 1 completion, 1 attempt, 15 yards
   - **SCREENSHOT:** Player statistics view

6. **Manage Game Clock**
   - See running clock or manual time entry
   - Official signals quarter/halftime:
     - Click "End 1st Quarter" button
     - Time stops/resets
     - **SCREENSHOT:** Quarter end state
     - Click "Start 2nd Quarter"
     - Clock resumes
   - At halftime (20 minutes):
     - Click "Halftime"
     - See halftime summary:
       - Current score
       - Leading team
       - Player statistics so far
     - **SCREENSHOT:** Halftime summary

7. **Record Safety**
   - During 2nd quarter, Thunder Hawks defense pulls flag in end zone
   - Click "Safety" button
   - Select defensive player: "Thomas Green"
   - **SCREENSHOT:** Safety recording
   - Score updates: Bumble Bees 7, Thunder Hawks 2

8. **Record Additional Scoring Plays**
   - Thunder Hawks score TD in 3rd quarter
   - Score: 7-8
   - Thunder Hawks attempt 2-point conversion
   - Click "Extra Point" > "Conversion (2pts)"
   - Click "Good"
   - Score: 7-10
   - **SCREENSHOT:** Updated score

9. **End Game**
   - 4th quarter complete
   - See final clock time (0:00)
   - Click "End Game" button
   - See final score: Bumble Bees 7, Thunder Hawks 10
   - **SCREENSHOT:** Final score display

10. **Review and Submit Game Statistics**
    - See complete game summary:
      - Final score
      - All touchdowns and scorers
      - Key statistics (passing yards, rushing yards, etc.)
      - Player-by-player statistics
    - **SCREENSHOT:** Game summary/statistics view
    - Click "Review Statistics"
    - Verify all entries are correct
    - **SCREENSHOT:** Detailed statistics verification
    - Click "Submit Game" or "Save to League"
    - Confirmation: "Game submitted successfully"
    - **SCREENSHOT:** Submission confirmation

---

## Scenario 5: Spectator Views Live Game Ticker and Standings

**User Role:** Spectator (coach, player, parent, fan - viewing only)
**Use Case:** Follow live game action and check league standings
**Duration:** Variable (during games or anytime)
**Frequency:** During gamedays, checking standings frequently

### User Journey Steps

1. **Navigate to Liveticker**
   - Visit LeagueSphere home page or click "Liveticker" in nav
   - See live games for today
   - **SCREENSHOT:** Liveticker home with active games

2. **Select Game to Watch**
   - See list of today's games:
     - "Bumble Bees vs Thunder Hawks - Field 1 (Live)"
     - "Fire Foxes vs Eagles - Field 2 (Live)"
     - "Dragons vs Falcons - Field 3 (Scheduled 7:00 PM)"
   - Click on "Bumble Bees vs Thunder Hawks"
   - **SCREENSHOT:** Game selection/active games list

3. **View Live Game Updates**
   - See live ticker with:
     - Current score (Bumble Bees 7, Thunder Hawks 10)
     - Current quarter (4th)
     - Time remaining (5:23)
     - Team logos/colors
   - **SCREENSHOT:** Live game ticker view

4. **Review Play-by-Play**
   - Below score, see play-by-play log (newest first):
     - "4Q 5:23 - Thunder Hawks gain 8 yards (David Williams pass to Sarah Brown)"
     - "4Q 6:15 - Safety! Bumble Bees pull flag (Thomas Green)"
     - "4Q 7:30 - Bumble Bees gain 4 yards (James Smith pass to David Williams)"
     - (Continue with earlier plays)
   - Scroll to see full game timeline
   - **SCREENSHOT:** Play-by-play feed

5. **Check Team Statistics**
   - Click "Statistics" or "Team Stats" tab
   - See current game stats:
     - Bumble Bees:
       - Passing: 12/18, 145 yards, 1 TD, 0 INT
       - Rushing: 4 carries, 18 yards
       - Defense: 2 interceptions, 1 safety
     - Thunder Hawks:
       - Passing: 10/14, 132 yards, 1 TD, 1 INT
       - Rushing: 3 carries, 12 yards
       - Defense: 0 interceptions, 1 safety
   - **SCREENSHOT:** Game statistics view

6. **View Player Statistics**
   - Click on team or specific player
   - See individual player stats:
     - "James Smith (QB)"
       - 12/18 completions
       - 145 passing yards
       - 1 TD
       - 0 INT
     - "David Williams (WR)"
       - 6 receptions
       - 87 receiving yards
       - 0 TD
   - **SCREENSHOT:** Player statistics view

7. **Navigate to League Standings**
   - Click "League Table" in main navigation
   - See league standings for current season
   - **SCREENSHOT:** League table/standings view

8. **View Division Standings**
   - By default see overall standings
   - Click division dropdown (if multiple divisions)
   - Select "Competitive Division"
   - See standings:
     ```
     Rank | Team          | W  | L  | T | Win% | PF  | PA  | Diff
     1    | Bumble Bees   | 5  | 2  | 0 | .714 | 245 | 198 | +47
     2    | Thunder Hawks | 4  | 3  | 0 | .571 | 216 | 231 | -15
     3    | Fire Foxes    | 4  | 3  | 0 | .571 | 207 | 219 | -12
     4    | Eagles        | 2  | 5  | 0 | .286 | 165 | 248 | -83
     ```
   - **SCREENSHOT:** Division standings

9. **View League Schedule**
   - Click "Schedule" or "All Games"
   - See upcoming games:
     - Week 6 (11/21/2024):
       - 6:00 PM - Bumble Bees vs Fire Foxes
       - 6:30 PM - Thunder Hawks vs Eagles
       - 7:00 PM - Dragons vs Falcons
   - Click on game to see more details (if available)
   - **SCREENSHOT:** Schedule/upcoming games view

10. **Filter by Team**
    - Click filter dropdown or search
    - Select "Bumble Bees"
    - See only Bumble Bees games and stats
    - **SCREENSHOT:** Filtered schedule/standings

---

## Scenario 6: Official Manages Game Officials and Certifications

**User Role:** Officials Manager/Association Administrator
**Use Case:** Manage official roster, track certifications, assign officials to games
**Duration:** 15-20 minutes per gameday
**Frequency:** Weekly before gameday

### User Journey Steps

1. **Navigate to Officials Management**
   - Click "Officials" in main navigation
   - See officials dashboard
   - **SCREENSHOT:** Officials home/dashboard

2. **View Officials List**
   - Click "View All Officials"
   - See table of officials with:
     - Official name
     - Certification level
     - License expiration date
     - Games assigned this season
     - Contact info
   - **SCREENSHOT:** Officials list view

3. **Filter Officials**
   - Filter by:
     - Association (if multiple)
     - Certification level
     - License status (active, expired, pending)
   - Click "Certified Referees" filter
   - See only fully certified officials
   - **SCREENSHOT:** Filtered officials list

4. **View Official Profile**
   - Click on official name: "John Martinez"
   - See profile with:
     - Photo
     - Name, email, phone
     - Certification level (Head Referee)
     - License details and expiration (12/31/2024)
     - Games assigned (list of gamedays)
     - Game history (previous assignments)
   - **SCREENSHOT:** Official profile view

5. **Assign Officials to Gameday**
   - Click "Assign Officials to Gameday"
   - Select gameday: "Week 5 - 11/14/2024"
   - See games without officials:
     - 6:00 PM - Bumble Bees vs Thunder Hawks - Field 1
     - 6:30 PM - Fire Foxes vs Eagles - Field 2
   - **SCREENSHOT:** Gameday with unassigned games

6. **Assign Officials to Game**
   - Click on game "Bumble Bees vs Thunder Hawks"
   - Form appears with official positions:
     - Head Referee (required)
     - Line Judge (required)
     - Scorekeeper (optional but recommended)
   - **SCREENSHOT:** Officials assignment form

7. **Select Head Referee**
   - Click "Head Referee" field
   - See dropdown of available certified referees:
     - John Martinez (Head Referee, available)
     - Susan Lee (Head Referee, available)
     - Robert Chen (Head Referee, available)
   - Select "John Martinez"
   - **SCREENSHOT:** Referee dropdown selection

8. **Select Line Judge**
   - Click "Line Judge" field
   - Dropdown shows available officials:
     - Maria Garcia (Line Judge, available)
     - James Wilson (Line Judge, available)
   - Select "Maria Garcia"
   - **SCREENSHOT:** Line judge selection

9. **Select Scorekeeper (Optional)**
   - Click "Scorekeeper" field
   - Dropdown shows available officials:
     - David Park (Scorekeeper, available)
     - Lisa Anderson (Scorekeeper, available)
   - Select "David Park"
   - Click "Save Assignment"
   - **SCREENSHOT:** Scorekeeper selection

10. **Confirm Assignments**
    - Game now shows:
      - Head Referee: John Martinez
      - Line Judge: Maria Garcia
      - Scorekeeper: David Park
    - **SCREENSHOT:** Game with assigned officials

11. **Assign Officials to Remaining Games**
    - Repeat for game 2: "Fire Foxes vs Eagles"
    - Assign different officials (avoid duplicates):
      - Head Referee: Susan Lee
      - Line Judge: James Wilson
      - Scorekeeper: Lisa Anderson
    - **SCREENSHOT:** Multiple games with officials assigned

12. **View Gameday Summary**
    - See all games for gameday with officials assigned
    - **SCREENSHOT:** Complete gameday with all officials

13. **Send Official Notifications**
    - Click "Send Notifications" button
    - Check: "Email officials about assignments"
    - See email preview
    - Click "Send"
    - Confirmation: "Emails sent to 6 officials"
    - **SCREENSHOT:** Email notification dialog

---

## Scenario 7: League Administrator Views Season Statistics and League Table

**User Role:** League Administrator
**Use Case:** Monitor season progress, view final standings, prepare for playoffs
**Duration:** 5-10 minutes
**Frequency:** Weekly or after each gameday

### User Journey Steps

1. **Navigate to League Table**
   - Click "League Table" in main navigation
   - See overall standings for current season
   - **SCREENSHOT:** League table home

2. **View Overall Standings**
   - See standings table with:
     - Rank (1-8)
     - Team name
     - Wins (W)
     - Losses (L)
     - Ties (T)
     - Win percentage (%)
     - Points For (PF)
     - Points Against (PA)
     - Point Differential
   - Example data:
     ```
     1. Bumble Bees     5-2-0  .714  245  198  +47
     2. Thunder Hawks   4-3-0  .571  216  231  -15
     3. Fire Foxes      4-3-0  .571  207  219  -12
     4. Eagles          2-5-0  .286  165  248  -83
     ```
   - **SCREENSHOT:** Overall standings table

3. **View Division Standings**
   - Click "Select League/Division" dropdown
   - See available divisions:
     - Competitive Division
     - Recreational Division
   - Select "Recreational Division"
   - See that division's standings
   - **SCREENSHOT:** Division selection and standings

4. **View Team Statistics**
   - Click on team name: "Bumble Bees"
   - See team detail page with:
     - Team information
     - Season record (5-2-0)
     - Points for and against
     - Game log (list of all games)
   - **SCREENSHOT:** Team detail view

5. **View Game Log**
   - See table of all games:
     ```
     Date       | Opponent        | Result | Score    | Location
     11/07/2024 | Thunder Hawks   | W      | 21 - 14  | Field 1
     10/31/2024 | Fire Foxes      | W      | 14 - 7   | Field 2
     10/24/2024 | Eagles          | W      | 28 - 0   | Field 3
     10/17/2024 | Dragons         | L      | 10 - 14  | Field 1
     ```
   - **SCREENSHOT:** Team game log

6. **View Season Leaders**
   - Click "League Leaders" or "Season Leaders"
   - See individual player statistics leaders:
     - Passing Yards:
       1. James Smith (Bumble Bees) - 1,245 yards
       2. Michael Torres (Thunder Hawks) - 1,123 yards
     - Receiving Yards:
       1. David Williams (Bumble Bees) - 845 yards
       2. Sarah Brown (Fire Foxes) - 721 yards
     - Passing TDs:
       1. James Smith (Bumble Bees) - 12 TDs
       2. Michael Torres (Thunder Hawks) - 10 TDs
     - Defensive Interceptions:
       1. Thomas Green (Bumble Bees) - 5 INTs
       2. Jessica Harris (Thunder Hawks) - 4 INTs
   - **SCREENSHOT:** Season statistical leaders

7. **View Playoff Seeding**
   - Click "Playoffs" or "Playoff Bracket"
   - See current playoff seeding based on standings:
     ```
     DIVISION 1 WINNER (Seed 1)
     Bumble Bees (5-2-0, .714)

     DIVISION 2 WINNER (Seed 2)
     Fire Foxes (4-3-0, .571)

     WILDCARD 1 (Seed 3)
     Thunder Hawks (4-3-0, .571)

     WILDCARD 2 (Seed 4)
     Eagles (2-5-0, .286)
     ```
   - **SCREENSHOT:** Playoff seeding view

8. **Export or Print Reports**
   - Click "Export/Print" or menu option
   - Options available:
     - Export as PDF
     - Export as Excel
     - Print to paper
   - Select "Export as PDF"
   - **SCREENSHOT:** Export dialog
   - PDF generated with:
     - Final standings
     - Game log
     - Player statistics
   - **SCREENSHOT:** Sample exported report (display snippet)

---

## Scenario 8: Team Manager Prepares Players for Game - Roster Management and Verification

**User Role:** Team Manager
**Use Case:** Pre-game preparation, verifying all players are registered and eligible
**Duration:** 10-15 minutes pre-game
**Frequency:** Before each game

### User Journey Steps

1. **Login and Navigate to Team**
   - Login with team manager account
   - Click "Team Manager" in nav
   - Select team: "Bumble Bees"
   - See team dashboard
   - **SCREENSHOT:** Team manager dashboard

2. **Check Upcoming Game Schedule**
   - Click "Upcoming Games" or see schedule section
   - See next scheduled game:
     - Date: 11/14/2024
     - Time: 6:00 PM
     - Opponent: "Thunder Hawks"
     - Location: "Central Park Field 1"
     - Status: "Scheduled"
   - **SCREENSHOT:** Upcoming games view

3. **View Team Roster for Next Game**
   - Click on upcoming game
   - See roster with availability:
     - Player name, number, position
     - Availability status (Playing, Injured, Unavailable, Unknown)
   - Example:
     - James Smith (QB) - Playing
     - David Williams (WR) - Playing
     - Maria Johnson (WR) - Injured (out 2 weeks)
     - Sarah Brown (QB) - Unknown (no response)
   - **SCREENSHOT:** Roster with availability status

4. **Mark Players as Available**
   - See list of players with status "Unknown"
   - Click on "Sarah Brown"
   - See options: Mark as Available / Unavailable / Injured
   - Click "Mark as Available"
   - Status updates to "Playing"
   - **SCREENSHOT:** Player availability update dialog

5. **Check Player Eligibility**
   - Click "Check Eligibility" or "Pass Card Status"
   - See players by eligibility status:
     ```
     ELIGIBLE (8 players)
     - James Smith (Pass card valid until 12/31/2024)
     - David Williams (Pass card valid until 12/31/2024)
     - (6 others)

     ELIGIBILITY ISSUES (0 players)
     - None

     MISSING PASS CARD (2 players)
     - Maria Johnson (needs to be photographed)
     - Robert Chen (needs registration photo)
     ```
   - **SCREENSHOT:** Player eligibility status page

6. **Request Missing Documentation**
   - Click on "Maria Johnson"
   - See note: "Pass card photo needed"
   - Click "Send Reminder to Player"
   - Choose delivery method: Email or SMS
   - Message: "Your pass card photo needs to be taken. Please contact team manager by Nov 13."
   - Click "Send"
   - **SCREENSHOT:** Reminder dialog

7. **Review Equipment Requirements**
   - Click "Equipment Check" or "Game Preparation"
   - See checklist:
     - [ ] Ensure all players have flag belts (league provides or required to bring)
     - [ ] Verify shoe requirements (no metal cleats)
     - [ ] Check jersey numbers match registration
     - [ ] Confirm player numbers are visible
   - Check off items
   - **SCREENSHOT:** Equipment checklist

8. **Generate Game Roster Report**
   - Click "Generate Roster Report" or "Print Roster"
   - See formatted roster with:
     - All players listed by position
     - Player numbers
     - Player photos (if available)
     - Contact information
   - Download as PDF or print
   - **SCREENSHOT:** Roster report

9. **Send Team Reminder**
   - Click "Send Game Reminder"
   - See pre-populated message:
     - "Game reminder: Bumble Bees vs Thunder Hawks"
     - "Date: 11/14/2024, 6:00 PM"
     - "Location: Central Park Field 1"
     - "Arrive 30 minutes early"
     - "Bring ID for pass check"
   - Click "Send to Team" (email to all players)
   - Confirmation: "Message sent to 11 players"
   - **SCREENSHOT:** Send reminder dialog

10. **Confirm Game Preparation Complete**
    - See checklist marked complete:
      - [ ] Team roster reviewed
      - [ ] Player eligibility verified
      - [ ] Equipment checked
      - [ ] Game reminders sent
    - Status: "Ready for Game"
    - **SCREENSHOT:** Game preparation complete

---

## Summary of Key Navigation Paths and Screenshots

### Navigation Structure

```
Home
├── Gamedays
│   ├── Gamedays List (filter by season/league)
│   ├── Create Gameday
│   ├── Gameday Detail
│   ├── Schedule Games (Wizard)
│   └── Assign Officials
├── Passcheck
│   ├── Select Gameday
│   ├── Select Team
│   ├── Team Roster
│   ├── Player Check-in
│   └── Check-in Summary
├── Scorecard
│   ├── Game Selection
│   ├── Live Scoring
│   ├── Game Statistics
│   └── Game Summary/Submit
├── Liveticker
│   ├── Active Games
│   ├── Game Ticker
│   ├── Play-by-Play
│   └── Game Statistics
├── League Table
│   ├── Overall Standings
│   ├── Division Standings
│   ├── Team Detail
│   ├── Season Leaders
│   ├── Playoff Seeding
│   └── Schedule/All Games
├── Team Manager
│   ├── Teams List
│   ├── Team Detail
│   ├── Roster Management
│   ├── Add/Edit Players
│   ├── Bulk Upload
│   └── Eligibility Check
├── Officials
│   ├── Officials List
│   ├── Official Profile
│   ├── Assign to Gameday
│   ├── Certifications
│   └── Sign-ups
└── User Accounts
    ├── Login
    ├── Logout
    ├── User Profile
    └── Settings
```

### Critical Screenshot Locations

**Authentication & Navigation:**
1. Login page
2. Home/dashboard page
3. Navigation menu (desktop view)
4. Mobile navigation (hamburger menu)

**Gamedays Management:**
5. Gamedays list view
6. Create gameday form (empty)
7. Create gameday form (filled)
8. Game schedule with multiple games
9. Gameday detail view
10. Officials assignment interface

**Passcheck:**
11. Passcheck home/gameday selection
12. Team selection
13. Roster list for check-in
14. Player detail with photo verification
15. Roster with check-in status
16. Ineligible player warning
17. Check-in completion summary

**Scorecard:**
18. Scorecard game selection
19. Live score display
20. Touchdown recording dialog
21. Extra point recording dialog
22. Statistics entry interface
23. Game statistics view
24. Halftime summary
25. Final score display
26. Game summary/statistics after submission

**Liveticker:**
27. Liveticker home with active games
28. Game selection list
29. Live ticker display
30. Play-by-play feed
31. Game statistics view
32. Player statistics detail

**League Table:**
33. League table home/overall standings
34. Division standings
35. Team detail view
36. Team game log
37. Season statistical leaders
38. Playoff seeding bracket
39. Export/print dialog

**Team Manager:**
40. Team list view
41. Team detail page
42. Roster list
43. Add player form (empty)
44. Add player form (completed)
45. Bulk upload dialog
46. Player eligibility list
47. Edit player form
48. Player action menu

**Officials:**
49. Officials home/dashboard
50. Officials list
51. Official profile
52. Officials assignment form
53. Referee dropdown selection
54. Game with assigned officials
55. Email notification dialog

---

## Platform & Device Considerations

### Desktop/Tablet Screenshots
- Full width navigation bar
- Multi-column layouts where applicable
- Dropdown menus
- Print-friendly views
- Keyboard shortcuts hints

### Mobile Screenshots
- Hamburger/toggle navigation
- Single-column layouts
- Touch-friendly buttons (min 44x44px)
- Simplified forms
- Swipe gestures (if applicable)

### Feature-Specific Platforms
- **Passcheck:** Tablet-first (used on iPad at field)
- **Scorecard:** Tablet/laptop (used during games)
- **Liveticker:** Mobile-friendly (watched on phones)
- **Team Manager:** Desktop/Tablet (administrative work)
- **League Table:** All devices (public viewing)

---

## Sample Data Reference

### Teams
- Bumble Bees (Competitive Division)
- Thunder Hawks (Competitive Division)
- Fire Foxes (Recreational Division)
- Eagles (Recreational Division)
- Dragons (Competitive Division)
- Falcons (Recreational Division)

### Sample Players
- James Smith #12 (QB, Bumble Bees)
- David Williams #5 (WR, Bumble Bees)
- Maria Johnson #5 (WR, Bumble Bees)
- Sarah Brown #3 (QB, Bumble Bees)
- Michael Torres (QB, Thunder Hawks)
- Jessica Harris (DB, Thunder Hawks)

### Game Example
- Date: 11/14/2024
- Gameday: Week 5 - Fall Regular Season
- Games:
  1. Bumble Bees vs Thunder Hawks (6:00 PM, Field 1) - Final: 7-10
  2. Fire Foxes vs Eagles (6:30 PM, Field 2)
  3. Dragons vs Falcons (7:00 PM, Field 3)

### Seasons/Leagues
- Season: Fall 2024
- Leagues: Competitive Division, Recreational Division
- Associations: Multiple (if applicable)

---

## Notes for Manual Development

1. **Sequence:** Present scenarios in order (1-8) as they represent logical user workflows
2. **Screenshots:** Capture both success and error states where applicable
3. **Responsive Design:** Include screenshots showing responsive behavior at different breakpoints
4. **Sample Data:** Use consistent sample data throughout all scenarios
5. **Actions:** Clearly label each screenshot with the action being performed
6. **Accessibility:** Note any accessibility features visible in each screenshot
7. **Timing:** Include approximate time durations for each scenario
8. **Permissions:** Note which user roles can perform each action

---

## Version Control

- **Document Version:** 1.0
- **Created:** 2024-11-07
- **Last Updated:** 2024-11-07
- **Platform:** LeagueSphere
- **Target Version:** Current (5.2.x+)
