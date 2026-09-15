# Gameday Designer basics

Build a small tournament template from a blank canvas, save it under a name,
then apply it to a gameday and show the resulting scheduled games.

Verified live against https://demo.leaguesphere.app (v4.24.3) on 2026-09-14.
Pre-flight (off camera, per SKILL.md): log in as admin@demo.local, make sure no
scratch gameday from a previous run is left behind. The recording starts on the
designer dashboard with an empty list.

-selector notes (all confirmed in the deployed build):
- The Save-as-Template dialog's name field and Save button have NO data-testid
  in the deployed build -- resolve them by their visible label/placeholder
  ("Template name..." field, "Save Template" button).
- `fill` does NOT propagate into this app's React-controlled inputs: click the
  field to focus it first, then type real keystrokes (type_text), then verify
  the value stuck before saving.
- Saving requires at least one team in the team pool (backend rejects
  num_teams=0 with 400), so the team group + team steps must come first.

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
- caption: Add a team group to the team pool
- action: click
- target: [data-testid="add-team-group-button"]
- hold: 3

## Step 4
- caption: Open the team picker for the new group
- action: click
- target: [data-testid="add-team-button"]
- hold: 2.5

## Step 5
- caption: Pick a team, for example Thunder Titans
- action: click
- target: a team button (e.g. Thunder Titans) in the Select Teams picker
- hold: 2.5

## Step 6
- caption: Confirm the team selection
- action: click
- target: the Apply to Gameday button in the Select Teams picker
- hold: 3

## Step 7
- caption: Add a playing field to the tournament
- action: click
- target: [data-testid="add-field-button"]
- hold: 3

## Step 8
- caption: Add the first game to the stage
- action: click
- target: [data-testid="add-game-button"]
- hold: 2.5

## Step 9
- caption: Add a second game to the same stage
- action: click
- target: [data-testid="add-game-button"]
- hold: 2.5

## Step 10
- caption: Add a second tournament phase for the finals
- action: click
- target: [data-testid="add-stage-button"]
- hold: 3

## Step 11
- caption: Open the template library
- action: click
- target: [data-testid="open-template-library-button"]
- hold: 2.5

## Step 12
- caption: Save the current layout as a reusable template
- action: click
- target: [data-testid="save-current-as-template-button"]
- hold: 2.5

## Step 13
- caption: Name the template Tutorial Basics
- action: fill
- target: the Template name field in the Save as Template dialog with "Tutorial Basics" (click to focus, type real keystrokes, verify the value stuck)
- hold: 4

## Step 14
- caption: Confirm and save the template
- action: click
- target: the Save Template button in the Save as Template dialog
- hold: 3

## Step 15
- caption: Reopen the library to apply the saved template
- action: click
- target: [data-testid="open-template-library-button"]
- hold: 2.5

## Step 16
- caption: Switch to your personal templates
- action: click
- target: the My templates tab in the Template Library
- hold: 2

## Step 17
- caption: Select the Tutorial Basics template to preview it
- action: click
- target: the Tutorial Basics entry under My templates
- hold: 2.5

## Step 18
- caption: Apply the template to this gameday
- action: click
- target: [data-testid="apply-template-button"]
- hold: 3

## Step 19
- caption: Pick the team for the applied template
- action: click
- target: a team button (e.g. Thunder Titans) in the Select Teams picker, then the Apply to Gameday button
- hold: 3

## Step 20
- caption: The scheduled games appear on the gameday
- action: wait
- target: the games table showing the applied template games
- hold: 4
