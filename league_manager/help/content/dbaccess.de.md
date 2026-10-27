# Temporärer Datenbankzugang

Diese Anleitung ist **nur für Staff** sichtbar. Du beantragst damit ein
befristetes Konto für die Produktionsdatenbank, statt ein dauerhaftes Passwort
weiterzugeben. Eine zweite Person muss zustimmen, und das Konto erlischt
spätestens nach acht Stunden von selbst.

## Zugang beantragen

1. Öffne `/dbaccess/` und klicke **New request**.
2. Trage den Zweck, die Laufzeit und – falls vorhanden – das Ticket ein. Unter
   **Tables** wählst du die Tabellen aus, die du ändern willst; lesen darfst du
   das ganze Schema.
3. Klicke **Submit for approval**. Den Kontonamen `dbeaver_prod_<dein Login>`
   vergibt LeagueSphere automatisch.
4. Eine andere Person mit der Berechtigung `dbaccess.approve_requests` öffnet
   die Anfrage und klickt **Approve**. Deine eigene Anfrage kannst du nicht
   freigeben.
5. Klicke nach der Arbeit **Revoke now**. Ohne Freigabe wird nie ein Konto
   angelegt; nach Ablauf entfernt es sich selbst.

## In DBeaver verbinden

Sobald die Anfrage **Active** ist, zeigt **Show password** die
Verbindungsdetails. Übernimm Benutzername, Datenbank und Passwort von dort – sie
gelten nur für diese eine Sitzung.

Im Reiter **Main** der Verbindung:

- URL `jdbc:mariadb://127.0.0.1:33063/<datenbank>`
- Server Host `127.0.0.1`, Port `33063`, Database aus den Verbindungsdetails
- Username `dbeaver_prod_<dein Login>`, Password aus **Show password**

<figure class="help-figure">
  <img src="/static/help/img/dbaccess-dbeaver-main.png" alt="DBeaver-Verbindungsfenster, Reiter Main, mit der JDBC-URL für 127.0.0.1:33063">
  <figcaption>Reiter <strong>Main</strong>: Adresse und Zugangsdaten der temporären Sitzung.</figcaption>
</figure>

Im Reiter **SSH** schaltest du den Tunnel ein:

- Host/IP `servy.lehel.xyz`, Port `22`
- User Name `dbeaver_tunnel`
- Authentication Method **Public Key**, Private Key auf die lokale Datei des
  Schlüssels aus Vaultwarden (`dbeaver prod tunnel key (servy)`)

<figure class="help-figure">
  <img src="/static/help/img/dbaccess-dbeaver-ssh.png" alt="DBeaver-Verbindungsfenster, Reiter SSH, mit Tunnel-Host und Public-Key-Anmeldung">
  <figcaption>Reiter <strong>SSH</strong>: Der Tunnel führt zur Datenbank auf <code>127.0.0.1</code>.</figcaption>
</figure>

**Test Connection** funktioniert erst, wenn der Tunnel steht.

## Bevor du schreibst

- Auto-Commit ausschalten und jede Änderung zuerst mit einem `SELECT` prüfen.
- Die `bak_<tabelle>_<datum>`-Kopien entstehen vor der Sitzung automatisch. Lege
  keine eigenen an – das Konto hat kein `CREATE`.
- Schreiben darfst du nur in die ausgewählten Tabellen, alles andere ist lesbar.

## Häufige Fragen

**Ich sehe `/dbaccess/` nicht.**
Die Seite verlangt einen Staff-Login. Ohne Staff-Recht bekommst du weder eine
Anfrage noch eine Freigabe.

**Warum kann ich meine eigene Anfrage nicht genehmigen?**
Zwei Personen sind der Sinn des Ablaufs: Wer fragt, entscheidet nicht.

**Das Passwort lässt sich nicht mehr anzeigen.**
Das geht nur im Zustand **Active** – also nach der Freigabe und vor Ablauf oder
**Revoke now**. Danach hilft nur eine neue Anfrage.
