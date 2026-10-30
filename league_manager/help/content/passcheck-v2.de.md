# Passcheck Passcheck v2

Die Passcheck v2 ist die schnelle Passkontrolle fürs Handy. Sie läuft parallel
zur klassischen Passcheck-Ansicht unter `/passcheck/` und schreibt denselben
Kader und dieselbe Prüfung.

<figure class="help-figure">
  <img src="/static/help/img/passcheck-v2.png" alt="Passcheck v2 mit Kader, Trikotnummern und geprüften Spielern">
  <figcaption>Ein Tipp prüft einen Spieler; die Trikotnummer öffnet die Spielerakte.</figcaption>
</figure>

## Kader prüfen

1. Öffne **Team → Passcheck v2** oder den Link **Passcheck v2** an einem Spiel.
2. Tippe auf einen Spieler, um ihn zu prüfen. Tippe erneut, um die Prüfung
   rückgängig zu machen; der Hinweis **Rückgängig** bleibt fünf Sekunden.
3. Tippe auf die **Trikotnummer**, um sie zu ändern. Bereits vergebene Nummern
   werden übersprungen.
4. Mit **Prüfung abschließen** trägst du **Abgenommen durch** und optional eine
   Anmerkung ein und speicherst die Passliste.

Spieler mit einem Prüfhinweis (z. B. maximale Spieltage erreicht) lassen sich
nicht direkt abhaken. Die Spielerakte zeigt den Grund; dort wird die Prüfung
bewusst bestätigt oder abgebrochen.

## Foto und Datenschutz

- Ein Passfoto wird nur angezeigt, wenn eine Einwilligung hinterlegt ist.
- Nur Offizielle des jeweiligen Spieltags können das Foto abrufen.
- Das Foto wird nicht im Browser-Cache gespeichert und verlässt die App nicht.

## Ohne Netz

Prüfungen werden lokal gepuffert, wenn das Netz am Platz fehlt. Ein Hinweis
zeigt wartende Einträge; sobald das Netz zurück ist, werden sie in der
Reihenfolge der Eingabe übertragen. Solange Einträge warten, ist der Abschluss
gesperrt.

## Gut zu wissen

- Die Mindestspielstärke wird vor dem Speichern geprüft.
- Ein zweites Gerät kann dieselbe Passliste nicht parallel führen; es sieht
  einen Hinweis und bleibt lesend.
- Die klassische Ansicht bleibt unverändert erreichbar.
