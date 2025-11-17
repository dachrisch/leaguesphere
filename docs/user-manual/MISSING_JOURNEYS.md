# Fehlende User Journeys - Dokumentationsplan

**Stand:** 11. November 2025
**Autor:** Claude Code
**Ziel:** Vollständige Screenshot-Dokumentation aller Hauptfunktionen

## Aktueller Stand

### ✅ Vollständig dokumentierte Journeys (mit echten Workflows)

1. **Scorecard** (11 Screenshots)
   - Spieltagsauswahl
   - Spielauswahl
   - Schiedsrichter-Zuweisung
   - Live-Scoring Interface
   - Touchdown erfassen
   - Spielstand-Updates

2. **Accounts** (5 Screenshots)
   - Login
   - Homepage eingeloggt
   - Admin Dashboard
   - Benutzerverwaltung
   - Passwort ändern

3. **Intro/Navigation** (6 Screenshots)
   - Startseite
   - Menüs (Orga, Officials, Team)
   - Login

### ⚠️ Teilweise dokumentiert (brauchen bessere Workflows)

4. **Gamedays** (4 Screenshots)
   - **Vorhanden:** Jahresübersicht, Spieltagsdetails, Statistiken
   - **FEHLT:**
     - Spieltag erstellen (Wizard)
     - Spiel hinzufügen/bearbeiten
     - Spielergebnisse manuell eintragen
     - Spieltag finalisieren/veröffentlichen

5. **Officials** (1 Screenshot)
   - **Vorhanden:** Einsätze-Tabelle
   - **FEHLT:**
     - Schiedsrichter-Anmeldung für Spieltag
     - Zuweisung zu Spielen
     - Schiedsrichter-Übersicht/Profil
     - Einsatzstatistiken

6. **Teammanager** (2 Screenshots)
   - **Vorhanden:** Teamauswahl, leerer Roster
   - **FEHLT:**
     - Roster mit Spielern (nicht leer!)
     - Spieler hinzufügen
     - Spieler bearbeiten/entfernen
     - Roster für Spieltag freigeben

7. **League Table** (1 Screenshot)
   - **Vorhanden:** Tabelle nach Spieltag
   - **FEHLT:**
     - Tabellenberechnung-Details
     - Spielplan-Ansicht
     - Head-to-Head Vergleiche
     - Saisonstatistiken

### ❌ Nur Empty States (brauchen DRINGEND echte Workflows)

8. **Passcheck** (1 Screenshot - leer!)
   - **Vorhanden:** Leere Spielauswahl
   - **FEHLT:**
     - Spiel auswählen mit Daten
     - Spielerliste anzeigen
     - Spieler scannen/suchen
     - Berechtigungsstatus prüfen
     - Nicht-berechtigten Spieler ablehnen
     - Warnungen/Hinweise anzeigen

9. **Liveticker** (1 Screenshot - leer!)
   - **Vorhanden:** "Keine aktiven Spiele"
   - **FEHLT:**
     - Liveticker mit laufenden Spielen
     - Ereignisse in Chronologie
     - Spielstand-Updates
     - Mehrere Spiele gleichzeitig
     - Filteroptionen

---

## PRIORITÄTENLISTE

### 🔴 Priorität 1: KRITISCH (Empty States ersetzen)

#### 1. Passcheck Journey
**Problem:** Nur leerer Zustand vorhanden, Kernfunktion nicht dokumentiert
**Benötigte Testdaten:**
- Spiel mit Roster-Daten
- Spieler mit Moodle-Registrierung (oder lokale Playerlist)
- Verschiedene Berechtigungsstatus (berechtigt, nicht berechtigt, Warnung)

**Workflow:**
1. Spielauswahl mit verfügbaren Spielen
2. Spiel auswählen → Spielerliste laden
3. Spieler suchen/scannen (Pass-Nummer)
4. Berechtigungsstatus anzeigen:
   - ✅ Berechtigt (grün)
   - ❌ Nicht berechtigt (rot) mit Grund
   - ⚠️ Warnung (gelb) - z.B. Transfer ausstehend
5. Details zur Nicht-Berechtigung
6. Spielerliste filtern/sortieren

**Screenshots benötigt:** 6-8

**Technische Herausforderung:** React SPA mit Routing-Problemen
**Lösung:** Manuelle Screenshots oder dedizierte Setup-Funktion

---

#### 2. Liveticker Journey
**Problem:** Nur leerer Zustand vorhanden
**Benötigte Testdaten:**
- Laufende Spiele mit Ereignissen
- Teamlog-Einträge (Touchdowns, Conversions, etc.)

**Workflow:**
1. Liveticker öffnen mit aktiven Spielen
2. Chronologische Ereignisliste
3. Mehrere Spiele gleichzeitig
4. Spielstand-Updates in Echtzeit
5. Filter nach Spiel
6. Historische Ereignisse

**Screenshots benötigt:** 4-5

**Technische Lösung:**
- Testdaten aus Scorecard-Spiel nutzen (bereits erstellt!)
- Nach Scoring-Session Liveticker öffnen
- Ereignisse sollten automatisch erscheinen

---

### 🟠 Priorität 2: WICHTIG (Workflows erweitern)

#### 3. Teammanager Journey (mit Spielern!)
**Problem:** Nur leere Rosters, keine Spielerverwaltung dokumentiert
**Benötigte Testdaten:**
- ✅ BEREITS VORHANDEN: 72 Spieler in 6 Teams!

**Workflow:**
1. Team auswählen
2. Roster mit Spielern anzeigen (nicht leer!)
3. Spieler hinzufügen (Formular)
4. Spielerdetails bearbeiten
5. Spieler aus Roster entfernen
6. Roster für Spieltag aktivieren

**Screenshots benötigt:** 5-6

**Technische Lösung:** Einfach! Daten existieren bereits

---

#### 4. Officials Journey
**Problem:** Nur Tabelle, kein Workflow dokumentiert
**Benötigte Testdaten:**
- Spieltage mit Schiedsrichter-Slots
- Schiedsrichter-Zuweisungen

**Workflow:**
1. Schiedsrichter-Anmeldung für Spieltag öffnen
2. Verfügbare Spiele anzeigen
3. Sich für Spiel anmelden
4. Zugewiesene Spiele sehen
5. Einsatzübersicht/Statistiken

**Screenshots benötigt:** 4-5

---

#### 5. Gameday Creation Journey
**Problem:** Kein Erstellungs-Workflow dokumentiert
**Benötigte Testdaten:**
- Teams für neuen Spieltag

**Workflow:**
1. "Spieltag erstellen" Button
2. Wizard Schritt 1: Grunddaten (Name, Datum, Format)
3. Wizard Schritt 2: Teams auswählen
4. Wizard Schritt 3: Spielplan generieren
5. Spieltag-Übersicht nach Erstellung
6. Spiel bearbeiten/Zeiten anpassen

**Screenshots benötigt:** 6-7

**Technische Herausforderung:** Wizard mit Timeouts (bekanntes Problem)

---

### 🟡 Priorität 3: NÜTZLICH (Erweiterte Features)

#### 6. League Table Details
**Screenshots benötigt:** 2-3
- Tabellenberechnung mit Erklärung
- Spielplan-Ansicht
- Head-to-Head Statistiken

#### 7. Gameday Results Entry
**Screenshots benötigt:** 3-4
- Ergebnisse manuell nachtragen
- Bulk-Edit für mehrere Spiele
- Spieltag abschließen

---

## UMSETZUNGSPLAN

### Phase 1: Passcheck & Liveticker (Empty States ersetzen)
**Zeitaufwand:** 1-2 Sessions
**Reihenfolge:**
1. ✅ Liveticker zuerst - einfacher, da Testdaten von Scorecard vorhanden
2. Passcheck - benötigt neue Testdaten-Strategie

**Liveticker-Plan:**
```bash
# Daten existieren bereits von Scorecard-Session!
# Einfach Liveticker öffnen nach Scorecard-Nutzung
1. Scorecard-Spiel mit mehreren Scores durchführen
2. Zu Liveticker navigieren
3. Screenshots von Ereignisliste machen
4. Verschiedene Filter testen
```

**Passcheck-Plan:**
```python
# Option A: Manuelle Screenshots
- Browser direkt öffnen: http://localhost:8000/passcheck/
- Manuell durch App navigieren
- Screenshots mit Browser-Tools

# Option B: Testdaten für Passcheck vorbereiten
- Playerlist-Gameday-Zuordnungen existieren bereits!
- Spiel auswählen mit Roster
- Spieler-Berechtigungen anzeigen
```

---

### Phase 2: Teammanager (einfach - Daten vorhanden)
**Zeitaufwand:** 30-60 Minuten
**Plan:**
```bash
# Daten existieren: 72 Spieler in 6 Teams
1. Zu Teammanager navigieren
2. Team mit Spielern auswählen (z.B. Berlin Adler - 12 Spieler)
3. Roster-Ansicht screenshoten
4. "Spieler hinzufügen" Formular
5. Spieler bearbeiten
```

---

### Phase 3: Officials & Gameday Creation
**Zeitaufwand:** 2-3 Sessions
**Herausforderungen:**
- Gameday-Wizard hat Timeout-Probleme
- Schiedsrichter-Anmeldung benötigt spezifische Permissions

---

## TESTDATEN-STATUS

### ✅ Bereits vorhanden:
- 72 Spieler in 6 Teams (für Teammanager)
- 6 Benutzer inkl. admin
- 27 Teams gesamt
- 6 Gamedays mit Spielen
- Scorecard-Spiel mit Ereignissen (für Liveticker)

### ❌ Fehlt noch:
- Passcheck: Spieler-Berechtigungen mit verschiedenen Status
- Officials: Schiedsrichter-Anmeldungen
- Liveticker: Mehr Spiele mit Ereignissen (optional)

---

## EMPFOHLENE REIHENFOLGE

### Session 1: Quick Wins (einfache Daten-Nutzung)
1. **Liveticker** (30 min) - Testdaten von Scorecard nutzen
2. **Teammanager** (45 min) - 72 Spieler bereits vorhanden

### Session 2: Passcheck (herausfordernd)
1. Passcheck-Testdaten-Strategie entwickeln
2. Manuelle Screenshots oder spezialisierte Tools
3. 6-8 Screenshots für kompletten Workflow

### Session 3: Officials & Advanced
1. Officials-Workflow
2. Gameday Creation (wenn möglich)

---

## TECHNISCHE LÖSUNGSANSÄTZE

### Für React SPAs (Passcheck, Liveticker):

**Option 1: Manuelle Screenshots** ⭐ EMPFOHLEN
```bash
# Einfachste und zuverlässigste Methode
1. Firefox/Chrome manuell öffnen
2. http://localhost:8000/passcheck/ navigieren
3. Durch App klicken
4. Browser Screenshot-Tool (F12 → Capture Screenshot)
5. Dateien in docs/user-manual/screenshots/ speichern
```

**Option 2: Playwright** (für Zukunft)
```javascript
// Bessere SPA-Unterstützung als Chrome MCP
const { chromium } = require('playwright');
// Kann Dialoge handhaben
// Bessere Navigation in React Apps
```

**Option 3: Hybride Approach**
```bash
# Chrome MCP für einfache Pages
# Manuell für komplexe SPAs
# Dokumentiere beide Methoden
```

---

## ERFOLGSKRITERIEN

### Minimale Abdeckung (MVP):
- ✅ Alle 9 Funktionen mit mind. 1 Screenshot mit echten Daten
- ✅ Keine Empty States mehr als Haupt-Screenshots
- ✅ Kernworkflows dokumentiert

### Vollständige Abdeckung (Ziel):
- 40-50 Screenshots gesamt
- Alle Hauptworkflows mit 4-8 Screenshots
- Edge Cases und Fehlerzustände dokumentiert
- Jede User-Rolle berücksichtigt

### Aktueller Stand:
- 32 Screenshots ✅
- 6/9 Funktionen vollständig ✅
- 3/9 Funktionen nur Empty States ❌

---

## NÄCHSTE SCHRITTE

1. **JETZT:** Liveticker Screenshots (einfach - Daten vorhanden!)
2. **DANACH:** Teammanager mit Spielern (einfach - Daten vorhanden!)
3. **DANN:** Passcheck-Strategie entwickeln
4. **SPÄTER:** Officials, Gameday Creation

**Geschätzter Zeitaufwand für Priorität 1:**
- Liveticker: 30 Minuten
- Passcheck: 1-2 Stunden
- **Total: 2-3 Stunden für kritische Verbesserung**

---

## DOKUMENTATION DER LEARNINGS

### Was funktioniert gut:
- ✅ Chrome MCP für Django-Templates
- ✅ Testdaten-Scripts erstellen
- ✅ Screenshot-Erfassung mit klarer Naming Convention
- ✅ Schrittweise Workflows dokumentieren

### Was problematisch ist:
- ❌ Chrome MCP + React SPAs mit Routing
- ❌ beforeunload Dialoge blockieren Navigation
- ❌ Komplexe State-Management in SPAs

### Beste Strategie:
- ✅ Testdaten sorgfältig vorbereiten
- ✅ Bei SPAs: Manuell navigieren und screenshoten
- ✅ Bei Django Templates: Chrome MCP nutzen
- ✅ Workflows zuerst planen, dann durchführen
