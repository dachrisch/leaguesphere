# Ergebnisse erfassen (Scorecard)

Rundgang durch die Scorecard: Spieltag/Spiel wählen, Offizielle und Münzwurf,
Spielzüge erfassen, Halbzeit und Abschluss mit Kapitänsbestätigung. Orientierung
an `league_manager/help/content/ergebnisse-erfassen.de.md`.

Pre-flight (off camera, per SKILL.md):
- Als `admin@demo.local` einloggen.
- Viewport 1920x1080 via `emulate`.
- Es braucht einen **heutigen** Spieltag mit mindestens einem angesetzten Spiel:
  `/api/gameday/list` liefert nur Spieltage mit `date == today`. Den Spieltag
  vorher anlegen (siehe Storyboard `liga-verwalten.de.md`) und die Spiele
  veröffentlichen.
- Die Offiziellen-Auswahllisten füllen sich aus dem `officials`-Team des Spiels
  (Demo: „Demo Officials", siehe Demo-Seed).

## Step 1
- caption: Scorecard öffnen
- action: navigate
- target: /scorecard/
- hold: 3

## Step 2
- caption: Modus wählen
- action: click
- target: the "Scorecard" button on the passcheck/scorecard chooser
- hold: 3

## Step 3
- caption: Spieltag auswählen
- action: wait
- target: the gameday list on the select-game screen
- hold: 3

## Step 4
- caption: Spieltag wählen
- action: click
- target: the "Auswählen" button of the today's gameday row
- hold: 3

## Step 5
- caption: Spiel starten
- action: click
- target: the "Start" button of the first game row
- hold: 3

## Step 6
- caption: Offizielle eintragen
- action: fill
- target: the five official dropdowns (Scorecard Judge, Referee, Down/Field/Side Judge)
- hold: 4

## Step 7
- caption: Münzwurf und Ballbesitz festhalten
- action: click
- target: the coin toss / possession radio buttons, then "Spiel starten"
- hold: 3

## Step 8
- caption: Spielzug erfassen
- action: click
- target: the "Touchdown" radio and the "Eintrag speichern" button
- hold: 3

## Step 9
- caption: Weiteren Spielzug erfassen
- action: click
- target: the "Serie" (or "Mehr…") radio and "Eintrag speichern"
- hold: 3

## Step 10
- caption: Halbzeit
- action: click
- target: '[data-testid="halftimeButton"]' then '[data-testid="halftime-done"]'
- hold: 3

## Step 11
- caption: Spiel beenden
- action: click
- target: '[data-testid="finalizeButton"]'
- hold: 3

## Step 12
- caption: Ergebnis abschicken
- action: click
- target: '[data-testid="confirmHomeButton"]', '[data-testid="confirmAwayButton"]' then the "Ergebnis abschicken" button
- hold: 4
