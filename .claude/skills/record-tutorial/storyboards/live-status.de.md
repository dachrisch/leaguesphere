# Live-Status heute (anstehende und laufende Spieltage)

Rundgang durch den Live-Status der heutigen Spieltage: die Startseite mit dem
heutigen Spieltag, die Status-/Fortschrittsübersicht mit der Gruppe „LIVE" und
dem Fortschritt eines laufenden Spieltags sowie der Liveticker mit dem gerade
laufenden Spiel. Fluss orientiert sich an
`league_manager/help/content/live-status.de.md` (Status auf einen Blick / Live
verfolgen / Fortschritt eines Spieltags).

Verifiziert live gegen https://demo.leaguesphere.app (v4.38.0) am 2026-10-13.

Pre-flight (off camera, per SKILL.md): als `admin@demo.local` einloggen; auf
echte 1920x1080 gehen – auf diesem Host liefert `resize_page(1920,1080)` nur
~1025 px, deshalb `emulate` mit `viewport 1920x1080x1` verwenden.

Status-Daten (Pre-flight-Mutation, über die API, off camera). Der Demo-Bestand
enthält nur Spieltage vom 2026-08-24/31 – also keinen heutigen Spieltag. Damit
die Statusgruppe „LIVE" überhaupt erscheint, wurde eigens ein **heutiger
Spieltag mit einem laufenden Spiel** angelegt. Reproduktion (idempotent, alles
per API, eingeloggt):

- Gameday anlegen: `POST /api/gamedays/` mit
  `{name:"Premier Division - Spieltag 3", date:"<heute>", start:"10:00",
  format:"6_2", season:3, league:1, address:"Demo Sportpark"}` → **id 37**.
- Vorlage „Association Group Cup" (id 16) anwenden:
  `POST /api/designer/templates/16/apply/` mit
  `{gameday_id:37, team_mapping:{"0_0":1,"0_1":2,"0_2":3,"0_3":4,"1_0":5,"1_1":6,"1_2":7,"1_3":8}}`
  (Teams 1–8) → **26 Spiele** (gameinfo ids 53–78; Gruppe A = 58–63, Gruppe B = 64–69).
- Status auf PUBLISHED setzen: `PATCH /api/gamedays/37/ {"status":"PUBLISHED"}`
  – bewusst **nicht** über `/publish/`, weil das `CanvasPublishService.apply()`
  die Spiele neu generieren und die Team-Zuordnung verwerfen würde.
- Ein Spiel live starten: `PUT /api/gamedays/game/61/setup` (Spiel 61 = „A Game 4",
  Anstoß 20:40, Thunder Titans–Stellar Strikers) → Status **„1. Halbzeit"**
  (live). Der PUT antwortet mit 400 (Pflichtfelder des Scorecards fehlen), der
  Spielstart wird trotzdem gesetzt – das ist erwartet.
- Zwei Spiele abschließen, damit der Fortschrittsbalken nicht bei 0 % steht:
  `PATCH /api/gamedays/gameinfo/58/result/` und `.../59/result/` mit
  `halftime_score`/`final_score` → **Fortschritt 2/26, 8 %**.
- Aufräumen: ein versehentlich angelegter leerer Prüf-Spieltag (id 38) wurde
  per `DELETE /api/gamedays/38/` wieder entfernt. Keine weiteren Spieltage,
  Vorlagen oder Reste aus früheren Läufen, die die Aufnahme stören würden.

Befunde (v4.38.0, alle live geprüft):

- Die **Startseite** `/gamedays/` (Home-Link; `/` leitet dorthin) listet die
  heutigen Spieltage (hier „13. Oktober 2026 – Premier Division – Premier
  Division - Spieltag 3"), zeigt aber **keine Statusgruppe** (kein „Läuft" /
  „anstehend"). Die Statusgruppierung ist im Deploy **nicht** auf der Liste.
- Die Status- und Fortschrittsübersicht liegt auf **`/gamedays/progress/`**
  (journey_dashboard `GameProgressPage` – die „Fortschrittsübersicht" aus dem
  Howto). Sie zeigt einen Abschnitt `LIVE (n Spiele)`; jede Karte trägt das
  Abzeichen **● LIVE** (bzw. `ANSTEHEND` / `BEENDET`) plus Fortschrittsbalken
  („Gespielt x/y", „n Spiele live", „m Spiele anstehend", „z %"). Kategorisierung
  in `useGameProgress.categorizeGamedays`: heute + nicht „stale" (mind. ein
  gestartetes Spiel, letzter Anstoß < 5 h her) → Gruppe „Live".
- **Die Spieltags-Detailseite `/gamedays/gameday/<id>/` antwortet auf der Demo
  durchgängig mit HTTP 500** – reproduziert an den Seed-Spieltagen 1 und 3, an
  einem frisch angelegten leeren Spieltag und an Spieltag 37. Der API-Endpunkt
  `/api/gameday/<id>/details?get=schedule` funktioniert jeweils, der Fehler
  steckt also in der HTML-Ansicht, nicht in den Daten. Deshalb führt der
  Rundgang vom Status-Karten **nicht** in die Detailseite (und nicht auf eines
  der Listenelemente, die alle dorthin verlinken), sondern direkt in den
  **Liveticker**.
- **Liveticker:** `/liveticker/?league=<league-slug>&gameday=<id>` (so baut die
  Detailseite `info.url_pattern_liveticker`). Zeigt das laufende Spiel mit
  Team-Beschreibungen, Status („1. Halbzeit"), Punktestand und Event („Spiel
  gestartet"); die Kopfzeile nennt „Letzte Aktualisierung … Uhr" und aktualisiert
  sich automatisch. Für Spieltag 37:
  `/liveticker/?league=premier-division&gameday=37`.

## Step 1
- caption: Startseite
- action: navigate
- target: /gamedays/
- hold: 3

## Step 2
- caption: Heutige Spieltage auf einen Blick
- action: wait
- target: the gameday list on /gamedays/ showing the today's gameday "13. Oktober 2026 - Premier Division - Premier Division - Spieltag 3"
- hold: 3

## Step 3
- caption: Live-Status auf einen Blick
- action: navigate
- target: /gamedays/progress/
- hold: 3

## Step 4
- caption: Status: Läuft
- action: hover
- target: the today's gameday card on /gamedays/progress/ – the link containing "● LIVE" and "Premier Division - Spieltag 3" (section "LIVE (1 SPIELE)")
- hold: 3

## Step 5
- caption: Fortschritt des Spieltags
- action: wait
- target: the same card's progress row ("Gespielt 2/26", "1 Spiele live", "23 Spiele anstehend", "8 %") and its progress bar
- hold: 4

## Step 6
- caption: Spiel im Liveticker verfolgen
- action: navigate
- target: /liveticker/?league=premier-division&gameday=37
- hold: 3

## Step 7
- caption: Live-Ergebnisse aktualisieren sich automatisch
- action: wait
- target: the running game in the liveticker ("A Game 4", status "1. Halbzeit", event "Spiel gestartet", "Letzte Aktualisierung … Uhr")
- hold: 4
