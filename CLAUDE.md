# CLAUDE.md – Sakina

Hinweise für Claude Code (und Menschen), die an Sakina weiterarbeiten. Der Nutzer spricht Deutsch, also auf Deutsch antworten, locker und in du-Form.

## Was ist das?
Persönliche Wohlfühl-PWA für **einen** Nutzer (Mohammed). Vanilla HTML/CSS/JS ohne Build, ohne Framework, ohne npm-Abhängigkeiten zur Laufzeit. Python-Server (nur Standardbibliothek) mit **SQLite-Datenbank** für Katalog + Verlauf, Sync und **Claude-Jobs** (Claude Code CLI auf dem Server).

### Grundprinzip
- **Offline-first:** Die App speichert alles zuerst im localStorage und gleicht sich mit dem Server ab, sobald er erreichbar ist. Der Server hängt am Handy-Hotspot und ist unterwegs offline, also muss die App immer ohne Server funktionieren.
- **Variable Inhalte kommen aus der Datenbank** (Übungen, Einheiten, Stufen, Zuhause-Liste, Gerichte, Wochenpläne, Analysen). `data.js` ist nur noch **Startwert/Fallback** (Seed) und für Texte, die fest bleiben (Sprüche, Atemübungen, Tipps).
- **Claude schreibt nie direkt in die DB.** Der Server baut den Kontext aus der DB, ruft `claude -p` ohne Werkzeuge auf, prüft das JSON und schreibt dann selbst.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst: Kopfzeile, `#view`, Tab-Leiste, `#overlay`, `#toast`. Lädt `fonts.css`, `style.css`, `data.js`, `app.js` |
| `data.js` | **Feste Inhalte**: Sprüche/Verse, Skalen, Übungen (`EX`, `LADDERS`, `UNITS`), Tipps, Joggen-Stufen, Atemübungen (`CALM`, `PATTERNS`), Wissens-Themen, eingebaute Fakten, Startplan, **KI-Prompts** (`FACT_SYSTEM`, `PLAN_SYSTEM`) |
| `app.js` | Logik: Speicher (`db`, `db.set` markiert für Sync), Render-Funktionen pro Tab (`renderHeute/Bewegung/Wissen/Meal`), Aktionen (`ACT`), Eingaben (`INP`), KI per API-Schlüssel (`ai()`, Fallback), Backup |
| `sync.js` | Client-Sync (`syncNow`, `markDirty`, `syncmeta`), `applyCatalog()` (DB-Katalog → `EX/LADDERS/UNITS/HOME_ITEMS`), Claude-Jobs (`runServerJob`), Karten für Vorschläge/Analysen/Plan-Verlauf |
| `style.css` | Design, CSS-Variablen für hell/dunkel (`[data-theme=dark]`) |
| `fonts.css`, `fonts/` | Lokale Schriften (Fraunces, Nunito, Amiri; OFL). Keine externen Schriften einbinden. |
| `sw.js` | Service Worker: Netz zuerst, sonst Cache. `/api/` wird nie gecacht. |
| `manifest.webmanifest`, `icon*` | PWA |
| `server/sakina_server.py` | HTTP: App-Dateien (Whitelist) + API (Liste im Datei-Kopf) |
| `server/db.py` | SQLite-Schema (`MIGRATIONS`, nur anhängen!), Seed, `catalog()` |
| `server/sync.py` | `/api/sync` (last-write-wins), Normalisierung Docs → Tabellen, Pläne speichern, Vorschläge annehmen/ablehnen |
| `server/claude_jobs.py` | Jobs `plan`, `analysis`, `exercises`, `fact`: Kontext aus DB → `claude -p --tools ""` → JSON prüfen → DB |
| `server/prompts/*.md` | System-Prompts der Jobs. `plan.md`/`fact.md` werden aus `data.js` erzeugt |
| `server/seed_catalog.json`, `tools/export_seed.js` | Seed für eine **neue** DB, erzeugt aus `data.js` (`node tools/export_seed.js`) |
| `deploy/install.sh`, `deploy/update.sh` | systemd-Dienst, Update-Timer (git pull), Claude-Timer, `tailscale serve` |

## Architektur in Kürze
- Rendern = Template-Strings → `#view.innerHTML`. `render()` ruft zuerst `flushAll()` (verzögerte Speicherungen) auf und erhält Scroll-Position und offene `<details>`.
- Klicks über Delegation: `data-act="name"` → `ACT.name(el)`. Eingaben: `data-inp="name"` → `INP.name(el)` mit `later()` (verzögert speichern).
- Zustand der Oberfläche in `S` (aktiver Tab, gewählte Sportart …), Daten nur im Speicher.
- Datum immer lokal als `YYYY-MM-DD` (`today()`, `addDays()`, `dow()` mit 0 = Montag).

## Datenmodell: App (localStorage, Präfix `gt_`, **nie umbenennen**)
| Schlüssel | Inhalt |
|---|---|
| `d_YYYY-MM-DD` | `{scales:{sleep,energy,body,head}, proud, soul:'yes'\|'no'\|null, soulWhat, water, eaten:{fr,mi,ab,sh}, health:{steps,sleepH,rhr,ts}, sore:['shoulder'\|'knee'\|'back']}` |
| `a_YYYY-MM-DD` | Array von Aktivitäten: `{type:'gym', unit:'A'..'D', sets:{exId:[{a,b}]}, stages:{push,pull}, feel, swaps:{origId:{to,reason,auto}}, skips:{origId:reason}, keep:{origId:true}}` bzw. `{type:'home'\|'box'\|'jog'\|'swim'\|'relax', done, feel, minutes, laps, checks, knee, stage}` |
| `w_YYYY-MM-DD` | `{kg}` (nur montags) |
| `k_YYYY-MM-DD` | `{facts:[{topic,title,text,tip}]}` |
| `plan`, `shop`, `favs`, `notes`, `ladders`, `jog`, `pantry`, `wish`, `homeCustom`, `planHistory`, `doctorNote` | siehe Namen |
| `settings` | `{name, theme, provider, model, baseUrl, apiKey, serverToken}`. `apiKey`/`serverToken` kommen **nie** ins Backup. |
| `srv` | Gerätestatus Server (db/claude erreichbar, Backup), `LOCAL_ONLY` |
| `syncmeta` | `{t:{key:ms}, dirty:{key:true}, seq, init, last}`, nur lokal |
| `catalog` | letzter Katalog vom Server (`/api/catalog`), nur lokal |
| `analyses` | vom Server geschrieben: letzte 12 Analysen |

Server-geschriebene Dokumente (kommen per Sync aufs Handy): `plan`, `shop`, `planHistory`, `analyses`, `k_DATUM`.

## Datenmodell: Server (SQLite `SAKINA_DATA/sakina.db`)
- **Katalog:** `exercises` (`category` gym|home, `kind`, `status` active|proposed|archived, `source` seed|claude|user), `ladder_stages`, `units` (A–D, `exercise_ids` JSON), `dishes` (fav, times_planned, last_planned), `meal_plans` (+ `plan_meals`, `prep_steps`, `shopping_items`, `raw`)
- **Verlauf:** `day_entries`, `activities`, `sets`, `weights`, `facts`, `analyses`, `ai_runs` (Protokoll jedes Claude-Laufs), `complaints` (Beschwerde-Tagebuch: checkin/swap/skip/jog_knee pro Datum + Stelle)
- **Belastung:** `exercises.loads` (`shoulder,knee,back`, leer = belastet nichts davon, `NULL` = unbekannt → nie als Ersatz), `exercises.muscle_group`. Seed-Tags kommen aus `data.js` (`loads`, `group`), `db.seed_update()` ergänzt sie idempotent bei jedem Start.
- **Sync:** `docs` (Spiegel aller App-Dokumente mit `updated_at` + `seq`), `meta` (`seq`, `catalog_version`)
- Neue Spalten/Tabellen nur als **neuer Eintrag in `MIGRATIONS`** (nie alte ändern). Neue Seed-Inhalte für bestehende DBs ebenfalls per Migration (`INSERT OR IGNORE`).
- Nach Katalog-Änderungen `db.bump_catalog(c)` aufrufen, sonst holt die App den Katalog nicht neu.

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
- Privatsphäre: keine externen Skripte, Schriften, Tracker oder CDNs. Über den API-Schlüssel (Handy → Anbieter) gehen nie persönliche Einträge. Claude auf dem Server bekommt für Analysen Tageswerte (Skalen, Wasser, Bewegung, Schritte, Gegessen), aber **keine Stolz-Texte und kein Gewicht**.
- Neue Übungen von Claude sind immer `proposed` und brauchen die Bestätigung des Nutzers. Verbotene Übungen filtert zusätzlich `FORBIDDEN` in `claude_jobs.py`.

## Schonen & Ersetzen (Gesundheit)
Vorgeschichte: Meniskus (Knie), Bandscheibe (Rücken), aktuell Schulterbeschwerden.
- „Was zwickt heute?“ (`d.sore`) → `unitPlan()` ersetzt Übungen, deren `loads` die Stelle treffen, automatisch (gleiche Muskelgruppe, sonst Rumpf). `gymRecommend()` wählt dann die schonendste Einheit.
- „↔ Ersetzen / auslassen“ pro Übung mit Grund. Sätze werden unter der **Ersatz-ID** gespeichert, die Original-ID steht in `swaps`.
- „🩺 Für den Orthopäden“: `complaintsReport()`/`complaintsText()` (8 Wochen, lokal berechnet, teilbar).
- Claude-Übungs-Check bekommt `beschwerden_8_wochen`. Vorschläge müssen `loads` angeben und werden verworfen, wenn sie eine Stelle belasten, die in 4 Wochen an ≥ 2 Tagen gezwickt hat.
- Neue Übungen immer mit ehrlichem `loads` taggen (lieber eine Stelle zu viel).

## Release-Checkliste (bei jeder Änderung)
1. `APP_VERSION` in `app.js` hochzählen (steht unter ⚙️ ganz unten).
2. `VERSION` in `sw.js` hochzählen (z. B. `sakina-v6`), sonst bleibt der alte Cache. Neue statische Dateien in `CORE` aufnehmen.
3. `node --check app.js data.js sw.js` und `python3 -m py_compile server/sakina_server.py`.
4. Lokal testen: `SAKINA_DATA=./data python3 server/sakina_server.py` und im Browser (Handy-Breite ~400 px, hell + dunkel) durchklicken. Mit Playwright: Konsole auf Fehler prüfen. Claude-Jobs ohne echtes Claude testen: `SAKINA_CLAUDE=/pfad/zu/fake-claude` (ein Skript, das `{"result":"<json>"}` ausgibt). Offline testen: `/api/**` blockieren, App muss weiterlaufen und danach nachsynchronisieren.
   Wenn `data.js` (Übungen, Startplan, Prompts) geändert wurde: `node tools/export_seed.js`.
5. Commit auf `main` und pushen. Der Server holt es innerhalb von 2 Minuten (`sakina-update.timer`). Auf dem iPhone die App 1–2× schließen und neu öffnen.

## Server-Hinweise
- Läuft hinter `tailscale serve` auf `127.0.0.1:8787`. **Nicht** öffentlich machen (kein Tailscale Funnel), ohne vorher `SAKINA_TOKEN` zu setzen.
- Statische Auslieferung nur per Whitelist (Endungen + Ordner `""`/`fonts`). Neue Ordner mit App-Dateien in `STATIC_DIRS` eintragen.
- Backups: `SAKINA_DATA/backups/sakina-<Zeit>.json`, Rechte 600, die neuesten `SAKINA_KEEP` (90) bleiben. `apiKey` wird serverseitig zusätzlich entfernt.
- Ändert sich etwas in `server/`, startet `deploy/update.sh` den Dienst neu.

## Claude-Jobs
- Aufruf: `claude -p --output-format json --tools "" --permission-mode dontAsk --strict-mcp-config --system-prompt-file …`, Eingabe per stdin, in einem leeren Temp-Ordner. **Keine Werkzeuge freischalten.**
- Per App: `POST /api/ai/start {job}` → Thread, Status über `GET /api/ai/status`. Per Timer: `sakina-job@plan|analysis|exercises` (Fr 18:00, So 19:00, am 1. um 10:00).
- Manuell auf dem Server: `python3 server/claude_jobs.py analysis` (mit `SAKINA_DATA` aus `/etc/sakina.env`).
- Protokoll: Tabelle `ai_runs` bzw. `journalctl -u sakina-job@plan`.

## Ideen / offene Punkte
- Kurzbefehl „Sakina Sync“: die deutschen Aktionsnamen in iOS sind nicht ganz sicher. Bei Problemen ein Beispiel vom Nutzer holen.
- Möglich: KI-Anfragen über den eigenen Server leiten (z. B. LiteLLM), damit der Schlüssel nicht im Browser liegt.
