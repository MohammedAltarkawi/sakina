"""Sakina – Abgleich App <-> Datenbank.

Die App bleibt offline-fähig: Sie speichert alles lokal (localStorage) und schickt
geänderte Dokumente an /api/sync. Der Server
  1. speichert sie im Spiegel `docs` (last-write-wins nach Zeitstempel),
  2. überträgt sie in die Verlaufs-Tabellen (day_entries, activities, sets, …),
  3. schickt alles zurück, was sich seit dem letzten Abgleich auf dem Server geändert hat
     (z. B. ein neuer Wochenplan oder eine Analyse von Claude).
"""
import json
import re

import db

KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
NOT_SYNCED = {"settings", "srv", "catalog", "sync", "syncmeta"}
DATE_KEY = re.compile(r"^([dawk])_(\d{4}-\d{2}-\d{2})$")


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


def _int(v):
    n = _num(v)
    return int(round(n)) if n is not None else None


# ------------------------------------------------------------ Dokumente
def put_doc(c, key, value, t=None, origin="server"):
    """Schreibt ein Dokument (vom Server oder der App) und überträgt es in die Tabellen."""
    t = t or db.now_ms()
    seq = db.next_seq(c)
    c.execute("""INSERT INTO docs(key,value,updated_at,seq,origin) VALUES(?,?,?,?,?)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at,
                 seq=excluded.seq, origin=excluded.origin""",
              (key, json.dumps(value, ensure_ascii=False), t, seq, origin))
    normalize(c, key, value)
    return seq


def get_doc(key, default=None):
    row = db.conn().execute("SELECT value FROM docs WHERE key=?", (key,)).fetchone()
    return json.loads(row[0]) if row else default


def apply_sync(payload):
    since = int(payload.get("since") or 0)
    incoming = payload.get("docs") or []
    rejected = []
    accepted = 0
    sent_keys = set()
    with db.tx() as c:
        for d in incoming[:5000]:
            k, v, t = d.get("k"), d.get("v"), int(d.get("t") or 0)
            if not isinstance(k, str) or not KEY_RE.match(k) or k in NOT_SYNCED:
                continue
            row = c.execute("SELECT updated_at, value, origin FROM docs WHERE key=?", (k,)).fetchone()
            if k.startswith("d_") and row and isinstance(v, dict) and not (row[2] == "app" and row[0] > t):
                # Tagesdokument: alles von der App, nur „health“ kann auch vom Server (Kurzbefehl) kommen.
                srv = json.loads(row[1]) or {}
                hs, ha = srv.get("health") or {}, v.get("health") or {}
                merged = dict(v)
                if hs and (hs.get("ts") or 0) > (ha.get("ts") or 0):
                    merged["health"] = {**ha, **hs}
                put_doc(c, k, merged, max(t, row[0]) + (1 if merged != v else 0), origin="app")
                if merged == v:
                    sent_keys.add(k)          # App hat schon den vollen Stand
                accepted += 1
                continue
            if row and row[0] > t:
                rejected.append(k)      # Server ist neuer -> App bekommt Server-Stand
                continue
            put_doc(c, k, v, t, origin="app")
            sent_keys.add(k)
            accepted += 1
    c = db.conn()
    out = []
    for r in c.execute("SELECT key,value,updated_at,seq FROM docs WHERE seq > ? OR key IN (%s) ORDER BY seq"
                       % ",".join("?" * len(rejected)), (since, *rejected)):
        if r["key"] in sent_keys:
            continue
        out.append({"k": r["key"], "v": json.loads(r["value"]), "t": r["updated_at"]})
    seq = int(db.meta("seq", "0"))
    return {"ok": True, "seq": seq, "accepted": accepted, "docs": out, "catalogVersion": db.meta("catalog_version", "0")}


# ------------------------------------------------------------ Gesundheitsdaten vom Kurzbefehl
def _health_num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("\u00a0", " ")
    s = re.sub(r"(?i)\s*(bpm|count/min|schläge/min|/min|schritte|steps)\s*$", "", s)
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", s):        # 8.432 -> 8432
        s = s.replace(".", "")
    m = re.search(r"-?\d+(?:[.,]\d+)?", s)
    return float(m.group().replace(",", ".")) if m else None


def _sleep_hours(v):
    """Schlaf kommt aus Kurzbefehle in vielen Formen: 26100 (s), 435 (min), 7,25 (h), '7:15', '7 Std. 15 Min.', '7 hr 15 min'."""
    if v is None or v == "":
        return None
    s = str(v).strip().lower()
    m = re.fullmatch(r"(\d+):(\d{1,2})(?::(\d{1,2}))?", s)
    if m:
        return int(m.group(1)) + int(m.group(2)) / 60
    h = re.search(r"(\d+(?:[.,]\d+)?)\s*(h|std|hr|hour|stunde)", s)
    mi = re.search(r"(\d+)\s*(m|min)(?![a-z]*s?ek)", s)
    if h or mi:
        return (float(h.group(1).replace(",", ".")) if h else 0) + (int(mi.group(1)) / 60 if mi else 0)
    n = _health_num(s)
    if n is None:
        return None
    if n > 1440:
        return n / 3600
    if n > 24:
        return n / 60
    return n


def import_health(data):
    """POST /api/health-import vom iPhone-Kurzbefehl. Schreibt health ins Tagesdokument."""
    import datetime as _dt
    get = lambda *ks: next((data[k] for k in ks if k in data and data[k] not in (None, "")), None)
    date = str(get("datum", "date") or _dt.date.today().isoformat())[:10]
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", date)
    if m:
        date = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise ValueError("Datum ungültig")
    out = {}
    steps = _health_num(get("schritte", "steps"))
    if steps is not None and 0 <= steps < 200000:
        out["steps"] = int(round(steps))
    sleep = _sleep_hours(get("schlaf", "sleep"))
    if sleep is not None and 0 < sleep <= 16:
        out["sleepH"] = round(sleep, 2)
    rhr = _health_num(get("ruhepuls", "rhr", "puls"))
    if rhr is not None and 25 < rhr < 150:
        out["rhr"] = int(round(rhr))
    if not out:
        raise ValueError("Keine Werte erkannt. Felder: schritte, schlaf, ruhepuls")
    out["ts"] = db.now_ms()
    out["src"] = "kurzbefehl"
    with db.tx() as c:
        doc = get_doc("d_" + date, {}) or {}
        doc["health"] = {**(doc.get("health") or {}), **out}
        put_doc(c, "d_" + date, doc)
    parts = []
    if "steps" in out:
        parts.append(f"{out['steps']:,} Schritte".replace(",", "."))
    if "sleepH" in out:
        h = out["sleepH"]
        parts.append(f"{int(h)} h {round((h - int(h)) * 60):02d} min Schlaf")
    if "rhr" in out:
        parts.append(f"Ruhepuls {out['rhr']}")
    return date, out, "In Sakina gespeichert ✓ " + " · ".join(parts)


# ------------------------------------------------------------ Normalisierung
def normalize(c, key, v):
    m = DATE_KEY.match(key)
    if m:
        kind, date = m.groups()
        if kind == "d":
            _day(c, date, v or {})
        elif kind == "a":
            _acts(c, date, v or [])
        elif kind == "w":
            kg = _num((v or {}).get("kg"))
            if kg:
                c.execute("INSERT INTO weights VALUES(?,?) ON CONFLICT(date) DO UPDATE SET kg=excluded.kg", (date, kg))
            else:
                c.execute("DELETE FROM weights WHERE date=?", (date,))
        elif kind == "k":
            c.execute("DELETE FROM facts WHERE date=?", (date,))
            for f in (v or {}).get("facts", []):
                c.execute("INSERT INTO facts(date,topic,title,text,tip,source) VALUES(?,?,?,?,?,?)",
                          (date, f.get("topic"), f.get("title", ""), f.get("text"), f.get("tip"),
                           f.get("source") or ("ki" if f.get("ai") else "eingebaut")))
        return
    if key == "favs":
        names = [str(x) for x in (v or [])]
        c.execute("UPDATE dishes SET fav=0")
        for n in names:
            c.execute("INSERT INTO dishes(name,fav,source,created_at) VALUES(?,1,'user',?) ON CONFLICT(name) DO UPDATE SET fav=1",
                      (n, db.now_ms()))
        db.bump_catalog(c)
    elif key == "plan" and isinstance(v, dict) and not v.get("starter") and not v.get("dbId"):
        store_plan(c, v, source="app")


def _day(c, date, v):
    s = v.get("scales") or {}
    e = v.get("eaten") or {}
    h = v.get("health") or {}
    c.execute("""INSERT INTO day_entries(date,sleep,energy,body,head,proud,soul,soul_what,water,
                   eaten_fr,eaten_mi,eaten_ab,eaten_sh,steps,sleep_h,rhr,updated_at)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(date) DO UPDATE SET sleep=excluded.sleep, energy=excluded.energy, body=excluded.body,
                   head=excluded.head, proud=excluded.proud, soul=excluded.soul, soul_what=excluded.soul_what,
                   water=excluded.water, eaten_fr=excluded.eaten_fr, eaten_mi=excluded.eaten_mi,
                   eaten_ab=excluded.eaten_ab, eaten_sh=excluded.eaten_sh, steps=excluded.steps,
                   sleep_h=excluded.sleep_h, rhr=excluded.rhr, updated_at=excluded.updated_at""",
              (date, _int(s.get("sleep")), _int(s.get("energy")), _int(s.get("body")), _int(s.get("head")),
               v.get("proud") or None, v.get("soul"), v.get("soulWhat") or None, _int(v.get("water")),
               1 if e.get("fr") else 0, 1 if e.get("mi") else 0, 1 if e.get("ab") else 0, 1 if e.get("sh") else 0,
               _int(h.get("steps")), _num(h.get("sleepH")), _int(h.get("rhr")), db.now_ms()))
    c.execute("DELETE FROM complaints WHERE date=? AND source='day'", (date,))
    for r in v.get("sore") or []:
        if r in REGIONS:
            c.execute("INSERT INTO complaints(date,region,action,source) VALUES(?,?,'checkin','day')", (date, r))


REGIONS = {"shoulder", "knee", "back"}


def _acts(c, date, items):
    c.execute("DELETE FROM sets WHERE date=?", (date,))
    c.execute("DELETE FROM activities WHERE date=?", (date,))
    c.execute("DELETE FROM complaints WHERE date=? AND source='acts'", (date,))
    for x in items if isinstance(items, list) else []:
        for orig, sw in (x.get("swaps") or {}).items():
            if isinstance(sw, dict):
                c.execute("INSERT INTO complaints(date,region,action,exercise_id,replacement_id,source) VALUES(?,?,'swap',?,?,'acts')",
                          (date, sw.get("reason") if sw.get("reason") in REGIONS else None, orig, sw.get("to")))
        for orig, reason in (x.get("skips") or {}).items():
            c.execute("INSERT INTO complaints(date,region,action,exercise_id,source) VALUES(?,?,'skip',?,'acts')",
                      (date, reason if reason in REGIONS else None, orig))
        if x.get("type") == "jog" and x.get("knee") == "pain":
            c.execute("INSERT INTO complaints(date,region,action,source) VALUES(?,'knee','jog_knee','acts')", (date,))
        known = {"type", "unit", "done", "feel", "minutes", "laps", "knee", "stage", "sets", "stages", "ts", "swaps", "skips"}
        extra = {k: v for k, v in x.items() if k not in known}
        done = 1 if (x.get("sets") if x.get("type") == "gym" else x.get("done")) else 0
        cur = c.execute("""INSERT INTO activities(date,type,unit,done,feel,minutes,laps,knee,stage,extra)
                           VALUES(?,?,?,?,?,?,?,?,?,?)""",
                        (date, x.get("type"), x.get("unit"), done, _int(x.get("feel")), _num(x.get("minutes")),
                         _int(x.get("laps")), x.get("knee"), _int(x.get("stage")), json.dumps(extra, ensure_ascii=False) if extra else None))
        aid = cur.lastrowid
        stages = x.get("stages") or {}
        for ex_id, rows in (x.get("sets") or {}).items():
            for i, r in enumerate(rows or []):
                a, b = _num((r or {}).get("a")), _num((r or {}).get("b"))
                if a is None and b is None:
                    continue
                c.execute("INSERT INTO sets VALUES(?,?,?,?,?,?,?)", (aid, date, ex_id, _int(stages.get(ex_id)), i + 1, a, b))


# ------------------------------------------------------------ Pläne & Gerichte
def store_plan(c, p, source, pantry=None, wish=None):
    """Speichert einen Wochenplan im Verlauf und pflegt die Gerichte-Tabelle."""
    t = db.now_ms()
    today = p.get("created") or __import__("datetime").date.today().isoformat()
    cur = c.execute("""INSERT INTO meal_plans(title,valid_from,created_on,source,fruit,note,pantry,wish,raw,created_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?)""",
                    (p.get("title", "Wochenplan"), p.get("validFrom"), today, source, p.get("fruit"), p.get("note"),
                     pantry, wish, json.dumps(p, ensure_ascii=False), t))
    pid = cur.lastrowid
    dishes = p.get("dishes") or []
    for i, m in enumerate(p.get("meals") or []):
        dish_id = None
        slot = m.get("slot", "")
        idx = 0 if re.search("mittag", slot, re.I) else 1 if re.search("abend", slot, re.I) else -1
        if idx >= 0 and idx < len(dishes):
            name = str(dishes[idx])
            c.execute("""INSERT INTO dishes(name,slot,description,protein,source,first_planned,last_planned,times_planned,created_at)
                         VALUES(?,?,?,?,?,?,?,1,?)
                         ON CONFLICT(name) DO UPDATE SET last_planned=excluded.last_planned,
                           times_planned=times_planned+1, description=excluded.description, protein=excluded.protein""",
                      (name, slot, m.get("what"), _int(m.get("protein")), source, today, today, t))
            dish_id = c.execute("SELECT id FROM dishes WHERE name=?", (name,)).fetchone()[0]
        c.execute("INSERT INTO plan_meals VALUES(?,?,?,?,?,?,?)",
                  (pid, i, slot, m.get("time"), m.get("what"), _int(m.get("protein")), dish_id))
    for i, s in enumerate(p.get("prep") or []):
        c.execute("INSERT INTO prep_steps VALUES(?,?,?,?)", (pid, i, s.get("step"), s.get("tools")))
    for g, items in (p.get("shop") or {}).items():
        for it in items:
            c.execute("INSERT INTO shopping_items(plan_id,grp,item) VALUES(?,?,?)", (pid, g, str(it)))
    db.bump_catalog(c)
    return pid


# ------------------------------------------------------------ Vorschläge
def decide_exercise(ex_id, accept, unit=None):
    with db.tx() as c:
        row = c.execute("SELECT * FROM exercises WHERE id=?", (ex_id,)).fetchone()
        if not row:
            raise KeyError("Übung nicht gefunden")
        if not accept:
            c.execute("UPDATE exercises SET status='archived', updated_at=? WHERE id=?", (db.now_ms(), ex_id))
        else:
            c.execute("UPDATE exercises SET status='active', updated_at=? WHERE id=?", (db.now_ms(), ex_id))
            unit = unit or row["suggested_unit"]
            if row["category"] == "gym" and unit:
                u = c.execute("SELECT exercise_ids FROM units WHERE id=?", (unit,)).fetchone()
                if u:
                    ids = json.loads(u[0])
                    if ex_id not in ids:
                        ids.append(ex_id)
                    c.execute("UPDATE units SET exercise_ids=?, updated_at=? WHERE id=?", (json.dumps(ids), db.now_ms(), unit))
        db.bump_catalog(c)


def remove_from_unit(ex_id, unit):
    with db.tx() as c:
        u = c.execute("SELECT exercise_ids FROM units WHERE id=?", (unit,)).fetchone()
        if u:
            ids = [i for i in json.loads(u[0]) if i != ex_id]
            c.execute("UPDATE units SET exercise_ids=?, updated_at=? WHERE id=?", (json.dumps(ids), db.now_ms(), unit))
            db.bump_catalog(c)
