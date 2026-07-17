# Tournament Creation Tutorial

This guide walks you through creating a **Tournament** in LeagueSphere and organizing games within it using the Django admin interface.

## What is a Tournament?

A **Tournament** is a presentation layer for organizing and displaying games across multiple "rows" and "columns" (think of it as a bracket or schedule grid). It allows you to:

- Display games in a structured, multi-panel layout
- Add titles, descriptions, location, and external links
- Control which columns (League Name, Field) are visible
- Create a professional tournament bracket or schedule view

### Tournament Hierarchy

```
Tournament
├── Rows (ordered, titled)
│   ├── Columns (ordered, titled)
│   │   └── ColumnGames (ordered gameinfo references)
│   └── Columns
│       └── ColumnGames
└── Rows
    └── Columns
        └── ColumnGames
```

Each **game** (Gameinfo) can appear in multiple columns (e.g., the same game could appear in both a "Semifinals" and "Live Bracket" view).

---

## Step-by-Step: Create a Tournament

### Step 1: Access the Admin Interface

1. Go to `/admin/gamedays/tournament/` (or click "Tournaments" in the Django admin sidebar)
2. Click the **"Add Tournament"** button (top right)

### Step 2: Fill in Tournament Metadata

On the "Add Tournament" form, fill in:

| Field | Description | Required | Example |
|-------|-------------|----------|---------|
| **Name** | Internal identifier (not shown to users) | ✓ | "2026-Nationals-Semifinals" |
| **Title** | Display name on the detail page | | "2026 National Championships - Semifinals" |
| **Location** | City/venue name (renders as Google Maps link) | | "Berlin, Germany" |
| **Description** | Additional info about the tournament | | "Regional qualifying round for nationals" |
| **Show League Name** | Display "Liga" column in game tables | | Unchecked (default) |
| **Show Field** | Display "Feld" column in game tables | | Unchecked (default) |

**Example filled form:**
```
Name:                 2026-Nationals-Semifinals
Title:                2026 National Championships - Semifinals
Location:             Berlin, Germany
Description:          Regional qualifying round for nationals
Show League Name:     ☐ (unchecked)
Show Field:           ☐ (unchecked)
```

Click **"Save"** and continue to Step 3.

---

### Step 3: Create Rows

After saving the Tournament, you're on its "Change" page. You'll see a **"Rows"** inline section.

1. Scroll to the **"Rows"** section
2. Click **"+ Add another Tournamentrow"** 
3. Fill in:
   - **Title**: e.g., "Semifinals", "Quarterfinals", "Round of 16"
   - **Order**: e.g., `1`, `2`, `3` (controls vertical placement on the detail page)

**Example rows:**
```
Row 1: Title="Semifinals", Order=1
Row 2: Title="Finals", Order=2
Row 3: Title="3rd Place", Order=3
```

Click **"Save"** to create the rows.

---

### Step 4: Create Columns

Now go to `/admin/gamedays/tournamentrow/` to manage columns per row.

1. **Select the row** you just created (e.g., "Semifinals")
2. In the "Columns" section, click **"+ Add another Tournamentcolumn"**
3. Fill in:
   - **Title**: e.g., "Match A", "Match B", "Bracket Overview"
   - **Order**: e.g., `1`, `2`, `3` (controls horizontal placement)

**Example columns in a row:**
```
Semifinals Row:
  Column 1: Title="Semi 1", Order=1
  Column 2: Title="Semi 2", Order=2
```

Click **"Save"**.

---

### Step 5: Add Games to Columns

Now go to `/admin/gamedays/tournamentcolumn/` or `/admin/gamedays/tournamentcolumngame/` to add games.

#### Via TournamentColumn Admin (Recommended)

1. **Select a column** (e.g., "2026-Nationals-Semifinals → Semifinals → Semi 1")
2. In the **"Column Games"** inline section, click **"+ Add another Tournamentcolumngame"**
3. Fill in:
   - **Gameinfo**: Search/autocomplete for the game (e.g., "4__1__2__Berlin, 2026-07-20 10:00:00 - Vorrunde/1 - Geplant [Geplant]")
   - **Order**: e.g., `1`, `2`, `3` (order within the column)

#### Via TournamentColumnGame Admin (Direct)

1. Go to `/admin/gamedays/tournamentcolumngame/`
2. Click **"Add Tournament Column Game"**
3. Select:
   - **Column**: Choose the column
   - **Gameinfo**: Search for the game
   - **Order**: Display order in that column

**Tips for finding games:**
- Games are identified by: `gameday_pk__gameinfo_pk__field - stage/standing - status`
- Example: `4__1__1 - Vorrunde/1 - Geplant` = Gameday #4, Game #1, Field 1, Vorrunde Group 1
- Use the **search field** (🔍) to filter by gameday name, stage, or field

**Example column with 3 games:**
```
Column: "Semi 1"
  ├─ Game 1: Gameinfo="Gameday Vorrunde → Game 1", Order=1
  ├─ Game 2: Gameinfo="Gameday Vorrunde → Game 2", Order=2
  └─ Game 3: Gameinfo="Gameday Vorrunde → Game 3", Order=3
```

---

### Step 6: Add External Links (Optional)

Still on the Tournament Change page, scroll to **"Resource URLs"** (the inline section at the bottom).

1. Click **"+ Add another Resource Url"**
2. Fill in:
   - **URL**: e.g., `https://livestream.example.com/channel/nationals`
   - **Description**: e.g., "Watch Live"

**Example links:**
```
Link 1: URL="https://livestream.example.com", Description="Watch Live"
Link 2: URL="https://bracket.example.com/2026", Description="Full Bracket"
Link 3: URL="https://forms.example.com/signup", Description="Register"
```

Click **"Save"** when done.

---

## Layout Reference: What Users See

When a user visits `/gamedays/tournament/<id>/`, they see:

### 1. **Top Section: Metadata Card + Links Card**
```
┌─────────────────────────────────────────────────────────────┐
│ Turnier Informationen           │           Links            │
├─────────────────────────────────┼────────────────────────────┤
│ Title: 2026 Nationals Semifinals │ Watch Live  [→]            │
│ Beschreibung: Regional qual...   │ Full Bracket [→]           │
│ Ort: Berlin, Germany [Maps 🔗]   │ Register    [→]            │
└─────────────────────────────────────────────────────────────┘
```

### 2. **Game Rows and Columns**
```
Semifinals
┌─────────────────────┬─────────────────────┐
│   Semi 1            │   Semi 2            │
├─────────────────────┼─────────────────────┤
│ Zeit│Heim│...│Gast  │ Zeit│Heim│...│Gast  │
├─────────────────────┼─────────────────────┤
│ 10:00 A vs B        │ 10:00 C vs D        │
│ 11:00 E vs F        │ 11:00 G vs H        │
└─────────────────────┴─────────────────────┘

Finals
┌─────────────────────┐
│   Final             │
├─────────────────────┤
│ Zeit│Heim│...│Gast  │
├─────────────────────┤
│ 15:00 Winner1 vs...  │
└─────────────────────┘
```

---

## Full Example Walkthrough

### Scenario: Create a 3-Round Tournament

**Goal:** Create a tournament with 3 rounds (Round of 16, Quarterfinals, Semifinals) where each round has 1-2 matches displayed side-by-side.

#### Step 1: Tournament Metadata
```
Name:                 2026-Qualifier-RO16
Title:                2026 Regional Qualifier - Round of 16
Location:             Munich, Germany
Description:          First round of regional qualifiers
Show League Name:     ☐
Show Field:           ☐ (or ☑ if games are on different fields)
```
**Save** → Continue to Rows.

#### Step 2: Create Rows
```
Row 1: Title="Round of 16",     Order=1
Row 2: Title="Quarterfinals",   Order=2
Row 3: Title="Semifinals",      Order=3
```
**Save** → Go to TournamentRow admin.

#### Step 3: Create Columns (per Row)

**For "Round of 16" (8 games → 4 matches → 2 columns):**
```
Column 1: Title="Matches 1-2",  Order=1
Column 2: Title="Matches 3-4",  Order=2
Column 3: Title="Matches 5-6",  Order=3
Column 4: Title="Matches 7-8",  Order=4
```

**For "Quarterfinals" (4 games → 2 matches → 1 column):**
```
Column 1: Title="All Matches",  Order=1
```

**For "Semifinals" (2 games → 1 column):**
```
Column 1: Title="Semifinals",   Order=1
```

#### Step 4: Populate with Games

Use **TournamentColumnGame** admin or inline on **TournamentColumn** change page.

**Example: Round of 16 - Matches 1-2:**
1. Search gameday "Qualifier Vorrunde"
2. Add games in order:
   - Game 1 (Field 1, 10:00) - Order=1
   - Game 2 (Field 2, 10:00) - Order=2

**Example: Semifinals:**
1. Find the 2 semifinal games from a later gameday
2. Add them in order:
   - Semifinal 1 (10:30) - Order=1
   - Semifinal 2 (12:00) - Order=2

#### Step 5: Add Links
```
URL 1: https://stream.example.com/qualifier, Description="Live Stream"
URL 2: https://bracket.example.com/2026-q1, Description="Bracket"
```

**Save** → Done!

---

## Troubleshooting

### Games not showing up?
- **Check game status**: Games must have `status != "DRAFT"` to be visible (usually "Geplant" or "Gestartet")
- **Verify game exists**: Search the gameinfo autocomplete to confirm the game exists
- **Check order**: Verify `ColumnGame.order` values are set and in sequence

### Wrong league name showing?
- **Game belongs to wrong gameday**: The game's league name comes from its parent gameday
- **Solution**: Add a different gameinfo from the correct gameday, or create a new gameday

### Location link not working?
- **Empty location field**: Ensure `Tournament.location` is filled in
- **Solution**: Edit the tournament and add a location

### Changes not visible on detail page?
- **Cache issue**: Refresh the browser (Ctrl+F5 or clear cache)
- **Wrong URL**: Verify you're visiting `/gamedays/tournament/<ID>/` (not a different tournament)

---

## Admin Quick Reference

| Task | URL | Steps |
|------|-----|-------|
| Create Tournament | `/admin/gamedays/tournament/add/` | Fill form, Save |
| Add Rows | Edit Tournament, scroll to "Rows" | Click "+ Add another", Save |
| Add Columns | `/admin/gamedays/tournamentrow/` → Edit row, scroll to "Columns" | Click "+ Add another", Save |
| Add Games | `/admin/gamedays/tournamentcolumn/` → Edit column, scroll to "Column Games" | Click "+ Add another", search gameinfo, Save |
| View Published | `/gamedays/tournament/<ID>/` | (No login required) |
| Edit Metadata | `/admin/gamedays/tournament/` → Edit tournament | Change title/location/links, Save |
| Delete Tournament | `/admin/gamedays/tournament/` → Select, Delete | Confirm deletion |

---

## Best Practices

1. **Name tournaments clearly**: Use date-based names (e.g., "2026-07-20-Qualifier") for easy identification
2. **Order everything**: Always set explicit order values (1, 2, 3...) for rows, columns, and games
3. **Keep titles short**: Column titles appear in card headers; keep them ≤20 characters
4. **Test visibility before sharing**: View the detail page and confirm games display correctly
5. **Add descriptions**: Even simple tournament descriptions help users understand the context
6. **Use location wisely**: Only set location if it's meaningful (maps link is shown to all users)
7. **Manage links sparingly**: 3-5 links is ideal; more clutters the "Links" card

---

## Common Patterns

### Pattern 1: Bracket View (Single-Elimination)
```
Round 1
├─ 8 Matches (2 columns of 4 each)
Round 2
├─ 4 Matches (2 columns of 2 each)
Round 3 (Semifinals)
├─ 2 Matches (1 column)
Round 4 (Final)
├─ 1 Match (1 column)
```

### Pattern 2: Group Stage (Round-Robin)
```
Group A
├─ All Games (1 column of 6 games)
Group B
├─ All Games (1 column of 6 games)
Group C
├─ All Games (1 column of 6 games)
```

### Pattern 3: Mixed (Groups → Knockout)
```
Group Stage
├─ Group A (1 column)
├─ Group B (1 column)
├─ Group C (1 column)
Knockout
├─ Round of 16 (4 columns of 1 match each)
├─ Quarterfinals (2 columns)
├─ Semifinals (1 column)
└─ Final (1 column)
```

---

## Summary Checklist

- [ ] Create Tournament with metadata (name, title, location, description)
- [ ] Create Rows with titles and order values
- [ ] Create Columns within each Row with titles and order values
- [ ] Add Games to Columns via TournamentColumnGame (search by gameinfo, set order)
- [ ] (Optional) Add external links via Resource URLs
- [ ] Visit `/gamedays/tournament/<ID>/` to verify appearance
- [ ] Confirm all games display in correct columns and order
- [ ] Check metadata card (title, location, links) render correctly

Done! Your Tournament is ready to share with users.
