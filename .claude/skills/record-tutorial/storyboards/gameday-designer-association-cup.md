# Gameday Designer: association template from a predefined format

Start from a blank canvas, apply the built-in 8-team group format, add an
extra group phase, then save the result as an association template.

Verified live against https://demo.leaguesphere.app (v4.24.3) on 2026-09-15.
Pre-flight (off camera, per SKILL.md): log in as admin@demo.local, make sure no
scratch gameday or leftover template from a previous run exists. The recording
starts on the designer dashboard with an empty list. Record at 1920x1080 with
the browser in kiosk mode so fields and bracket are fully visible.

-selector notes (all confirmed in the deployed build):
- The built-in template entries have NO data-testid -- resolve them by visible
  text ("8 Teams - 2 Groups of 4").
- The demo only has 3 real teams, but the 8-team format needs 8: use the
  "Auto-generate 8 missing teams" button in the Select Teams picker.
- `fill` does NOT propagate into this app's React-controlled inputs: click the
  field to focus it first, then type real keystrokes (type_text), then verify
  the value stuck before saving.
- The new stage is appended at the bottom of the canvas as an empty
  "Stage N" -- scroll it into view before renaming it via its pencil button.
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
- target: the "Auto-generate 8 missing teams" button in the Select Teams picker
- hold: 2.5

## Step 7
- caption: Confirm the team selection
- action: click
- target: the Apply to Gameday button in the Select Teams picker
- hold: 3

## Step 8
- caption: Add an extra group phase to the tournament
- action: click
- target: [data-testid="add-stage-button"]
- hold: 3

## Step 9
- caption: Name the new phase Finals Group
- action: fill
- target: the new empty stage's name field (pencil button, type real keystrokes, confirm with Enter)
- hold: 4

## Step 10
- caption: Open the template library to save the result
- action: click
- target: [data-testid="open-template-library-button"]
- hold: 2.5

## Step 11
- caption: Save the current layout as a reusable template
- action: click
- target: [data-testid="save-current-as-template-button"]
- hold: 2.5

## Step 12
- caption: Name the template Association Group Cup
- action: fill
- target: the Template name field in the Save as Template dialog (click to focus, type real keystrokes, verify the value stuck)
- hold: 4

## Step 13
- caption: Share it with your association
- action: click
- target: the Association visibility card ("Shared with your association") in the Save as Template dialog
- hold: 2.5

## Step 14
- caption: Confirm and save the template
- action: click
- target: the Save Template button in the Save as Template dialog
- hold: 3

## Step 15
- caption: The template is saved under Association
- action: wait
- target: the Association tab showing the Association Group Cup entry
- hold: 4
