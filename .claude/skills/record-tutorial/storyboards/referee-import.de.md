# Schiedsrichter-Meldungen importieren (Selbstmelde-Import)

Tour durch den Staff-Import der Offiziellen-Selbstmeldungen: den
Google-Sheet-Export (.csv/.xlsx) hochladen, das automatisch einsortierte
Prüfergebnis (Neu / Duplikate / Konflikte) kontrollieren, auswählen und den
Import bestätigen.

Verifiziert live gegen https://demo.leaguesphere.app (v4.38.0) am 2026-10-13.
Fluss entspricht `league_manager/help/content/referee-import.de.md` (Bereich
*Offizielle Einträge*): Meldungen werden als Datei hochgeladen, LeagueSphere
prüft die gemeldeten Offiziellen und zeigt sie zur Kontrolle an; nach der
Freigabe sind die Einsätze erfasst.

Pre-flight (off camera, per SKILL.md): als `admin@demo.local` einloggen; auf
echte 1920x1080 gehen – auf diesem Host liefert `resize_page(1920,1080)` nur
~1025 px, deshalb `emulate` mit `viewport 1920x1080x1` verwenden. Die Aufnahme
startet auf `/officials/gameofficial/import/upload/` (leeres Formular).

- selector notes (all confirmed in the deployed build, v4.38.0):
- Route Upload: `/officials/gameofficial/import/upload/` (staff only, Name der
  View `GameOfficialImportUploadView`). Route Confirm:
  `/officials/gameofficial/import/confirm/`.
- **Die Demo enthält KEINE Offiziellen** (Admin-Liste „0 officials"; jede
  Team-Liste und die Statistik sind leer). Damit der Import echte Einträge
  auflösen und als „Neu" einordnen kann, wurden vorab zwei Demo-Offizielle über
  die Django-Verwaltung angelegt: **Sabine Wagner (id 1)** und **Jonas Becker
  (id 2)**. Ohne dahinterliegende Offizielle landet jede Zeile im Konflikt-Tab
  („Official mit ID … wurde nicht gefunden."). Das Intro der Tour sagt das
  nicht – es ist reine Pre-flight-Datenvorbereitung.
- **Datei-Feld:** das versteckte `<input type="file" id="id_file">` (crispy
  innerhalb von `label#import-drop-zone`). Die **`fill`-Aktion des SKILL kann
  kein File-Input setzen** – stattdessen das chrome-devtools-Tool `upload_file`
  auf dem File-Input-Element verwenden (Exception, siehe Step 2). Danach
  `#import-upload-btn` („Hochladen") klicken.
- **Upload-POST ist `fetch()`-gesteuert** (Template-JS): während der Prüfung
  zeigt `#import-spinner` („Datei wird verarbeitet …"). Danach rendert der
  Client das Ergebnis: Branch-Tabs `#import-branch-tabs` („Externe Einsätze
  (n)", „Interne Korrekturen (n)") und die Filter-Stepper `#import-stepper`
  (Buttons „Neu (x/y)", „Duplikate (x/y)", „Konflikte (x/y)"). Ein Fehler
  erscheint in `#import-error`.
- **Zeilen-Auswahl:** pro Zeile eine Checkbox in `#import-table-body`, dazu die
  Gmail-artige „Alle auswählen"-Checkbox `#import-select-all-checkbox` im
  Tabellenkopf (wirkt auf alle sichtbaren/gefilterten Zeilen des aktiven
  Branch). „Neu"-Zeilen sind per Default vorausgewählt; Konflikt-/Duplikat-
  Zeilen nicht.
- **Bestätigen:** `#import-confirm-form` sendet nur die ausgewählten
  `row_numbers` (versteckte Felder `external_rows` / `internal_rows`, komma-
  separiert). Der Submit ist ein normaler Form-POST → Redirect zurück auf die
  Upload-Seite mit einer Django-Message („N externe Einsätze erstellt, M
  Korrekturen angewendet, K Fehler."). **Confirm nie als fetch** – sichtbarer
  Seitenwechsel ist Teil der Tour.
- **Beispiel-Datei (Pre-flight):** `/tmp/opencode/referee-import-sample.csv`.
  Spalten wie der echte Sheet-Export; „Welche Position?" kommt zweimal vor, der
  zweite Vorkommen wird von pandas zu `Welche Position?.1` (externer Branch).
  Branch über die Frage-Spalte: „außerhalb DFFL" → extern, „DFFL" → intern.
  Zeilen: 2 gültige externe Meldungen (Sabine id 1, Jonas id 2 → Tab „Neu"),
  1 externe Meldung mit unbekannter Lizenznummer 99999 (→ Tab „Konflikte"),
  1 interne Korrektur (DFFL, Spiel-ID 16, Sabine id 1 → Tab „Interne
  Korrekturen"). Erwartetes Ergebnis: „Neu (2/2)", „Duplikate (0/0)",
  „Konflikte (0/1)".

## Step 1
- caption: Selbstmeldungen der Offiziellen importieren
- action: navigate
- target: /officials/gameofficial/import/upload/
- hold: 3

## Step 2
- caption: Google-Sheet-Export auswählen
- action: fill
- target: the file input #id_file inside the drop zone label#import-drop-zone — SKILL's fill cannot set a file input, so the chrome-devtools upload_file tool is used here instead
- hold: 3

## Step 3
- caption: Hochladen und automatisch prüfen lassen
- action: click
- target: the "Hochladen" button #import-upload-btn (POST via fetch, spinner #import-spinner)
- hold: 3

## Step 4
- caption: LeagueSphere sortiert: Neu, Duplikate, Konflikte
- action: wait
- target: the rendered result #import-results with branch tabs #import-branch-tabs and the Neu/Duplikate/Konflikte stepper #import-stepper
- hold: 4

## Step 5
- caption: Meldung bei Bedarf abwählen
- action: click
- target: the checkbox of the first row in #import-table-body (deselect one of the pre-selected "Neu" entries)
- hold: 3

## Step 6
- caption: Alle Meldungen auswählen
- action: click
- target: the select-all checkbox #import-select-all-checkbox in the table head
- hold: 3

## Step 7
- caption: Import bestätigen
- action: click
- target: the "Bestätigen (N ausgewählt)" submit button in #import-confirm-form
- hold: 3

## Step 8
- caption: Fertig – Einsätze sind erfasst
- action: wait
- target: the redirect back to the upload page with the success message "N externe Einsätze erstellt, M Korrekturen angewendet, 0 Fehler."
- hold: 4
