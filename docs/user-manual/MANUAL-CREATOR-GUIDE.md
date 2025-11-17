# LeagueSphere User Manual Creator Guide

This guide provides instructions for creating the standalone HTML user manual using the user journey scenarios and screenshot checklist.

---

## Quick Start

### 1. Understanding the Deliverables

You have three main documents to guide manual creation:

1. **user-journeys.md** - 8 detailed user journey scenarios with:
   - Step-by-step actions users take
   - Screenshot capture points marked
   - Realistic sample data
   - Expected outcomes

2. **screenshot-checklist.md** - Complete list of 55+ screenshots needed:
   - Organized by scenario
   - Prioritized by importance
   - Device/platform specifications
   - Naming conventions

3. **MANUAL-CREATOR-GUIDE.md** (this document) - Instructions for:
   - Capturing screenshots
   - Organizing content
   - Building HTML manual
   - Quality assurance

### 2. Timeline Overview

```
Phase 1: Setup & Planning (1 day)
├── Review all journey scenarios
├── Set up test environment
├── Prepare test data
└── Plan screenshot capture schedule

Phase 2: Screenshot Capture (3-5 days)
├── Capture desktop screenshots (1920x1080)
├── Capture tablet screenshots (optional)
├── Capture mobile screenshots (critical flows)
├── Annotate & optimize images

Phase 3: Manual Assembly (3-5 days)
├── Create HTML structure
├── Write section introductions
├── Place screenshots with descriptions
├── Add navigation links
├── Test responsiveness

Phase 4: QA & Polish (2-3 days)
├── Test all links & navigation
├── Verify accessibility
├── Check mobile responsiveness
├── Gather user feedback

Phase 5: Deployment (1 day)
├── Final review
├── Deploy to hosting
└── Create backup
```

---

## Phase 1: Setup & Planning

### 1.1 Review the Journey Scenarios

Read through all 8 scenarios in `user-journeys.md`:

1. **League Administrator Creates Gameday** - Core feature overview
2. **Team Manager Manages Roster** - Team management flow
3. **Official Checks Players (Passcheck)** - Real-time eligibility checking
4. **Scorekeeper Records Live Score** - Live game statistics entry
5. **Spectator Follows Games** - Public viewing/read-only features
6. **Officials Manager** - Official assignment & management
7. **League Administrator Views Stats** - Standings & analytics
8. **Team Manager Pre-Game Prep** - Team preparation workflow

### 1.2 Set Up Test Environment

**Requirements:**
- Local LeagueSphere instance running (Django dev server)
- MySQL/MariaDB database with test data
- All three React apps built:
  - passcheck: built and accessible at `/passcheck/`
  - scorecard: built and accessible at `/scorecard/`
  - liveticker: built and accessible at `/liveticker/`

**Setup Commands:**
```bash
# Start Django server
cd /home/cda/dev/leaguesphere
python manage.py runserver

# In another terminal, build React apps
npm --prefix passcheck/ run build
npm --prefix scorecard/ run build
npm --prefix liveticker/ run build

# Ensure static files are collected
python manage.py collectstatic

# Access at http://localhost:8000
```

### 1.3 Prepare Test Data

Use realistic sample data from the scenarios:

**Create Test Users:**
- Admin user: `admin` / `password123` (for gameday management)
- Team Manager: `team_manager` / `password123` (for team mgmt)
- Official Manager: `official_mgr` / `password123` (for officials)
- Regular User: `spectator` / `password123` (for viewing)

**Create Test Teams:**
- Bumble Bees
- Thunder Hawks
- Fire Foxes
- Eagles

**Create Test Players:**
- James Smith #12 (QB) - Bumble Bees
- David Williams #5 (WR) - Bumble Bees
- Maria Johnson #3 (WR) - Bumble Bees
- Sarah Brown #7 (QB) - Fire Foxes
- Michael Torres (QB) - Thunder Hawks
- Thomas Green (DB) - Bumble Bees

**Create Season/League:**
- Season: "Fall 2024"
- Leagues: "Competitive Division", "Recreational Division"

### 1.4 Test Data Creation Script (Optional)

Create a Django management command to populate test data:

```python
# gamedays/management/commands/create_test_data.py
from django.core.management.base import BaseCommand
from gamedays.models import Season, League, Team, Gameday, Gameinfo

class Command(BaseCommand):
    def handle(self, *args, **options):
        # Create season
        season, _ = Season.objects.get_or_create(name="Fall 2024")

        # Create leagues
        comp_league, _ = League.objects.get_or_create(name="Competitive Division")
        rec_league, _ = League.objects.get_or_create(name="Recreational Division")

        # Create teams
        teams_data = [
            ("Bumble Bees", "Central City", comp_league),
            ("Thunder Hawks", "North Valley", comp_league),
            ("Fire Foxes", "East Side", rec_league),
            ("Eagles", "West End", rec_league),
        ]

        for name, location, league in teams_data:
            team, created = Team.objects.get_or_create(
                name=name,
                defaults={'location': location, 'league': league}
            )
            if created:
                self.stdout.write(f"Created team: {name}")

        self.stdout.write("Test data created successfully")
```

Run with:
```bash
python manage.py create_test_data
```

---

## Phase 2: Screenshot Capture

### 2.1 Screenshot Capture Workflow

#### For Each Scenario:

1. **Read the scenario** in user-journeys.md
2. **Prepare the test environment** (clear cache, set up data)
3. **Follow each step** exactly as described
4. **Capture screenshot** at marked points
5. **Name screenshot** using SC-###-[description].png format
6. **Annotate image** (optional: highlight clickable elements)
7. **Save to folder:** `/docs/user-manual/images/`
8. **Document metadata:** Resolution, browser, date

### 2.2 Capture Settings

**Desktop Screenshots:**
```
Resolution: 1920x1080
Browser: Google Chrome (latest)
Browser Zoom: 100%
Format: PNG
Quality: High (lossless)
```

**Tablet Screenshots:**
```
Device: iPad (landscape) or equivalent
Resolution: 1024x768
Browser: Safari or Chrome
Format: PNG
```

**Mobile Screenshots:**
```
Device: iPhone 12 or Android equivalent
Resolution: 375x812 (iPhone) or 360x800 (Android)
Browser: Mobile Safari/Chrome
Format: PNG
```

### 2.3 Screenshots by Scenario

#### Scenario 1: Create Gameday (7 screenshots)

**SC-005: Gamedays List View**
- URL: `/gamedays/`
- User: Admin
- Action: After login, before creating gameday
- Shows: Existing gamedays, filters, "New Gameday" button
- What to Capture: Full page with list of gamedays

**SC-006: Create Gameday Form (Empty)**
- URL: `/gamedays/gameday/new/`
- User: Admin
- Action: Click "New Gameday" button
- Shows: Empty form with all fields
- What to Capture: Entire form with:
  - Name field
  - Season dropdown
  - League dropdown
  - Date picker
  - Start time
  - Format dropdown
  - Address textarea
  - Save/Cancel buttons

**SC-007: Create Gameday Form (Filled)**
- Same URL
- Action: Fill in all fields with sample data
- Data to enter:
  - Name: "Week 5 - Fall Regular Season"
  - Season: "Fall 2024"
  - League: "Competitive Division"
  - Date: 11/14/2024
  - Start: 18:00
  - Format: "6v6"
  - Address: "Central Park Fields 1-4, Main Street"
- What to Capture: Completed form before saving

**SC-008: Success Message**
- After clicking Save
- Shows: Success alert at top of page
- Message: "Gameday created successfully"
- What to Capture: Gameday list with new gameday added

**SC-009: Add Games Form**
- URL: `/gamedays/gameday/[id]/gameinfos/wizard/`
- User: Admin
- Action: Click "Add Games" or similar
- Shows: Form to add first game with fields:
  - Time
  - Field
  - Home Team
  - Away Team
  - Standing
  - Stage
- What to Capture: Game 1 form filled with:
  - Time: 18:00
  - Field: 1
  - Home: Bumble Bees
  - Away: Thunder Hawks
  - Standing: Round 1
  - Stage: Regular Season

**SC-010: Schedule After Multiple Games**
- After adding games
- Shows: Calendar/schedule view with multiple games:
  - 18:00 Bumble Bees vs Thunder Hawks (Field 1)
  - 18:30 Fire Foxes vs Eagles (Field 2)
  - 19:00 Dragons vs Falcons (Field 3)
- What to Capture: Full schedule grid/list

**SC-011: Gameday Detail View**
- URL: `/gamedays/gameday/[id]/`
- Shows: Complete gameday with:
  - Gameday info (name, date, time, location)
  - All games scheduled
  - Game details (teams, field, time)
  - Officials assignments (if filled)
  - Edit/Delete options
- What to Capture: Full detail view

#### Scenario 2: Team Roster Management (9 screenshots)

**SC-012: Team Manager Dashboard**
- URL: `/teammanager/`
- User: Team Manager
- Shows: Team list or selection interface
- What to Capture: Dashboard with team options

**SC-013: Team List View**
- Shows: Table/cards of teams
- What to Capture: Multiple teams displayed with edit options

**SC-014: Team Detail Page**
- URL: `/teammanager/team/[id]`
- Shows: Team info + roster section
- What to Capture: Team header with roster list below

**SC-015: Add Player Form (Empty)**
- URL: `/teammanager/team/[id]/addplayer/` (or similar)
- User: Team Manager
- Shows: Empty player form
- What to Capture: Form with fields:
  - First Name
  - Last Name
  - Number
  - Position
  - Birth Date
  - Email
  - Photo upload

**SC-016: Add Player Form (Filled)**
- Same form with data:
  - First Name: James
  - Last Name: Smith
  - Number: 12
  - Position: Quarterback
  - Birth Date: 01/15/1990
  - Photo: (uploaded)
- What to Capture: Completed form before save

**SC-017: Success Message**
- After saving player
- Shows: Success notification
- What to Capture: Confirmation message

**SC-018: Roster List**
- URL: `/teammanager/team/[id]`
- Shows: Table/grid of players with:
  - Photo thumbnail
  - Name
  - Number
  - Position
  - Status/Actions
- What to Capture: Complete roster with multiple players

**SC-019: Bulk Upload Dialog**
- URL: Bulk upload modal/page
- Shows: CSV upload interface
- What to Capture: Upload form with:
  - File input
  - CSV template download link
  - Import button
  - Example CSV data shown

**SC-020: Player Eligibility List**
- Shows: Roster with eligibility indicators:
  - Pass card valid/invalid
  - Photo verified/needed
  - Registration status
- What to Capture: Roster with status icons/colors

#### Scenario 3: Passcheck (7 screenshots)

**SC-021: Passcheck Home**
- URL: `/passcheck/`
- Shows: Welcome screen with React app
- What to Capture: App home with gameday selection prompt

**SC-022: Gameday Selection**
- Shows: Dropdown or selector for today's gamedays
- What to Capture: Dropdown showing available gamedays

**SC-023: Team Selection**
- Shows: Selector for home/away team
- Options: "Bumble Bees", "Thunder Hawks"
- What to Capture: Team selection interface

**SC-024: Team Roster**
- Shows: List of players on team roster
- What to Capture: Roster with:
  - Player photo
  - Player name
  - Number
  - Position
  - Checkbox for check-in

**SC-025: Player Detail Card**
- Shows: Large player card during check-in
- What to Capture: Card with:
  - Large player photo
  - Pass card photo side-by-side
  - Player details (name, number, position)
  - Verification status
  - Verified/Reject buttons

**SC-026: Roster with Check-in Status**
- Shows: Roster with checkmarks/status indicators
- Partial checked in (5/12 players)
- What to Capture: Roster with mixed check-in status

**SC-027: Check-in Complete**
- All players checked in
- Shows: Confirmation with count
- "12 players checked in"
- What to Capture: Completion summary

#### Scenario 4: Scorecard (11 screenshots)

**SC-028: Scorecard Home**
- URL: `/scorecard/`
- Shows: Game selection
- What to Capture: Available games for scoring

**SC-029: Live Score Display**
- Shows: Live game interface
- Score: 0-0 at start
- What to Capture: Initial scorecard view

**SC-030: Touchdown Dialog**
- Shows: Modal/form to record TD
- What to Capture: TD entry form with:
  - Team selector (if needed)
  - Player dropdown
  - Confirmation button

**SC-031: Updated Score After TD**
- Score: Bumble Bees 6, Thunder Hawks 0
- What to Capture: Score display updated

**SC-032: Extra Point Dialog**
- Shows: Form for 1pt kick vs 2pt conversion
- What to Capture: XP entry form

**SC-033: Score After XP**
- Score: Bumble Bees 7, Thunder Hawks 0
- What to Capture: Updated score

**SC-034: Statistics Entry**
- Shows: Interface for recording stats
- What to Capture: Stat entry controls (buttons, forms)

**SC-035: Player Statistics**
- Shows: Accumulated stats for players
- Example: James Smith (QB)
  - 12/18 completions
  - 145 yards
- What to Capture: Stats display

**SC-036: Halftime Summary**
- Shows: Halftime break summary
- What to Capture: Halftime stats/summary

**SC-037: Final Score Display**
- Score: Bumble Bees 7, Thunder Hawks 10
- Status: Game ended
- What to Capture: Final score display

**SC-038: Game Summary After Submission**
- Shows: Complete game recap
- What to Capture: Summary with all stats and scoring plays

#### Scenario 5: Liveticker (7 screenshots)

**SC-039: Liveticker Home**
- URL: `/liveticker/`
- Shows: Active games list
- What to Capture: Games currently in progress

**SC-040: Game Selection List**
- Shows: Today's games with status
- What to Capture: Game selection interface

**SC-041: Live Ticker Display**
- Shows: Live game ticker
- Score visible (updates)
- What to Capture: Live ticker interface

**SC-042: Play-by-Play Feed**
- Shows: Recent plays in chronological order
- What to Capture: Play-by-play list

**SC-043: Game Statistics**
- Shows: Team stats (passing, rushing, defense)
- What to Capture: Stats display for both teams

**SC-044: Player Statistics**
- Shows: Individual player stats
- What to Capture: Player stat detail

**SC-045: League Table (from Liveticker)**
- Links to overall standings
- What to Capture: Standings table

#### Scenario 6: Officials Management (8 screenshots)

**SC-046: Officials Dashboard**
- URL: `/officials/`
- Shows: Officials home/overview
- What to Capture: Officials section home

**SC-047: Officials List**
- Shows: Table of all officials
- Columns: Name, Level, License Exp, Games
- What to Capture: Officials directory

**SC-048: Filtered Officials**
- Filter applied (e.g., "Certified Referees")
- Shows: Filtered results
- What to Capture: Filtered list

**SC-049: Official Profile**
- URL: `/officials/profile/[id]/`
- Shows: Official details with:
  - Photo
  - Certification
  - License exp
  - Game history
- What to Capture: Full profile

**SC-050: Officials Assignment Form**
- URL: Game detail page with assignment section
- Shows: Form with position dropdowns
- What to Capture: Assignment form with empty fields

**SC-051: Referee Dropdown**
- Shows: Open dropdown with official names
- What to Capture: Selection dropdown

**SC-052: Game with Assigned Officials**
- Shows: Game with all three officials assigned:
  - Head Ref: John Martinez
  - Line Judge: Maria Garcia
  - Scorekeeper: David Park
- What to Capture: Completed assignment display

**SC-053: Email Notification Dialog**
- Shows: Modal to send emails to officials
- Preview of email message
- What to Capture: Email preview/send dialog

#### Scenario 7: League Table (6 screenshots)

**SC-054: League Table Home**
- URL: `/leaguetable/`
- Shows: Overall standings
- What to Capture: Standings table with all teams

**SC-055: Division Standings**
- Filter/selector shows division: "Competitive Division"
- Shows: Only teams in that division
- What to Capture: Filtered standings view

**SC-056: Team Detail Page**
- URL: Team from standings selected
- Shows: Team info + stats
- What to Capture: Team details

**SC-057: Team Game Log**
- Shows: List of all games with results
- What to Capture: Game log table

**SC-058: Season Leaders**
- Shows: Statistical leaders (passing yards, receiving yards, TDs, INTs)
- What to Capture: Leaderboard display

**SC-059: Playoff Seeding**
- Shows: Playoff bracket/seeding
- What to Capture: Playoff bracket view

#### Scenario 8: Pre-Game Preparation (8 screenshots)

**SC-060: Team Manager Dashboard**
- URL: `/teammanager/`
- Shows: Team with upcoming game
- What to Capture: Dashboard with game section

**SC-061: Upcoming Games**
- Shows: Next scheduled game details
- What to Capture: Game preview

**SC-062: Roster with Availability**
- Shows: Team roster with player status
- Status options: Playing, Injured, Unavailable, Unknown
- What to Capture: Roster with mixed statuses

**SC-063: Availability Update Dialog**
- Shows: Modal to change player status
- What to Capture: Status update form

**SC-064: Player Eligibility Status**
- Shows: Roster with pass card/eligibility status
- What to Capture: Eligibility indicators

**SC-065: Equipment Checklist**
- Shows: Pre-game checklist
- Items: Flag belts, shoe requirements, jersey numbers
- What to Capture: Checklist interface

**SC-066: Roster Report**
- Shows: Printable roster format
- What to Capture: Report preview

**SC-067: Game Reminder Dialog**
- Shows: Message to send to team
- What to Capture: Reminder preview/send interface

### 2.4 Image Optimization

After capturing, optimize images:

```bash
# Install ImageMagick if needed
sudo apt-get install imagemagick

# Resize if needed (keep original aspect ratio)
convert original.png -resize 1920x1080 resized.png

# Optimize PNG (reduce file size)
optipng -o5 resized.png

# Create web-optimized version
convert resized.png -quality 85 optimized.png
```

### 2.5 Image Naming Convention

```
SC-###-[feature]-[state].png

Examples:
SC-001-login-form.png
SC-005-gamedays-list.png
SC-029-scorecard-touchdown-dialog.png
SC-054-league-table-standings.png
```

### 2.6 Create Images Folder

```bash
mkdir -p /home/cda/dev/leaguesphere/docs/user-manual/images
```

---

## Phase 3: Manual Assembly

### 3.1 HTML Manual Structure

Create `index.html` with this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LeagueSphere User Manual</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>LeagueSphere User Manual</h1>
        <p class="version">Version 5.2.x</p>
        <nav>
            <ul class="toc">
                <li><a href="#getting-started">Getting Started</a></li>
                <li><a href="#gamedays">Managing Gamedays</a></li>
                <li><a href="#teams">Managing Teams & Players</a></li>
                <li><a href="#passcheck">Player Eligibility (Passcheck)</a></li>
                <li><a href="#scorecard">Live Game Scoring (Scorecard)</a></li>
                <li><a href="#liveticker">Following Games (Liveticker)</a></li>
                <li><a href="#league-table">League Standings (League Table)</a></li>
                <li><a href="#officials">Managing Officials</a></li>
                <li><a href="#pre-game">Pre-Game Preparation</a></li>
                <li><a href="#appendix">Appendix</a></li>
            </ul>
        </nav>
    </header>

    <main>
        <!-- Content sections go here -->
    </main>

    <footer>
        <p>&copy; 2024 LeagueSphere. All rights reserved.</p>
    </footer>

    <script src="script.js"></script>
</body>
</html>
```

### 3.2 CSS Styling

Create `styles.css`:

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f5f5f5;
}

header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem;
    text-align: center;
}

header h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
}

nav.toc {
    background: white;
    padding: 1rem;
    margin: 2rem 0;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    position: sticky;
    top: 0;
}

nav.toc ul {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
}

nav.toc a {
    color: #667eea;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.3s;
}

nav.toc a:hover {
    background-color: #f0f0f0;
}

main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}

section {
    background: white;
    padding: 2rem;
    margin-bottom: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

h2 {
    color: #667eea;
    font-size: 2rem;
    margin-bottom: 1rem;
    border-bottom: 3px solid #667eea;
    padding-bottom: 0.5rem;
}

h3 {
    color: #764ba2;
    font-size: 1.5rem;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
}

.scenario {
    background: #f9f9f9;
    border-left: 4px solid #667eea;
    padding: 1rem;
    margin: 1rem 0;
}

.scenario-title {
    font-weight: bold;
    color: #667eea;
    margin-bottom: 0.5rem;
}

.step {
    margin: 1.5rem 0;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
}

.step-number {
    display: inline-block;
    background: #667eea;
    color: white;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    text-align: center;
    line-height: 2rem;
    margin-right: 0.5rem;
    font-weight: bold;
}

.step-description {
    margin-top: 0.5rem;
}

.screenshot-container {
    margin: 1.5rem 0;
    text-align: center;
}

.screenshot-container img {
    max-width: 100%;
    height: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.screenshot-caption {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: #666;
    font-style: italic;
}

.note, .tip, .warning {
    padding: 1rem;
    margin: 1rem 0;
    border-radius: 4px;
    border-left: 4px solid;
}

.note {
    background: #e3f2fd;
    border-color: #2196f3;
    color: #1565c0;
}

.tip {
    background: #f0f4c3;
    border-color: #fbc02d;
    color: #f57f17;
}

.warning {
    background: #ffebee;
    border-color: #f44336;
    color: #c62828;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
}

table th, table td {
    border: 1px solid #ddd;
    padding: 0.75rem;
    text-align: left;
}

table th {
    background: #667eea;
    color: white;
    font-weight: bold;
}

table tr:nth-child(even) {
    background: #f5f5f5;
}

footer {
    background: #333;
    color: white;
    text-align: center;
    padding: 2rem;
    margin-top: 3rem;
}

/* Responsive Design */
@media (max-width: 768px) {
    header h1 {
        font-size: 1.5rem;
    }

    nav.toc ul {
        flex-direction: column;
        gap: 0.5rem;
    }

    nav.toc a {
        display: block;
    }

    main {
        padding: 1rem;
    }

    section {
        padding: 1rem;
    }
}
```

### 3.3 Create Sections

Create a section for each scenario in `index.html`:

```html
<section id="gamedays">
    <h2>Managing Gamedays</h2>

    <p>This section covers how to create and manage gameday events, schedule games,
    and assign officials.</p>

    <div class="scenario">
        <div class="scenario-title">Scenario: League Administrator Creates a New Gameday</div>
        <p>Learn how to set up a new gameday with multiple games and assign officials.</p>

        <div class="step">
            <span class="step-number">1</span>
            <div class="step-description">
                <strong>Navigate to Gamedays Management</strong>
                <p>Click "Gamedays" in the main navigation menu to see the list of existing gamedays.</p>
                <div class="screenshot-container">
                    <img src="images/SC-005-gamedays-list.png" alt="Gamedays list view">
                    <p class="screenshot-caption">SC-005: Gamedays list showing existing gamedays by season and league</p>
                </div>
            </div>
        </div>

        <div class="step">
            <span class="step-number">2</span>
            <div class="step-description">
                <strong>Create New Gameday</strong>
                <p>Click the "New Gameday" button to begin creating a new gameday.</p>
                <div class="screenshot-container">
                    <img src="images/SC-006-create-gameday-form.png" alt="Create gameday form">
                    <p class="screenshot-caption">SC-006: Empty create gameday form with all fields</p>
                </div>
            </div>
        </div>

        <!-- Continue with more steps... -->
    </div>
</section>
```

### 3.4 Use Consistent Structure

For each scenario, use this pattern:

```html
<div class="scenario">
    <div class="scenario-title">
        [Scenario Title]
    </div>

    <p>[Brief description of what this scenario covers]</p>

    <div class="step">
        <span class="step-number">1</span>
        <div class="step-description">
            <strong>[Step Title]</strong>
            <p>[Step Description]</p>
            <div class="screenshot-container">
                <img src="images/SC-###-[name].png" alt="[Description]">
                <p class="screenshot-caption">SC-###: [Screenshot Description]</p>
            </div>
        </div>
    </div>

    <!-- Repeat for each step -->
</div>
```

### 3.5 Add Navigation Links

Add smooth scrolling and anchor links:

```html
<!-- In header -->
<nav>
    <ul class="toc">
        <li><a href="#getting-started">Getting Started</a></li>
        <li><a href="#gamedays">Managing Gamedays</a></li>
        <!-- etc -->
    </ul>
</nav>

<!-- In each section -->
<section id="gamedays">
    <h2>Managing Gamedays</h2>
    <!-- content -->
</section>
```

### 3.6 Create JavaScript for Interactivity

Create `script.js`:

```javascript
// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Lazy load images
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src || img.src;
                observer.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img').forEach(img => {
        imageObserver.observe(img);
    });
}

// Print functionality
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'p') {
        // Custom print handling if needed
    }
});
```

---

## Phase 4: QA & Polish

### 4.1 Quality Assurance Checklist

- [ ] All screenshots are present and correctly named
- [ ] All images load properly (no broken image icons)
- [ ] All navigation links work (no broken anchors)
- [ ] Content matches scenarios exactly
- [ ] Grammar and spelling are correct
- [ ] Consistent formatting and styling throughout
- [ ] Responsive design works on all breakpoints
- [ ] Page loads quickly (images optimized)
- [ ] Accessible to screen readers (alt-text on all images)
- [ ] Mobile view is usable and readable

### 4.2 Browser Testing

Test in:
- [ ] Chrome (Desktop)
- [ ] Firefox (Desktop)
- [ ] Safari (Desktop)
- [ ] Edge (Desktop)
- [ ] Chrome Mobile
- [ ] Safari Mobile (iOS)

### 4.3 Accessibility Check

- [ ] All images have descriptive alt-text
- [ ] Headings are properly nested (h1 > h2 > h3)
- [ ] Color contrast is sufficient (WCAG AA standard)
- [ ] Keyboard navigation works
- [ ] Form labels are associated with inputs
- [ ] No images with text only (text should be real text)

### 4.4 Performance Optimization

```bash
# Analyze page performance
lighthouse index.html --view

# Optimize images further if needed
jpegoptim *.jpg --max=85
pngcrush -e .png -max *.png
```

### 4.5 User Testing

- Ask 2-3 typical users to:
  - Navigate through the manual
  - Follow one complete scenario
  - Find specific information
  - Report any confusing sections
- Collect feedback
- Make refinements

---

## Phase 5: Deployment

### 5.1 Final Review Checklist

- [ ] All content is accurate
- [ ] All screenshots capture correct features
- [ ] Sample data is consistent
- [ ] Navigation is complete
- [ ] Manual is accessible
- [ ] Mobile view is functional
- [ ] Load time is acceptable
- [ ] All links work
- [ ] Print view looks good

### 5.2 Deployment Location

Place manual in:
```
/home/cda/dev/leaguesphere/docs/user-manual/
├── index.html          (Main manual)
├── styles.css          (Styling)
├── script.js           (Interactivity)
├── images/             (All screenshots)
│   ├── SC-001-*.png
│   ├── SC-002-*.png
│   └── ...
└── user-journeys.md    (Reference document)
```

### 5.3 Create Backup

```bash
cd /home/cda/dev/leaguesphere/docs/user-manual
tar -czf user-manual-backup-$(date +%Y%m%d).tar.gz index.html styles.css script.js images/
```

### 5.4 Version Documentation

Create `README.md` in manual folder:

```markdown
# LeagueSphere User Manual

This is the standalone HTML user manual for LeagueSphere flag football league management system.

## Contents

- **index.html** - Main manual with all 8 user scenarios
- **styles.css** - Styling and responsive design
- **script.js** - Navigation and interactivity
- **images/** - Screenshots (55+)

## How to Use

1. Open `index.html` in a web browser
2. Use the table of contents to navigate
3. Each scenario provides step-by-step instructions
4. Screenshots show exactly what to expect

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Mobile Support

- Fully responsive down to 320px width
- Tested on iPhone 12 and Android phones

## Accessibility

- WCAG 2.1 AA compliant
- Keyboard navigable
- Screen reader compatible
- High contrast text

## Version

Manual Version: 1.0
LeagueSphere Version: 5.2.x
Last Updated: 2024-11-07

## Updating

To update the manual:
1. Update user journey scenarios if feature changes
2. Capture new screenshots
3. Update HTML content
4. Test thoroughly
5. Update version number in README and manual

## Support

For issues with the manual, contact [support email]
```

---

## File Checklist

After completion, verify you have:

```
/home/cda/dev/leaguesphere/docs/user-manual/
├── index.html                     (Main manual)
├── styles.css                     (Styles)
├── script.js                      (JavaScript)
├── README.md                      (Manual info)
├── user-journeys.md               (Scenario reference)
├── screenshot-checklist.md        (Screenshot list)
├── MANUAL-CREATOR-GUIDE.md        (This file)
└── images/
    ├── SC-001-login-*.png
    ├── SC-002-home-*.png
    ├── SC-003-navigation-*.png
    ├── SC-004-mobile-menu-*.png
    ├── SC-005-gamedays-list.png
    ├── SC-006-create-gameday-empty.png
    ├── SC-007-create-gameday-filled.png
    ├── SC-008-success-message.png
    ├── SC-009-add-games-form.png
    ├── SC-010-schedule-multiple-games.png
    ├── SC-011-gameday-detail.png
    ├── SC-012-team-manager-dashboard.png
    ├── SC-013-team-list.png
    ├── SC-014-team-detail.png
    ├── SC-015-add-player-empty.png
    ├── SC-016-add-player-filled.png
    ├── SC-017-success-player-added.png
    ├── SC-018-roster-list.png
    ├── SC-019-bulk-upload-dialog.png
    ├── SC-020-player-eligibility-list.png
    ├── SC-021-passcheck-home.png
    ├── SC-022-gameday-selection.png
    ├── SC-023-team-selection.png
    ├── SC-024-team-roster.png
    ├── SC-025-player-detail-card.png
    ├── SC-026-roster-with-checkin-status.png
    ├── SC-027-checkin-complete.png
    ├── SC-028-scorecard-home.png
    ├── SC-029-live-score-display.png
    ├── SC-030-touchdown-dialog.png
    ├── SC-031-score-after-td.png
    ├── SC-032-extra-point-dialog.png
    ├── SC-033-score-after-xp.png
    ├── SC-034-statistics-entry.png
    ├── SC-035-player-statistics.png
    ├── SC-036-halftime-summary.png
    ├── SC-037-final-score.png
    ├── SC-038-game-summary.png
    ├── SC-039-liveticker-home.png
    ├── SC-040-game-selection-list.png
    ├── SC-041-live-ticker-display.png
    ├── SC-042-play-by-play-feed.png
    ├── SC-043-game-statistics.png
    ├── SC-044-player-statistics.png
    ├── SC-045-league-table-from-ticker.png
    ├── SC-046-officials-dashboard.png
    ├── SC-047-officials-list.png
    ├── SC-048-filtered-officials.png
    ├── SC-049-official-profile.png
    ├── SC-050-officials-assignment-form.png
    ├── SC-051-referee-dropdown.png
    ├── SC-052-game-with-officials.png
    ├── SC-053-email-notification-dialog.png
    ├── SC-054-league-table-home.png
    ├── SC-055-division-standings.png
    ├── SC-056-team-detail-page.png
    ├── SC-057-team-game-log.png
    ├── SC-058-season-leaders.png
    ├── SC-059-playoff-seeding.png
    ├── SC-060-team-mgr-dashboard.png
    ├── SC-061-upcoming-games.png
    ├── SC-062-roster-with-availability.png
    ├── SC-063-availability-update-dialog.png
    ├── SC-064-player-eligibility-status.png
    ├── SC-065-equipment-checklist.png
    ├── SC-066-roster-report.png
    └── SC-067-game-reminder-dialog.png
```

---

## Key Takeaways

1. **Reference the scenarios** - Use `user-journeys.md` as your guide for exactly what to capture
2. **Follow the checklist** - Use `screenshot-checklist.md` to track your progress
3. **Be consistent** - Use same data, same browser, same resolution throughout
4. **Test thoroughly** - QA is critical for a professional manual
5. **Optimize images** - Ensure fast load times
6. **Make it accessible** - Alt text and contrast matter
7. **Keep it organized** - Clear structure helps users find information

---

## Support & Troubleshooting

### Common Issues

**Issue:** Screenshots are blurry
- Solution: Ensure 100% zoom, high resolution camera/screenshot tool

**Issue:** Manual won't load images
- Solution: Check file paths are relative, ensure images/ folder exists

**Issue:** Mobile layout looks broken
- Solution: Test viewport meta tag, use CSS media queries properly

**Issue:** Pages load slowly
- Solution: Optimize images more, use lazy loading

**Issue:** Navigation not smooth
- Solution: Check anchor IDs match href values, test JavaScript

### Getting Help

- Review the original user-journeys.md document
- Check screenshot-checklist.md for naming conventions
- Test in multiple browsers
- Validate HTML/CSS with W3C validators

---

## Next Steps

1. Read all three documents (user-journeys.md, screenshot-checklist.md, this guide)
2. Set up your test environment and create sample data
3. Begin capturing screenshots Phase 2
4. Assemble the HTML manual in Phase 3
5. Run QA checks in Phase 4
6. Deploy in Phase 5

---

## Document Info

- **Version:** 1.0
- **Created:** 2024-11-07
- **Status:** Ready for manual creation
- **Contact:** [Add support contact info]

