# Screenshots Directory

This directory contains screenshots for the LeagueSphere user manual.

## Organization

Each subdirectory corresponds to a feature page:
- `intro/` - Navigation & Erste Schritte
- `gamedays/` - Spieltage verwalten
- `passcheck/` - Spielberechtigung prüfen
- `scorecard/` - Live-Scoring
- `officials/` - Schiedsrichter verwalten
- `liveticker/` - Liveticker
- `league-table/` - Tabellen & Spielpläne
- `teammanager/` - Teams verwalten
- `accounts/` - Benutzerkonten

## Naming Convention

Format: `[feature]-[action]-[number].png`

Examples:
- `gamedays-list-01.png` - First screenshot of gamedays list
- `passcheck-search-01.png` - Passcheck search interface
- `scorecard-scoring-02.png` - Second screenshot of scoring interface

## Screenshot Requirements

### Technical Specifications:
- **Format:** PNG (preferred) or JPG
- **Resolution:** 1920x1080 or actual browser viewport
- **Quality:** High quality, no compression artifacts
- **Size:** Optimize to <500KB per image (use TinyPNG or similar)
- **Content:** Crop to relevant UI area

### Capture Guidelines:
1. Use consistent browser (Chrome/Firefox recommended)
2. Set browser zoom to 100%
3. Use consistent viewport size (1920x1080 recommended)
4. Capture from https://leaguesphere.app
5. Anonymize personal information if present
6. Focus on the feature being documented
7. Capture in light mode for consistency

### Recommended Tools:
- **Linux:** Flameshot, GNOME Screenshot
- **macOS:** Screenshot app (Cmd+Shift+4), CleanShot X
- **Windows:** Snipping Tool, ShareX
- **Browser:** Chrome DevTools device toolbar for consistent viewport

## Image Optimization

After capturing screenshots, optimize them:

```bash
# Using optipng
find screenshots/ -name "*.png" -exec optipng -o5 {} \;

# Using TinyPNG CLI (if installed)
tinypng screenshots/**/*.png
```

## Adding Screenshots to HTML

Once screenshots are captured and placed in the appropriate subdirectory, add them to the HTML files using this pattern:

```html
<figure class="figure">
    <img src="screenshots/[feature]/[screenshot-name].png"
         class="figure-img img-fluid rounded shadow-sm"
         alt="[Detailed description of what the screenshot shows]"
         loading="lazy">
    <figcaption class="figure-caption">
        [Caption explaining what the user sees in this screenshot]
    </figcaption>
</figure>
```

## Accessibility

Always provide meaningful alt text for images:
- Describe what the screenshot shows
- Explain the UI elements visible
- Mention any important details
- Keep it concise but informative

Example:
```html
alt="Spieltagsliste zeigt Übersicht aller geplanten Spieltage mit Datum, Ort und Status"
```

## Expected Screenshots by Feature

### intro/ (5-8 screenshots)
- `navigation-01.png` - Main navigation bar
- `navigation-02.png` - Sidebar navigation
- `home-page.png` - Dashboard overview
- `login-01.png` - Login screen
- `user-roles.png` - User roles explanation

### gamedays/ (8-12 screenshots)
- `gamedays-list-01.png` - Gamedays list view
- `gamedays-create-01.png` - Create gameday form
- `gamedays-detail-01.png` - Gameday detail view
- `gamedays-edit-01.png` - Edit gameday
- `game-scheduling-01.png` - Scheduling interface
- `conflict-detection-01.png` - Conflict detection

### passcheck/ (5-7 screenshots)
- `passcheck-search-01.png` - Player search interface
- `passcheck-player-01.png` - Player detail view
- `passcheck-eligible-01.png` - Eligible status display
- `passcheck-ineligible-01.png` - Ineligible status display
- `moodle-integration-01.png` - Moodle integration view

### scorecard/ (8-10 screenshots)
- `scorecard-overview-01.png` - Scorecard overview
- `scorecard-scoring-01.png` - Scoring interface
- `scorecard-clock-01.png` - Game clock management
- `scorecard-touchdown-01.png` - Touchdown recording
- `scorecard-plays-01.png` - Play list
- `scorecard-finalize-01.png` - Finalize game

### officials/ (4-6 screenshots)
- `officials-list-01.png` - Officials list
- `officials-assign-01.png` - Assign officials to game
- `officials-availability-01.png` - Availability management

### liveticker/ (5-7 screenshots)
- `liveticker-live-01.png` - Live ticker display
- `liveticker-events-01.png` - Event list
- `liveticker-filter-01.png` - Filtering options
- `liveticker-multiple-games-01.png` - Multiple games view

### league-table/ (5-7 screenshots)
- `standings-01.png` - League standings table
- `schedule-01.png` - Schedule view
- `statistics-01.png` - Statistics display
- `export-01.png` - Export options

### teammanager/ (5-7 screenshots)
- `teams-list-01.png` - Teams list
- `team-detail-01.png` - Team detail view
- `roster-01.png` - Roster management
- `player-add-01.png` - Add player form

### accounts/ (4-6 screenshots)
- `login-01.png` - Login screen
- `profile-01.png` - User profile
- `profile-edit-01.png` - Edit profile
- `password-change-01.png` - Change password
- `google-oauth-01.png` - Google authentication

## Status

- [ ] intro/ screenshots captured
- [ ] gamedays/ screenshots captured
- [ ] passcheck/ screenshots captured
- [ ] scorecard/ screenshots captured
- [ ] officials/ screenshots captured
- [ ] liveticker/ screenshots captured
- [ ] league-table/ screenshots captured
- [ ] teammanager/ screenshots captured
- [ ] accounts/ screenshots captured
- [ ] All screenshots optimized (<500KB)
- [ ] All screenshots added to HTML files
- [ ] All alt text written

## Notes for QA Engineer

This directory structure has been created by the implementation-engineer. Your task is to:

1. Capture screenshots from https://leaguesphere.app for each feature
2. Organize them into the appropriate subdirectories
3. Optimize image sizes
4. Add them to the HTML files with proper alt text and captions
5. Ensure consistency in screenshot style and viewport

Please follow the naming convention and technical specifications above.
