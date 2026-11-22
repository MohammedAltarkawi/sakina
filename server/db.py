"""Sakina – SQLite-Datenbank.

Zwei Bereiche:
  Katalog  (was die App anbietet, variabel, auch von Claude erweiterbar)
           exercises, ladder_stages, units, dishes, meal_plans, plan_meals, prep_steps, shopping_items
  Verlauf  (was du gemacht hast, mit Datum)
           day_entries, activities, sets, weights, facts, analyses, ai_runs
  Sync     docs  (Spiegel der App-Dokumente, last-write-wins, mit seq für den Abgleich)

Schema-Änderungen nur additiv über MIGRATIONS (PRAGMA user_version).
"""
import json
import os
import sqlite3
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
_local = threading.local()
_write_lock = threading.Lock()

MIGRATIONS = [
    # v1
    """
    CREATE TABLE docs (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL,
      seq INTEGER NOT NULL, origin TEXT NOT NULL DEFAULT 'app');
    CREATE INDEX docs_seq ON docs(seq);
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);

    CREATE TABLE exercises (
      id TEXT PRIMARY KEY, category TEXT NOT NULL,              -- gym | home
      name TEXT NOT NULL, kind TEXT NOT NULL,                    -- kg | bw | sec | assist | dist | check | ladder
      sets INTEGER, lo INTEGER, hi INTEGER, side INTEGER DEFAULT 0, side_word TEXT, hint TEXT,
      status TEXT NOT NULL DEFAULT 'active',                     -- active | proposed | archived
      source TEXT NOT NULL DEFAULT 'seed',                       -- seed | claude | user
      reason TEXT, suggested_unit TEXT, sort INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE ladder_stages (
      ladder_id TEXT NOT NULL, stage INTEGER NOT NULL, name TEXT NOT NULL,
      sets INTEGER, lo INTEGER, hi INTEGER, kind TEXT NOT NULL,
      PRIMARY KEY (ladder_id, stage));
    CREATE TABLE units (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sub TEXT, exercise_ids TEXT NOT NULL, updated_at INTEGER NOT NULL);

    CREATE TABLE dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, slot TEXT, description TEXT,
      protein INTEGER, fav INTEGER DEFAULT 0, source TEXT DEFAULT 'seed',
      first_planned TEXT, last_planned TEXT, times_planned INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, valid_from TEXT, created_on TEXT NOT NULL,
      source TEXT NOT NULL, fruit TEXT, note TEXT, pantry TEXT, wish TEXT, raw TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE plan_meals (
      plan_id INTEGER NOT NULL, pos INTEGER NOT NULL, slot TEXT, time TEXT, what TEXT, protein INTEGER, dish_id INTEGER);
    CREATE TABLE prep_steps (plan_id INTEGER NOT NULL, pos INTEGER NOT NULL, step TEXT, tools TEXT);
    CREATE TABLE shopping_items (plan_id INTEGER NOT NULL, grp TEXT, item TEXT, checked INTEGER DEFAULT 0);

    CREATE TABLE day_entries (
      date TEXT PRIMARY KEY, sleep INTEGER, energy INTEGER, body INTEGER, head INTEGER,
      proud TEXT, soul TEXT, soul_what TEXT, water INTEGER,
      eaten_fr INTEGER, eaten_mi INTEGER, eaten_ab INTEGER, eaten_sh INTEGER,
      steps INTEGER, sleep_h REAL, rhr INTEGER, updated_at INTEGER NOT NULL);
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL, unit TEXT,
      done INTEGER, feel INTEGER, minutes REAL, laps INTEGER, knee TEXT, stage INTEGER, extra TEXT);
    CREATE INDEX activities_date ON activities(date);
    CREATE TABLE sets (
      activity_id INTEGER NOT NULL, date TEXT NOT NULL, exercise_id TEXT NOT NULL, stage INTEGER,
      set_no INTEGER NOT NULL, a REAL, b REAL);
    CREATE INDEX sets_ex ON sets(exercise_id, date);
    CREATE TABLE weights (date TEXT PRIMARY KEY, kg REAL NOT NULL);
    CREATE TABLE facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, topic TEXT, title TEXT NOT NULL,
      text TEXT, tip TEXT, source TEXT DEFAULT 'app');
    CREATE INDEX facts_date ON facts(date);

    CREATE TABLE analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, period_from TEXT, period_to TEXT,
      title TEXT, body TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE ai_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, trigger TEXT NOT NULL,
      status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
      error TEXT, result_ref TEXT, input_chars INTEGER, output_chars INTEGER);
    """,
    # v2: Belastung (Schulter/Knie/Rücken) + Muskelgruppe pro Übung, Beschwerde-Tagebuch
    """
    ALTER TABLE exercises ADD COLUMN loads TEXT;          -- z. B. "shoulder,back"
    ALTER TABLE exercises ADD COLUMN muscle_group TEXT;   -- push | pull | legs | core | arms | shoulders | carry | home
    CREATE TABLE complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, region TEXT,
      action TEXT NOT NULL,                               -- checkin | swap | skip | jog_knee
      exercise_id TEXT, replacement_id TEXT, source TEXT NOT NULL);
    CREATE INDEX complaints_date ON complaints(date);
    """,
    # v3: Gerichte, die er nicht mag (beim Austauschen markiert)
    """
    ALTER TABLE dishes ADD COLUMN disliked INTEGER DEFAULT 0;
    """,
]


def data_dir():
    return Path(os.environ.get("SAKINA_DATA", Path.home() / ".local/share/sakina")).expanduser()


def db_path():
    return data_dir() / "sakina.db"


def now_ms():
    return int(time.time() * 1000)


def conn():
    """Eine Verbindung pro Thread."""
    c = getattr(_local, "conn", None)
    if c is None:
        data_dir().mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(db_path(), timeout=30)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA busy_timeout=30000")
        _local.conn = c
    return c


class tx:
    """Schreib-Transaktion (serialisiert über ein Lock)."""
    def __enter__(self):
        _write_lock.acquire()
        self.c = conn()
        self.c.execute("BEGIN IMMEDIATE")
        return self.c

    def __exit__(self, et, ev, tb):
        try:
            if et:
                self.c.execute("ROLLBACK")
            else:
                self.c.execute("COMMIT")
        finally:
            _write_lock.release()
        return False


def migrate():
    c = conn()
    v = c.execute("PRAGMA user_version").fetchone()[0]
    for i, sql in enumerate(MIGRATIONS[v:], start=v + 1):
        with _write_lock:
            c.executescript("BEGIN;" + sql + f";PRAGMA user_version={i};COMMIT;")
    if v == 0:
        seed()
    seed_update()
    os.chmod(db_path(), 0o600)


# ---------------------------------------------------------------- Meta / seq
def next_seq(c):
    row = c.execute("SELECT v FROM meta WHERE k='seq'").fetchone()
    s = int(row[0]) + 1 if row else 1
    c.execute("INSERT INTO meta(k,v) VALUES('seq',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (str(s),))
    return s


def bump_catalog(c):
    c.execute("INSERT INTO meta(k,v) VALUES('catalog_version',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (str(now_ms()),))


def meta(k, default=None):
    row = conn().execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
    return row[0] if row else default


# ---------------------------------------------------------------- Seed
def seed():
    s = json.loads((HERE / "seed_catalog.json").read_text(encoding="utf-8"))
    t = now_ms()
    with tx() as c:
        for i, e in enumerate(s["exercises"]):
            c.execute("""INSERT OR IGNORE INTO exercises(id,category,name,kind,sets,lo,hi,side,side_word,hint,status,source,sort,created_at,updated_at)
                         VALUES(?,?,?,?,?,?,?,?,?,?, 'active','seed',?,?,?)""",
                      (e["id"], e["category"], e["name"], e["kind"], e.get("sets"), e.get("lo"), e.get("hi"),
                       1 if e.get("side") else 0, e.get("sideWord"), e.get("hint"), e.get("sort", i), t, t))
        for l in s["ladders"]:
            c.execute("""INSERT OR IGNORE INTO exercises(id,category,name,kind,status,source,created_at,updated_at)
                         VALUES(?, 'gym', ?, 'ladder', 'active', 'seed', ?, ?)""", (l["id"], l["name"], t, t))
            for n, st in enumerate(l["stages"], start=1):
                c.execute("INSERT OR IGNORE INTO ladder_stages VALUES(?,?,?,?,?,?,?)",
                          (l["id"], n, st["n"], st["sets"], st["lo"], st["hi"], st["kind"]))
        for u in s["units"]:
            c.execute("INSERT OR IGNORE INTO units VALUES(?,?,?,?,?)", (u["id"], u["name"], u["sub"], json.dumps(u["ex"]), t))
        for d in s["dishes"]:
            c.execute("INSERT OR IGNORE INTO dishes(name,slot,description,protein,source,created_at) VALUES(?,?,?,?, 'seed', ?)",
                      (d["name"], d["slot"], d["description"], d["protein"], t))
        bump_catalog(c)


def seed_update():
    """Idempotent bei jedem Start: neue Seed-Übungen ergänzen, fehlende Tags setzen.
    Ändert nie etwas, das schon gesetzt ist (archivierte Übungen bleiben archiviert)."""
    s = json.loads((HERE / "seed_catalog.json").read_text(encoding="utf-8"))
    t = now_ms()
    changed = False
    with tx() as c:
        for i, e in enumerate(s["exercises"]):
            cur = c.execute("""INSERT OR IGNORE INTO exercises(id,category,name,kind,sets,lo,hi,side,side_word,hint,status,source,sort,created_at,updated_at)
                               VALUES(?,?,?,?,?,?,?,?,?,?, 'active','seed',?,?,?)""",
                            (e["id"], e["category"], e["name"], e["kind"], e.get("sets"), e.get("lo"), e.get("hi"),
                             1 if e.get("side") else 0, e.get("sideWord"), e.get("hint"), e.get("sort", i), t, t))
            changed |= cur.rowcount > 0
        for e in s["exercises"] + s["ladders"]:
            cur = c.execute("UPDATE exercises SET loads=?, muscle_group=?, updated_at=? WHERE id=? AND loads IS NULL",
                            (",".join(e.get("loads") or []), e.get("group"), t, e["id"]))
            changed |= cur.rowcount > 0
        if changed:
            bump_catalog(c)


# ---------------------------------------------------------------- Katalog lesen
def catalog():
    c = conn()
    ex = [dict(r) for r in c.execute("SELECT * FROM exercises WHERE status != 'archived' ORDER BY category, sort, created_at")]
    stages = {}
    for r in c.execute("SELECT * FROM ladder_stages ORDER BY ladder_id, stage"):
        stages.setdefault(r["ladder_id"], []).append({"n": r["name"], "sets": r["sets"], "lo": r["lo"], "hi": r["hi"], "kind": r["kind"]})
    units = [{"id": r["id"], "name": r["name"], "sub": r["sub"], "ex": json.loads(r["exercise_ids"])}
             for r in c.execute("SELECT * FROM units ORDER BY id")]
    dishes = [dict(r) for r in c.execute("SELECT * FROM dishes ORDER BY fav DESC, last_planned DESC, name")]
    plans = [dict(r) for r in c.execute(
        "SELECT id,title,valid_from,created_on,source FROM meal_plans ORDER BY id DESC LIMIT 30")]
    return {"version": meta("catalog_version", "0"), "exercises": ex, "ladders": stages, "units": units,
            "dishes": dishes, "plans": plans}
