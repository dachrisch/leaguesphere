# LeagueSphere Screenshot-Erfassungsleitfaden
## Manuelle Anleitung für verbleibende Benutzerreisen

**Stand**: 16. November 2025
**Ziel**: Screenshots für die verbleibenden Benutzerreisen erfassen
**Umgebung**: http://localhost:8000
**Anmeldedaten**: admin / admin123
**Testdaten verfügbar**: 72 Spieler, 8 Teams, 4 Spiele heute, 4 Schiedsrichter

---

## Inhaltsverzeichnis

1. [Browser-Einrichtung](#browser-einrichtung)
2. [Firefox Screenshot-Tool](#firefox-screenshot-tool)
3. [Qualitätsrichtlinien](#qualitätsrichtlinien)
4. [Scorecard-Reise](#scorecard-reise) (8-10 Screenshots)
5. [Liveticker-Reise](#liveticker-reise) (3-4 Screenshots)
6. [Passcheck-Reise](#passcheck-reise) (4-6 Screenshots)
7. [Spieltage Zusätzlich](#spieltage-zusätzlich) (2-3 Screenshots)
8. [Schiedsrichter Zusätzlich](#schiedsrichter-zusätzlich) (1-2 Screenshots)
9. [Problemlösung](#problemlösung)
10. [Checkliste](#checkliste)

---

## Browser-Einrichtung

### Empfohlene Konfiguration

**Browser**: Firefox oder Chrome
**Viewport-Größe**: 1440 x 900 Pixel (Desktop-optimiert)
**Zoom-Stufe**: 100% (Standard)
**Sprache**: Deutsch (Standardsprache der Anwendung)

### Firefox Viewport einstellen

1. Drücken Sie `F12` um die Entwicklertools zu öffnen
2. Drücken Sie `Ctrl+Shift+M` um den responsiven Design-Modus zu aktivieren
3. Wählen Sie "Responsive" aus dem Dropdown-Menü
4. Setzen Sie die Abmessungen auf **1440 x 900**
5. Lassen Sie diesen Modus für alle Screenshots aktiv

### Chrome Viewport einstellen

1. Drücken Sie `F12` um DevTools zu öffnen
2. Klicken Sie auf "Toggle device toolbar" oder drücken Sie `Ctrl+Shift+M`
3. Wählen Sie "Responsive" aus dem Geräte-Dropdown
4. Setzen Sie die Abmessungen auf **1440 x 900**
5. Lassen Sie diesen Modus für alle Screenshots aktiv

---

## Firefox Screenshot-Tool

### Methode 1: Firefox Integriertes Screenshot-Tool (Empfohlen)

1. **Aktivieren Sie das Screenshot-Tool**:
   - Drücken Sie `Shift+Ctrl+S` (oder `Shift+Cmd+S` auf Mac)
   - ODER klicken Sie mit der rechten Maustaste auf die Seite → "Screenshot aufnehmen"

2. **Wählen Sie den Bereich**:
   - **"Sichtbaren Bereich speichern"** - Erfasst den sichtbaren Viewport (empfohlen)
   - **"Ganze Seite speichern"** - Erfasst die gesamte scrollbare Seite
   - **Manuell auswählen** - Ziehen Sie ein Rechteck über den gewünschten Bereich

3. **Speichern**:
   - Klicken Sie auf die gewünschte Option
   - Der Screenshot wird in Ihren Downloads-Ordner gespeichert
   - Verschieben Sie ihn in das entsprechende Verzeichnis
   - Benennen Sie ihn nach der Namenskonvention

### Methode 2: Browser DevTools Command Palette

**Firefox**:
1. Drücken Sie `Shift+F2` um die Entwickler-Toolbar zu öffnen
2. Tippen Sie: `screenshot --fullpage dateiname.png`
3. ODER für sichtbaren Bereich: `screenshot dateiname.png`

**Chrome**:
1. Drücken Sie `Ctrl+Shift+P` um die Command Palette zu öffnen
2. Tippen Sie "screenshot" und wählen Sie:
   - **"Capture full size screenshot"** - Für vollständige Seitenerfassung
   - **"Capture screenshot"** - Für sichtbaren Viewport
3. Screenshot wird in Downloads gespeichert

### Methode 3: GNOME Screenshot (Linux)

1. **Vollbild**: Drücken Sie `PrtScn`
2. **Aktives Fenster**: Drücken Sie `Alt+PrtScn`
3. **Bereich auswählen**: Drücken Sie `Shift+PrtScn`
4. Speichern Sie im entsprechenden Verzeichnis

---

## Qualitätsrichtlinien

### Screenshot-Spezifikationen

- **Format**: PNG (verlustfrei)
- **Maximale Dateigröße**: < 500 KB pro Bild
- **Auflösung**: 1440 x 900 Pixel (oder responsive erfasst)
- **Namenskonvention**: `SC-###-beschreibung.png`
  - SC = Screenshot
  - ### = Dreistellige Nummer (z.B. 039, 040, 041)
  - beschreibung = Kurze englische Beschreibung mit Bindestrichen

### Was in jedem Screenshot sein sollte

✅ **Erforderlich**:
- Navigationskopfzeile sichtbar (für Kontext)
- Hauptinhalt klar und lesbar
- Keine Ladeanimationen oder Spinner
- Keine Entwicklertools sichtbar
- Keine Adressleiste des Browsers sichtbar (verwenden Sie DevTools-Modus)

❌ **Zu vermeiden**:
- Verschwommene oder unscharfe Bilder
- Inkonsistente Viewport-Größen
- Sichtbare persönliche Informationen
- Fehlermeldungen (außer wenn dies das Ziel ist)
- Unvollständig geladene Seiten

### Speicherorte

Alle Screenshots werden in folgenden Verzeichnissen gespeichert:

```
/home/cda/dev/leaguesphere/docs/user-manual/screenshots/
├── scorecard/      # Live-Scoring-Interface
├── liveticker/     # Echtzeit-Spielticker
├── passcheck/      # Spielberechtigung prüfen
├── gamedays/       # Spieltage
└── officials/      # Schiedsrichter
```

---

## Scorecard-Reise

### Übersicht

Die Scorecard-Benutzerreise zeigt den vollständigen Workflow von der Spielauswahl bis zum Live-Scoring. Diese Screenshots sind teilweise bereits vorhanden (SC-030 bis SC-038), aber zusätzliche Screenshots könnten nützlich sein.

### Voraussetzungen

- Django Dev-Server läuft auf http://localhost:8000
- Testdaten geladen: 4 Spiele für heute verfügbar
- Als Admin angemeldet: admin / admin123

### Screenshot 1: Login-Bildschirm (Falls nicht vorhanden)

**Dateiname**: `SC-039-login-screen.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/scorecard/`
**URL**: `http://localhost:8000/accounts/login/`

**Anweisungen**:
1. Wenn nicht angemeldet, navigieren Sie zu `/accounts/login/`
2. NICHT ausfüllen - leeres Formular zeigen
3. Screenshot aufnehmen
4. Zeigt: Login-Formular mit Benutzername/Passwort-Feldern

**Was sichtbar sein sollte**:
- Login-Formular
- Benutzername-Feld
- Passwort-Feld
- "Anmelden"-Button
- LeagueSphere-Header

---

### Screenshot 2: Spieltagsauswahl mit verfügbarem Spieltag (BEREITS VORHANDEN: SC-030)

**Status**: ✅ Bereits erfasst als `SC-030-gameday-selection.png`

---

### Screenshot 3: Spielauswahl mit 4 verfügbaren Spielen (BEREITS VORHANDEN: SC-031)

**Status**: ✅ Bereits erfasst als `SC-031-game-selection-with-games.png`

---

### Screenshot 4: Schiedsrichter-Zuweisungsformular (BEREITS VORHANDEN: SC-032)

**Status**: ✅ Bereits erfasst als `SC-032-officials-assignment.png`

---

### Screenshot 5: Ausgefülltes Spieleinstellungsformular (BEREITS VORHANDEN: SC-033)

**Status**: ✅ Bereits erfasst als `SC-033-game-setup-complete.png`

---

### Screenshot 6: Live-Scoring-Interface zu Spielbeginn (BEREITS VORHANDEN: SC-034)

**Status**: ✅ Bereits erfasst als `SC-034-live-scoring-interface.png`

---

### Screenshot 7: Touchdown-Eingabeformular (BEREITS VORHANDEN: SC-035)

**Status**: ✅ Bereits erfasst als `SC-035-touchdown-entry-form.png`

---

### Screenshot 8: Nach Touchdown (BEREITS VORHANDEN: SC-037)

**Status**: ✅ Bereits erfasst als `SC-037-score-updated-7-0.png`

---

### Screenshot 9: Ballbesitz-Indikator (BEREITS VORHANDEN: SC-038)

**Status**: ✅ Bereits erfasst als `SC-038-scoreboard-active-game.png`

---

### Screenshot 10: Extra Point Scoring (NEU)

**Dateiname**: `SC-040-extra-point-form.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/scorecard/`
**URL**: `http://localhost:8000/scorecard/` (während aktivem Spiel)

**Anweisungen**:
1. Navigieren Sie zum aktiven Spiel in Scorecard
2. Klicken Sie auf "Extra Point" oder "PAT" Button
3. Extra Point Eingabeformular sollte erscheinen
4. Screenshot aufnehmen BEVOR Sie absenden

**Was sichtbar sein sollte**:
- Extra Point Formular
- Optionen (erfolgreich/fehlgeschlagen)
- Aktueller Spielstand
- Team-Informationen

---

### Screenshot 11: Field Goal Scoring (NEU)

**Dateiname**: `SC-041-field-goal-form.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/scorecard/`
**URL**: `http://localhost:8000/scorecard/` (während aktivem Spiel)

**Anweisungen**:
1. Navigieren Sie zum aktiven Spiel in Scorecard
2. Klicken Sie auf "Field Goal" Button
3. Field Goal Eingabeformular sollte erscheinen
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Field Goal Formular
- Distanz-Eingabefeld (optional)
- Erfolgreich/Fehlgeschlagen-Optionen
- Aktueller Spielstand

---

### Screenshot 12: Safety Scoring (NEU)

**Dateiname**: `SC-042-safety-form.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/scorecard/`
**URL**: `http://localhost:8000/scorecard/` (während aktivem Spiel)

**Anweisungen**:
1. Navigieren Sie zum aktiven Spiel in Scorecard
2. Klicken Sie auf "Safety" Button (falls vorhanden)
3. Safety Eingabeformular sollte erscheinen
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Safety Formular
- Bestätigungsoption
- Aktueller Spielstand
- Welches Team den Safety erzielt hat

---

### Screenshot 13: Spielstand nach mehreren Plays (NEU)

**Dateiname**: `SC-043-score-multiple-plays.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/scorecard/`
**URL**: `http://localhost:8000/scorecard/` (während aktivem Spiel)

**Anweisungen**:
1. Navigieren Sie zum aktiven Spiel in Scorecard
2. Führen Sie mehrere Scoring-Aktionen durch:
   - Touchdown für Home-Team (7 Punkte)
   - Touchdown für Away-Team (7 Punkte)
   - Field Goal für Home-Team (3 Punkte)
3. Endstand sollte etwa Home 10 - Away 7 sein
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Aktueller Spielstand (ungleich 0:0)
- Beide Teams mit Punkten
- Ballbesitz-Indikator
- Alle Scoring-Buttons verfügbar

---

### Screenshot 14: Quarter/Half abgeschlossen (NEU)

**Dateiname**: `SC-044-quarter-complete.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/scorecard/`
**URL**: `http://localhost:8000/scorecard/` (während aktivem Spiel)

**Anweisungen**:
1. Navigieren Sie zum aktiven Spiel in Scorecard
2. Klicken Sie auf "Quarter beenden" oder ähnlichen Button (falls vorhanden)
3. Quarter-Abschluss-Ansicht sollte erscheinen
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Spielstand am Ende des Quarters
- Quarter-Nummer (1, 2, 3, oder 4)
- "Nächstes Quarter starten"-Button
- Zusammenfassung des Quarters

**Hinweis**: Falls diese Funktion nicht verfügbar ist, überspringen Sie diesen Screenshot.

---

## Liveticker-Reise

### Übersicht

Der Liveticker zeigt Echtzeit-Ereignisse von laufenden Spielen. Um aussagekräftige Screenshots zu erhalten, müssen zuerst im Scorecard Ereignisse erstellt werden.

### Voraussetzungen

- Django Dev-Server läuft
- Mindestens ein Spiel im Scorecard aktiv
- Scoring-Ereignisse wurden im Scorecard erstellt (Touchdowns, Field Goals, etc.)

### Screenshot 1: Liveticker mit aktiven Spielen (NEU)

**Dateiname**: `SC-045-liveticker-active-games.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/liveticker/`
**URL**: `http://localhost:8000/liveticker/`

**Anweisungen**:
1. ZUERST: Erstellen Sie Ereignisse im Scorecard (siehe Scorecard-Reise oben)
2. Navigieren Sie zu `/liveticker/`
3. Warten Sie 2-3 Sekunden für automatisches Polling
4. Aktive Spiele sollten angezeigt werden
5. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Liste der aktiven Spiele
- Aktuelle Spielstände
- Spielzeit oder Quarter-Information
- LeagueSphere-Header

**Hinweis**: Der Liveticker aktualisiert sich automatisch alle paar Sekunden. Wenn keine Spiele angezeigt werden, überprüfen Sie, ob im Scorecard aktive Spiele vorhanden sind.

---

### Screenshot 2: Event-Timeline mit Touchdown-Ereignissen (NEU)

**Dateiname**: `SC-046-liveticker-event-timeline.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/liveticker/`
**URL**: `http://localhost:8000/liveticker/`

**Anweisungen**:
1. Navigieren Sie zu `/liveticker/`
2. Warten Sie bis Ereignisse geladen sind
3. Erweitern Sie ein Spiel (falls einklappbar), um Events zu sehen
4. Screenshot sollte mindestens 2-3 Ereignisse zeigen
5. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Chronologische Liste von Ereignissen
- Ereignis-Details (z.B. "Touchdown - Berlin Adler - #23 - 7 Punkte")
- Zeitstempel der Ereignisse
- Aktualisierungsindikator (optional)

**Hinweis**: Falls keine Ereignisse angezeigt werden:
1. Gehen Sie zurück zum Scorecard
2. Erstellen Sie 2-3 Touchdowns
3. Kehren Sie zum Liveticker zurück
4. Warten Sie auf automatische Aktualisierung

---

### Screenshot 3: Mehrere Spiele gleichzeitig (NEU)

**Dateiname**: `SC-047-liveticker-multiple-games.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/liveticker/`
**URL**: `http://localhost:8000/liveticker/`

**Anweisungen**:
1. ZUERST: Starten Sie mindestens 2 Spiele im Scorecard
2. Erstellen Sie Ereignisse in beiden Spielen
3. Navigieren Sie zu `/liveticker/`
4. Beide Spiele sollten sichtbar sein
5. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Mindestens 2 aktive Spiele
- Spielstände für jedes Spiel
- Neueste Ereignisse für jedes Spiel
- Klare Trennung zwischen den Spielen

**Hinweis**: Falls nur 1 Spiel verfügbar ist, können Sie diesen Screenshot überspringen.

---

### Screenshot 4: Spiel beendet im Liveticker (NEU)

**Dateiname**: `SC-048-liveticker-game-finished.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/liveticker/`
**URL**: `http://localhost:8000/liveticker/`

**Anweisungen**:
1. ZUERST: Beenden Sie ein Spiel im Scorecard (falls möglich)
2. Navigieren Sie zu `/liveticker/`
3. Das beendete Spiel sollte als "FINAL" oder ähnlich markiert sein
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Endstand des Spiels
- "FINAL" oder "Beendet"-Status
- Finaler Spielstand
- Unterscheidung zu aktiven Spielen

**Hinweis**: Falls das Beenden von Spielen nicht unterstützt wird, überspringen Sie diesen Screenshot.

---

## Passcheck-Reise

### Übersicht

Passcheck ermöglicht die Überprüfung der Spielberechtigung von Spielern. Mit den vorhandenen Testdaten (72 Spieler in Teams) sollten vollständige Screenshots möglich sein.

### Voraussetzungen

- Django Dev-Server läuft
- Testdaten geladen: 72 Spieler, 8 Teams
- Spiele für heute verfügbar (4 Spiele)
- Als Admin angemeldet

### Screenshot 1: Spielauswahl mit heutigem Spieltag (NEU)

**Dateiname**: `SC-049-passcheck-game-selection-today.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/passcheck/`
**URL**: `http://localhost:8000/passcheck/`

**Anweisungen**:
1. Navigieren Sie zu `/passcheck/`
2. Spieltagsauswahl sollte erscheinen
3. Wählen Sie "Flag Football Cup 16.11.2025" (heutiger Spieltag)
4. Spielauswahl-Seite sollte 4 verfügbare Spiele zeigen
5. Screenshot aufnehmen BEVOR Sie ein Spiel auswählen

**Was sichtbar sein sollte**:
- Überschrift "Spiel auswählen" oder ähnlich
- Liste der 4 verfügbaren Spiele für heute
- Team-Namen für jedes Spiel
- Spielzeit
- Auswahl-Buttons oder Links

**Hinweis**: Falls Sie direkt zur leeren Spielauswahl weitergeleitet werden, überprüfen Sie, ob der Spieltag korrekt eingerichtet ist.

---

### Screenshot 2: Spielerliste für ein Team (NEU)

**Dateiname**: `SC-050-passcheck-player-list.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/passcheck/`
**URL**: `http://localhost:8000/passcheck/` (nach Spielauswahl)

**Anweisungen**:
1. Wählen Sie ein Spiel aus (z.B. Berlin Adler vs. Hamburg Blue Devils)
2. Wählen Sie ein Team aus (z.B. Berlin Adler mit 12 Spielern)
3. Spielerliste sollte erscheinen
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Team-Name (z.B. "Berlin Adler")
- Liste der Spieler mit:
  - Spielernummer
  - Spielername
  - Berechtigungsstatus (grün/rot/gelb)
- Suchfeld (falls vorhanden)
- Filtermöglichkeiten (falls vorhanden)

**Hinweis**: Wenn keine Spieler angezeigt werden, überprüfen Sie die Testdaten. Die Spieler sollten durch das Skript `populate_player_rosters.py` erstellt worden sein.

---

### Screenshot 3: Spielerberechtigung - Grün/Genehmigt (NEU)

**Dateiname**: `SC-051-passcheck-player-approved.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/passcheck/`
**URL**: `http://localhost:8000/passcheck/` (in Spielerliste)

**Anweisungen**:
1. Navigieren Sie zur Spielerliste eines Teams
2. Finden Sie einen Spieler mit grünem/genehmigtem Status
3. Zoomen Sie auf diesen Spieler (optional) oder stellen Sie sicher, dass der Status klar sichtbar ist
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Spieler-Information
- Grüner Status-Indikator oder "Berechtigt"-Label
- Spielernummer und Name
- Optional: Moodle-Status oder Pass-Information

**Hinweis**: Falls alle Spieler rot/ungenehmigt sind, kann dieser Screenshot die vorhandene Situation zeigen und in der Dokumentation als "Nicht berechtigt"-Beispiel verwendet werden.

---

### Screenshot 4: Spieler-Suchinterface (NEU)

**Dateiname**: `SC-052-passcheck-player-search.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/passcheck/`
**URL**: `http://localhost:8000/passcheck/` (in Spielerliste)

**Anweisungen**:
1. Navigieren Sie zur Spielerliste
2. Suchen Sie nach dem Suchfeld (normalerweise oben)
3. Klicken Sie in das Suchfeld (aktivieren Sie es)
4. Geben Sie OPTIONAL einen Teil eines Namens ein (z.B. "Schmidt")
5. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Suchfeld aktiviert (Cursor sichtbar)
- Optional: Suchergebnisse wenn Text eingegeben wurde
- Spielerliste (gefiltert oder ungefiltert)
- Suchfeld-Platzhaltertext

**Hinweis**: Falls kein Suchfeld vorhanden ist, überspringen Sie diesen Screenshot.

---

### Screenshot 5: Berechtigungsdetails-Ansicht (NEU)

**Dateiname**: `SC-053-passcheck-eligibility-details.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/passcheck/`
**URL**: `http://localhost:8000/passcheck/` (Spielerdetails)

**Anweisungen**:
1. Navigieren Sie zur Spielerliste
2. Klicken Sie auf einen Spieler, um Details zu sehen (falls möglich)
3. Details-Ansicht sollte erscheinen mit:
   - Pass-Status
   - Moodle-Kurs-Status
   - Equipment-Genehmigung
   - Weitere Berechtigungsinformationen
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Detaillierte Spielerinformation
- Berechtigungskriterien:
  - Moodle-Kurs abgeschlossen? (Ja/Nein)
  - Equipment-Genehmigung? (Ja/Nein)
  - Spielberechtigung? (Berechtigt/Nicht berechtigt)
- Zurück-Button oder Navigation

**Hinweis**: Falls keine Detail-Ansicht verfügbar ist, überspringen Sie diesen Screenshot. Die Berechtigungslogik könnte direkt in der Liste angezeigt werden.

---

### Screenshot 6: Team-Umschaltung (NEU)

**Dateiname**: `SC-054-passcheck-team-switch.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/passcheck/`
**URL**: `http://localhost:8000/passcheck/`

**Anweisungen**:
1. Navigieren Sie zum Passcheck mit ausgewähltem Spiel
2. Suchen Sie nach einem "Team wechseln"-Button oder Dropdown
3. Klicken Sie auf diesen Button ODER
4. Screenshot der Team-Auswahl-Ansicht
5. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Aktuelles Team angezeigt
- Option zum Wechseln zum anderen Team (z.B. von Berlin Adler zu Hamburg Blue Devils)
- Dropdown oder Buttons für Teamwechsel
- Navigation zurück zur Spielauswahl

**Hinweis**: Falls kein Team-Wechsel möglich ist, überspringen Sie diesen Screenshot.

---

## Spieltage Zusätzlich

### Screenshot 1: Heutiger Spieltag - Detail-Ansicht mit 4 Spielen (NEU)

**Dateiname**: `SC-055-gameday-today-detail.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/gamedays/`
**URL**: `http://localhost:8000/gamedays/gameday/<ID>/` (ID des heutigen Spieltags)

**Anweisungen**:
1. Navigieren Sie zur Startseite `/`
2. Finden Sie den Spieltag "Flag Football Cup 16.11.2025"
3. Klicken Sie auf den Spieltag-Link, um die Detail-Ansicht zu öffnen
4. Die Detail-Seite sollte 4 Spiele anzeigen
5. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Spieltag-Name: "Flag Football Cup 16.11.2025"
- Datum: 16.11.2025
- Spielort-Information (falls vorhanden)
- Liste der 4 Spiele:
  - Team-Namen
  - Spielzeiten
  - Feld-Zuweisungen (falls vorhanden)
- Aktionen: "Spiel bearbeiten", "Neues Spiel" (falls vorhanden)

---

### Screenshot 2: Spiel-Detail-Ansicht (NEU)

**Dateiname**: `SC-056-game-detail-view.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/gamedays/`
**URL**: `http://localhost:8000/gamedays/game/<ID>/` (ID eines Spiels)

**Anweisungen**:
1. Navigieren Sie zur Spieltag-Detail-Ansicht
2. Klicken Sie auf eines der 4 Spiele
3. Spiel-Detail-Seite sollte erscheinen
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Home-Team und Away-Team Namen
- Spielzeit
- Spielort/Feld
- Zugewiesene Schiedsrichter (falls vorhanden)
- Spielstand (falls schon gespielt)
- "Bearbeiten"-Button (für Admins)

---

### Screenshot 3: Spieltag mit gemischten Stati (NEU - Optional)

**Dateiname**: `SC-057-gameday-mixed-status.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/gamedays/`
**URL**: `http://localhost:8000/gamedays/gameday/<ID>/`

**Anweisungen**:
1. Suchen Sie einen Spieltag mit verschiedenen Spiel-Stati:
   - Geplante Spiele (noch nicht gestartet)
   - Aktive Spiele (im Scorecard gestartet)
   - Beendete Spiele (mit Endergebnis)
2. Navigieren Sie zur Detail-Ansicht dieses Spieltags
3. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Spiele in verschiedenen Stati
- Visuelle Unterscheidung (z.B. Farben, Icons)
- Spielstände für beendete Spiele
- "Live"-Indikator für aktive Spiele (falls vorhanden)

**Hinweis**: Falls kein Spieltag mit gemischten Stati verfügbar ist, überspringen Sie diesen Screenshot.

---

## Schiedsrichter Zusätzlich

### Screenshot 1: Schiedsrichter zu Spielen zugewiesen (NEU)

**Dateiname**: `SC-058-officials-assigned-to-games.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/officials/`
**URL**: `http://localhost:8000/officials/assignments/` oder `/officials/`

**Anweisungen**:
1. Navigieren Sie zur Schiedsrichter-Verwaltung
2. Suchen Sie nach einer Ansicht, die Zuweisungen zeigt:
   - Welche Schiedsrichter welchen Spielen zugewiesen sind
   - Datum und Spieltag
3. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Liste der Spiele
- Zugewiesene Schiedsrichter (mindestens 1-2)
- Spieltag-Information
- Datum/Zeit der Spiele
- Optional: Schiedsrichter-Rollen (Head Referee, Umpire, etc.)

**Hinweis**: Falls keine Zuweisungen vorhanden sind, können Sie dies im Scorecard (SC-032) erstellen und dann hierher zurückkehren.

---

### Screenshot 2: Schiedsrichter-Detail/Profil (NEU - Optional)

**Dateiname**: `SC-059-official-detail-profile.png`
**Speicherort**: `/home/cda/dev/leaguesphere/docs/user-manual/screenshots/officials/`
**URL**: `http://localhost:8000/officials/official/<ID>/`

**Anweisungen**:
1. Navigieren Sie zur Schiedsrichter-Liste
2. Klicken Sie auf einen Schiedsrichter
3. Detail-/Profil-Ansicht sollte erscheinen
4. Screenshot aufnehmen

**Was sichtbar sein sollte**:
- Schiedsrichter-Name
- Kontaktinformation (E-Mail, falls vorhanden)
- Liste der zugewiesenen Spiele
- Statistiken (Anzahl der gepfiffenen Spiele, etc.)
- "Bearbeiten"-Button (für Admins)

**Hinweis**: Falls keine Detail-Ansicht verfügbar ist, überspringen Sie diesen Screenshot.

---

## Problemlösung

### Problem: React-App leitet weiter oder zeigt leere Seite

**Symptome**:
- Passcheck/Scorecard/Liveticker zeigen keine Daten
- Unerwartete Redirects
- Leere Seiten

**Lösungen**:
1. **Aktualisieren Sie die Seite** (F5 oder Ctrl+R)
2. **Leeren Sie den Browser-Cache**:
   - Firefox: Ctrl+Shift+Delete → "Cache" auswählen → "Jetzt löschen"
   - Chrome: Ctrl+Shift+Delete → "Cached images and files" → "Clear data"
3. **Überprüfen Sie die Browser-Konsole** (F12 → Console-Tab):
   - Suchen Sie nach JavaScript-Fehlern
   - Suchen Sie nach 404 oder 500 HTTP-Fehlern
4. **Überprüfen Sie den Django Dev-Server**:
   - Ist der Server noch aktiv?
   - Gibt es Fehlermeldungen im Terminal?
5. **Melden Sie sich erneut an**:
   - Session könnte abgelaufen sein
   - Navigieren Sie zu `/accounts/login/`

### Problem: beforeunload-Dialoge blockieren Navigation

**Symptome**:
- "Möchten Sie diese Seite wirklich verlassen?"-Dialog erscheint
- Navigation wird blockiert

**Lösungen**:
1. **Akzeptieren Sie den Dialog** ("Seite verlassen" klicken)
2. **Deaktivieren Sie beforeunload in DevTools**:
   - Firefox: about:config → dom.disable_beforeunload = true
   - Chrome: Keine native Option, verwenden Sie Extension
3. **Verwenden Sie neue Tabs**:
   - Öffnen Sie jede URL in einem neuen Tab (Ctrl+T)
   - Schließen Sie Tabs nach Screenshot

### Problem: Keine Spieler in Passcheck

**Symptome**:
- Passcheck zeigt "Keine Spieler verfügbar"
- Leere Roster-Listen

**Lösungen**:
1. **Überprüfen Sie Testdaten**:
   ```bash
   # Führen Sie das Spielerdaten-Skript aus
   python /home/cda/dev/leaguesphere/scripts/populate_player_rosters.py
   ```
2. **Überprüfen Sie Team-Zuweisungen**:
   - Navigieren Sie zum Django Admin: `/admin/`
   - Gehen Sie zu "Passcheck" → "Playerlists"
   - Überprüfen Sie, ob Spielerlisten für Teams existieren
3. **Erstellen Sie manuelle Testdaten**:
   - Django Admin → "Passcheck" → "Players" → "Add Player"
   - Füllen Sie Name, Team, Nummer aus
   - Speichern

### Problem: Liveticker zeigt keine Ereignisse

**Symptome**:
- Liveticker zeigt "Keine aktiven Spiele"
- Keine Ereignisse trotz Scorecard-Aktivität

**Lösungen**:
1. **Erstellen Sie Ereignisse im Scorecard**:
   - Navigieren Sie zu `/scorecard/`
   - Starten Sie ein Spiel
   - Erstellen Sie mindestens 2-3 Touchdowns
2. **Warten Sie auf Polling**:
   - Liveticker aktualisiert sich automatisch alle 5-10 Sekunden
   - Warten Sie 10-15 Sekunden nach Erstellen der Ereignisse
3. **Aktualisieren Sie die Seite manuell**:
   - Drücken Sie F5 oder Ctrl+R
4. **Überprüfen Sie die API**:
   - Öffnen Sie in neuem Tab: `http://localhost:8000/api/liveticker/`
   - JSON-Antwort sollte Ereignisse enthalten

### Problem: Screenshots sind zu groß (> 500 KB)

**Symptome**:
- PNG-Dateien über 500 KB
- Langsames Laden im Handbuch

**Lösungen**:
1. **Verwenden Sie "Capture screenshot" statt "Capture full size"**:
   - Viewport-Screenshot ist kleiner als Full-Page
2. **Komprimieren Sie mit pngquant**:
   ```bash
   # Installieren Sie pngquant (falls nicht vorhanden)
   sudo apt install pngquant

   # Komprimieren Sie ein Bild
   pngquant --quality=65-80 SC-XXX-description.png --output SC-XXX-description.png --force
   ```
3. **Verwenden Sie optipng**:
   ```bash
   # Installieren
   sudo apt install optipng

   # Optimieren
   optipng -o5 SC-XXX-description.png
   ```

---

## Checkliste

### Vor dem Start

- [ ] Django Dev-Server läuft auf http://localhost:8000
- [ ] MySQL-Datenbank ist erreichbar (LXC Container servyy-test)
- [ ] Testdaten geladen (72 Spieler, 8 Teams, 4 Spiele heute, 4 Schiedsrichter)
- [ ] Als Admin angemeldet (admin / admin123)
- [ ] Browser-Viewport auf 1440 x 900 eingestellt
- [ ] Screenshot-Verzeichnisse existieren:
  ```bash
  ls -la /home/cda/dev/leaguesphere/docs/user-manual/screenshots/
  ```

### Scorecard-Reise (8-10 Screenshots)

- [ ] SC-039: Login-Bildschirm (NEU)
- [x] SC-030: Spieltagsauswahl (VORHANDEN)
- [x] SC-031: Spielauswahl mit 4 Spielen (VORHANDEN)
- [x] SC-032: Schiedsrichter-Zuweisung (VORHANDEN)
- [x] SC-033: Spieleinstellungen komplett (VORHANDEN)
- [x] SC-034: Live-Scoring zu Beginn 0:0 (VORHANDEN)
- [x] SC-035: Touchdown-Formular (VORHANDEN)
- [x] SC-037: Nach Touchdown 7:0 (VORHANDEN)
- [x] SC-038: Ballbesitz-Indikator (VORHANDEN)
- [ ] SC-040: Extra Point Formular (NEU)
- [ ] SC-041: Field Goal Formular (NEU)
- [ ] SC-042: Safety Formular (NEU - Optional)
- [ ] SC-043: Spielstand nach mehreren Plays (NEU)
- [ ] SC-044: Quarter abgeschlossen (NEU - Optional)

### Liveticker-Reise (3-4 Screenshots)

- [ ] SC-045: Liveticker mit aktiven Spielen (NEU)
- [ ] SC-046: Event-Timeline mit Ereignissen (NEU)
- [ ] SC-047: Mehrere Spiele gleichzeitig (NEU - Optional)
- [ ] SC-048: Spiel beendet (NEU - Optional)

### Passcheck-Reise (4-6 Screenshots)

- [ ] SC-049: Spielauswahl mit heutigem Spieltag (NEU)
- [ ] SC-050: Spielerliste für ein Team (NEU)
- [ ] SC-051: Spielerberechtigung grün/genehmigt (NEU)
- [ ] SC-052: Spieler-Suchinterface (NEU)
- [ ] SC-053: Berechtigungsdetails-Ansicht (NEU - Optional)
- [ ] SC-054: Team-Umschaltung (NEU - Optional)

### Spieltage Zusätzlich (2-3 Screenshots)

- [ ] SC-055: Heutiger Spieltag Detail mit 4 Spielen (NEU)
- [ ] SC-056: Spiel-Detail-Ansicht (NEU)
- [ ] SC-057: Spieltag mit gemischten Stati (NEU - Optional)

### Schiedsrichter Zusätzlich (1-2 Screenshots)

- [ ] SC-058: Schiedsrichter zu Spielen zugewiesen (NEU)
- [ ] SC-059: Schiedsrichter-Detail/Profil (NEU - Optional)

### Qualitätsprüfung

- [ ] Alle Screenshots sind klar und lesbar
- [ ] Konsistente Viewport-Größe (1440 x 900)
- [ ] Keine Browser-UI sichtbar (Adressleiste, Entwicklertools)
- [ ] Navigationskopfzeile in jedem Screenshot sichtbar
- [ ] Dateigrößen < 500 KB
- [ ] Namenskonvention eingehalten: `SC-###-beschreibung.png`
- [ ] Screenshots in korrekten Verzeichnissen gespeichert
- [ ] Keine persönlichen Daten sichtbar

### Nach dem Abschluss

- [ ] Anzahl der erfassten Screenshots gezählt:
  ```bash
  find /home/cda/dev/leaguesphere/docs/user-manual/screenshots/ -name "SC-*.png" | wc -l
  ```
- [ ] Screenshot-Inventar aktualisiert (PROGRESS.md)
- [ ] Fehlende Screenshots dokumentiert
- [ ] Backup der Screenshots erstellt:
  ```bash
  tar -czf screenshots_backup_$(date +%Y%m%d).tar.gz \
    /home/cda/dev/leaguesphere/docs/user-manual/screenshots/
  ```

---

## Zusammenfassung

**Geschätzte Gesamtzeit**: 3-4 Stunden

**Benötigte Screenshots**:
- Scorecard: 5 neue Screenshots (+ 9 vorhandene)
- Liveticker: 2-4 neue Screenshots
- Passcheck: 4-6 neue Screenshots
- Spieltage: 2-3 neue Screenshots
- Schiedsrichter: 1-2 neue Screenshots

**Gesamt**: ~14-20 neue Screenshots

**Priorität**:
1. **HOCH**: Passcheck (4-6), Liveticker (2-4) - Diese fehlen komplett
2. **MITTEL**: Spieltage (2-3), Schiedsrichter (1-2) - Ergänzung vorhanden
3. **NIEDRIG**: Scorecard (5) - Hauptworkflow bereits dokumentiert

**Viel Erfolg beim Erfassen der Screenshots!**

Falls Sie Fragen haben oder auf Probleme stoßen, konsultieren Sie die Problemlösungs-Sektion oder melden Sie sich bei einem Entwickler.
