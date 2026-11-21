#!/usr/bin/env python3
"""Sakina – kleiner Server für das Selbsthosten.

Liefert die App aus und speichert Backups auf dem eigenen Rechner.
Nur Python-Standardbibliothek, keine Pakete nötig.

Umgebungsvariablen (alle optional):
  SAKINA_HOST   Adresse zum Lauschen          (Standard: 127.0.0.1)
  SAKINA_PORT   Port                          (Standard: 8787)
  SAKINA_DATA   Ordner für Backups            (Standard: ~/.local/share/sakina)
  SAKINA_TOKEN  Wenn gesetzt, muss die App diesen Token mitschicken
  SAKINA_KEEP   Wie viele Backups behalten    (Standard: 90)

API (alle außer /api/health brauchen den Token, falls gesetzt):
  GET  /api/health              -> {"ok": true, "claude": true, ...}
  POST /api/sync                -> Abgleich App <-> Datenbank (siehe sync.py)
  GET  /api/catalog             -> Übungen, Einheiten, Stufen, Gerichte, Pläne aus der DB
  POST /api/catalog/exercise    -> {"id","action":"accept"|"reject"|"remove","unit"}
  POST /api/ai/start            -> {"job":"plan"|"analysis"|"exercises"|"fact","topic"}
  GET  /api/ai/status           -> laufende Jobs + letzte Läufe
  GET  /api/history/plans       -> alle gespeicherten Wochenpläne (kurz)
  GET  /api/history/plan?id=N   -> ein Wochenplan komplett
  POST /api/backup              -> Backup (JSON aus der App) speichern
  GET  /api/backup/latest       -> neuestes Backup
  GET  /api/backups             -> Liste der Backups
"""
import json
import mimetypes
import os
import sys
import tempfile
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import claude_jobs  # noqa: E402
import db  # noqa: E402
import sync  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent          # Repo-Ordner mit index.html
HOST = os.environ.get("SAKINA_HOST", "127.0.0.1")
PORT = int(os.environ.get("SAKINA_PORT", "8787"))
DATA = Path(os.environ.get("SAKINA_DATA", Path.home() / ".local/share/sakina")).expanduser()
TOKEN = os.environ.get("SAKINA_TOKEN", "").strip()
KEEP = int(os.environ.get("SAKINA_KEEP", "90"))
MAX_BODY = 25 * 1024 * 1024
BACKUPS = DATA / "backups"

# Nur diese Dateien werden ausgeliefert, nie .git, server/, deploy/ usw.
STATIC_EXT = {".html", ".css", ".js", ".webmanifest", ".svg", ".png", ".woff2", ".ico", ".txt"}
STATIC_DIRS = {"", "fonts"}
NO_CACHE = {".html", ".js", ".css", ".webmanifest"}

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("text/javascript", ".js")


def backup_files():
    return sorted(BACKUPS.glob("sakina-*.json"))


class Handler(BaseHTTPRequestHandler):
    server_version = "Sakina"
    sys_version = ""

    # ---------- Hilfen ----------
    def _send(self, status, body=b"", ctype="application/json; charset=utf-8", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode(), headers={"Cache-Control": "no-store"})

    def _authorized(self):
        return not TOKEN or self.headers.get("X-Sakina-Token", "") == TOKEN

    def log_message(self, fmt, *args):  # kurze Logs, keine Inhalte
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    # ---------- GET ----------
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        u = urlparse(self.path)
        path = u.path
        if "/api/" in path:
            try:
                return self._api_get(path[path.index("/api/"):], parse_qs(u.query))
            except Exception as e:  # noqa: BLE001
                return self._json(500, {"error": str(e)[:300]})
        self._static(path)

    def _api_get(self, path, q):
        if path == "/api/health":
            return self._json(200, {"ok": True, "app": "sakina", "backups": len(backup_files()), "token": bool(TOKEN),
                                    "db": True, "claude": claude_jobs.claude_available()})
        if not self._authorized():
            return self._json(401, {"error": "Token fehlt oder falsch"})
        if path == "/api/catalog":
            return self._json(200, db.catalog())
        if path == "/api/ai/status":
            return self._json(200, {"available": claude_jobs.claude_available(), "running": claude_jobs.running_jobs(),
                                    "runs": claude_jobs.last_runs(15)})
        if path == "/api/history/plans":
            return self._json(200, {"plans": [dict(r) for r in db.conn().execute(
                "SELECT id,title,valid_from,created_on,source FROM meal_plans ORDER BY id DESC")]})
        if path == "/api/history/plan":
            r = db.conn().execute("SELECT raw FROM meal_plans WHERE id=?", ((q.get("id") or ["0"])[0],)).fetchone()
            return self._json(200, json.loads(r[0])) if r else self._json(404, {"error": "Plan nicht gefunden"})
        if path == "/api/backup/latest":
            files = backup_files()
            if not files:
                return self._json(404, {"error": "Noch kein Backup auf dem Server"})
            return self._send(200, files[-1].read_bytes(), headers={"Cache-Control": "no-store"})
        if path == "/api/backups":
            return self._json(200, {"backups": [{"name": f.name, "bytes": f.stat().st_size} for f in reversed(backup_files())]})
        self._json(404, {"error": "Unbekannt"})

    def _static(self, path):
        rel = unquote(path).lstrip("/") or "index.html"
        p = (ROOT / rel).resolve()
        ok = (
            ROOT in p.parents
            and p.is_file()
            and p.suffix in STATIC_EXT
            and str(p.parent.relative_to(ROOT)).replace(".", "") in STATIC_DIRS
            and not any(part.startswith(".") for part in p.relative_to(ROOT).parts)
        )
        if not ok:
            # unbekannte Seiten -> App (wichtig für Start aus dem Homescreen)
            if "." not in rel.rsplit("/", 1)[-1]:
                p = ROOT / "index.html"
            else:
                return self._send(404, b"Nicht gefunden", "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript") or ctype.endswith("json"):
            ctype += "; charset=utf-8"
        cache = "no-cache" if p.suffix in NO_CACHE or p.name == "sw.js" else "public, max-age=604800"
        self._send(200, p.read_bytes(), ctype, {"Cache-Control": cache})

    # ---------- POST ----------
    def do_POST(self):
        path = urlparse(self.path).path
        path = path[path.index("/api/"):] if "/api/" in path else path
        routes = {"/api/backup": self._post_backup, "/api/sync": self._post_sync,
                  "/api/catalog/exercise": self._post_exercise, "/api/ai/start": self._post_ai}
        if path not in routes:
            return self._json(404, {"error": "Unbekannt"})
        if not self._authorized():
            return self._json(401, {"error": "Token fehlt oder falsch"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {"error": "Anfrage leer oder zu groß"})
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            return self._json(400, {"error": "Kein gültiges JSON"})
        try:
            routes[path](data)
        except claude_jobs.JobError as e:
            self._json(409, {"error": str(e)})
        except KeyError as e:
            self._json(404, {"error": str(e).strip("'")})
        except Exception as e:  # noqa: BLE001
            self._json(500, {"error": str(e)[:300]})

    def _post_sync(self, data):
        if not isinstance(data, dict):
            return self._json(400, {"error": "Ungültig"})
        self._json(200, sync.apply_sync(data))

    def _post_exercise(self, data):
        act = data.get("action")
        if act in ("accept", "reject"):
            sync.decide_exercise(str(data.get("id")), act == "accept", data.get("unit"))
        elif act == "remove":
            sync.remove_from_unit(str(data.get("id")), str(data.get("unit")))
        else:
            return self._json(400, {"error": "action?"})
        self._json(200, {"ok": True, "catalog": db.catalog()})

    def _post_ai(self, data):
        job = data.get("job")
        if not claude_jobs.claude_available():
            return self._json(503, {"error": "claude ist auf dem Server nicht verfügbar"})
        claude_jobs.start_job_async(job, "app", data.get("topic"))
        self._json(202, {"ok": True, "running": claude_jobs.running_jobs()})

    def _post_backup(self, data):
        if not isinstance(data, dict) or data.get("app") not in ("sakina", "guter-tag") or not isinstance(data.get("data"), dict):
            return self._json(400, {"error": "Das ist kein Sakina-Backup"})
        settings = data["data"].get("settings")
        if isinstance(settings, dict):
            settings.pop("apiKey", None)  # Schlüssel nie auf die Platte
        BACKUPS.mkdir(parents=True, exist_ok=True)
        name = "sakina-" + datetime.now().strftime("%Y-%m-%dT%H%M%S") + ".json"
        fd, tmp = tempfile.mkstemp(dir=BACKUPS, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, BACKUPS / name)
        os.chmod(BACKUPS / name, 0o600)
        files = backup_files()
        for old in files[:-KEEP] if KEEP > 0 else []:
            old.unlink(missing_ok=True)
        self._json(200, {"ok": True, "name": name, "kept": min(len(files), KEEP)})


def main():
    if not (ROOT / "index.html").exists():
        sys.exit(f"index.html nicht gefunden in {ROOT}")
    DATA.mkdir(parents=True, exist_ok=True)
    os.chmod(DATA, 0o700)
    os.environ.setdefault("SAKINA_DATA", str(DATA))
    db.migrate()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Sakina läuft auf http://{HOST}:{PORT}  ·  Backups in {BACKUPS}" + ("  ·  mit Token" if TOKEN else ""), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
