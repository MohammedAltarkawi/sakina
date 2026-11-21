#!/usr/bin/env python3
"""Sakina – Claude-Jobs.

Claude (Claude Code im Terminal, mit deinem Abo angemeldet) wird OHNE Werkzeuge in einem
leeren Ordner gestartet. Der Server holt die nötigen Daten aus der Datenbank, gibt sie Claude
als Text mit, prüft die JSON-Antwort und schreibt erst dann in die Datenbank.

Jobs:   plan       neuer Meal-Prep-Wochenplan
        analysis   Wochen-Auswertung (letzte 7 Tage)
        exercises  Übungs-Check, schlägt neue Übungen vor (du bestätigst in der App)
        fact       Fakt des Tages (Thema als Argument)

Aufruf: python3 server/claude_jobs.py plan|analysis|exercises|fact [thema] [--trigger timer]
Umgebungsvariablen: SAKINA_CLAUDE (Pfad zu claude), SAKINA_CLAUDE_MODEL (optional), SAKINA_DATA
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db  # noqa: E402
import sync  # noqa: E402

HERE = Path(__file__).resolve().parent
PROMPTS = HERE / "prompts"
TIMEOUT = int(os.environ.get("SAKINA_CLAUDE_TIMEOUT", "300"))
JOBS = ("plan", "analysis", "exercises", "fact")
TOPICS = {"darm": "Darm", "haut": "Haut", "stress": "Stress", "schlaf": "Schlaf", "immun": "Immunsystem",
          "muskeln": "Muskeln & Erholung", "essen": "Essen", "haus": "Hausmittel", "kopf": "Kopf & Entspannung"}
_running = set()
_running_lock = threading.Lock()


class JobError(Exception):
    pass


# ------------------------------------------------------------------ Claude aufrufen
def claude_bin():
    return os.environ.get("SAKINA_CLAUDE") or shutil.which("claude") or str(Path.home() / ".local/bin/claude")


def claude_available():
    p = claude_bin()
    return bool(p) and Path(p).exists() and os.access(p, os.X_OK)


def run_claude(system, user):
    if not claude_available():
        raise JobError("claude ist auf dem Server nicht installiert oder nicht gefunden (SAKINA_CLAUDE setzen)")
    with tempfile.TemporaryDirectory(prefix="sakina-claude-") as work:
        sp = Path(work) / "system.md"
        sp.write_text(system, encoding="utf-8")
        cmd = [claude_bin(), "-p", "--output-format", "json", "--tools", "", "--permission-mode", "dontAsk",
               "--strict-mcp-config", "--system-prompt-file", str(sp)]
        if os.environ.get("SAKINA_CLAUDE_MODEL"):
            cmd += ["--model", os.environ["SAKINA_CLAUDE_MODEL"]]
        try:
            p = subprocess.run(cmd, input=user, capture_output=True, text=True, cwd=work, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            raise JobError(f"Claude hat nicht innerhalb von {TIMEOUT} s geantwortet")
    if p.returncode != 0 and not p.stdout.strip():
        raise JobError("claude-Fehler: " + (p.stderr.strip()[-300:] or f"Exit {p.returncode}"))
    try:
        env = json.loads(p.stdout)
        text = env.get("result", "") if isinstance(env, dict) else str(env)
        if isinstance(env, dict) and env.get("is_error"):
            raise JobError("Claude meldet einen Fehler: " + str(text)[:300])
    except ValueError:
        text = p.stdout
    return parse_json(text)


def parse_json(text):
    t = re.sub(r"```(?:json)?", "", str(text))
    a, b = t.find("{"), t.rfind("}")
    if a < 0 or b < a:
        raise JobError("Antwort war kein JSON")
    try:
        return json.loads(t[a:b + 1])
    except ValueError as e:
        raise JobError(f"JSON kaputt: {e}")


def prompt(name):
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


# ------------------------------------------------------------------ Hilfen
def today():
    return dt.date.today()


def iso(d):
    return d.isoformat()


def monday(d):
    return d - dt.timedelta(days=d.weekday())


def rows(sql, *args):
    return [dict(r) for r in db.conn().execute(sql, args)]


def best_set(kind, sets):
    sets = [s for s in sets if s["b"] is not None]
    if not sets:
        return None
    if kind == "assist":
        return sorted(sets, key=lambda s: ((s["a"] or 0), -(s["b"] or 0)))[0]
    if kind in ("kg", "dist"):
        return sorted(sets, key=lambda s: (-(s["a"] or 0), -(s["b"] or 0)))[0]
    return sorted(sets, key=lambda s: -(s["b"] or 0))[0]


def exercise_progress(since):
    cat = {e["id"]: e for e in rows("SELECT * FROM exercises")}
    stages = {}
    for r in rows("SELECT * FROM ladder_stages"):
        stages[(r["ladder_id"], r["stage"])] = r
    out = {}
    for ex_id in [r["exercise_id"] for r in rows("SELECT DISTINCT exercise_id FROM sets WHERE date>=?", since)]:
        e = cat.get(ex_id, {"name": ex_id, "kind": "kg", "hi": None})
        dates = [r["date"] for r in rows("SELECT DISTINCT date FROM sets WHERE exercise_id=? AND date>=? ORDER BY date", ex_id, since)]
        first = rows("SELECT * FROM sets WHERE exercise_id=? AND date=? ORDER BY set_no", ex_id, dates[0])
        last = rows("SELECT * FROM sets WHERE exercise_id=? AND date=? ORDER BY set_no", ex_id, dates[-1])
        kind, hi = e.get("kind"), e.get("hi")
        if kind == "ladder":
            st = last[0]["stage"] or 1
            s = stages.get((ex_id, st), {})
            kind, hi = s.get("kind", "bw"), s.get("hi")
        bf, bl = best_set(kind, first), best_set(kind, last)
        out[ex_id] = {
            "name": e["name"], "art": kind, "einheiten": len(dates),
            "stufe_anfang": first[0]["stage"], "stufe_jetzt": last[0]["stage"],
            "staerkster_satz_anfang": {k: bf[k] for k in ("a", "b")} if bf else None,
            "staerkster_satz_jetzt": {k: bl[k] for k in ("a", "b")} if bl else None,
            "obere_wdh_zuletzt_geschafft": bool(hi and last and all((s["b"] or 0) >= hi for s in last)),
        }
    return out


# ------------------------------------------------------------------ Job: Wochenplan
def job_plan(trigger="app"):
    t = today()
    valid_from = monday(t) + dt.timedelta(days=7) if t.weekday() >= 4 else monday(t)
    recent = rows("SELECT title, created_on FROM meal_plans ORDER BY id DESC LIMIT 6")
    recent_dishes = [r["name"] for r in rows("SELECT name FROM dishes WHERE last_planned IS NOT NULL ORDER BY last_planned DESC LIMIT 12")]
    favs = [r["name"] for r in rows("SELECT name FROM dishes WHERE fav=1")]
    since = iso(t - dt.timedelta(days=14))
    eaten = rows("SELECT SUM(eaten_fr) fr, SUM(eaten_mi) mi, SUM(eaten_ab) ab, SUM(eaten_sh) sh, COUNT(*) tage FROM day_entries WHERE date>=?", since)[0]
    gym_days = rows("SELECT COUNT(DISTINCT date) n FROM activities WHERE type='gym' AND done=1 AND date>=?", since)[0]["n"]
    pantry, wish = sync.get_doc("pantry", "") or "", sync.get_doc("wish", "") or ""
    use_fav = bool(favs) and t.toordinal() % 3 == 0
    user = f"""Heute ist {t.strftime('%A, %d.%m.%Y')}. Der Plan gilt für die Woche ab {valid_from.strftime('%d.%m.%Y')}.
Gerichte der letzten Wochen (bitte andere nehmen): {'; '.join(recent_dishes) or 'keine'}
Letzte Pläne: {'; '.join(r['title'] for r in recent) or 'keine'}
Lieblingsgerichte: {'; '.join(favs) or 'noch keine'}. {'Bau diesmal eins davon ein, gern leicht abgewandelt.' if use_fav else 'Diesmal lieber neue Gerichte; die Lieblingsgerichte zeigen nur, was ihm schmeckt.'}
Was noch zuhause ist (verbrauchen, NICHT auf die Einkaufsliste): {pantry.strip() or 'nichts angegeben'}
Worauf er Lust hat: {wish.strip() or 'keine Vorgabe'}
Verlauf letzte 14 Tage (nur zur Orientierung): {eaten.get('tage') or 0} Tage eingetragen; gegessen: Frühstück {eaten.get('fr') or 0}×, Mittag {eaten.get('mi') or 0}×, Abend {eaten.get('ab') or 0}×, Shake {eaten.get('sh') or 0}×; Gym-Tage: {gym_days}.
Wenn eine Mahlzeit oft ausgelassen wurde, mach sie besonders einfach."""
    p = normalize_plan(run_claude(prompt("plan"), user))
    p.update({"created": iso(t), "validFrom": iso(valid_from), "source": "claude"})
    with db.tx() as c:
        pid = sync.store_plan(c, p, "claude", pantry=pantry, wish=wish)
        p["dbId"] = pid
        sync.put_doc(c, "plan", p)
        sync.put_doc(c, "shop", {"checked": {}})
        hist = sync.get_doc("planHistory", []) or []
        hist.append({"date": iso(t), "title": p["title"], "dishes": p["dishes"], "dbId": pid})
        sync.put_doc(c, "planHistory", hist[-20:])
    return f"plan:{pid}"


def normalize_plan(j):
    if not isinstance(j, dict) or not isinstance(j.get("meals"), list) or not isinstance(j.get("prep"), list):
        raise JobError("Plan unvollständig")
    text = json.dumps(j, ensure_ascii=False).lower()
    for bad in ("schwein", "speck", "bacon", "gelatine", "wein ", "bier", "alkohol", "kalorien", "kcal"):
        if bad in text and not re.search(r"(kein|ohne|halal)[^.]{0,30}" + re.escape(bad.strip()), text):
            raise JobError(f"Plan enthält „{bad.strip()}“ – verworfen")

    def prot(m):
        n = re.search(r"\d+", str(m.get("protein", "")))
        return int(n.group()) if n else 0
    shop = {str(g): [str(x) for x in a] for g, a in (j.get("shop") or {}).items() if isinstance(a, list)}
    meals = [{"slot": str(m.get("slot", "")), "time": str(m.get("time", "")), "what": str(m.get("what", "")), "protein": prot(m)} for m in j["meals"]]
    dishes = j.get("dishes") if isinstance(j.get("dishes"), list) and len(j["dishes"]) >= 2 else [meals[1]["what"], meals[2]["what"]]
    return {"title": str(j.get("title") or "Neuer Wochenplan"), "meals": meals, "fruit": str(j.get("fruit", "")),
            "note": str(j.get("note", "")),
            "prep": [{"step": str(s.get("step", "")), "tools": str(s.get("tools", ""))} if isinstance(s, dict) else {"step": str(s), "tools": ""} for s in j["prep"]],
            "shop": shop, "dishes": [str(d) for d in dishes]}


# ------------------------------------------------------------------ Job: Wochen-Analyse
def job_analysis(trigger="app"):
    t = today()
    frm, to = t - dt.timedelta(days=6), t
    days = rows("""SELECT date, sleep schlaf, energy energie, body koerper, head kopf, water wasser_glaeser, soul seele,
                   eaten_fr fruehstueck, eaten_mi mittag, eaten_ab abend, eaten_sh shake, steps schritte, sleep_h schlaf_h, rhr ruhepuls
                   FROM day_entries WHERE date BETWEEN ? AND ? ORDER BY date""", iso(frm), iso(to))
    acts = rows("SELECT date, type art, unit einheit, feel koerpergefuehl, minutes minuten, knee knie, stage stufe FROM activities WHERE done=1 AND date BETWEEN ? AND ? ORDER BY date", iso(frm), iso(to))
    data = {"zeitraum": f"{frm.strftime('%d.%m.')}–{to.strftime('%d.%m.%Y')}", "tage": days, "bewegung": acts,
            "hat_gezwickt": complaints_summary(iso(frm)),
            "gym_fortschritt_4_wochen": exercise_progress(iso(t - dt.timedelta(days=28)))}
    if not days and not acts:
        raise JobError("In den letzten 7 Tagen gibt es noch keine Einträge")
    j = run_claude(prompt("analysis"), json.dumps(data, ensure_ascii=False, default=str))
    body = {"summary": str(j.get("summary", "")), "good": [str(x) for x in j.get("good", [])][:5],
            "ideas": [str(x) for x in j.get("ideas", [])][:4], "focus": str(j.get("focus", ""))}
    with db.tx() as c:
        aid = c.execute("INSERT INTO analyses(kind,period_from,period_to,title,body,created_at) VALUES('week',?,?,?,?,?)",
                        (iso(frm), iso(to), str(j.get("title") or "Deine Woche"), json.dumps(body, ensure_ascii=False), db.now_ms())).lastrowid
        publish_analyses(c)
    return f"analysis:{aid}"


def publish_analyses(c):
    items = [{"id": r["id"], "kind": r["kind"], "from": r["period_from"], "to": r["period_to"], "title": r["title"],
              "created": r["created_at"], **json.loads(r["body"])}
             for r in c.execute("SELECT * FROM analyses ORDER BY id DESC LIMIT 12")]
    sync.put_doc(c, "analyses", items)


# ------------------------------------------------------------------ Job: Übungs-Check
FORBIDDEN = re.compile(r"(über ?kopf|overhead|military|arnold|schulterdrück|nackendrück|kreuzheb|deadlift|good ?morning|"
                       r"langhantel[- ]?kniebeug|back ?squat|sprung|jump|plyo|burpee)", re.I)


def job_exercises(trigger="app"):
    t = today()
    cat = rows("SELECT id, name, category, kind, status, loads AS belastet, muscle_group AS gruppe FROM exercises WHERE status!='archived'")
    units = {r["id"]: {"name": r["name"], "uebungen": json.loads(r["exercise_ids"])} for r in rows("SELECT * FROM units")}
    since = iso(t - dt.timedelta(days=56))
    feel = rows("SELECT unit, ROUND(AVG(feel),1) gefuehl, COUNT(*) n FROM activities WHERE type='gym' AND done=1 AND date>=? GROUP BY unit", since)
    knee = rows("SELECT COUNT(*) n FROM activities WHERE type='jog' AND knee='pain' AND date>=?", since)[0]["n"]
    ladders = sync.get_doc("ladders", {}) or {}
    jog = (sync.get_doc("jog", {}) or {}).get("stage")
    data = {"katalog": cat, "einheiten": units, "verlauf_8_wochen": exercise_progress(since), "gefuehl_pro_einheit": feel,
            "stufen": {"liegestuetz": ladders.get("push", 1), "klimmzug": ladders.get("pull", 1), "joggen": jog},
            "knie_hat_beim_joggen_gezwickt": knee, "beschwerden_8_wochen": complaints_summary(since)}
    j = run_claude(prompt("exercises"), json.dumps(data, ensure_ascii=False, default=str))
    existing = {r["id"] for r in rows("SELECT id FROM exercises")}
    names = {r["name"].lower() for r in rows("SELECT name FROM exercises")}
    added, skipped = [], []
    sensitive = sensitive_regions(iso(t - dt.timedelta(days=28)))
    with db.tx() as c:
        for p in (j.get("proposals") or [])[:3]:
            ok, why = check_proposal(p, existing, names, sensitive)
            if not ok:
                skipped.append(f"{p.get('name', '?')}: {why}")
                continue
            grp = p.get("group") if p.get("group") in ("push", "pull", "legs", "core", "arms", "shoulders", "carry") else ("home" if p["category"] == "home" else "core")
            c.execute("""INSERT INTO exercises(id,category,name,kind,sets,lo,hi,side,hint,status,source,reason,suggested_unit,sort,loads,muscle_group,created_at,updated_at)
                         VALUES(?,?,?,?,?,?,?,?,?,'proposed','claude',?,?,1000,?,?,?,?)""",
                      (p["id"], p["category"], p["name"].strip(), p["kind"], int(p.get("sets") or 3), int(p.get("lo") or 8),
                       int(p.get("hi") or 12), 1 if p.get("side") else 0, str(p.get("hint") or "")[:200], str(p.get("reason") or "")[:300],
                       p.get("suggested_unit") if p["category"] == "gym" else None, ",".join(p.get("loads") or []), grp, db.now_ms(), db.now_ms()))
            added.append(p["name"])
        body = {"summary": str(j.get("summary", "")), "good": [], "ideas": [f"Neu vorgeschlagen: {n}" for n in added] or ["Diesmal keine neuen Übungen – passt gerade so."],
                "focus": "", "skipped": skipped}
        c.execute("INSERT INTO analyses(kind,period_from,period_to,title,body,created_at) VALUES('exercises',?,?,?,?,?)",
                  (since, iso(t), "Übungs-Check", json.dumps(body, ensure_ascii=False), db.now_ms()))
        db.bump_catalog(c)
        publish_analyses(c)
    return f"exercises:{len(added)}"


REGION_DE = {"shoulder": "Schulter", "knee": "Knie", "back": "Rücken"}


def complaints_summary(since):
    """Wie oft welche Stelle gezwickt hat und welche Übungen deshalb ersetzt/ausgelassen wurden."""
    out = {}
    for r in rows("SELECT region, COUNT(DISTINCT date) tage FROM complaints WHERE date>=? AND region IS NOT NULL GROUP BY region", since):
        out[REGION_DE.get(r["region"], r["region"])] = {"tage": r["tage"]}
    names = {e["id"]: e["name"] for e in rows("SELECT id, name FROM exercises")}
    for r in rows("""SELECT region, action, exercise_id, replacement_id, COUNT(*) n FROM complaints
                     WHERE date>=? AND action IN ('swap','skip') GROUP BY region, action, exercise_id, replacement_id""", since):
        reg = REGION_DE.get(r["region"], "anderes")
        out.setdefault(reg, {"tage": 0}).setdefault("uebungen", []).append(
            {"uebung": names.get(r["exercise_id"], r["exercise_id"]), "aktion": "ersetzt" if r["action"] == "swap" else "ausgelassen",
             "durch": names.get(r["replacement_id"]) if r["replacement_id"] else None, "mal": r["n"]})
    return out


def sensitive_regions(since, min_days=2):
    return {r["region"] for r in rows("SELECT region FROM complaints WHERE date>=? AND region IS NOT NULL GROUP BY region HAVING COUNT(DISTINCT date)>=?", since, min_days)}


def check_proposal(p, existing, names, sensitive=frozenset()):
    if not isinstance(p, dict):
        return False, "kein Objekt"
    pid, name = str(p.get("id", "")), str(p.get("name", ""))
    if not re.fullmatch(r"[a-z][a-z0-9_]{2,40}", pid):
        return False, "ungültige id"
    if pid in existing or name.lower() in names:
        return False, "gibt es schon"
    if p.get("category") not in ("gym", "home"):
        return False, "Kategorie"
    kinds = {"kg", "bw", "sec", "dist"} if p["category"] == "gym" else {"check"}
    if p.get("kind") not in kinds:
        return False, "Art"
    if FORBIDDEN.search(name + " " + str(p.get("hint", ""))):
        return False, "nicht gelenkschonend"
    if p["category"] == "gym" and p.get("suggested_unit") not in ("A", "B", "C", "D"):
        return False, "Einheit"
    if not isinstance(p.get("loads"), list):
        return False, "Belastung fehlt"
    loads = p["loads"]
    if any(l not in REGION_DE for l in loads):
        return False, "Belastung unklar"
    if set(loads) & set(sensitive):
        return False, "belastet eine Stelle, die gerade öfter zwickt"
    try:
        sets, lo, hi = int(p.get("sets") or 3), int(p.get("lo") or 8), int(p.get("hi") or 12)
    except (TypeError, ValueError):
        return False, "Zahlen"
    if not (1 <= sets <= 5 and 1 <= lo <= hi <= 120):
        return False, "Bereich"
    return True, ""


# ------------------------------------------------------------------ Job: Fakt
def job_fact(trigger="app", topic="kopf"):
    topic = topic if topic in TOPICS else "kopf"
    d = iso(today())
    doc = sync.get_doc("k_" + d, {"facts": []}) or {"facts": []}
    if len(doc.get("facts", [])) >= 5:
        raise JobError("Für heute gibt es schon 5 Fakten")
    shown = [r["title"] for r in rows("SELECT title FROM facts ORDER BY id DESC LIMIT 80")]
    j = run_claude(prompt("fact"), f"Thema: {TOPICS[topic]}.\nSchon gezeigte Titel (nichts Doppeltes):\n" + ("\n".join("- " + s for s in shown) or "- keine"))
    if not j.get("title") or not j.get("text"):
        raise JobError("Antwort unvollständig")
    with db.tx() as c:
        doc = sync.get_doc("k_" + d, {"facts": []}) or {"facts": []}
        doc.setdefault("facts", []).append({"topic": topic, "title": str(j["title"]), "text": str(j["text"]),
                                            "tip": str(j.get("tip", "")), "ai": True, "source": "claude"})
        sync.put_doc(c, "k_" + d, doc)
    return f"fact:{d}"


# ------------------------------------------------------------------ Ausführen + Protokoll
def run_job(job, trigger="app", arg=None, reserved=False):
    if job not in JOBS:
        raise JobError("Unbekannter Job")
    if not reserved:
        with _running_lock:
            if job in _running:
                raise JobError("Läuft schon")
            _running.add(job)
    with db.tx() as c:
        rid = c.execute("INSERT INTO ai_runs(job,trigger,status,started_at) VALUES(?,?,'running',?)", (job, trigger, db.now_ms())).lastrowid
    try:
        fn = {"plan": job_plan, "analysis": job_analysis, "exercises": job_exercises, "fact": job_fact}[job]
        ref = fn(trigger, arg) if job == "fact" else fn(trigger)
        with db.tx() as c:
            c.execute("UPDATE ai_runs SET status='ok', finished_at=?, result_ref=? WHERE id=?", (db.now_ms(), ref, rid))
        return rid
    except Exception as e:  # noqa: BLE001 – Fehler landen im Protokoll
        with db.tx() as c:
            c.execute("UPDATE ai_runs SET status='error', finished_at=?, error=? WHERE id=?", (db.now_ms(), str(e)[:500], rid))
        raise
    finally:
        with _running_lock:
            _running.discard(job)


def start_job_async(job, trigger="app", arg=None):
    """Für die API: startet im Hintergrund. Status über running_jobs()/last_runs()."""
    if job not in JOBS:
        raise JobError("Unbekannter Job")
    with _running_lock:
        if job in _running:
            raise JobError("Läuft schon")
        _running.add(job)

    def worker():
        try:
            run_job(job, trigger, arg, reserved=True)
        except Exception:  # noqa: BLE001 – steht im Protokoll (ai_runs)
            pass
    threading.Thread(target=worker, daemon=True).start()


def running_jobs():
    with _running_lock:
        return sorted(_running)


def last_runs(limit=20):
    return rows("SELECT id, job, trigger, status, started_at, finished_at, error FROM ai_runs ORDER BY id DESC LIMIT ?", limit)


if __name__ == "__main__":
    argv = sys.argv[1:]
    trig = "cli"
    if "--trigger" in argv:
        i = argv.index("--trigger")
        trig = argv[i + 1] if i + 1 < len(argv) else "cli"
        del argv[i:i + 2]
    args = argv
    if not args or args[0] not in JOBS:
        sys.exit(__doc__)
    db.migrate()
    try:
        run_job(args[0], trig, args[1] if len(args) > 1 else None)
        print("ok:", last_runs(1)[0])
    except JobError as e:
        sys.exit(f"Fehler: {e}")
