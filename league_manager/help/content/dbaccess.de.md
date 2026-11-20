# Temporärer Datenbankzugang

Diese Anleitung ist **nur für Staff** sichtbar. Du beantragst damit ein
befristetes Konto für die Produktionsdatenbank, statt ein dauerhaftes Passwort
weiterzugeben. Normalerweise muss eine zweite Person zustimmen, und das Konto
erlischt spätestens nach acht Stunden von selbst.

## Zugang beantragen

1. Öffne `/dbaccess/` und klicke **New request**.
2. Trage den Zweck, die Laufzeit und – falls vorhanden – das Ticket ein. Unter
   **Tables** wählst du die Tabellen aus, die du ändern willst. Lesen darfst du
   alle Tabellen der Freigabeliste – **nicht** das ganze Schema: Identitäten,
   Sitzungen, Tokens und der Zugangs-Verlauf bleiben ausgenommen.
3. Unter **What it may do** stehen zwei Kästchen, beide standardmäßig aus:
   **INSERT** erlaubt neue Zeilen, **DELETE** erlaubt das Löschen von Zeilen –
   jeweils nur in den ausgewählten Tabellen. Ohne Haken bleibt es bei
   **Lesen + UPDATE**, wie bisher.
4. Klicke **Submit for approval**. Den Kontonamen `dbeaver_prod_<dein Login>`
   vergibt LeagueSphere automatisch.
5. Üblicherweise öffnet eine andere Person mit der Berechtigung
   `dbaccess.approve_requests` die Anfrage und klickt **Approve**. Sie sieht
   dabei die volle Rechte-Menge („Lesen + UPDATE“, „+ INSERT“, „+ DELETE“) –
   auch **DELETE** ist als irreversibel markiert. Hast du diese Berechtigung
   selbst (oder bist Superuser), kannst du die eigene Anfrage über
   **Approve my own request** freigeben – mit Pflicht-Begründung. Im Verlauf
   steht dann `self-approved` statt `approve`; die Rechte-Menge steht in beiden
   Fällen im Ereignis. Für INSERT und DELETE gelten dieselben Regeln, es gibt
   keine zusätzliche zweite Unterschrift.
6. Klicke nach der Arbeit **Revoke now**. Ohne Freigabe wird nie ein Konto
   angelegt; nach Ablauf entfernt es sich selbst.

## In DBeaver verbinden

Sobald die Anfrage **Active** ist, zeigt **Show password** die
Verbindungsdetails. Übernimm Benutzername, Datenbank und Passwort von dort – sie
gelten nur für diese eine Sitzung. Den Knopf siehst **nur du** als
antragstellende Person: Genehmiger, andere Staff-Accounts und Admins können das
Passwort nicht abrufen.

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
- Die `bak_<tabelle>_<datum>`-Kopien entstehen vor der Sitzung automatisch. Ist der
  Tabellenname zu lang für MariaDBs Grenze von 64 Zeichen, heißt die Kopie
  `bak_<gekürzt>_<hash>_<datum>`. Lege keine eigenen an – das Konto hat kein `CREATE`.
- Das Konto darf **nur** die ausgewählten Tabellen schreiben, und dort genau die
  beantragte Rechte-Menge: immer `UPDATE`, zusätzlich `INSERT` und/oder `DELETE`,
  wenn angehakt. Alle anderen Tabellen der Freigabeliste sind nur lesbar.

## INSERT, DELETE und der Weg zurück

- **INSERT** legt neue Zeilen an. Diese Zeilen stehen **nicht** in der
  Sicherungskopie – sie existierte schon vor dem Einfügen. Ein falsch
  eingefügter Datensatz muss also von Hand korrigiert oder gelöscht werden
  (Löschen nur, wenn DELETE mitbeantragt wurde).
- **DELETE** entfernt Zeilen. Das ist der einzige Schritt ohne automatischen
  Rückweg: Die `bak_<tabelle>_<datum>`-Kopie ist die einzige Sicherung, und die
  Wiederherstellung ist ein manuelles `INSERT … SELECT` daraus. Fremdschlüssel
  können mit einem `DELETE` weitere Zeilen mitreißen – prüfe die Zeilenzahl
  vorher mit demselben `SELECT`, das du zum Eingrenzen benutzt.
- Beide Rechte gelten nur für diese eine Sitzung und nur für die auf dem Antrag
  gewählten Tabellen. Eine neue Sitzung ist ein neuer Antrag.

## Häufige Fragen

**Ich sehe `/dbaccess/` nicht.**
Die Seite verlangt einen Staff-Login. Ohne Staff-Recht bekommst du weder eine
Anfrage noch eine Freigabe.

**Was bedeutet `self-approved` im Verlauf?**
Du hast deine eigene Anfrage freigegeben. Das darf, wer freigeben darf, verlangt
aber eine Begründung und wird ohne zweite Unterschrift protokolliert. Als
Genehmiger steht dabei nie der Antragsteller – es fehlt also bewusst eine zweite
Person.

**Was bedeutet „Read + UPDATE + INSERT + DELETE“?**
Das ist die Rechte-Menge, die der Genehmiger freigibt: Lesen und UPDATE auf den
gewählten Tabellen, dazu die ausdrücklich angehakten Rechte. Ohne Haken steht
dort nur „Read + UPDATE“. Fehlt `INSERT` oder `DELETE` in der Anzeige, hat das
Konto dieses Recht auch nicht.

**Das Passwort lässt sich nicht mehr anzeigen.**
Das geht nur im Zustand **Active** – also nach der Freigabe und vor Ablauf oder
**Revoke now**. Danach hilft nur eine neue Anfrage.
