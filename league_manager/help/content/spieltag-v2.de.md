# Scorecard v2

Die Scorecard v2 ist die neue Erfassung am Feld (Beta). Sie führt dich von der
Spieltagsauswahl bis zum abgeschickten Ergebnis und schreibt dieselben Einträge
wie die bisherige Scorecard
([Ergebnisse erfassen](/help/ergebnisse-erfassen/)).

<figure class="help-figure">
  <img src="/static/help/img/spieltag-v2.png" alt="Scorecard v2 im Spiel: Spielstand, Ballbesitz, Aktionen und Spielverlauf mit Rückgängig">
  <figcaption>Im Spiel: Spielstand, Ballbesitz, Aktionen und der Spielverlauf – jeder Eintrag lässt sich rückgängig machen.</figcaption>
</figure>

## Schritt für Schritt

1. Öffne `/scorecard/v2/` und tippe auf einen Spieltag unter **Meine Spieltage**.
   Laufende Spiele setzen die Erfassung fort, geplante öffnen **Spiel
   vorbereiten**.
2. Prüfe in **Spiel vorbereiten** die Offiziellen und ihre Lizenzen, halte
   **Münzwurf gewonnen von**, **Erster Ballbesitz** und **Spielrichtung** fest
   und tippe auf **Spiel starten**. **Jetzt starten** bestätigt den Start.
3. Erfasse im laufenden Spiel (oben stehen Feld und Runde) jeden Spielzug über
   **Touchdown**, **1st Down**, **Turnover**, **Interception**, **Strafe**,
   **Safety**, **Overtime**, **Spielzeit** oder **Auszeit**.
4. **Rückgängig** nimmt einen Eintrag zurück, **Halbzeit** wechselt in die
   zweite Halbzeit.
5. **Spielende und Bestätigung** öffnet den Abschluss: beide Captains
   bestätigen, dann **Ergebnis abschicken**.

Oben rechts öffnet der Avatar das **Konto**-Menü: dort stehen die Darstellung
**Auto**, **Hell** und **Dunkel** (Auto folgt der Einstellung des Geräts) und
**Abmelden**.

**Offizielle eintragen:** Tippe in **Spiel vorbereiten** auf eine Position und
suche nach dem Nachnamen. Die Vorschläge kommen aus dem ganzen Verzeichnis, mit
Team und Lizenz. **Freitext** heißt: es ist nur ein Name gespeichert – er
braucht Vor- und Nachnamen und wird nur angeboten, wenn niemand gefunden wurde.
Wer schon in einer anderen Position steht, lässt sich nicht wählen. Eine
abgelaufene Lizenz steht als Hinweis an der Zeile und warnt beim Start, sie
sperrt ihn nicht.

Welche Positionen **Spiel vorbereiten** anbietet und wie sie heißen, bereitet
die Ligaleitung für ihre Liga vor – du wählst nur die Personen aus. Welche
Positionen als Pflicht zählen, legt sie ebenfalls fest; der Zähler oben zeigt
**4/4 besetzt**. Eine optionale Position ohne Besetzung erscheint als schmale
Zeile **Scorecard Judge hinzufügen**; sobald jemand eingetragen ist, wird daraus
eine normale Zeile.

**Spiel starten bestätigen:** Über **Spiel starten** steht die Zeile **Bereit
zum Starten**, sobald alle Pflichtangaben gesetzt sind; fehlt etwas, listet
**Angaben fehlen** genau auf, was noch fehlt. Ohne Verbindung oder bei einem
gesperrten Spiel steht dort **Start nur online** bzw. **Nur lesen**. **Spiel
starten** öffnet zuerst
eine Übersicht: Begegnung, Anstoß, Feld, Offizielle, Münzwurf gewonnen von,
erster Ballbesitz, Spielrichtung, Passcheck und Lizenzwarnungen. **Jetzt
starten** schreibt die Vorbereitung und sperrt das Spiel für dieses Gerät – eine
Spieluhr läuft in der App nicht. Fehlt eine Pflichtposition oder eine der drei
Angaben, nennt die Übersicht den Grund und der Start bleibt gesperrt. Eine
abgelaufene Lizenz warnt nur: **Trotzdem starten** startet.

## Ohne Netz

Einmal geöffnet, funktioniert die Erfassung auch ohne Verbindung: Einträge,
Rückgängig (solange nicht übertragen), Ballbesitz und Halbzeit werden auf dem
Gerät gespeichert und später in der Reihenfolge der Eingabe gesendet.

Netz brauchst du zum **Spiel starten**, zum Bearbeiten der Offiziellen, zum
**Ergebnis abschicken** und für ein Spiel, das dieses Gerät noch nie geöffnet
hat. Das Ergebnis lässt sich erst senden, wenn die Warteschlange leer ist.

Oben in der Leiste zeigt dir der Punkt den Stand der Übertragung: **Synchron**,
**N warten** oder **Offline**; ein Tipp versucht es sofort erneut. Abgelehnte
Einträge erscheinen darunter und lassen sich dort erneut versuchen oder
verwerfen.

## Zweites Gerät

Das Spiel gehört dem Gerät, das es gestartet hat. Ein zweites Gerät öffnet es
nur lesend und sagt dir auch, warum. Staff kann die Sperre freigeben, wenn ein
Gerät verloren geht.

## Häufige Fragen

**Wo ist die alte Scorecard hin?**
Sie bleibt unter `/scorecard/` unverändert erreichbar. Beide Apps schreiben
dieselben Ergebnisse.

**Warum lässt sich das Ergebnis nicht abschicken?**
Solange Einträge warten oder abgelehnt wurden, ist der Knopf gesperrt. Übertrage
oder verwerfe sie zuerst über die Anzeige oben.
