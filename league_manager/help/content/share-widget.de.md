# Website einbinden

LeagueSphere kann Spielplan, Ergebnisse, Live-Zwischenstände und Tabellen direkt
auf deiner Vereinswebsite anzeigen – ohne dass du Daten doppelt pflegen musst.

<figure class="help-figure">
  <img src="/static/help/img/website.png" alt="Widget-Generator mit Teamauswahl und Optionen">
  <figcaption>Der Widget-Generator: Teams wählen, Optionen festlegen, Code kopieren.</figcaption>
</figure>

## Das Widget

Das Widget ist ein kleines Code-Stück, das du in deine Website einfügst.

1. Öffne den **Widget-Generator** (Menü *Team* → *Widget einbetten*).
2. Wähle deine Teams, die Saison und die Liga.
3. Kopiere den erzeugten Code und füge ihn auf deiner Seite ein.

Das Widget passt sich an Logo und Farben deines Vereins an und regelt seine Höhe
selbst, sodass es sich sauber einfügt.

## Mehrere Teams auf einmal

Ein Embed kann alle Ligen zeigen, in denen deine Teams spielen – mit deinen Teams
farblich hervorgehoben.

## Für eigene Layouts

Möchtest du die Daten selbst darstellen, nutzt du die öffentliche Schnittstelle
`/api/snapshot/`. Sie ist anonym, schreibgeschützt und liefert dieselben Daten
wie das Widget.

## Häufige Fragen

**Aktualisiert sich das Widget automatisch?**
Ja. Ergebnisse und Live-Zwischenstände werden laufend nachgeladen.

**Was zeigt das Widget bei laufenden Spielen?**
Den aktuellen Zwischenstand und den Spielstatus.
