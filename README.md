# Sakina (سكينة)

Persönliche Wohlfühl- und Alltags-App als **PWA** (installierbare Web-App).
Im Mittelpunkt steht, wie man sich fühlt und was der Körper leistet, nicht Kalorien oder Aussehen.

- **☀️ Heute**: Begrüßung mit Tagesspruch/Koranvers, 4 Fragen (1–5), Stolz-Moment, „etwas für die Seele“, Wasser mit wachsender Pflanze
- **🤸 Bewegung**: Gym (A–D, Empfehlung, Auto-Speichern, Satz 1 überträgt sich, **„Was zwickt heute?“ mit automatischem Ersatz**, ↔ Ersetzen/Auslassen, **Übersicht für den Orthopäden**), Zuhause, Boxen, Joggen (8 Stufen), Schwimmen, Entspannung, Daten vom iPhone (Schritte/Schlaf/Ruhepuls), Wiegen (nur montags), Monats-Rückblick, Import aus der alten App
- **🧠 Wissen**: 8 Übungen zum Kopf-Beruhigen (3 davon geführt), Fakt des Tages (KI oder eingebaut)
- **🍲 Meal Prep**: Gegessen-Checkliste, Wochenplan mit Protein, Prep-Schritte mit Geräten, Einkaufsliste, KI-Wochenplan, Lieblingsgerichte

Reines HTML/CSS/JavaScript, **kein Build-Schritt, keine Abhängigkeiten**. Der Server braucht nur Python 3 und speichert alles in einer **SQLite-Datenbank**.

### Datenbank & Claude (auf deinem Server)
- **Offline-first:** Du kannst immer eintragen, auch ohne Server. Sobald der Server erreichbar ist, gleicht die App alles mit der Datenbank ab (⚙️ zeigt den Status).
- **Variable Inhalte aus der Datenbank:** Übungen, Gym-Einheiten, Stufen, Zuhause-Liste, Gerichte, Wochenpläne, Analysen, alles mit Datum, damit du den Verlauf siehst.
- **Claude Code auf dem Server** (dein Abo, kein API-Schlüssel nötig):
  - **Freitag 18 Uhr:** neuer Meal-Prep-Plan aus Verlauf, Vorrat, Wunsch und Lieblingsgerichten
  - **Sonntag 19 Uhr:** Wochen-Auswertung (Schlaf, Energie, Bewegung, Essen, stärkend, ohne Gewicht)
  - **Am 1. jedes Monats:** Übungs-Check mit Vorschlägen für neue Übungen. Die landen als **Vorschlag**, du bestätigst sie in der App.
  - Alles auch per Knopf in der App. Fakt des Tages kommt ebenfalls von Claude.
- Claude bekommt dabei **keine Werkzeuge**: Der Server gibt ihm die Daten als Text, prüft die Antwort und schreibt selbst in die Datenbank.

---

## Datenschutz: wo liegen die Daten?

| Was | Wo |
|---|---|
| Alle Einträge | **auf dem Handy**, im Speicher der App (localStorage, Schlüssel beginnen mit `gt_`) |
| Datenbank (Katalog + Verlauf) | **auf deinem eigenen Server**: `/var/lib/sakina/sakina.db` |
| Automatische Sicherung | **auf deinem eigenen Server**, Ordner `/var/lib/sakina/backups` |
| Claude-Auswertungen | laufen über dein Claude-Abo auf dem Server. Claude bekommt Tageswerte, aber keine Stolz-Texte und kein Gewicht. |
| Schriften | liegen in `fonts/`, **keine Anfragen an Google** |
| KI (optional) | Nur Fakt des Tages und Wochenplan gehen an den KI-Anbieter, den du unter ⚙️ einträgst. Es wird nur das Thema bzw. Vorrat/Wunsch geschickt, **nie** Stimmung, Stolz oder Gewicht. |
| API-Schlüssel | nur auf dem Gerät, **nie** in Backups und nie auf dem Server |

**Daten gehen verloren, wenn** du das App-Icon vom Home-Bildschirm löschst, die Adresse der App sich ändert, oder Safari-Website-Daten gelöscht werden.
→ Deshalb die Server-Sicherung nutzen oder ab und zu ⚙️ → „Backup exportieren“.

---

## Auf dem eigenen Server betreiben (Ubuntu + Tailscale)

Ergebnis: Die App läuft unter einer HTTPS-Adresse wie `https://server.tailXXXX.ts.net`, die **nur deine eigenen Geräte** erreichen. Neue Versionen aus GitHub kommen automatisch, und deine Daten werden automatisch auf den Server gesichert.

### 1. Vorbereiten (einmalig)
- Tailscale läuft auf dem Server und auf dem iPhone.
- Tailscale-Admin-Konsole → **DNS** → MagicDNS an → **HTTPS Certificates: Enable**.

### 2. Lesezugriff auf das Repo (Deploy Key)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/sakina_deploy -N ""
cat ~/.ssh/sakina_deploy.pub        # → GitHub: Repo → Settings → Deploy keys → Add (ohne Schreibrecht)
cat >> ~/.ssh/config <<'EOF'
Host github-sakina
  HostName github.com
  IdentityFile ~/.ssh/sakina_deploy
EOF
```

### 3. Claude Code auf dem Server (für Pläne, Analysen, Übungen)
Als **derselbe Benutzer**, der Sakina laufen lässt:
```bash
claude            # einmal starten und mit deinem Abo einloggen, dann /exit
claude -p "sag hallo"    # muss antworten
```

### 4. Holen und installieren
```bash
sudo mkdir -p /srv/sakina && sudo chown $USER /srv/sakina
git clone git@github-sakina:MohammedAltarkawi/sakina.git /srv/sakina
cd /srv/sakina && ./deploy/install.sh
```
Das Skript richtet ein:
- `sakina.service`: der Server (`server/sakina_server.py`) auf `127.0.0.1:8787`, startet automatisch
- `sakina-update.timer`: holt alle 2 Minuten Neues von GitHub (`deploy/update.sh`)
- `sakina-job-plan/analysis/exercises.timer`: Claude-Jobs (Fr, So, monatlich)
- `tailscale serve`: HTTPS nach außen, nur im eigenen Tailnet
- `/etc/sakina.env`: Einstellungen (Port, Datenordner, optional Token)

### 5. Aufs iPhone
1. **Vorher** in der alten App: ⚙️ → „Backup exportieren“
2. Die `ts.net`-Adresse in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**
3. In der neuen App: ⚙️ → „Backup importieren“
4. Ab jetzt sichert die App sich selbst auf den Server (beim Öffnen, höchstens alle 30 Min).

### Nützliche Befehle
```bash
systemctl status sakina                 # läuft der Server?
journalctl -u sakina -n 50              # Logs
journalctl -u sakina-update -n 20       # letzte Updates
ls -lh /var/lib/sakina/backups          # Sicherungen (die letzten 90 bleiben)
tailscale serve status                  # HTTPS-Adresse
sudo systemctl start sakina-job@analysis   # Claude-Job sofort laufen lassen (plan | analysis | exercises)
journalctl -u sakina-job@plan -n 30        # Log eines Claude-Jobs
systemctl list-timers 'sakina*'            # wann die Jobs das nächste Mal laufen
sqlite3 /var/lib/sakina/sakina.db '.tables'   # in die Datenbank schauen
sudo systemctl restart sakina           # neu starten
```

### Optional: Token
In `/etc/sakina.env` `SAKINA_TOKEN=etwas-langes-zufälliges` setzen → `sudo systemctl restart sakina` → denselben Token in der App unter ⚙️ → „Server-Token“ eintragen.

### Sicherungen wiederherstellen
- In der App: ⚙️ → „Vom Server wiederherstellen“ (nimmt die neueste Sicherung)
- Ältere Sicherung: Datei aus `/var/lib/sakina/backups/` aufs Handy holen → ⚙️ → „Backup importieren“

---

## Lokal starten (zum Entwickeln)
```bash
SAKINA_DATA=./data python3 server/sakina_server.py     # → http://127.0.0.1:8787
```
Ein reiner Static-Server reicht auch (`python3 -m http.server`). Dann gibt es aber keine Server-Sicherung.

---

## Gesundheitsdaten vom iPhone
Web-Apps dürfen Apple Health nicht direkt lesen. Deshalb gibt es einen Kurzbefehl („Sakina Sync“), der Werte aus Health in die Zwischenablage kopiert, im Format:
```
SAKINA
schritte=8432
ruhepuls=58
schlaf=7,3
```
Optional `datum=2026-11-20`. Schlaf darf in Stunden, Minuten oder Sekunden kommen.
In der App: **Bewegung → „Gesundheitsdaten einfügen“**.

---

## KI einrichten (optional)
⚙️ → Anbieter (Anthropic / OpenAI / OpenAI-kompatibel mit Basis-URL), Schlüssel, Modell → „Verbindung testen“.
Ohne Schlüssel läuft alles, mit eingebauten Fakten und dem Startplan.
Bei einem eigenen OpenAI-kompatiblen Server (z. B. LiteLLM) muss dieser CORS für die App-Adresse erlauben.

---

## Mit Claude Code weiterentwickeln
Alle Regeln, die Architektur und die Release-Checkliste stehen in **[CLAUDE.md](CLAUDE.md)**. Claude Code liest die Datei automatisch.
