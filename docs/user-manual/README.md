# LeagueSphere Benutzerhandbuch

Standalone HTML-basiertes Benutzerhandbuch für LeagueSphere.

## Schnellstart

### Methode 1: Direkt im Browser öffnen (Empfohlen für lokale Nutzung)

1. Navigieren Sie zu `/home/cda/dev/leaguesphere/docs/user-manual/` im Dateimanager
2. Doppelklicken Sie auf `index.html`
3. Das Handbuch öffnet sich in Ihrem Standard-Browser

**Voraussetzungen:**
- Moderne Webbrowser (Chrome, Firefox, Safari, Edge)
- Internetverbindung (für Bootstrap CDN)

### Methode 2: Mit lokalem Webserver (Empfohlen für Entwicklung)

**Mit Python:**
```bash
cd /home/cda/dev/leaguesphere/docs/user-manual
python3 -m http.server 8080
# Öffnen Sie http://localhost:8080 im Browser
```

**Mit Node.js:**
```bash
cd /home/cda/dev/leaguesphere/docs/user-manual
npx http-server -p 8080
# Öffnen Sie http://localhost:8080 im Browser
```

## Struktur

```
docs/user-manual/
├── index.html                      # Startseite mit Übersicht
├── intro.html                      # Navigation & Erste Schritte
├── gamedays.html                   # Spieltage verwalten
├── passcheck.html                  # Spielberechtigung prüfen
├── scorecard.html                  # Live-Scoring
├── officials.html                  # Schiedsrichter verwalten
├── liveticker.html                 # Liveticker
├── league-table.html               # Tabellen & Spielpläne
├── teammanager.html                # Teams verwalten
├── accounts.html                   # Benutzerkonten
├── ARCHITECTURE.md                 # Architektur-Dokument
├── README.md                       # Diese Datei
├── assets/
│   ├── css/
│   │   └── manual.css              # Benutzerdefinierte Styles
│   ├── js/
│   │   └── manual.js               # JavaScript-Erweiterungen
│   └── images/
│       └── (Logo und Bilder)
└── screenshots/
    ├── intro/
    ├── gamedays/
    ├── passcheck/
    ├── scorecard/
    ├── officials/
    ├── liveticker/
    ├── league-table/
    ├── teammanager/
    └── accounts/
```

## Entwicklungsstatus

### Phase 1: Struktur Setup ✅ (Abgeschlossen)
- ✅ Verzeichnisstruktur erstellt
- ✅ CSS-Datei (manual.css) erstellt
- ✅ JavaScript-Datei (manual.js) erstellt
- ✅ Startseite (index.html) erstellt
- ✅ 9 Feature-Seiten mit konsistenter Struktur erstellt

### Phase 2: Inhaltserstellung (Ausstehend)
- ⏳ Inhalte werden vom `documentation-specialist` hinzugefügt
- ⏳ Textbeschreibungen für jede Funktion
- ⏳ Schritt-für-Schritt-Anleitungen
- ⏳ Tipps und Best Practices

### Phase 3: Screenshots (Ausstehend)
- ⏳ Screenshots werden vom `qa-engineer` hinzugefügt
- ⏳ Erfassung von https://leaguesphere.app
- ⏳ Optimierung und Organisation
- ⏳ Alt-Text für Barrierefreiheit

## Features

### Aktuell implementiert:
- ✅ Responsive Bootstrap 5 Design
- ✅ Konsistente Navigation (Header + Sidebar)
- ✅ 9 Feature-Seiten mit Platzhaltern
- ✅ Breadcrumb-Navigation
- ✅ Seiten-zu-Seiten-Navigation (Vorwärts/Rückwärts)
- ✅ Druckfunktion
- ✅ Barrierefreiheit (Skip-to-Content-Link, semantisches HTML)
- ✅ Smooth Scrolling
- ✅ Back-to-Top-Button (JavaScript)
- ✅ Aktive Seiten-Hervorhebung in Sidebar

### Für die Zukunft geplant:
- ⏳ Vollständige Inhalte für alle Seiten
- ⏳ Screenshots für alle Features
- ⏳ Suchfunktion
- ⏳ Dark Mode
- ⏳ Mehrsprachige Unterstützung (Englisch)
- ⏳ Interaktive Tutorials
- ⏳ Video-Anleitungen

## Technologien

- **HTML5** - Semantisches Markup
- **CSS3** - Benutzerdefinierte Styles
- **JavaScript (ES6+)** - Interaktive Funktionen
- **Bootstrap 5.3.2** - UI Framework (via CDN)

**Keine Build-Tools erforderlich!** Das Handbuch besteht aus reinen HTML/CSS/JS-Dateien.

## Browser-Kompatibilität

- Chrome 100+ ✅
- Firefox 100+ ✅
- Safari 15+ ✅
- Edge 100+ ✅

## Barrierefreiheit

Das Handbuch folgt WCAG 2.1 AA-Richtlinien:
- Semantisches HTML
- Tastaturnavigation
- Skip-to-Content-Link
- Alt-Text für Bilder (wird hinzugefügt)
- Ausreichender Farbkontrast
- ARIA-Labels für bessere Screen-Reader-Unterstützung

## Wartung

### Inhalte aktualisieren:
1. Öffnen Sie die entsprechende HTML-Datei in einem Texteditor
2. Bearbeiten Sie den Inhalt innerhalb der `<section>`-Tags
3. Speichern Sie die Datei
4. Aktualisieren Sie Ihren Browser, um die Änderungen zu sehen

### Screenshots hinzufügen:
1. Erfassen Sie Screenshots von https://leaguesphere.app
2. Speichern Sie sie im entsprechenden `screenshots/`-Unterverzeichnis
3. Optimieren Sie Bilder (<500KB empfohlen)
4. Fügen Sie `<figure>`-Tags mit Alt-Text in HTML ein

### Styles ändern:
- Bearbeiten Sie `assets/css/manual.css`
- Benutzerdefinierte CSS-Variablen sind im `:root`-Selektor definiert

### JavaScript-Funktionen hinzufügen:
- Bearbeiten Sie `assets/js/manual.js`
- Alle Funktionen werden bei DOMContentLoaded ausgeführt

## Lizenz

Copyright © 2025 LeagueSphere

## Support

- GitHub: https://github.com/dachrisch/leaguesphere
- Anwendung: https://leaguesphere.app

## Nächste Schritte

1. **Dokumentationsspezialist** sollte Inhalte für alle Seiten erstellen
2. **QA-Engineer** sollte Screenshots erfassen und hinzufügen
3. Nach Fertigstellung: Handbuch mit der LeagueSphere-Anwendung integrieren oder als ZIP verteilen
