# CLAUDE.md – Sakina

Hinweise für Claude Code (und Menschen), die an Sakina weiterarbeiten. Der Nutzer spricht Deutsch, also auf Deutsch antworten, locker und in du-Form.

## Was ist das?
Persönliche Wohlfühl-PWA für **einen** Nutzer (Mohammed). Vanilla HTML/CSS/JS ohne Build, ohne Framework, ohne npm-Abhängigkeiten zur Laufzeit. Optionaler Python-Server (nur Standardbibliothek) für Selbsthosting und Backups.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst: Kopfzeile, `#view`, Tab-Leiste, `#overlay`, `#toast`. Lädt `fonts.css`, `style.css`, `data.js`, `app.js` |
| `data.js` | **Feste Inhalte**: Sprüche/Verse, Skalen, Übungen (`EX`, `LADDERS`, `UNITS`), Tipps, Joggen-Stufen, Atemübungen (`CALM`, `PATTERNS`), Wissens-Themen, eingebaute Fakten, Startplan, **KI-Prompts** (`FACT_SYSTEM`, `PLAN_SYSTEM`) |
| `app.js` | Logik: Speicher (`db`), Render-Funktionen pro Tab (`renderHeute/Bewegung/Wissen/Meal`), Aktionen (`ACT`), Eingaben (`INP`), KI (`ai()`), Backup, Server-Sicherung |
| `style.css` | Design, CSS-Variablen für hell/dunkel (`[data-theme=dark]`) |
| `fonts.css`, `fonts/` | Lokale Schriften (Fraunces, Nunito, Amiri; OFL). Keine externen Schriften einbinden. |
| `sw.js` | Service Worker: Netz zuerst, sonst Cache. `/api/` wird nie gecacht. |
| `manifest.webmanifest`, `icon*` | PWA |
| `server/sakina_server.py` | Liefert nur App-Dateien (Whitelist) aus + `/api/health`, `POST /api/backup`, `GET /api/backup/latest`, `GET /api/backups` |
| `deploy/install.sh`, `deploy/update.sh` | systemd-Dienst, Update-Timer (git pull), `tailscale serve` |

## Architektur in Kürze
- Rendern = Template-Strings → `#view.innerHTML`. `render()` ruft zuerst `flushAll()` (verzögerte Speicherungen) auf und erhält Scroll-Position und offene `<details>`.
- Klicks über Delegation: `data-act="name"` → `ACT.name(el)`. Eingaben: `data-inp="name"` → `INP.name(el)` mit `later()` (verzögert speichern).
- Zustand der Oberfläche in `S` (aktiver Tab, gewählte Sportart …), Daten nur im Speicher.
- Datum immer lokal als `YYYY-MM-DD` (`today()`, `addDays()`, `dow()` mit 0 = Montag).

## Datenmodell (localStorage, Präfix `gt_`, **nie umbenennen**)
| Schlüssel | Inhalt |
|---|---|
| `d_YYYY-MM-DD` | `{scales:{sleep,energy,body,head}, proud, soul:'yes'\|'no'\|null, soulWhat, water, eaten:{fr,mi,ab,sh}, health:{steps,sleepH,rhr,ts}}` |
| `a_YYYY-MM-DD` | Array von Aktivitäten: `{type:'gym', unit:'A'..'D', sets:{exId:[{a,b}]}, stages:{push,pull}, feel}` bzw. `{type:'home'\|'box'\|'jog'\|'swim'\|'relax', done, feel, minutes, laps, checks, knee, stage}` |
| `w_YYYY-MM-DD` | `{kg}` (nur montags) |
| `k_YYYY-MM-DD` | `{facts:[{topic,title,text,tip}]}` |
| `plan`, `shop`, `favs`, `notes`, `ladders`, `jog`, `pantry`, `wish`, `homeCustom`, `planHistory` | siehe Namen |
| `settings` | `{name, theme, provider, model, baseUrl, apiKey, serverToken}`. `apiKey`/`serverToken` kommen **nie** ins Backup. |
| `srv` | Gerätestatus der Server-Sicherung (`LOCAL_ONLY`, nicht im Backup) |

Bei Sätzen: `a` = kg / Hilfe-kg, `b` = Wiederholungen / Sekunden / Meter (je nach `kind` in `EX`/`LADDERS`).
**Übungs-IDs in `EX` nicht ändern**: Daten und Import hängen daran.

### Datenänderungen = nur additiv
Die Daten liegen auf dem Handy des Nutzers, ein Fehler kann sie zerstören. Deshalb:
- Neue Felder dürfen dazukommen, alte nie umbenennen oder löschen. Beim Lesen immer Standardwerte setzen (wie `dayDoc()`).
- Wenn eine Migration unvermeidbar ist, muss sie idempotent sein und darf die alten Werte nicht löschen.
- Backups von `app: 'guter-tag'` (alter Name) weiter akzeptieren.

## Produkt-Regeln (vom Nutzer festgelegt, nicht aufweichen)
- Ton: Deutsch, du-Form, warm, locker. Keine Fachbegriffe bei Trainingssteigerung („heute etwas mehr Gewicht“).
- **Tab „Heute“: keine Kalorien, kein Gewicht, keine Körpermaße.** Meal Prep: **nirgends Kalorien**, nur grobes Protein.
- Gewicht: nur montags eintragbar, Anzeige **neutral** (kein Grün/Rot), mit dem Hinweis, dass die Zahl nichts über Kraft/Gefühl sagt.
- Koranverse nur auf Arabisch (Amiri, rechtsbündig), Quelle in ﴿ ﴾.
- Essen: streng **halal** (kein Schwein, keine Gelatine, kein Alkohol, auch nicht zum Kochen).
- Wissens-Fakten (`FACT_SYSTEM`): keine psychischen Erkrankungen/Diagnosen/Symptomlisten/Selbsttests, nichts Angstmachendes, kein Abnehmen/Aussehen. Diese Regeln im Prompt nicht abschwächen.
- Training: rücken-, knie- und schulterschonend. Kein schweres Kniebeugen mit Langhantel, kein klassisches Kreuzheben, kein Drücken über Kopf. Der Orthopäden-Hinweis bleibt unter jedem Plan.
- Meal-Prep-Schritte dürfen nie mehr Küchengeräte gleichzeitig brauchen, als er hat (siehe `PLAN_SYSTEM`).
- Barrierefreiheit: große Tipp-Flächen (≥ 44 px), `aria-label`/`aria-pressed`, Dark Mode mitdenken.
- Privatsphäre: keine externen Skripte, Schriften, Tracker oder CDNs. Persönliche Einträge nie an die KI schicken.

## Release-Checkliste (bei jeder Änderung)
1. `APP_VERSION` in `app.js` hochzählen (steht unter ⚙️ ganz unten).
2. `VERSION` in `sw.js` hochzählen (z. B. `sakina-v6`), sonst bleibt der alte Cache. Neue statische Dateien in `CORE` aufnehmen.
3. `node --check app.js data.js sw.js` und `python3 -m py_compile server/sakina_server.py`.
4. Lokal testen: `SAKINA_DATA=./data python3 server/sakina_server.py` und im Browser (Handy-Breite ~400 px, hell + dunkel) durchklicken. Mit Playwright: Konsole auf Fehler prüfen.
5. Commit auf `main` und pushen. Der Server holt es innerhalb von 2 Minuten (`sakina-update.timer`). Auf dem iPhone die App 1–2× schließen und neu öffnen.

## Server-Hinweise
- Läuft hinter `tailscale serve` auf `127.0.0.1:8787`. **Nicht** öffentlich machen (kein Tailscale Funnel), ohne vorher `SAKINA_TOKEN` zu setzen.
- Statische Auslieferung nur per Whitelist (Endungen + Ordner `""`/`fonts`). Neue Ordner mit App-Dateien in `STATIC_DIRS` eintragen.
- Backups: `SAKINA_DATA/backups/sakina-<Zeit>.json`, Rechte 600, die neuesten `SAKINA_KEEP` (90) bleiben. `apiKey` wird serverseitig zusätzlich entfernt.
- Ändert sich etwas in `server/`, startet `deploy/update.sh` den Dienst neu.

## Ideen / offene Punkte
- Kurzbefehl „Sakina Sync“: die deutschen Aktionsnamen in iOS sind nicht ganz sicher. Bei Problemen ein Beispiel vom Nutzer holen.
- Möglich: KI-Anfragen über den eigenen Server leiten (z. B. LiteLLM), damit der Schlüssel nicht im Browser liegt.
