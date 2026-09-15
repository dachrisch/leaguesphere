# Gameday Designer: association template from a predefined format

Start from a blank canvas, apply the built-in 8-team group format, add an extra
"Championship Group" phase whose games reference the *winner*/*loser* of earlier
group-stage games (indirect/dynamic team references) instead of fixed teams, then
save the result as an association template.

Verified live against https://demo.leaguesphere.app (v4.24.3) on 2026-09-15.
Pre-flight (off camera, per SKILL.md): log in as admin@demo.local, make sure no
scratch gameday or leftover template from a previous run exists. The recording
starts on the designer dashboard with an empty list. Capture at a 1920x1080
viewport (`resize_page`) so fields and the bracket are fully visible.

-selector notes (all confirmed in the deployed build):
- The built-in template entries have NO data-testid -- resolve them by visible
  text ("8 Teams - 2 Groups of 4").
- The demo's real team pool size varies; "Auto-generate N missing teams" always
  tops it up to the template's required count regardless of how many are real.
- `fill` does NOT propagate into this app's React-controlled inputs: click the
  field to focus it first, then type real keystrokes (type_text), then verify
  the value stuck before saving.
- The new stage is appended at the bottom of the canvas as an empty
  "Stage N" -- scroll it into view before renaming it via its pencil button.
- **Team/dynamic-reference selectors (Home, Away, Official on every game row)
  are `react-select` components, not plain `<select>`s.** The element the
  accessibility tree exposes as `combobox` is a ~0x0px dummy input used only to
  hold keyboard focus -- chrome-devtools-mcp's `click` tool times out
  ("did not become interactive") trying to click it directly. Use
  `evaluate_script` instead: dispatch `mousedown`/`mouseup`/`click` on the
  ancestor `.react-select__control` to open the menu, then find the
  `.react-select__option` whose `textContent` matches the desired label (exact
  match; options are grouped by team group and by stage) and dispatch a `click`
  on it. Direct teams appear as plain team names; indirect references appear as
  "⚡ Winner of <Game> (<Stage>)" / "💔 Loser of <Game> (<Stage>)" -- these labels
  only exist for games that already exist elsewhere in the schedule at the time
  the menu is opened, so add the group-stage games before referencing them.
- Newly added games in a custom stage default every selector to
  "-- Select Team --"; nothing needs clearing first.
- Visibility is picked with the "Association" card ("Shared with your
  association") in the Save as Template dialog, NOT a dropdown.

## Step 1
- caption: Open the Gameday Designer dashboard
- action: navigate
- target: /gamedays/gameday/design/
- hold: 3

## Step 2
- caption: Create a new gameday to design
- action: click
- target: [data-testid="create-gameday-button"]
- hold: 3

## Step 3
- caption: Open the template library
- action: click
- target: [data-testid="open-template-library-button"]
- hold: 2.5

## Step 4
- caption: Pick the predefined 8-team group format
- action: click
- target: the "8 Teams - 2 Groups of 4" entry under Tournament Formats
- hold: 2.5

## Step 5
- caption: Apply the template to this gameday
- action: click
- target: [data-testid="apply-template-button"]
- hold: 3

## Step 6
- caption: Auto-generate the missing teams
- action: click
- target: the "Auto-generate N missing teams" button in the Select Teams picker
- hold: 2.5

## Step 7
- caption: Confirm the team selection
- action: click
- target: the Apply to Gameday button in the Select Teams picker
- hold: 3

## Step 8
- caption: Add an extra phase for a cross-group championship round
- action: click
- target: [data-testid="add-stage-button"]
- hold: 3

## Step 9
- caption: Name the new phase Championship Group
- action: fill
- target: the new empty stage's name field (pencil button, type real keystrokes, confirm with Enter)
- hold: 4

## Step 10
- caption: Add the first championship game
- action: click
- target: the Add Game button inside the new Championship Group stage
- hold: 2.5

## Step 11
- caption: Set Home to the winner of Group A's first game
- action: click
- target: the new game's Home selector (react-select workaround) -> option "⚡ Winner of A Game 1 (Group Stage A)"
- hold: 4

## Step 12
- caption: Set Away to the winner of Group B's first game
- action: click
- target: the new game's Away selector (react-select workaround) -> option "⚡ Winner of B Game 1 (Group Stage B)"
- hold: 4

## Step 13
- caption: Add a second game for the group's runners-up
- action: click
- target: the Add Game button inside the new Championship Group stage
- hold: 2.5

## Step 14
- caption: Set Home to the loser of Group A's first game
- action: click
- target: the second new game's Home selector (react-select workaround) -> option "💔 Loser of A Game 1 (Group Stage A)"
- hold: 4

## Step 15
- caption: Set Away to the loser of Group B's first game
- action: click
- target: the second new game's Away selector (react-select workaround) -> option "💔 Loser of B Game 1 (Group Stage B)"
- hold: 4

## Step 16
- caption: Open the template library to save the result
- action: click
- target: [data-testid="open-template-library-button"]
- hold: 2.5

## Step 17
- caption: Save the current layout as a reusable template
- action: click
- target: [data-testid="save-current-as-template-button"]
- hold: 2.5

## Step 18
- caption: Name the template Association Group Cup
- action: fill
- target: the Template name field in the Save as Template dialog (click to focus, type real keystrokes, verify the value stuck)
- hold: 4

## Step 19
- caption: Share it with your association
- action: click
- target: the Association visibility card ("Shared with your association") in the Save as Template dialog
- hold: 2.5

## Step 20
- caption: Confirm and save the template
- action: click
- target: the Save Template button in the Save as Template dialog
- hold: 3

## Step 21
- caption: The template is saved under Association
- action: wait
- target: the Association tab showing the Association Group Cup entry
- hold: 4
