# Gameday Designer (Spieltags-Designer)

Vom geführten Start zum wiederverwendbaren Spielplan: einen neuen Spieltag
anlegen, Teams, Feld, Spiele und Schiedsrichter pflegen, den Aufbau als
**Vorlage** speichern und diese Vorlage direkt wieder anwenden.

Verifiziert live gegen https://demo.leaguesphere.app (v4.36.2) am 2026-10-13.
Pre-flight (off camera, per SKILL.md): als admin@demo.local einloggen, die
UI-Sprache auf Deutsch stellen (`localStorage.i18nextLng = "de"`, dann neu
laden), die Onboarding-Touren als gesehen markieren (Journey-Events
`gd_tour_manual_build_skipped` / `gd_tour_save_template_skipped` per API
posten), damit keine Tour die Aufnahme überlagert, und einen übrig
gebliebenen Spieltag/Vorlage aus einem vorigen Lauf löschen. Der Demo-Bestand
hat keine eigenen Vorlagen; die Aufnahme beginnt auf dem Designer-Dashboard
mit leerer Liste.

- selector notes (all confirmed in the deployed build v4.36.2):
- Routen: Dashboard `/gamedays/gameday/design/`, Editor
  `/gamedays/gameday/design/designer/<id>`. `create-gameday-button` legt einen
  Standard-Spieltag an und navigiert direkt in den Editor.
- Bestätigte `data-testid`s: `create-gameday-button`, `add-team-group-button`,
  `add-team-button`, `add-field-button`, `add-game-button`,
  `auto-assign-officials-button`, `open-template-library-button`,
  `save-current-as-template-button`, `apply-template-button`.
- Der "Select Teams"-Dialog (beim Team-Hinzufügen **und** beim Anwenden einer
  Vorlage) ist teilweise englisch und hat keine stabilen `data-testid`s für
  die Team-Kacheln: Team per exaktem Text ("Thunder Titans") wählen, dann
  "Apply to Gameday →".
- Der "Save as Template"-Dialog hat für das Namensfeld und den Speichern-Knopf
  **keine** `data-testid`s in diesem Build: auflösen über
  Placeholder "Template name..." bzw. Knopftext "Save Template". `fill`
  propagiert nicht in dieses React-Input – erst klicken/fokussieren, dann
  echte Tastenanschläge (`type_text`), Wert prüfen.
- Speichern verlangt mindestens ein Team im Team-Pool (Backend lehnt
  `num_teams=0` mit 400 ab), daher kommen Team-Gruppe und Team zuerst.
- Nach dem Speichern bleibt die Vorlagen-Bibliothek offen; die neue Vorlage
  erscheint unter "MY TEMPLATES". Direkt dort auswählen und anwenden – kein
  erneutes Öffnen der Bibliothek nötig.
- Die Vorlagen-Bibliothek und das "Select Teams"-Modal sind englisch
  beschriftet (nicht übersetzt); nur das Designer-Fenster selbst ist deutsch.
- Der Editor scrollt in `.list-canvas` (nicht im Fenster). Für spätere
  Schritte dieses Containers `scrollTop` setzen, damit der Zielbereich sichtbar
  ist. "Schiedsrichter zuweisen" (`auto-assign-officials-button`) füllt die
  Spalte „Schiedsrichter" sichtbar mit Teams.

## Step 1
- caption: Spieltags-Designer öffnen
- action: navigate
- target: /gamedays/gameday/design/
- hold: 3

## Step 2
- caption: Neuen Spieltag anlegen – der geführte Start begleitet dich
- action: click
- target: [data-testid="create-gameday-button"]
- hold: 3

## Step 3
- caption: Eine Team-Gruppe im Team-Pool anlegen
- action: click
- target: [data-testid="add-team-group-button"]
- hold: 3

## Step 4
- caption: Teams zur Gruppe hinzufügen
- action: click
- target: [data-testid="add-team-button"]
- hold: 3

## Step 5
- caption: Team auswählen und übernehmen
- action: click
- target: the "Thunder Titans" tile in the Select Teams dialog, then "Apply to Gameday →"
- hold: 3

## Step 6
- caption: Ein Spielfeld anlegen
- action: click
- target: [data-testid="add-field-button"]
- hold: 3

## Step 7
- caption: Spiele zur Phase hinzufügen
- action: click
- target: the prominent "Spiel hinzufügen" button in the stage's empty state, then [data-testid="add-game-button"] for the second game
- hold: 3

## Step 8
- caption: Schiedsrichter mit einem Klick zuweisen
- action: click
- target: [data-testid="auto-assign-officials-button"]
- hold: 3

## Step 9
- caption: Vorlagen-Bibliothek öffnen
- action: click
- target: [data-testid="open-template-library-button"]
- hold: 2.5

## Step 10
- caption: Aktuellen Aufbau als Vorlage speichern
- action: click
- target: [data-testid="save-current-as-template-button"]
- hold: 2.5

## Step 11
- caption: Vorlage benennen, z. B. Tutorial Basics
- action: fill
- target: the "Template name..." field in the Save as Template dialog (click to focus, type real keystrokes "Tutorial Basics", verify the value stuck)
- hold: 4

## Step 12
- caption: Vorlage speichern
- action: click
- target: the "Save Template" button in the Save as Template dialog
- hold: 3

## Step 13
- caption: Gespeicherte Vorlage auswählen
- action: click
- target: the "Tutorial Basics" entry under MY TEMPLATES in the Template Library
- hold: 2.5

## Step 14
- caption: Vorlage wiederverwenden – Zeiten und Spielplan stehen automatisch
- action: click
- target: [data-testid="apply-template-button"], then pick "Thunder Titans" and "Apply to Gameday →" in the Select Teams dialog (scroll .list-canvas to the schedule)
- hold: 4
