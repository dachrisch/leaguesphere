# Liga & Spieltag verwalten (Spieltag anlegen)

Rundgang durch das Anlegen eines Spieltags über den Chooser und das klassische
Formular samt Assistent (Gruppen/Felder/Format -> Teams -> Spielplan).
Orientierung an `league_manager/help/content/liga-verwalten.de.md`. Der Designer
hat ein eigenes Video (`gameday-designer`), deshalb zeigt dieses Video bewusst
den klassischen Weg.

Pre-flight (off camera, per SKILL.md):
- Als `admin@demo.local` einloggen (Staff).
- Viewport auf 1920x1080 setzen: `resize_page` liefert auf diesem Host nur
  ~1025px, daher `emulate` mit `viewport 1920x1080x1` verwenden.
- Etwaige Reste früherer Läufe (Prüf-Spieltage) vorher entfernen.
- Datum bewusst auf **heute** setzen, damit ein späterer Ergebnis-Rundgang
  (Scorecard listet nur heutige Spieltage) darauf aufbauen kann.

Befund: `/gamedays/gameday/<id>/` (Detailseite) antwortet auf der Demo mit
HTTP 500 – der Rundgang endet daher im Assistenten/der Spieleliste und **nicht**
auf der Spieltags-Detailseite.

## Step 1
- caption: Neuen Spieltag anlegen
- action: navigate
- target: /gamedays/gameday/create/
- hold: 3

## Step 2
- caption: Klassisches Formular öffnen
- action: click
- target: the link "…oder das klassische Formular verwenden →"
- hold: 3

## Step 3
- caption: Name und Datum eintragen
- action: fill
- target: the gameday name and date fields in #gameday-form
- hold: 3

## Step 4
- caption: Saison und Liga wählen
- action: fill
- target: the season and league selectors in #gameday-form
- hold: 3

## Step 5
- caption: Spieltag anlegen
- action: click
- target: the submit button with value "gameinfos_create" (label "Spiele erstellen")
- hold: 3

## Step 6
- caption: Spielpläne werden vorbereitet
- action: wait
- target: the wizard step 1 form #fields-groups-form
- hold: 3

## Step 7
- caption: Gruppen und Felder festlegen
- action: fill
- target: the group count / number of fields / format fields in #fields-groups-form
- hold: 3

## Step 8
- caption: Weiter
- action: click
- target: the "Weiter" submit button in #fields-groups-form
- hold: 3

## Step 9
- caption: Teams zuordnen
- action: fill
- target: the team autocomplete fields in #gamedays-format-form
- hold: 3

## Step 10
- caption: Spielplan erstellen
- action: click
- target: the "Spielplan erstellen" submit button in #gamedays-format-form
- hold: 3

## Step 11
- caption: Spielplan wird berechnet
- action: wait
- target: the generated schedule in #gameinfos-form
- hold: 4

## Step 12
- caption: Spielplan prüfen und übernehmen
- action: wait
- target: the "#gameinfos-form" table with the generated games
- hold: 4
