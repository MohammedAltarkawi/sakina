'use strict';
/* Sakina – Abgleich mit dem eigenen Server (Datenbank + Claude)
   Offline-first: Alles wird zuerst lokal gespeichert (db.set markiert es als „offen“).
   Sobald der Server erreichbar ist, gehen offene Dokumente an /api/sync und
   Änderungen vom Server (neuer Plan, Analysen, Fakten, Katalog) kommen zurück. */

const SYNC_SKIP = new Set(['settings', 'srv', 'catalog', 'syncmeta']);
const syncMeta = () => Object.assign({ t: {}, dirty: {}, seq: 0, init: false }, db.get('syncmeta', {}));
const saveMeta = m => localStorage.setItem(P + 'syncmeta', JSON.stringify(m));
let applyingRemote = false;
let syncing = null;
let syncTimer = null;

function markDirty(k) {
  if (applyingRemote || SYNC_SKIP.has(k)) return;
  const m = syncMeta(); m.t[k] = Date.now(); m.dirty[k] = true; saveMeta(m);
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 15000);
}

const srvInfo = () => db.get('srv', {});
const serverHasClaude = () => !!srvInfo().claude && navigator.onLine;
const apiHeaders = (json = true) => ({ ...(json ? { 'content-type': 'application/json' } : {}), ...srvHeaders() });

async function api(path, opts = {}) {
  const r = await fetch('api/' + path, { cache: 'no-store', ...opts, headers: { ...apiHeaders(!!opts.body), ...(opts.headers || {}) } });
  if ([404, 405, 501].includes(r.status) && !/^(catalog\/exercise|history\/plan)/.test(path)) { const e = new Error('Kein Sakina-Server erreichbar'); e.noServer = true; throw e; }
  let j = null; try { j = await r.json(); } catch { /* leer */ }
  if (r.status === 401) throw new Error('Server-Token fehlt oder ist falsch (⚙️)');
  if (!r.ok) throw new Error(j?.error || 'Server-Fehler ' + r.status);
  return j;
}

/* Prüft, ob ein Server mit Datenbank/Claude da ist (merkt sich das Ergebnis). */
async function checkServer() {
  if (location.protocol === 'file:') return;
  try {
    const h = await api('health');
    db.set('srv', { ...srvInfo(), db: !!h.db, claude: !!h.claude, seen: Date.now(), err: null });
  } catch (e) {
    db.set('srv', { ...srvInfo(), db: false, claude: false, err: e.noServer ? 'hier läuft kein Sakina-Server' : 'Server nicht erreichbar' });
  }
}

async function syncNow(manual = false) {
  if (syncing) return syncing;
  if (!manual && (!navigator.onLine || location.protocol === 'file:' || (!srvInfo().db && srvInfo().seen == null))) return;
  syncing = (async () => {
    flushAll();
    let m = syncMeta();
    if (!m.init) { // erster Abgleich: alles Vorhandene hochladen
      db.keys('').forEach(k => { if (!SYNC_SKIP.has(k)) { m.dirty[k] = true; m.t[k] = m.t[k] || Date.now(); } });
      m.init = true; saveMeta(m);
    }
    const sent = Object.keys(m.dirty).filter(k => db.get(k) !== null).map(k => ({ k, v: db.get(k), t: m.t[k] || Date.now() }));
    let res;
    try {
      res = await api('sync', { method: 'POST', body: JSON.stringify({ since: m.seq, docs: sent }) });
    } catch (e) {
      db.set('srv', { ...srvInfo(), syncErr: e.message, ...(e.noServer ? { db: false } : {}) });
      if (manual) toast(e.message);
      return false;
    }
    m = syncMeta(); // kann sich während der Anfrage geändert haben
    for (const d of sent) if (m.t[d.k] === d.t) delete m.dirty[d.k];
    let changed = false;
    applyingRemote = true;
    try {
      for (const d of res.docs || []) {
        if (SYNC_SKIP.has(d.k)) continue;
        if (m.dirty[d.k] && (m.t[d.k] || 0) > d.t) continue; // lokal neuer
        localStorage.setItem(P + d.k, JSON.stringify(d.v));
        m.t[d.k] = d.t; delete m.dirty[d.k]; changed = true;
      }
    } finally { applyingRemote = false; }
    m.seq = res.seq; m.last = Date.now(); saveMeta(m);
    db.set('srv', { ...srvInfo(), db: true, syncErr: null });
    if (res.catalogVersion && res.catalogVersion !== db.get('catalog')?.version) {
      try { db.set('catalog', await api('catalog')); applyCatalog(); changed = true; } catch { /* nächstes Mal */ }
    }
    if (changed && !document.querySelector('#view :focus')) render();
    if (manual) toast('Synchronisiert ✓');
    return true;
  })();
  try { return await syncing; } finally { syncing = null; }
}

function syncStatusText() {
  const s = srvInfo(), m = syncMeta(), open = Object.keys(m.dirty).length;
  if (!s.db) return s.err ? `Datenbank: ${s.err}. Alles bleibt auf dem Handy.` : 'Datenbank: noch nicht verbunden.';
  const when = m.last ? new Date(m.last).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie';
  return `Datenbank ✓ · Claude ${s.claude ? '✓' : '✗'} · zuletzt ${when}${open ? ` · ${open} offen` : ''}${s.syncErr ? ` · ${s.syncErr}` : ''}`;
}

/* ---------- Katalog aus der Datenbank (statt fest im Code) ---------- */
function applyCatalog() {
  const c = db.get('catalog');
  if (!c || !Array.isArray(c.exercises)) return;
  const active = c.exercises.filter(e => e.status === 'active');
  const tags = e => ({ ...(e.loads != null ? { loads: String(e.loads).split(',').filter(Boolean) } : {}), ...(e.muscle_group ? { group: e.muscle_group } : {}) });
  active.filter(e => e.category === 'gym' && e.kind !== 'ladder').forEach(e => {
    EX[e.id] = { name: e.name, sets: e.sets || 3, lo: e.lo || 8, hi: e.hi || 12, kind: e.kind, side: !!e.side,
      ...(e.side_word ? { sideWord: e.side_word } : {}), ...(e.hint ? { hint: e.hint } : {}), ...(e.source === 'claude' ? { byClaude: true } : {}),
      ...(EX[e.id] ? { loads: EX[e.id].loads, group: EX[e.id].group } : {}), ...tags(e) };
  });
  Object.entries(c.ladders || {}).forEach(([id, stages]) => {
    const e = c.exercises.find(x => x.id === id);
    if (stages.length) LADDERS[id] = { ...(LADDERS[id] || {}), name: e?.name || LADDERS[id]?.name || id, stages, ...(e ? tags(e) : {}) };
  });
  (c.units || []).forEach(u => { UNITS[u.id] = { name: u.name, sub: u.sub, ex: u.ex.filter(id => EX[id] || LADDERS[id]) }; });
  const home = active.filter(e => e.category === 'home').map(e => ({ id: e.id, n: e.sets ? `${e.name}, ${e.sets}×${e.lo}${e.side ? ' pro Seite' : ''}` : e.name, ...tags(e) }));
  if (home.length) HOME_ITEMS.splice(0, HOME_ITEMS.length, ...home);
}

/* ---------- Claude-Jobs auf dem Server ---------- */
S.jobs = S.jobs || {};
const JOB_LABEL = { plan: 'Wochenplan', analysis: 'Wochen-Analyse', exercises: 'Übungs-Check', fact: 'Fakt', dish: 'Neues Gericht' };

async function runServerJob(job, extra = {}) {
  if (S.jobs[job]) return false;
  S.jobs[job] = true; render();
  try {
    await syncNow();                       // erst den aktuellen Stand hochladen
    await api('ai/start', { method: 'POST', body: JSON.stringify({ job, ...extra }) });
    const t0 = Date.now();
    let st;
    do {
      await new Promise(r => setTimeout(r, 3000));
      st = await api('ai/status');
    } while (st.running.includes(job) && Date.now() - t0 < 7 * 60e3);
    const run = st.runs.find(r => r.job === job);
    if (run?.status === 'error') throw new Error(run.error || 'Fehler');
    await syncNow();
    toast(`${JOB_LABEL[job]} von Claude ist da ✓`);
    return true;
  } catch (e) {
    toast(`${JOB_LABEL[job]}: ${e.message}`);
    return false;
  } finally { S.jobs[job] = false; render(); }
}

/* ---------- Ansichten ---------- */
function proposalsCard() {
  const c = db.get('catalog');
  const props = (c?.exercises || []).filter(e => e.status === 'proposed');
  const canRun = serverHasClaude();
  if (!props.length && !canRun) return '';
  const unitSel = (e) => `<select class="unit-sel" id="u_${esc(e.id)}" aria-label="Einheit für ${esc(e.name)}">${Object.keys(UNITS).map(u =>
    `<option value="${u}" ${u === (e.suggested_unit || 'A') ? 'selected' : ''}>${u} ${esc(UNITS[u].name)}</option>`).join('')}</select>`;
  return `<section class="card"><h3>💡 Neue Übungen</h3>
    ${props.length ? props.map(e => `<div class="proposal"><b>${esc(e.name)}</b> <span class="muted small">${e.category === 'home' ? 'Zuhause' : `${e.sets}× ${e.lo === e.hi ? e.lo : e.lo + '–' + e.hi}${e.kind === 'sec' ? ' s' : ''}`}</span>
      ${e.reason ? `<p class="small">${esc(e.reason)}</p>` : ''}${e.hint ? `<p class="small muted">${esc(e.hint)}</p>` : ''}
      <div class="row">${e.category === 'gym' ? unitSel(e) : ''}<button class="btn primary small" data-act="propAccept" data-id="${esc(e.id)}">Übernehmen</button><button class="btn small" data-act="propReject" data-id="${esc(e.id)}">Nein danke</button></div></div>`).join('')
      : '<p class="muted small">Gerade keine offenen Vorschläge.</p>'}
    <p class="small muted">Vorschläge von Claude, passend zu deinem Verlauf. Erst nach deinem OK kommen sie in den Plan. Im Zweifel beim Orthopäden nachfragen.</p>
    ${canRun ? `<button class="btn wide" data-act="job" data-job="exercises" ${S.jobs.exercises ? 'disabled' : ''}>${S.jobs.exercises ? 'Claude schaut sich dein Training an …' : 'Übungs-Check jetzt machen'}</button>` : ''}</section>`;
}

function analysisCard() {
  const list = db.get('analyses', []) || [];
  const canRun = serverHasClaude();
  if (!list.length && !canRun) return '';
  const one = a => `<article class="analysis"><span class="fact-topic">${a.kind === 'exercises' ? '🏋️ Übungs-Check' : '📈 Woche'} · ${a.from ? fmtDM(a.from) : ''}–${a.to ? fmtDM(a.to) : ''}</span>
    <h4>${esc(a.title)}</h4>${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
    ${a.good?.length ? `<p class="small"><b>Was gut lief</b></p><ul class="tips">${a.good.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.ideas?.length ? `<p class="small"><b>Kleine Ideen</b></p><ul class="tips">${a.ideas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.focus ? `<p class="tip">🎯 ${esc(a.focus)}</p>` : ''}</article>`;
  return `<section class="card"><h3>📈 Deine Woche</h3>${list.length ? one(list[0]) : '<p class="muted">Noch keine Auswertung. Claude macht sie jeden Sonntag automatisch.</p>'}
    ${list.length > 1 ? `<details class="sub" id="det-analyses"><summary>Frühere Auswertungen (${list.length - 1})</summary>${list.slice(1).map(one).join('')}</details>` : ''}
    ${canRun ? `<button class="btn wide" data-act="job" data-job="analysis" ${S.jobs.analysis ? 'disabled' : ''}>${S.jobs.analysis ? 'Claude wertet aus …' : 'Jetzt auswerten'}</button>` : ''}</section>`;
}

function planHistoryCard() {
  const hist = (db.get('planHistory', []) || []).slice().reverse();
  if (!hist.length) return '';
  return `<section class="card"><h3>📚 Frühere Pläne</h3><ul class="favs">${hist.map(h => `<li><span><b>${esc(h.title)}</b><br><span class="small muted">${fmtShort(h.date)}${h.dishes?.length ? ' · ' + esc(h.dishes.join(' & ')) : ''}</span></span>
    ${h.dbId && srvInfo().db ? `<button class="btn small" data-act="planOpen" data-id="${h.dbId}">Ansehen</button>` : ''}</li>`).join('')}</ul></section>`;
}

function showPlanOverlay(p, id) {
  const o = $('#overlay');
  o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(p.title)}">
    <div class="sheet-head"><h3>${esc(p.title)}</h3><button class="close" data-g="close" aria-label="Schließen">✕</button></div>
    ${p.meals.map(m => `<div class="meal"><b>${esc(m.slot)}</b> <span class="muted small">${esc(m.time || '')}</span><p>${esc(m.what)}</p>${m.protein ? `<p class="protein">💪 ca. ${m.protein} g Protein</p>` : ''}</div>`).join('')}
    <h4>Prep</h4><ol class="prep">${p.prep.map(s => `<li><p>${esc(s.step)}</p>${s.tools ? `<span class="tools">🍳 ${esc(s.tools)}</span>` : ''}</li>`).join('')}</ol>
    <button class="btn primary wide" data-g="planReuse" data-id="${id}">Diesen Plan wieder verwenden</button></div>`;
  o.hidden = false; document.body.classList.add('noscroll');
  showPlanOverlay.current = p;
}
