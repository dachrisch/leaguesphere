# Share-Widget (Widget einbetten)

Tour durch den Widget-Generator (Menü *Team* → *Widget einbetten*): Team suchen,
Saison und Liga wählen, den Live-Vorschau-iframe prüfen, den Einbettungscode
kopieren und das fertige Widget auf der Vereinsseite ansehen.

Verifiziert live gegen https://demo.leaguesphere.app (v4.36.2) am 2026-10-13.
Pre-flight (off camera, per SKILL.md): als admin@demo.local einloggen, auf
1920x1080 (`resize_page`) gehen. Der Generator hält keinen Server-Zustand – ein
frischer Aufruf von `/share/` genügt als sauberer Start. Aufnahme beginnt auf
`/share/` (Formular sichtbar, noch kein Team gewählt).

- selector notes (all confirmed in the deployed build):
- Route: `/share/` (Generator), gerendertes Widget unter `/share/widget/`,
  öffentliche API unter `/api/snapshot/`. Menüpfad bestätigt: *Team* →
  "📺 Widget einbetten" → `/share/`.
- **Team-Suche ist ein reines React-Input** (`input[type=search]`,
  Placeholder "Team suchen…"), kein Autocomplete-Widget: Fokus per Klick, dann
  echte Tastatureingabe (`type_text`); Treffer erscheinen nach ~250 ms als
  `<ul class="share-gen__results">` mit je einem `<button>` pro Team.
- **Saison- und Liga-Picker sind native `<select>`s, NICHT react-select**
  (`[data-testid="gen-season"]`, `[data-testid="gen-league"]`). Der react-select-
  Workaround aus SKILL.md ist hier nicht nötig; der Wert wird per JS gesetzt und
  ein `change`-Event dispatches. Die Liga-Auswahl ist erst nach Teamwahl aktiv und
  lädt beim Saisonwechsel kurz asynchron neu.
- Ansicht ist ein drittes natives `<select>` (`[data-testid="gen-view"]`,
  Optionen Spielplan/Tabelle/Live-Ticker, Default Spielplan).
- Live-Vorschau + Einbettungscodes erscheinen erst **nach** Teamwahl in
  Abschnitt "3. Vorschau & Einbettung"; die Seite wird dadurch scrollbar
  (~2213 px hoch). Die Code-Textareas: "Schritt 1 – Größen-Listener", "Schritt 2
  – iframe", "Direktlink", "Daten als JSON"; je ein "Kopieren"-Button darunter.
- **Der Demo-Datenbestand hat KEINE Tabellenstände**: `/api/snapshot/…&include=standings`
  liefert für jede Liga/Saison/Team-Kombination `standings: []`, und
  `/leaguetable/premier-division/` zeigt "Tabelle wurde noch nicht erstellt."
  Deshalb rendert `view=table` nur "Tabelle nicht verfügbar." und `view=live`
  "Kein Live-Spiel gerade.". Die Storyboard-Tour zeigt darum bewusst die
  funktionierende Spielplan-Ansicht (echtes Ergebnis vorhanden) statt einer
  leeren Tabelle. Der "Ansicht"-Picker bleibt in jeder Aufnahme sichtbar.
- Demo-Team mit Spielplan-Daten: **Thunder Titans, id 4** (spielt in allen vier
  Ligen; Premier Division enthält ein beendetes Spiel). Direktlink-URL:
  `/share/widget/?t=4&year=2025&league=1`.

## Step 1
- caption: Widget-Generator öffnen
- action: navigate
- target: /share/
- hold: 3

## Step 2
- caption: Verein suchen
- action: fill
- target: the Team-Suche input (input[type=search], placeholder "Team suchen…") – click to focus, type real keystrokes "Thunder"
- hold: 3

## Step 3
- caption: Team auswählen
- action: click
- target: the "Thunder Titans (Mighty and powerful)" button in ul.share-gen__results
- hold: 3

## Step 4
- caption: Saison wählen
- action: click
- target: the Saison select [data-testid="gen-season"] -> option "2025/2026" (native select, set value + change event)
- hold: 3

## Step 5
- caption: Liga wählen
- action: click
- target: the Liga select [data-testid="gen-league"] -> option "Premier Division" (native select, set value + change event)
- hold: 3

## Step 6
- caption: Live-Vorschau passt sich an
- action: wait
- target: the generator's live preview iframe (section 3, scrolled into view) showing the Spielplan for Thunder Titans
- hold: 3

## Step 7
- caption: Einbettungscode kopieren
- action: click
- target: the "Kopieren" button under "Schritt 2 – iframe" (scrolled into view)
- hold: 3

## Step 8
- caption: So sieht das Widget auf der Vereinsseite aus
- action: navigate
- target: /share/widget/?t=4&year=2025&league=1
- hold: 3

## Step 9
- caption: Code auf der eigenen Website einfügen
- action: wait
- target: the rendered widget (Thunder Titans Spielplan, past result shown)
- hold: 4
