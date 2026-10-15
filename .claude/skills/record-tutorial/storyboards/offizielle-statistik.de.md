# Offizielle: Übersicht & Statistik

Rundgang durch den Bereich „Offizielle": Übersicht (Teamkarten mit Suche),
Statistik/Bestenliste (inkl. Einblenden externer Spiele), alle Einsätze und der
Lizenz-Check. Orientierung an
`league_manager/help/content/offizielle-statistik.de.md`.

Pre-flight (off camera, per SKILL.md):
- Als `admin@demo.local` einloggen.
- Viewport 1920x1080 via `emulate`.
- Braucht `GameOfficial`-Daten: die Demo muss mit dem erweiterten Seed
  (`seed_demo_data`, „Demo Officials") neu befüllt sein. Die Bestenliste zeigt
  nur Offizielle mit **≥ 10** erfassten Spielen.
- `/officials/einsaetze/` ist 24 h gecacht – ggf. frisch nach dem Seed aufnehmen
  (Cache über den „Clear Cache"-Knopf leeren).
- Der **Lizenz-Check** (`/officials/licensecheck/<course_id>/`) antwortet auf der
  Demo mit **HTTP 500** (Moodle-Anbindung fehlt) und ist daher **nicht** Teil des
  Videos. `/officials/einsaetze/` zeigt auf der Demo nur wenige Einträge.

## Step 1
- caption: Offizielle-Übersicht
- action: navigate
- target: /officials/team/all/list/
- hold: 3

## Step 2
- caption: Nach Team suchen
- action: fill
- target: the team search input #team-search
- hold: 3

## Step 3
- caption: Statistik öffnen
- action: navigate
- target: /officials/statistics/
- hold: 3

## Step 4
- caption: Externe Offizielle einblenden
- action: click
- target: the toggle/checkbox #include-external-toggle
- hold: 3

## Step 5
- caption: Bestenliste mit Einsätzen
- action: wait
- target: the statistics table (#statistics-table-with-external) with ranked officials
- hold: 4

## Step 6
- caption: Alle Einsätze
- action: navigate
- target: /officials/einsaetze/
- hold: 3

## Step 7
- caption: Wer hat wann gepfiffen
- action: wait
- target: the assignments table (Datum, Spieltag, Team, Name, Position)
- hold: 4
