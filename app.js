'use strict';
/* Sakina – App-Logik */

const APP_VERSION = 'v5 · Datenbank & Claude';

/* ---------- Helfer ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const dow = s => (parseD(s).getDay() + 6) % 7; // 0 = Montag
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fmtDM = s => { const d = parseD(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };
const fmtShort = s => `${WD[dow(s)]}, ${fmtDM(s)}`;
const mondayOf = s => addDays(s, -dow(s));
const dayNum = s => Math.round(Date.UTC(...s.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 86400000);
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const fmtNum = n => n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ',');
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pickN = (arr, n, seed) => arr.map((x, i) => [hash(seed + '|' + i), x]).sort((p, q) => p[0] - q[0]).slice(0, n).map(p => p[1]);

/* ---------- Speicher (private Dokumente im Browser) ---------- */
const P = 'gt_';
const db = {
  get(k, def = null) { try { const v = localStorage.getItem(P + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { localStorage.setItem(P + k, JSON.stringify(v)); if (typeof markDirty === 'function') markDirty(k); },
  del(k) { localStorage.removeItem(P + k); },
  keys(prefix = '') {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P + prefix)) out.push(k.slice(P.length)); }
    return out.sort();
  },
};
const settings = () => Object.assign({ name: 'Mohammed', provider: 'anthropic', apiKey: '', model: '', baseUrl: '', theme: 'auto', serverToken: '' }, db.get('settings', {}));
const LOCAL_ONLY = ['srv']; // Gerätestatus, kommt nicht ins Backup
const hasAI = () => !!settings().apiKey;
const dayDoc = (d = today()) => Object.assign({ scales: {}, proud: '', soul: null, soulWhat: '', water: 0, eaten: {} }, db.get('d_' + d, {}));
const saveDay = (doc, d = today()) => db.set('d_' + d, doc);
const acts = d => db.get('a_' + d, []);
const hasSets = x => x && x.sets && Object.keys(x.sets).length > 0;
const isDone = x => x.type === 'gym' ? hasSets(x) : !!x.done;
const getAct = (type, d = today()) => acts(d).find(x => x.type === type) || { type };
function setAct(type, patch, d = today()) {
  const list = acts(d); let it = list.find(x => x.type === type);
  if (!it) { it = { type }; list.push(it); }
  Object.assign(it, patch, { ts: Date.now() });
  db.set('a_' + d, list);
  return it;
}

/* ---------- verzögertes Speichern ---------- */
const pending = new Map();
function later(key, fn, ms = 500) {
  if (pending.has(key)) clearTimeout(pending.get(key).t);
  pending.set(key, { fn, t: setTimeout(() => { pending.delete(key); fn(); }, ms) });
}
function flushAll() { for (const [k, p] of [...pending]) { clearTimeout(p.t); pending.delete(k); p.fn(); } }

/* ---------- Zustand ---------- */
const S = { tab: 'heute', move: null, gymUnit: null, month: today().slice(0, 7), factTopic: null, openCalm: null, loadingFact: false, loadingPlan: false, day: today(), jobs: {} };

/* ---------- Theme ---------- */
function applyTheme() {
  const t = settings().theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#12201A' : '#1F6B45');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ---------- Toast ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.classList.remove('show'); t.hidden = true; }, 3200);
}

/* ---------- Bausteine ---------- */
const SUN = `<svg class="sun" viewBox="0 0 100 100" aria-hidden="true"><g stroke="#FFD21F" stroke-width="7" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="50" y1="8" x2="50" y2="20" transform="rotate(${a} 50 50)"/>`).join('')}</g><circle cx="50" cy="50" r="22" fill="#FFD21F"/></svg>`;

function scaleBtns(act, key, val, label) {
  return `<div class="scale-btns" role="group" aria-label="${esc(label || 'Skala 1 bis 5')}">${[1, 2, 3, 4, 5].map(v =>
    `<button class="sbtn ${val === v ? 'on' : ''}" data-act="${act}" data-k="${esc(key)}" data-v="${v}" aria-pressed="${val === v}" aria-label="${v} von 5">${v}</button>`).join('')}</div>
    <div class="scale-legend"><span>1 = Kacke</span><span>5 = super</span></div>`;
}

function plantSVG(n) {
  const k = Math.min(n, 10);
  const top = 112 - k * 9 - 8;
  let leaves = '';
  for (let i = 0; i < k; i++) {
    const y = 108 - i * 9; const left = i % 2 === 0; const cx = left ? 49 : 71;
    leaves += `<ellipse cx="${cx}" cy="${y}" rx="12" ry="5" transform="rotate(${left ? 25 : -25} ${cx} ${y})" fill="var(--leaf)"/>`;
  }
  const sprout = k === 0 ? `<ellipse cx="55" cy="104" rx="5" ry="2.5" fill="var(--leaf)"/><ellipse cx="65" cy="104" rx="5" ry="2.5" fill="var(--leaf)"/>` : '';
  const flower = n >= 10 ? `<g class="flower">${[0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="60" cy="${top - 9}" rx="5" ry="9" fill="#FFD21F" transform="rotate(${a} 60 ${top})"/>`).join('')}<circle cx="60" cy="${top}" r="5.5" fill="#E89A1C"/></g>` : '';
  return `<svg viewBox="0 0 120 160" class="plant-svg" role="img" aria-label="Pflanze mit ${k} Blättern${n >= 10 ? ', blühend' : ''}">
    <path d="M60 116 L60 ${k === 0 ? 106 : top}" stroke="var(--stem)" stroke-width="3.5" stroke-linecap="round"/>${sprout}${leaves}${flower}
    <path d="M34 116 H86 L80 154 H40 Z" fill="var(--pot)"/><rect x="30" y="112" width="60" height="9" rx="3" fill="var(--pot-rim)"/></svg>`;
}
function glassSVG(n) {
  const f = Math.min(n, 10) / 10; const h = 44 * f;
  return `<svg viewBox="0 0 40 56" class="glass" aria-hidden="true"><path d="M5 4 H35 L31 52 H9 Z" fill="none" stroke="var(--g)" stroke-width="2.5" stroke-linejoin="round"/>
    <clipPath id="gl"><path d="M6 5 H34 L30.2 51 H9.8 Z"/></clipPath><rect clip-path="url(#gl)" x="0" y="${51 - h}" width="40" height="${h}" fill="var(--water)"/></svg>`;
}

/* ================================================================
   TAB HEUTE
   ================================================================ */
function renderHeute() {
  const d = today(), doc = dayDoc(d), st = settings();
  const q = QUOTES[dayNum(d) % QUOTES.length];
  const dateStr = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseD(d));
  const quote = q.ar
    ? `<div class="verse" dir="rtl" lang="ar">${q.ar}<div class="verse-src">﴿ ${q.src} ﴾</div></div>`
    : `<p class="quote">${esc(q.t)}</p>`;
  const done = SCALES.every(s => doc.scales[s.k]) && doc.proud.trim() && doc.soul === 'yes';
  let h = `<section class="hello">${SUN}<div class="hello-date">${dateStr}</div><h2>Hey ${esc(st.name || 'du')},</h2><p class="hello-sub">heute wird ein guter Tag.</p>${quote}</section>`;
  if (done) h += `<div class="card done-banner" role="status">Heute gut auf dich geachtet ☀️</div>`;

  h += `<section class="card"><h3>Wie geht's uns heute?</h3>${SCALES.map(s => `
    <div class="scale"><p class="q">${s.q}</p>${scaleBtns('scale', s.k, doc.scales[s.k], s.q)}</div>
    ${s.k === 'head' && doc.scales.head && doc.scales.head <= 2 ? `<button class="hint" data-act="headHelp">🌿 Kopf heute unruhig? Hier ist eine Übung, die helfen kann ›</button>` : ''}`).join('')}</section>`;

  h += `<section class="card"><h3>Worauf warst du heute stolz?</h3><p class="muted">Was mochtest du heute an dir?</p>
    <textarea id="proud" rows="3" aria-label="Worauf warst du heute stolz? Was mochtest du heute an dir?" placeholder="Auch Kleinigkeiten zählen …">${esc(doc.proud)}</textarea>
    <div class="row"><button class="btn primary" data-act="saveProud">Speichern</button><span class="saved" id="proudSaved" aria-live="polite">${doc.proud ? '✓ Gespeichert' : ''}</span></div></section>`;

  h += `<section class="card"><h3>Haben wir heute etwas für die Seele getan?</h3>
    <div class="seg"><button class="${doc.soul === 'yes' ? 'on' : ''}" data-act="soul" data-v="yes" aria-pressed="${doc.soul === 'yes'}">Ja ☀️</button><button class="${doc.soul === 'no' ? 'on' : ''}" data-act="soul" data-v="no" aria-pressed="${doc.soul === 'no'}">Noch nicht</button></div>`;
  if (doc.soul === 'yes') h += `<label class="lbl">Was war's? <span class="muted">(optional)</span><input type="text" data-inp="soulWhat" value="${esc(doc.soulWhat)}" placeholder="z. B. Spaziergang am Wasser"></label>`;
  if (doc.soul === 'no') h += `<p class="muted">Vielleicht etwas davon?</p><ul class="ideas">${pickN(SOUL_IDEAS, 3, d).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  h += `</section>`;

  const n = doc.water || 0;
  h += `<section class="card water"><h3>Wasser</h3><div class="plant">${plantSVG(n)}</div>
    ${n >= 10 ? '<p class="bloom">Deine Pflanze blüht. Richtig gut getrunken heute 🌼</p>' : ''}
    <div class="water-row">${glassSVG(n)}
      <button class="round" data-act="water" data-v="-1" aria-label="Ein Glas weniger" ${n <= 0 ? 'disabled' : ''}>−</button>
      <div class="water-count" aria-live="polite"><b>${n}</b> von 10 Gläsern<br><span class="muted">${fmtNum(n * 0.25)} l</span></div>
      <button class="round" data-act="water" data-v="1" aria-label="Ein Glas mehr">+</button></div>
    <p class="muted small center">1 Glas = 250 ml</p></section>`;
  return h;
}

/* ================================================================
   TAB BEWEGUNG
   ================================================================ */
function doneOn(type, d) { return acts(d).some(x => x.type === type && isDone(x)); }

function weekBar() {
  const t = today(), mo = mondayOf(t);
  return `<div class="weekbar" aria-label="Diese Woche">${WD.map((w, i) => {
    const d = addDays(mo, i); const types = [...new Set(acts(d).filter(isDone).map(x => x.type))];
    return `<div class="wd ${d === t ? 'today' : ''}"><span>${w}</span><b>${types.map(x => EMO[x]).join('') || '·'}</b></div>`;
  }).join('')}</div>`;
}

function renderBewegung() {
  let h = `<section class="card"><h3>Worauf haben wir heute Lust?</h3><div class="tiles">${MOVES.map(m =>
    `<button class="tile ${S.move === m.k ? 'on' : ''}" data-act="move" data-k="${m.k}" aria-pressed="${S.move === m.k}"><span class="tile-e">${m.e}</span><span>${m.n}</span>${doneOn(m.k, today()) ? '<span class="tick" aria-label="heute erledigt">✓</span>' : ''}</button>`).join('')}</div>${weekBar()}</section>`;
  h += healthCard();
  if (S.move) {
    const view = { gym: gymView, home: homeView, jog: jogView, box: () => simpleView('box'), swim: () => simpleView('swim'), relax: () => simpleView('relax') }[S.move];
    h += `<section class="card" id="plan">${view()}<p class="ortho">⚠️ ${ORTHO_HINT}</p></section>`;
  }
  h += analysisCard() + proposalsCard() + weighView() + reviewView() + importView();
  return h;
}


/* ---------- Gesundheitsdaten vom iPhone (über Kurzbefehl + Zwischenablage) ---------- */
function parseHealth(text) {
  const t = String(text || '');
  if (!/sakina|schritte|steps/i.test(t)) throw new Error('In der Zwischenablage stehen keine Sakina-Daten. Erst den Kurzbefehl ausführen.');
  const get = re => { const m = t.match(re); return m ? m[1].trim() : null; };
  const toNum = v => { if (v == null || v === '') return null; let x = String(v).replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); // 8.432 → 8432
    return num(x.replace(/[^\d.,-]/g, '')); };
  const date = toISO(get(/(?:datum|date)\s*[=:]\s*([^\n;|]+)/i)) || today();
  const steps = toNum(get(/(?:schritte|steps)\s*[=:]\s*([^\n;|]+)/i));
  let sleep = toNum(get(/(?:schlaf|sleep)\s*[=:]\s*([^\n;|]+)/i));
  if (sleep != null && sleep > 24) sleep = sleep > 1440 ? sleep / 3600 : sleep / 60; // Sekunden oder Minuten → Stunden
  const rhr = toNum(get(/(?:ruhepuls|rhr|puls)\s*[=:]\s*([^\n;|]+)/i));
  const out = { date };
  if (steps != null && steps >= 0 && steps < 200000) out.steps = Math.round(steps);
  if (sleep != null && sleep > 0 && sleep <= 16) out.sleepH = Math.round(sleep * 10) / 10;
  if (rhr != null && rhr > 25 && rhr < 150) out.rhr = Math.round(rhr);
  if (out.steps == null && out.sleepH == null && out.rhr == null) throw new Error('Keine Werte gefunden. Prüf den Text im Kurzbefehl.');
  return out;
}
function saveHealth(hd) {
  const doc = dayDoc(hd.date);
  doc.health = Object.assign({}, doc.health, hd, { ts: Date.now() });
  delete doc.health.date;
  saveDay(doc, hd.date);
  const parts = [hd.steps != null && `${hd.steps.toLocaleString('de-DE')} Schritte`, hd.sleepH != null && `${fmtNum(hd.sleepH)} h Schlaf`, hd.rhr != null && `Ruhepuls ${hd.rhr}`].filter(Boolean);
  toast(`📲 Übernommen${hd.date !== today() ? ' für ' + fmtShort(hd.date) : ''}: ${parts.join(' · ')}`);
}
const fmtSleep = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${pad(m % 60)} min`; };
function healthCard() {
  const t = today(), hd = dayDoc(t).health, y = dayDoc(addDays(t, -1)).health;
  const val = (v, f) => v != null ? f(v) : '–';
  return `<section class="card health"><h3>📲 Vom Handy</h3>
    <div class="kacheln"><div><b>${val(hd?.steps, v => v.toLocaleString('de-DE'))}</b><span>Schritte heute</span></div>
    <div><b>${val(hd?.sleepH ?? y?.sleepH, v => fmtNum(v) + ' h')}</b><span>Schlaf${hd?.sleepH == null && y?.sleepH != null ? ' (gestern)' : ''}</span></div>
    <div><b>${val(hd?.rhr, v => v)}</b><span>Ruhepuls</span></div></div>
    <button class="btn primary wide" data-act="healthPaste">Gesundheitsdaten einfügen</button>
    ${hd?.ts ? `<p class="small muted center">Zuletzt aktualisiert um ${new Date(hd.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>` : '<p class="small muted center">Erst den Kurzbefehl „Sakina Sync“ ausführen, dann hier tippen.</p>'}
    ${S.healthManual ? `<label class="lbl">Klappt das Einfügen nicht? Hier lang drücken → „Einsetzen“:<textarea id="healthText" rows="3" placeholder="SAKINA&#10;schritte=8432&#10;schlaf=7,3&#10;ruhepuls=58"></textarea></label><button class="btn small" data-act="healthManual">Übernehmen</button>` : ''}
  </section>`;
}

/* ---------- Gym ---------- */
const ladderStage = id => (db.get('ladders', {})[id]) || 1;
function exSpec(id, stage) {
  if (LADDERS[id]) {
    const s = stage || ladderStage(id); const st = LADDERS[id].stages[s - 1];
    return { ...st, id, ladder: id, stage: s, name: `${LADDERS[id].name} · Stufe ${s}: ${st.n}` };
  }
  return { ...EX[id], id };
}

function lastSets(id, stage) {
  const t = today();
  for (const k of db.keys('a_').reverse()) {
    const d = k.slice(2); if (d >= t) continue;
    const list = acts(d);
    for (let i = list.length - 1; i >= 0; i--) {
      const x = list[i];
      if (x.type !== 'gym' || !x.sets || !x.sets[id]) continue;
      if (LADDERS[id] && (x.stages?.[id] || 1) !== stage) continue;
      if (x.sets[id].some(s => s.a || s.b)) return { d, sets: x.sets[id] };
    }
  }
  return null;
}

function fmtSet(sp, s, short) {
  const a = fmtNum(num(s.a)), b = fmtNum(num(s.b));
  if (!a && !b) return '–';
  switch (sp.kind) {
    case 'kg': return short ? `${a || '–'} × ${b || '–'}` : `${a || '–'} kg × ${b || '–'}`;
    case 'assist': return short ? `${a || '–'} × ${b || '–'}` : `Hilfe ${a || '–'} kg × ${b || '–'}`;
    case 'dist': return short ? `${a || '–'} kg · ${b || '–'} m` : `${a || '–'} kg · ${b || '–'} m`;
    case 'sec': return `${b} s`;
    default: return short ? b : `${b} Wdh.`;
  }
}
const fmtSets = (sp, sets) => sets.map((s, i) => fmtSet(sp, s, i > 0)).join(' / ');

function progressMsg(sp, sets) {
  const done = sets.slice(0, sp.sets);
  if (done.length < sp.sets || !done.every(s => num(s.b) != null && num(s.b) >= sp.hi)) return '';
  if (sp.kind === 'kg' || sp.kind === 'dist') return '↑ Alles geschafft: heute etwas mehr Gewicht';
  if (sp.kind === 'assist') return '↑ Alles geschafft: heute etwas weniger Hilfe';
  if (sp.ladder && sp.stage < 4) return '↑ Alles geschafft: bereit für die nächste Stufe?';
  if (sp.kind === 'sec') return '↑ Alles geschafft: heute ein paar Sekunden mehr';
  return '↑ Alles geschafft: heute 1–2 mehr';
}

function gymRecommend() {
  const t = today(), order = ['A', 'B', 'C', 'D'];
  let last = null;
  for (const k of db.keys('a_').reverse()) {
    const d = k.slice(2); if (d >= t) continue;
    const g = acts(d).filter(x => x.type === 'gym' && hasSets(x));
    if (g.length) { last = { d, unit: g[g.length - 1].unit }; break; }
  }
  let unit = last ? order[(order.indexOf(last.unit) + 1) % 4] : 'A';
  const y = acts(addDays(t, -1));
  const jogY = y.some(x => x.type === 'jog' && x.done);
  const legsY = y.some(x => x.type === 'gym' && x.unit === 'C' && hasSets(x));
  let extra = '';
  if (unit === 'C' && (jogY || legsY)) { unit = 'D'; extra = ` Gestern ${jogY ? 'warst du joggen' : 'waren die Beine dran'}, deshalb heute nicht Beine.`; }
  const reason = last
    ? `Letztes Gym: ${UNITS[last.unit].name} (${fmtShort(last.d)}). Heute passt ${UNITS[unit].name}.${extra}`
    : `Noch kein Gym eingetragen. Fang ganz entspannt mit ${UNITS[unit].name} an.${extra}`;
  return { unit, reason };
}

function setInput(id, i, f, cur, last, label) {
  return `<label class="fld"><input type="text" inputmode="decimal" autocomplete="off" data-inp="set" data-ex="${id}" data-i="${i}" data-f="${f}"
    value="${esc(cur || '')}" ${i === 0 ? `data-old="${esc(cur || '')}"` : ''} placeholder="${esc(last ? fmtNum(num(last)) : '')}" aria-label="Satz ${i + 1}, ${label}"><span>${label}</span></label>`;
}

function exBlock(id, item, notes) {
  const sp = exSpec(id); const F = FIELDS[sp.kind];
  const last = lastSets(id, sp.stage); const cur = (item.sets || {})[id] || [];
  const target = `${sp.sets}× ${sp.lo === sp.hi ? sp.lo : sp.lo + '–' + sp.hi}${F.unit ? ' ' + F.unit : ''}${sp.side ? ' ' + (sp.sideWord || 'pro Seite') : ''}`;
  let h = `<div class="ex" data-ex="${id}"><div class="ex-head"><h4>${esc(sp.name)}${sp.byClaude ? ' <span class="badge-new">✨ neu</span>' : ''}</h4><span class="target">${target}</span></div>`;
  if (sp.ladder) {
    const L = LADDERS[sp.ladder];
    h += `<div class="ladder" role="group" aria-label="Stufe wählen">${L.stages.map((s, i) =>
      `<button class="${sp.stage === i + 1 ? 'on' : ''}" data-act="stage" data-l="${sp.ladder}" data-s="${i + 1}" aria-pressed="${sp.stage === i + 1}" aria-label="Stufe ${i + 1}: ${esc(s.n)}">${i + 1}</button>`).join('')}</div>
      <p class="small muted">${L.stages.map((s, i) => `${i + 1} ${s.n}`).join(' → ')}</p>`;
  }
  if (sp.hint) h += `<p class="small muted">${esc(sp.hint)}</p>`;
  if (last) h += `<p class="last">Letztes Mal: ${esc(fmtSets(sp, last.sets))}</p>`;
  const prog = last && progressMsg(sp, last.sets);
  if (prog) h += `<p class="prog">${prog}</p>`;
  h += `<div class="sets">`;
  for (let i = 0; i < sp.sets; i++) {
    const c = cur[i] || {}, l = (last?.sets || [])[i] || {};
    h += `<div class="set"><span class="set-n">Satz ${i + 1}</span>${F.a ? setInput(id, i, 'a', c.a, l.a, F.a) : ''}${setInput(id, i, 'b', c.b, l.b, F.b)}</div>`;
  }
  h += `</div><label class="note"><span>📝 Notiz fürs nächste Mal</span><textarea rows="1" data-inp="note" data-ex="${id}" placeholder="z. B. Sitz auf 4">${esc(notes[id] || '')}</textarea></label></div>`;
  return h;
}

function gymView() {
  const t = today(), rec = gymRecommend();
  if (!S.gymUnit) {
    const g = acts(t).filter(x => x.type === 'gym' && hasSets(x));
    S.gymUnit = g.length ? g[g.length - 1].unit : rec.unit;
  }
  const U = S.gymUnit;
  const item = acts(t).find(x => x.type === 'gym' && x.unit === U) || { sets: {}, feel: null };
  const notes = db.get('notes', {});
  let h = `<h3>🏋️ Gym</h3><p class="muted">Calisthenics-orientiert und schonend für Rücken, Knie und Schulter.</p>
    <div class="units">${Object.keys(UNITS).map(u => `<button class="unit ${u === U ? 'on' : ''}" data-act="unit" data-u="${u}" aria-pressed="${u === U}"><b>${u}</b><span>${UNITS[u].name}</span>${u === rec.unit ? '<em>★ empfohlen</em>' : ''}</button>`).join('')}</div>
    <p class="reason">${esc(rec.reason)}</p><p class="unit-sub"><b>${U} ${UNITS[U].name}</b> · ${UNITS[U].sub}</p>`;
  h += UNITS[U].ex.map(id => exBlock(id, item, notes)).join('');
  h += `<div class="feel"><p class="q">Wie hat sich dein Körper angefühlt?</p>${scaleBtns('gymFeel', U, item.feel, 'Körpergefühl')}</div>
    <p class="saved center" id="gymSaved" aria-live="polite">${hasSets(item) ? '✓ Automatisch gespeichert' : 'Wird automatisch gespeichert, sobald du etwas einträgst.'}</p>`;
  return h;
}

function saveGym() {
  const blocks = $$('#view .ex[data-ex]');
  if (!blocks.length || !S.gymUnit) return;
  const U = S.gymUnit, t = today(), list = acts(t);
  let item = list.find(x => x.type === 'gym' && x.unit === U);
  const sets = {};
  blocks.forEach(b => {
    const rows = [];
    $$('input[data-inp=set]', b).forEach(i => { const k = +i.dataset.i; rows[k] = rows[k] || { a: '', b: '' }; rows[k][i.dataset.f] = i.value.trim(); });
    if (rows.some(r => r.a || r.b)) sets[b.dataset.ex] = rows;
  });
  const stages = {}; UNITS[U].ex.forEach(id => { if (LADDERS[id]) stages[id] = ladderStage(id); });
  if (!item) { if (!Object.keys(sets).length) return; item = { type: 'gym', unit: U, feel: null }; list.push(item); }
  Object.assign(item, { sets, stages, ts: Date.now() });
  if (!Object.keys(sets).length && !item.feel) list.splice(list.indexOf(item), 1);
  db.set('a_' + t, list);
  const el = $('#gymSaved'); if (el) el.textContent = '✓ Automatisch gespeichert';
}

/* ---------- Zuhause ---------- */
function homeView() {
  const it = getAct('home');
  const custom = String(db.get('homeCustom', '') || '').split('\n').map(s => s.trim()).filter(Boolean);
  const items = [...HOME_ITEMS, ...custom.map(n => ({ id: 'c_' + n, n }))];
  return `<h3>🧘 Zuhause</h3><p class="muted">Rücken & Pilates, ruhig und sauber. Abhaken, was du gemacht hast.</p>
    <ul class="checks">${items.map(x => `<li><label class="check"><input type="checkbox" data-act="homeCheck" data-id="${esc(x.id)}" ${it.checks?.[x.id] ? 'checked' : ''}><span>${esc(x.n)}</span></label></li>`).join('')}</ul>
    <details class="sub"><summary>Eigene Übungen hinzufügen</summary><textarea data-inp="homeCustom" rows="3" placeholder="Eine Übung pro Zeile">${esc(db.get('homeCustom', '') || '')}</textarea><button class="btn small" data-act="rerender">In die Liste übernehmen</button></details>
    ${feelBlock('home', it.feel)}${doneBtn('home', it)}`;
}
const feelBlock = (type, v) => `<div class="feel"><p class="q">Wie hat sich dein Körper angefühlt?</p>${scaleBtns('feel', type, v, 'Körpergefühl')}</div>`;
const doneBtn = (type, it) => it.done
  ? `<button class="btn done-btn" data-act="done" data-type="${type}" aria-pressed="true">Erledigt ✓</button><p class="muted small center">Gespeichert. Nochmal tippen macht es rückgängig.</p>`
  : `<button class="btn primary wide" data-act="done" data-type="${type}" aria-pressed="false">Erledigt ✓</button>`;

/* ---------- Boxen / Schwimmen / Entspannung ---------- */
function simpleView(type) {
  const T = TIPS[type], it = getAct(type);
  return `<h3>${T.title}</h3><ul class="tips">${T.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="row fields"><label class="lbl">Minuten<input type="text" inputmode="numeric" data-inp="actField" data-type="${type}" data-f="minutes" value="${esc(it.minutes || '')}"></label>
    ${type === 'swim' ? `<label class="lbl">Bahnen<input type="text" inputmode="numeric" data-inp="actField" data-type="swim" data-f="laps" value="${esc(it.laps || '')}"></label>` : ''}</div>
    ${feelBlock(type, it.feel)}${doneBtn(type, it)}`;
}

/* ---------- Joggen ---------- */
function jogView() {
  const st = db.get('jog', { stage: 1 }).stage || 1, it = getAct('jog');
  return `<h3>🏃 Joggen</h3><p class="muted">Einsteigerplan in 8 Stufen. Heute: <b>Stufe ${st}</b> · ${JOG_STAGES[st - 1]}</p>
    <ol class="jog">${JOG_STAGES.map((s, i) => `<li><button class="${st === i + 1 ? 'on' : ''}" data-act="jogStage" data-s="${i + 1}" aria-pressed="${st === i + 1}"><b>${i + 1}</b> ${s}</button></li>`).join('')}</ol>
    <ul class="tips">${JOG_TIPS.map(x => `<li>${x}</li>`).join('')}</ul>
    <p class="q">War das Knie okay?</p><div class="seg"><button class="${it.knee === 'ok' ? 'on' : ''}" data-act="knee" data-v="ok" aria-pressed="${it.knee === 'ok'}">Ja</button><button class="${it.knee === 'pain' ? 'on' : ''}" data-act="knee" data-v="pain" aria-pressed="${it.knee === 'pain'}">Hat gezwickt</button></div>
    ${it.knee === 'pain' ? '<p class="note-box">Nächstes Mal eine Stufe zurück und es beim Orthopäden erwähnen.</p>' : ''}
    ${doneBtn('jog', it)}`;
}

/* ---------- Wiegen ---------- */
function weighView() {
  const t = today(), w = db.get('w_' + t);
  const list = db.keys('w_').reverse().slice(0, 6).map(k => ({ d: k.slice(2), kg: db.get(k)?.kg }));
  return `<section class="card"><h3>⚖️ Wiegen</h3><p class="muted">Nur montags, morgens vor dem Frühstück. Die Zahl sagt nichts über Muskeln, Kraft oder wie du dich fühlst.</p>
    ${dow(t) === 0
      ? `<div class="row"><input id="wkg" class="kg-in" type="text" inputmode="decimal" value="${w ? fmtNum(w.kg) : ''}" aria-label="Gewicht in kg"><span>kg</span><button class="btn primary" data-act="saveWeight">${w ? 'Ändern' : 'Eintragen'}</button></div>`
      : `<p class="lock">🔒 Nächster Wiegetag: ${fmtShort(addDays(t, 7 - dow(t)))}</p>`}
    ${list.length ? `<ul class="neutral-list">${list.map(x => `<li><span>${fmtShort(x.d)}</span><b>${fmtNum(x.kg)} kg</b></li>`).join('')}</ul>` : ''}</section>`;
}

/* ---------- Monats-Rückblick ---------- */
const prevMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`; };
const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`; };
const monthDays = m => { const [y, mo] = m.split('-').map(Number); return [...Array(new Date(y, mo, 0).getDate())].map((_, i) => `${m}-${pad(i + 1)}`); };
const r1 = n => Math.round(n * 10) / 10;

function bestSet(sp, sets) {
  const c = sets.filter(s => num(s.b) != null).map(s => ({ a: num(s.a) ?? 0, b: num(s.b), raw: s }));
  if (!c.length) return null;
  c.sort((x, y) => better(sp, x, y) ? -1 : better(sp, y, x) ? 1 : 0);
  return c[0];
}
function better(sp, x, y) {
  if (sp.kind === 'kg' || sp.kind === 'dist') return x.a > y.a || (x.a === y.a && x.b > y.b);
  if (sp.kind === 'assist') return x.a < y.a || (x.a === y.a && x.b > y.b);
  return x.b > y.b;
}

function reviewView() {
  const m = S.month, [y, mo] = m.split('-').map(Number), ds = monthDays(m), cur = today().slice(0, 7);
  const docs = ds.map(d => db.get('d_' + d));
  const pdocs = monthDays(prevMonth(m)).map(d => db.get('d_' + d));
  let h = `<section class="card review"><div class="month-nav"><button data-act="month" data-v="-1" aria-label="Vormonat">‹</button><h3>Rückblick ${MONTHS[mo - 1]} ${y}</h3><button data-act="month" data-v="1" ${m >= cur ? 'disabled' : ''} aria-label="Nächster Monat">›</button></div>`;

  h += `<h4>So ging's dir</h4>`;
  SCALES.forEach(s => {
    const vals = docs.map(x => x?.scales?.[s.k] || 0);
    const a = avg(vals.filter(Boolean)), pa = avg(pdocs.map(x => x?.scales?.[s.k]).filter(Boolean));
    h += `<div class="strip-wrap"><p class="small"><b>${s.short}</b> <span class="muted">Ø ${a ? fmtNum(r1(a)) : '–'} · Vormonat ${pa ? fmtNum(r1(pa)) : '–'}</span></p>
      <div class="strip" style="--n:${ds.length}">${vals.map((v, i) => `<i class="c${v}" title="${fmtDM(ds[i])}: ${v || 'kein Eintrag'}"></i>`).join('')}</div></div>`;
  });
  h += `<div class="legend small muted"><i class="c1"></i>1 <i class="c3"></i>3 <i class="c5"></i>5 <i class="c0"></i>kein Eintrag</div>`;

  const soulYes = docs.filter(x => x?.soul === 'yes').length;
  const wDays = docs.filter(x => x && x.water > 0);
  const bloom = docs.filter(x => x && x.water >= 10).length;
  h += `<div class="kacheln"><div><b>${soulYes}</b><span>Tage etwas für die Seele</span></div><div><b>${wDays.length ? fmtNum(r1(avg(wDays.map(x => x.water)))) : '–'}</b><span>Ø Gläser Wasser</span></div><div><b>${bloom}</b><span>Tage Pflanze geblüht 🌼</span></div></div>`;

  const actDays = ds.map(d => acts(d).filter(isDone));
  const counts = {}; actDays.flat().forEach(x => counts[x.type] = (counts[x.type] || 0) + 1);
  const hs = docs.map(x => x?.health).filter(Boolean);
  const stepsA = avg(hs.map(x => x.steps).filter(v => v != null)), sleepA = avg(hs.map(x => x.sleepH).filter(v => v != null));
  if (stepsA != null || sleepA != null) h += `<div class="kacheln two"><div><b>${stepsA != null ? Math.round(stepsA).toLocaleString('de-DE') : '–'}</b><span>Ø Schritte am Tag</span></div><div><b>${sleepA != null ? fmtSleep(sleepA) : '–'}</b><span>Ø Schlaf</span></div></div>`;
  h += `<h4>Bewegung</h4><p><b>${actDays.filter(a => a.length).length}</b> aktive Tage</p>
    <div class="counts">${MOVES.filter(mv => counts[mv.k]).map(mv => `<span>${mv.e} ${mv.n}: <b>${counts[mv.k]}</b></span>`).join('') || '<span class="muted">Noch nichts in diesem Monat.</span>'}</div>
    <div class="cal">${WD.map(w => `<span class="cal-h">${w}</span>`).join('')}${'<span></span>'.repeat(dow(ds[0]))}${ds.map((d, i) =>
      `<span class="cal-d ${d === today() ? 'today' : ''}"><small>${i + 1}</small>${[...new Set(actDays[i].map(x => x.type))].map(t => EMO[t]).join('')}</span>`).join('')}</div>`;

  /* Fortschritte */
  const byEx = {}, gyms = [];
  ds.forEach(d => acts(d).forEach(x => { if (x.type === 'gym' && hasSets(x)) gyms.push({ d, x }); }));
  gyms.forEach(({ d, x }) => Object.entries(x.sets).forEach(([id, sets]) => (byEx[id] = byEx[id] || []).push({ d, sets, stage: x.stages?.[id] || 1 })));
  const lines = [];
  Object.entries(byEx).forEach(([id, arr]) => {
    if (!EX[id] && !LADDERS[id]) return;
    if (LADDERS[id]) {
      const f = arr[0].stage, l = arr[arr.length - 1].stage;
      if (l > f) { lines.push(`<li><b>${LADDERS[id].name}:</b> Stufe ${f} → Stufe ${l} 🎉</li>`); return; }
      const lastSt = arr.filter(a => a.stage === l); arr = lastSt;
    }
    const sp = exSpec(id, arr[0].stage);
    const a = bestSet(sp, arr[0].sets), b = bestSet(sp, arr[arr.length - 1].sets);
    if (!a || !b) return;
    const name = LADDERS[id] ? `${LADDERS[id].name} (Stufe ${arr[0].stage})` : sp.name;
    lines.push(arr.length < 2 ? `<li><b>${esc(name)}:</b> ${esc(fmtSet(sp, a.raw))} <span class="muted">(1 Einheit)</span></li>`
      : `<li><b>${esc(name)}:</b> ${esc(fmtSet(sp, a.raw))} → ${esc(fmtSet(sp, b.raw))} ${better(sp, b, a) ? '<span class="up">↑</span>' : ''}</li>`);
  });
  const jogs = ds.map(d => acts(d).find(x => x.type === 'jog' && x.done && x.stage)).filter(Boolean);
  if (jogs.length && jogs[jogs.length - 1].stage > jogs[0].stage) lines.push(`<li><b>Joggen:</b> Stufe ${jogs[0].stage} → Stufe ${jogs[jogs.length - 1].stage} 🎉</li>`);
  h += `<h4>Fortschritte</h4>${lines.length ? `<ul class="prog-list">${lines.join('')}</ul><p class="small muted">Stärkster Satz der ersten und der letzten Einheit im Monat.</p>` : '<p class="muted">Sobald du im Gym einträgst, siehst du hier deine Entwicklung.</p>'}`;

  const ws = ds.filter(d => db.get('w_' + d)).map(d => ({ d, kg: db.get('w_' + d).kg }));
  h += `<h4>Gewicht (montags)</h4>`;
  if (ws.length) {
    const diff = ws.length > 1 ? r1(ws[ws.length - 1].kg - ws[0].kg) : null;
    h += `<ul class="neutral-list">${ws.map(w => `<li><span>${fmtShort(w.d)}</span><b>${fmtNum(w.kg)} kg</b></li>`).join('')}</ul>
      ${diff != null ? `<p class="neutral">Veränderung im Monat: ${diff > 0 ? '+' : ''}${fmtNum(diff)} kg</p>` : ''}`;
  } else h += `<p class="muted">Kein Eintrag in diesem Monat.</p>`;
  h += `<p class="small muted">Muskeln, Wasser und Verdauung bewegen die Zahl mit. Schau sie dir immer zusammen mit deiner Kraft und deinem Gefühl an.</p>`;

  const proud = ds.map((d, i) => ({ d, t: docs[i]?.proud?.trim() })).filter(x => x.t);
  h += `<h4>Deine Stolz-Momente</h4>${proud.length ? `<ul class="proud-list">${proud.map(p => `<li><span class="muted small">${fmtShort(p.d)}</span>${esc(p.t)}</li>`).join('')}</ul>` : '<p class="muted">Noch keine in diesem Monat.</p>'}`;
  return h + `</section>`;
}

/* ---------- Import aus der alten App ---------- */
function importView() {
  return `<details class="card import"><summary><b>Daten aus der alten App übernehmen</b></summary>
    <p class="small muted">Füge hier den JSON-Export deiner alten Fitness-App ein. Übernommen werden Gewicht (pro Woche der erste Wert, beim Montag eingetragen), Trainings mit kg und Wiederholungen (wenn die Übungs-ID gleich ist), Klimmzug-Stufe, Rezeptnamen als Lieblingsgerichte und dein Vorrat. Kalorien, Maße und Schritte bewusst nicht.</p>
    <textarea id="importText" rows="5" placeholder='{ "…": … }' aria-label="JSON-Export der alten App"></textarea>
    <button class="btn primary" data-act="runImport">Übernehmen</button><p id="importResult" class="small" aria-live="polite"></p></details>`;
}

function walk(o, fn, key = '', depth = 0) {
  if (depth > 8 || o == null) return;
  fn(key, o);
  if (Array.isArray(o)) o.forEach(v => walk(v, fn, key, depth + 1));
  else if (typeof o === 'object') Object.entries(o).forEach(([k, v]) => walk(v, fn, k, depth + 1));
}
const toISO = v => { if (!v) return null; const s = String(v); const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const de = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (de) return `${de[3]}-${pad(de[2])}-${pad(de[1])}`; if (/^\d{12,}$/.test(s)) return iso(new Date(+s)); return null; };
const dateOf = o => toISO(o.date ?? o.day ?? o.datum ?? o.d ?? o.timestamp ?? o.ts ?? o.createdAt);

function importOld(text) {
  let j; try { j = JSON.parse(text); } catch { throw new Error('Das ist kein gültiges JSON.'); }
  const res = { w: 0, t: 0, l: false, r: 0, p: false };
  /* Gewicht */
  const weights = [];
  walk(j, (k, v) => {
    if (/^w(eight)?_\d{4}-\d{2}-\d{2}$/.test(k)) { const kg = num(typeof v === 'object' ? (v.kg ?? v.weight ?? v.value) : v); if (kg) weights.push({ d: toISO(k), kg }); }
    if (Array.isArray(v) && /weigh|gewicht|wiegen|bodyweight/i.test(k)) v.forEach(e => { if (e && typeof e === 'object') { const d = dateOf(e), kg = num(e.kg ?? e.weight ?? e.value ?? e.gewicht); if (d && kg) weights.push({ d, kg }); } });
  });
  const byWeek = {};
  weights.sort((a, b) => a.d.localeCompare(b.d)).forEach(w => { const mo = mondayOf(w.d); if (!byWeek[mo]) byWeek[mo] = w.kg; });
  Object.entries(byWeek).forEach(([mo, kg]) => { if (!db.get('w_' + mo) && kg > 30 && kg < 300) { db.set('w_' + mo, { kg }); res.w++; } });

  /* Trainings */
  const known = new Set([...Object.keys(EX), ...Object.keys(LADDERS)]);
  const sessions = [];
  walk(j, (k, v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    const d = dateOf(v) || toISO(k.match(/\d{4}-\d{2}-\d{2}/)?.[0]);
    const exs = v.exercises ?? v.uebungen ?? v.sets ?? v.log;
    if (!d || !exs || typeof exs !== 'object') return;
    const out = {};
    const add = (id, sets) => {
      if (!known.has(id) || !Array.isArray(sets)) return;
      const rows = sets.map(s => typeof s === 'object' && s ? { a: String(s.kg ?? s.weight ?? s.gewicht ?? s.assist ?? ''), b: String(s.reps ?? s.wdh ?? s.wiederholungen ?? s.sec ?? s.seconds ?? s.m ?? '') } : { a: '', b: String(s) })
        .map(r => ({ a: r.a === 'undefined' || r.a === 'null' ? '' : r.a, b: r.b === 'undefined' || r.b === 'null' ? '' : r.b }));
      if (rows.some(r => r.a || r.b)) out[id] = rows;
    };
    if (Array.isArray(exs)) exs.forEach(e => e && add(e.id ?? e.exerciseId ?? e.key, e.sets ?? e.saetze));
    else Object.entries(exs).forEach(([id, sets]) => add(id, Array.isArray(sets) ? sets : sets?.sets));
    if (Object.keys(out).length) sessions.push({ d, sets: out });
  });
  sessions.forEach(s => {
    const list = acts(s.d);
    if (list.some(x => x.type === 'gym')) return;
    const ids = Object.keys(s.sets);
    const unit = Object.keys(UNITS).map(u => [u, ids.filter(i => UNITS[u].ex.includes(i)).length]).sort((a, b) => b[1] - a[1])[0][0];
    list.push({ type: 'gym', unit, sets: s.sets, stages: {}, imported: true, ts: Date.now() });
    db.set('a_' + s.d, list); res.t++;
  });

  /* Klimmzug-Stufe, Rezepte, Vorrat */
  walk(j, (k, v) => {
    if (/pull.?up.*(stage|stufe|level)|klimmzug.*(stufe|level)|^pull$/i.test(k) && Number.isInteger(+v) && +v >= 1 && +v <= 4) {
      const L = db.get('ladders', {}); L.pull = +v; db.set('ladders', L); res.l = true;
    }
    if (Array.isArray(v) && /recipe|rezept/i.test(k)) {
      const favs = db.get('favs', []);
      v.forEach(r => { const n = typeof r === 'string' ? r : (r?.name ?? r?.title ?? r?.titel); if (n && !favs.includes(n)) { favs.push(String(n)); res.r++; } });
      db.set('favs', favs);
    }
    if (/pantry|vorrat|zuhause/i.test(k) && (typeof v === 'string' || Array.isArray(v)) && !res.p) {
      const txt = Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : (x?.name ?? '')).filter(Boolean).join(', ') : v;
      if (txt.trim()) { db.set('pantry', txt.trim()); res.p = true; }
    }
  });
  return res;
}

/* ================================================================
   TAB WISSEN
   ================================================================ */
const topicOf = id => TOPICS.find(t => t.id === id) || TOPICS[0];
function factCard(f) {
  const t = topicOf(f.topic);
  return `<article class="fact"><span class="fact-topic">${t.e} ${t.n}</span><h4>${esc(f.title)}</h4><p>${esc(f.text)}</p>${f.tip ? `<p class="tip">💡 ${esc(f.tip)}</p>` : ''}</article>`;
}
function renderWissen() {
  let h = `<section class="card"><h3>🌿 Kopf beruhigen</h3><p class="muted">Wenn der Kopf zu laut ist</p>${CALM.map(c =>
    `<details class="calm" id="calm-${c.id}" ${S.openCalm === c.id ? 'open' : ''}><summary><span class="calm-e">${c.e}</span>${esc(c.n)}</summary>
      <p>${esc(c.why)}</p><ol>${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${PATTERNS[c.id] ? `<button class="btn primary" data-act="guide" data-p="${c.id}">Geführt mitmachen</button>` : ''}</details>`).join('')}</section>`;

  const d = today(), doc = db.get('k_' + d, { facts: [] });
  const topic = S.factTopic || TOPICS[dayNum(d) % TOPICS.length].id;
  h += `<section class="card"><h3>💡 Fakt des Tages</h3><div class="chips" role="group" aria-label="Thema wählen">${TOPICS.map(t =>
    `<button class="chip ${t.id === topic ? 'on' : ''}" data-act="topic" data-t="${t.id}" aria-pressed="${t.id === topic}">${t.e} ${t.n}</button>`).join('')}</div>`;
  if (S.loadingFact) h += `<p class="loading">Einen Moment, ich such was Schönes raus …</p>`;
  h += doc.facts.slice().reverse().map(factCard).join('');
  h += doc.facts.length < 5
    ? `<button class="btn wide" data-act="moreFact" ${S.loadingFact ? 'disabled' : ''}>Noch was über ${topicOf(topic).e} ${topicOf(topic).n}</button>`
    : `<p class="muted small center">Für heute ist genug gelernt. Morgen gibt's Neues 🌙</p>`;
  if (!hasAI()) h += `<p class="small muted center">Ohne KI-Schlüssel kommen die Fakten aus der eingebauten Sammlung. Einrichten unter ⚙️.</p>`;
  const older = db.keys('k_').filter(k => k.slice(2) < d).reverse();
  if (older.length) h += `<details class="sub"><summary>Schon gelernt (${older.reduce((n, k) => n + (db.get(k)?.facts?.length || 0), 0)})</summary>${older.map(k =>
    `<p class="small muted">${fmtShort(k.slice(2))}</p>${(db.get(k)?.facts || []).map(factCard).join('')}`).join('')}</details>`;
  return h + `</section>`;
}

const allFactTitles = () => db.keys('k_').flatMap(k => (db.get(k)?.facts || []).map(f => f.title));
function builtinFact(topic) {
  const shown = new Set(allFactTitles());
  const free = BUILTIN_FACTS.filter(f => !shown.has(f.title));
  const pool = free.length ? free : BUILTIN_FACTS;
  return pool.find(f => f.topic === topic) || pool[dayNum(today()) % pool.length];
}
async function newFact(topic) {
  const d = today(), doc = db.get('k_' + d, { facts: [] });
  if (doc.facts.length >= 5 || S.loadingFact) return;
  S.loadingFact = true; render();
  if (serverHasClaude()) {
    const ok = await runServerJob('fact', { topic });
    if (ok && (db.get('k_' + d, { facts: [] }).facts.length > doc.facts.length)) { S.loadingFact = false; render(); return; }
  }
  let fact;
  if (hasAI()) {
    try { fact = { ...(await aiFact(topic)), topic, ai: true }; }
    catch (e) { toast('KI gerade nicht erreichbar, hier ein eingebauter Fakt. (' + e.message + ')'); }
  }
  if (!fact) { const b = builtinFact(topic); fact = { ...b }; }
  const fresh = db.get('k_' + d, { facts: [] }); fresh.facts.push(fact); db.set('k_' + d, fresh);
  S.loadingFact = false; render();
}
function ensureFact() {
  const d = today();
  if (S.tab === 'wissen' && !db.get('k_' + d) && !S.loadingFact) newFact(S.factTopic || TOPICS[dayNum(d) % TOPICS.length].id);
}

/* ---------- Geführte Atmung ---------- */
let G = null;
function openGuide(id) {
  const p = PATTERNS[id];
  G = { p, id, running: false, elapsed: 0, phase: 0, left: 0, timer: null, done: false };
  const o = $('#overlay');
  o.innerHTML = `<div class="guide" role="dialog" aria-modal="true" aria-label="Geführte Übung: ${esc(p.name)}">
    <button class="close" data-g="close" aria-label="Schließen">✕</button><h3>${esc(p.name)}</h3>
    <div class="circle-wrap"><div class="circle" id="gc"></div><div class="g-center"><div id="gphase" aria-live="polite">Bereit?</div><div id="gsec" class="g-sec"></div></div></div>
    <p id="gleft" class="muted center">${Math.round(p.total / 60 * 10) / 10 > 1 ? 'ca. ' + Math.round(p.total / 60) + ' Minuten' : 'ca. 1–2 Minuten'}</p>
    <div class="row center"><button class="btn primary big" id="gbtn" data-g="start">Starten</button></div></div>`;
  o.hidden = false; document.body.classList.add('noscroll');
  $('#gbtn').focus();
}
function gCircle(kind, dur) {
  const c = $('#gc'); if (!c) return;
  c.style.transition = `transform ${dur}s ease-in-out`;
  c.style.transform = `scale(${kind === 'out' ? 0.5 : kind === 'in2' ? 1.08 : 0.95})`;
}
function gShow() {
  const ph = G.p.phases[G.phase];
  $('#gphase').textContent = ph[0]; $('#gsec').textContent = G.left;
  const rest = Math.max(0, G.p.total - G.elapsed);
  $('#gleft').textContent = `noch ca. ${Math.floor(rest / 60)}:${pad(rest % 60)}`;
}
function gPhase() { const ph = G.p.phases[G.phase]; G.left = ph[1]; gCircle(ph[2], ph[1]); gShow(); }
function gTick() {
  G.left--; G.elapsed++;
  if (G.left > 0) return gShow();
  G.phase = (G.phase + 1) % G.p.phases.length;
  if (G.phase === 0 && G.elapsed >= G.p.total) return gFinish();
  gPhase();
}
function gStart() {
  if (G.done) { G.done = false; G.elapsed = 0; G.phase = 0; }
  G.running = true; $('#gbtn').textContent = 'Pause'; $('#gbtn').dataset.g = 'pause';
  if (G.left > 0) { gCircle(G.p.phases[G.phase][2], G.left); gShow(); } else gPhase();
  G.timer = setInterval(gTick, 1000);
}
function gPause() {
  clearInterval(G.timer); G.running = false;
  const c = $('#gc'); const tr = getComputedStyle(c).transform; c.style.transition = 'none'; c.style.transform = tr;
  $('#gbtn').textContent = 'Weiter'; $('#gbtn').dataset.g = 'start'; $('#gphase').textContent = 'Pause';
}
function gFinish() {
  clearInterval(G.timer); G.running = false; G.done = true; G.left = 0;
  gCircle('in', 1.5);
  $('#gphase').textContent = 'Gut gemacht 🌿'; $('#gsec').textContent = ''; $('#gleft').textContent = 'Spür kurz nach, wie es dir jetzt geht.';
  $('#gbtn').textContent = 'Nochmal'; $('#gbtn').dataset.g = 'start';
}
function closeOverlay() {
  if (G) { clearInterval(G.timer); G = null; }
  const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; document.body.classList.remove('noscroll');
}

/* ================================================================
   TAB MEAL PREP
   ================================================================ */
const proteinOf = m => num(String(m.protein ?? '').match(/\d+(?:[.,]\d+)?/)?.[0]) || 0;
function renderMeal() {
  const plan = db.get('plan') || START_PLAN, doc = dayDoc(), favs = db.get('favs', []), shop = db.get('shop', { checked: {} });
  let h = `<section class="card"><h3>Heute gegessen?</h3><p class="muted small">Zum Abhaken, damit nichts untergeht.</p><ul class="checks">${EAT.map(e =>
    `<li><label class="check"><input type="checkbox" data-act="eat" data-k="${e.k}" ${doc.eaten[e.k] ? 'checked' : ''}><span>${e.e} ${e.n} <span class="muted">${e.t}</span></span></label></li>`).join('')}</ul></section>`;

  const sum = plan.meals.reduce((n, m) => n + proteinOf(m), 0);
  const valid = plan.validFrom && plan.validFrom > today() ? `<p class="badge">Gilt ab ${fmtShort(plan.validFrom)}</p>` : '';
  h += `<section class="card"><h3>Was es diese Woche gibt</h3><p class="plan-title">${esc(plan.title)}</p>${valid}`;
  plan.meals.forEach((m, i) => {
    const slotIcon = /früh/i.test(m.slot) ? '🌅' : /mittag/i.test(m.slot) ? '☀️' : /abend/i.test(m.slot) ? '🌙' : '🥤';
    const favIdx = /mittag/i.test(m.slot) ? 0 : /abend/i.test(m.slot) ? 1 : -1;
    const dish = favIdx >= 0 ? (plan.dishes?.[favIdx] || m.what) : null;
    const isFav = dish && favs.includes(dish);
    h += `<div class="meal"><div class="meal-head"><b>${slotIcon} ${esc(m.slot)}</b><span class="muted small">${esc(m.time || '')}</span>
      ${dish ? `<button class="star ${isFav ? 'on' : ''}" data-act="fav" data-n="${esc(dish)}" aria-pressed="${!!isFav}" aria-label="${isFav ? 'Aus Lieblingsgerichten entfernen' : 'Als Lieblingsgericht merken'}">${isFav ? '★' : '☆'}</button>` : ''}</div>
      <p>${esc(m.what)}</p>${proteinOf(m) ? `<p class="protein">💪 ca. ${proteinOf(m)} g Protein</p>` : ''}</div>`;
  });
  h += `<p class="protein-sum">Zusammen am Tag: 💪 ca. ${sum} g Protein</p>`;
  if (plan.fruit) h += `<p class="info">🍓 ${esc(plan.fruit)}</p>`;
  if (plan.note) h += `<p class="info">🧊 ${esc(plan.note)}</p>`;
  h += `</section>`;

  h += `<section class="card"><h3>Prep-Tag</h3><ol class="prep">${plan.prep.map(p =>
    `<li><p>${esc(p.step)}</p>${p.tools ? `<span class="tools">🍳 ${esc(p.tools)}</span>` : ''}</li>`).join('')}</ol></section>`;

  h += `<section class="card"><h3>Einkaufsliste</h3><p class="small muted">Fleisch bitte halal-zertifiziert.</p>${Object.entries(plan.shop || {}).map(([g, items]) =>
    `<h4>${esc(g)}</h4><ul class="checks shop">${items.map(it => { const key = g + '|' + it; return `<li><label class="check"><input type="checkbox" data-act="shop" data-k="${esc(key)}" ${shop.checked?.[key] ? 'checked' : ''}><span>${esc(it)}</span></label></li>`; }).join('')}</ul>`).join('')}</section>`;

  h += `<section class="card"><h3>Nächster Wochenplan</h3>
    <label class="lbl">Was hast du noch zuhause?<textarea data-inp="pantry" rows="2" placeholder="z. B. halbe Packung Nudeln, 2 Dosen Kichererbsen">${esc(db.get('pantry', '') || '')}</textarea></label>
    <label class="lbl">Worauf hast du Lust?<textarea data-inp="wish" rows="2" placeholder="z. B. was mit Kartoffeln, gern orientalisch">${esc(db.get('wish', '') || '')}</textarea></label>
    <button class="btn primary wide" data-act="newPlan" ${S.loadingPlan || S.jobs.plan ? 'disabled' : ''}>${S.loadingPlan || S.jobs.plan ? 'Plan wird gekocht … 🍲 (bis zu 2 Min)' : 'Neuen Wochenplan erstellen'}</button>
    <p class="small muted">${serverHasClaude() ? 'Claude auf deinem Server plant mit deinem Verlauf, Vorrat und Lieblingsgerichten. Freitags kommt automatisch ein neuer Plan.' : hasAI() ? 'Freitag bis Sonntag erstellt, gilt der Plan für die kommende Woche.' : 'Dafür brauchst du einen KI-Schlüssel (⚙️). Bis dahin gilt der Startplan.'}</p></section>`;

  h += planHistoryCard();
  h += `<section class="card"><h3>Lieblingsgerichte ★</h3>${favs.length ? `<ul class="favs">${favs.map(f =>
    `<li><span>★ ${esc(f)}</span><button class="x" data-act="favDel" data-n="${esc(f)}" aria-label="${esc(f)} entfernen">✕</button></li>`).join('')}</ul><p class="small muted">Fließen ab und zu in neue Pläne ein.</p>` : '<p class="muted">Tipp auf ☆ bei Mittag oder Abend, um ein Gericht zu merken.</p>'}</section>`;
  return h;
}

function normalizePlan(j) {
  if (!j || !Array.isArray(j.meals) || !Array.isArray(j.prep)) throw new Error('Plan unvollständig');
  const shop = {};
  Object.entries(j.shop || {}).forEach(([g, a]) => { if (Array.isArray(a)) shop[g] = a.map(String); });
  return {
    title: String(j.title || 'Neuer Wochenplan'),
    meals: j.meals.map(m => ({ slot: String(m.slot || ''), time: String(m.time || ''), what: String(m.what || ''), protein: proteinOf(m) })),
    fruit: String(j.fruit || ''), note: String(j.note || ''),
    prep: j.prep.map(p => typeof p === 'string' ? { step: p, tools: '' } : { step: String(p.step || ''), tools: String(p.tools || '') }),
    shop,
    dishes: Array.isArray(j.dishes) && j.dishes.length >= 2 ? j.dishes.map(String) : [j.meals[1]?.what, j.meals[2]?.what].map(String),
  };
}
async function generatePlan() {
  if (serverHasClaude()) { flushAll(); await runServerJob('plan'); return; }
  if (!hasAI()) { toast('Für neue Pläne brauchst du einen KI-Schlüssel.'); openSettings(); return; }
  flushAll();
  const t = today(), validFrom = dow(t) >= 4 ? addDays(mondayOf(t), 7) : mondayOf(t);
  const hist = db.get('planHistory', []), favs = db.get('favs', []);
  const useFav = favs.length && hash(t) % 3 === 0;
  const user = `Heute ist ${fmtShort(t)}. Der Plan gilt für die Woche ab ${fmtShort(validFrom)}.
Gerichte der letzten Wochen (bitte andere nehmen): ${hist.slice(-6).flatMap(x => x.dishes || []).join('; ') || 'keine'}
Lieblingsgerichte: ${favs.join('; ') || 'noch keine'}. ${useFav ? 'Bau diesmal eins davon ein, gern leicht abgewandelt.' : 'Diesmal lieber neue Gerichte, die Lieblingsgerichte zeigen nur, was ihm schmeckt.'}
Was noch zuhause ist (verbrauchen, NICHT auf die Einkaufsliste): ${db.get('pantry', '') || 'nichts angegeben'}
Worauf er Lust hat: ${db.get('wish', '') || 'keine Vorgabe'}`;
  S.loadingPlan = true; render();
  try {
    const p = normalizePlan(parseJSON(await ai(PLAN_SYSTEM, user, 6000)));
    Object.assign(p, { created: t, validFrom });
    db.set('plan', p); db.set('shop', { checked: {} });
    hist.push({ date: t, title: p.title, dishes: p.dishes }); db.set('planHistory', hist.slice(-20));
    toast('Neuer Wochenplan ist da 🍲');
  } catch (e) { toast('Das hat nicht geklappt: ' + e.message); }
  S.loadingPlan = false; render();
}

/* ================================================================
   KI
   ================================================================ */
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5-mini', compatible: '' };
async function errText(r) { try { const j = await r.json(); return j.error?.message || j.message || r.status + ''; } catch { return 'Fehler ' + r.status; } }
async function ai(system, user, maxTokens = 1200) {
  const s = settings();
  if (!s.apiKey) throw new Error('Kein API-Schlüssel');
  const model = s.model || DEFAULT_MODEL[s.provider];
  if (!model) throw new Error('Bitte ein Modell eintragen');
  if (s.provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json(); return (j.content || []).map(c => c.text || '').join('');
  }
  const base = s.provider === 'openai' ? 'https://api.openai.com/v1' : String(s.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Bitte eine Basis-URL eintragen');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.apiKey },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(await errText(r));
  const j = await r.json(); return j.choices?.[0]?.message?.content || '';
}
function parseJSON(txt) {
  const t = String(txt).replace(/```json|```/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Antwort war kein JSON');
  return JSON.parse(t.slice(a, b + 1));
}
async function aiFact(topicId) {
  const t = topicOf(topicId), shown = allFactTitles();
  const j = parseJSON(await ai(FACT_SYSTEM, `Thema: ${t.n}.\nSchon gezeigte Titel (nichts Doppeltes):\n${shown.slice(-80).map(x => '- ' + x).join('\n') || '- keine'}`, 800));
  if (!j.title || !j.text) throw new Error('Antwort unvollständig');
  return { title: String(j.title), text: String(j.text), tip: String(j.tip || '') };
}

/* ================================================================
   EINSTELLUNGEN & BACKUP
   ================================================================ */
function openSettings() {
  const s = settings();
  const o = $('#overlay');
  o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Einstellungen">
    <div class="sheet-head"><h3>⚙️ Einstellungen</h3><button class="close" data-g="close" aria-label="Schließen">✕</button></div>
    <label class="lbl">Dein Name in der Begrüßung<input id="sName" type="text" value="${esc(s.name)}"></label>
    <label class="lbl">Darstellung<select id="sTheme"><option value="auto">wie das Handy</option><option value="light">hell</option><option value="dark">dunkel</option></select></label>
    <h4>KI-Zugang</h4><p class="small muted">Nur für „Fakt des Tages“ und „Neuer Wochenplan“. Der Schlüssel bleibt nur auf diesem Gerät und kommt nie in ein Backup.</p>
    <label class="lbl">Anbieter<select id="sProv"><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="compatible">OpenAI-kompatibel</option></select></label>
    <label class="lbl" id="sBaseWrap">Basis-URL<input id="sBase" type="url" value="${esc(s.baseUrl)}" placeholder="https://…/v1"></label>
    <label class="lbl">API-Schlüssel<input id="sKey" type="password" autocomplete="off" value="${esc(s.apiKey)}" placeholder="sk-…"></label>
    <label class="lbl">Modell<input id="sModel" type="text" value="${esc(s.model)}" placeholder=""></label>
    <div class="row"><button class="btn primary" data-g="saveSettings">Speichern</button><button class="btn" data-g="test">Verbindung testen</button></div>
    <p id="sTest" class="small" aria-live="polite"></p>
    <h4>Datenbank auf deinem Server</h4>
    <p class="small muted">Alles wird zuerst auf dem Handy gespeichert und abgeglichen, sobald dein Server erreichbar ist. Übungen, Pläne und Gerichte kommen aus der Datenbank.</p>
    <p id="syncStatus" class="small" aria-live="polite">${esc(syncStatusText())}</p>
    <div class="row"><button class="btn" data-g="syncNow">Jetzt synchronisieren</button></div>
    <h4>Sicherung auf deinem Server</h4>
    <p class="small muted">Läuft Sakina auf deinem eigenen Server, sichert die App deine Einträge automatisch dorthin (beim Öffnen, höchstens alle 30 Minuten). Nichts geht an fremde Server.</p>
    <p id="srvStatus" class="small" aria-live="polite">${esc(serverStatusText())}</p>
    <label class="lbl">Server-Token <span class="muted">(nur falls auf dem Server gesetzt)</span><input id="sToken" type="password" autocomplete="off" value="${esc(s.serverToken)}"></label>
    <div class="row"><button class="btn" data-g="srvBackup">Jetzt sichern</button><button class="btn" data-g="srvRestore">Vom Server wiederherstellen</button></div>
    <h4>Backup als Datei</h4><p class="small muted">Alle Einträge als Datei sichern oder wiederherstellen.</p>
    <div class="row"><button class="btn" data-g="export">Backup exportieren</button><label class="btn file-btn">Backup importieren<input type="file" id="sImport" accept="application/json,.json" hidden></label></div>
    <p class="small muted center">Sakina ${APP_VERSION} · alle Daten bleiben privat auf diesem Gerät.</p></div>`;
  $('#sTheme').value = s.theme; $('#sProv').value = s.provider;
  const sync = () => { const p = $('#sProv').value; $('#sBaseWrap').hidden = p !== 'compatible'; $('#sModel').placeholder = DEFAULT_MODEL[p] || 'Modellname'; };
  $('#sProv').addEventListener('change', sync); sync();
  $('#sImport').addEventListener('change', e => importBackup(e.target.files[0]));
  o.hidden = false; document.body.classList.add('noscroll');
}
function readSettingsForm() {
  const s = settings();
  Object.assign(s, { name: $('#sName').value.trim() || 'Mohammed', theme: $('#sTheme').value, provider: $('#sProv').value, baseUrl: $('#sBase').value.trim(), apiKey: $('#sKey').value.trim(), model: $('#sModel').value.trim(), serverToken: $('#sToken').value.trim() });
  db.set('settings', s); applyTheme();
}
function buildBackup() {
  flushAll();
  const out = { app: 'sakina', version: 1, appVersion: APP_VERSION, exported: new Date().toISOString(), data: {} };
  db.keys('').forEach(k => {
    if (LOCAL_ONLY.includes(k)) return;
    const v = db.get(k);
    if (k === 'settings') { const c = { ...v }; delete c.apiKey; delete c.serverToken; out.data[k] = c; } else out.data[k] = v;
  });
  return out;
}
function exportData() {
  const out = buildBackup();
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `sakina-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup gespeichert');
}
function restoreBackup(j, question) {
  if (!['sakina', 'guter-tag'].includes(j?.app) || !j.data) throw new Error('Das ist kein Sakina-Backup.');
  if (!confirm(question)) return false;
  const cur = settings();
  Object.entries(j.data).forEach(([k, v]) => {
    if (LOCAL_ONLY.includes(k)) return;
    if (k === 'settings') db.set(k, { ...v, apiKey: cur.apiKey, serverToken: cur.serverToken }); else db.set(k, v);
  });
  applyTheme(); closeOverlay(); render(); toast('Backup eingespielt ✓');
  return true;
}
async function importBackup(file) {
  if (!file) return;
  try { restoreBackup(JSON.parse(await file.text()), 'Backup einspielen? Einträge mit gleichem Datum werden überschrieben.'); }
  catch (e) { toast(e.message); }
}

/* ---------- Sicherung auf dem eigenen Server (gleiche Adresse, api/…) ---------- */
const srvHeaders = () => { const t = settings().serverToken; return t ? { 'X-Sakina-Token': t } : {}; };
function serverStatusText() {
  const st = db.get('srv', {});
  if (st.ok) return `✓ Zuletzt gesichert: ${new Date(st.ok).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;
  if (st.backupErr) return `Noch keine Server-Sicherung (${st.backupErr}).`;
  return 'Noch keine Server-Sicherung.';
}
async function serverBackup(manual = false) {
  const st = db.get('srv', {});
  const now = Date.now();
  if (!manual) {
    if (location.protocol === 'file:' || !navigator.onLine) return;
    if (st.ok && now - st.ok < 30 * 60e3) return;          // höchstens alle 30 Minuten
    if (st.tried && now - st.tried < 60 * 60e3 && !st.ok) return; // kein Server? höchstens stündlich probieren
  }
  db.set('srv', { ...st, tried: now });
  try {
    const r = await fetch('api/backup', { method: 'POST', headers: { 'content-type': 'application/json', ...srvHeaders() }, body: JSON.stringify(buildBackup()), cache: 'no-store' });
    if ([404, 405, 501].includes(r.status)) throw new Error('hier läuft kein Sakina-Server');
    if (r.status === 401) throw new Error('Server-Token fehlt oder ist falsch');
    if (!r.ok) throw new Error('Server-Fehler ' + r.status);
    db.set('srv', { ...db.get('srv', {}), ok: Date.now(), tried: now, backupErr: null });
    if (manual) toast('Auf dem Server gesichert ✓');
  } catch (e) {
    db.set('srv', { ...db.get('srv', {}), backupErr: e.message === 'Failed to fetch' ? 'Server nicht erreichbar' : e.message });
    if (manual) toast(db.get('srv').backupErr);
  }
  const el = $('#srvStatus'); if (el) el.textContent = serverStatusText();
}
async function serverRestore() {
  try {
    const r = await fetch('api/backup/latest', { headers: srvHeaders(), cache: 'no-store' });
    if (r.status === 401) throw new Error('Server-Token fehlt oder ist falsch');
    if (r.status === 404) throw new Error('Auf dem Server liegt noch kein Backup (oder hier läuft kein Sakina-Server).');
    if (!r.ok) throw new Error('Server-Fehler ' + r.status);
    const j = await r.json();
    restoreBackup(j, `Backup vom Server einspielen (${j.exported ? new Date(j.exported).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'neuestes'})? Einträge mit gleichem Datum werden überschrieben.`);
  } catch (e) { toast(e.message === 'Failed to fetch' ? 'Server nicht erreichbar' : e.message); }
}

/* ================================================================
   RENDER & EVENTS
   ================================================================ */
function render(keepScroll = true) {
  flushAll();
  if (S.day !== today()) { S.day = today(); S.gymUnit = null; }
  const y = scrollY;
  const openIds = keepScroll ? $$('#view details[open]').map((d, i) => d.id || 'det' + i) : [];
  const f = { heute: renderHeute, bewegung: renderBewegung, wissen: renderWissen, meal: renderMeal }[S.tab];
  $('#view').innerHTML = f();
  $$('#view details').forEach((d, i) => { if (openIds.includes(d.id || 'det' + i)) d.open = true; });
  $$('.tabbar button').forEach(b => { const on = b.dataset.tab === S.tab; b.setAttribute('aria-selected', on); b.classList.toggle('on', on); });
  if (keepScroll) scrollTo(0, y);
  if (S.tab === 'wissen') {
    if (S.openCalm) { const el = $('#calm-' + S.openCalm); S.openCalm = null; el && setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
    ensureFact();
  }
}
function go(tab) { flushAll(); S.tab = tab; render(false); scrollTo(0, 0); }

const ACT = {
  scale(b) { const doc = dayDoc(), k = b.dataset.k, v = +b.dataset.v; if (doc.scales[k] === v) delete doc.scales[k]; else doc.scales[k] = v; saveDay(doc); render(); },
  headHelp() { S.openCalm = 'breath'; go('wissen'); },
  saveProud() { const doc = dayDoc(); doc.proud = $('#proud').value.trim(); saveDay(doc); render(); toast(doc.proud ? 'Schön. Gespeichert ☀️' : 'Gespeichert'); },
  soul(b) { const doc = dayDoc(), v = b.dataset.v; doc.soul = doc.soul === v ? null : v; saveDay(doc); render(); },
  water(b) { const doc = dayDoc(); doc.water = Math.max(0, Math.min(20, (doc.water || 0) + +b.dataset.v)); saveDay(doc); render(); },
  move(b) { const k = b.dataset.k; flushAll(); S.move = S.move === k ? null : k; render(); if (S.move) setTimeout(() => $('#plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); },
  unit(b) { saveGym(); S.gymUnit = b.dataset.u; render(); },
  stage(b) { saveGym(); const L = db.get('ladders', {}); L[b.dataset.l] = +b.dataset.s; db.set('ladders', L); render(); },
  gymFeel(b) {
    saveGym();
    const t = today(), list = acts(t), U = S.gymUnit, v = +b.dataset.v;
    let it = list.find(x => x.type === 'gym' && x.unit === U);
    if (!it) { it = { type: 'gym', unit: U, sets: {}, stages: {}, feel: null }; list.push(it); }
    it.feel = it.feel === v ? null : v;
    if (!hasSets(it) && !it.feel) list.splice(list.indexOf(it), 1);
    db.set('a_' + t, list);
    $$('.sbtn', b.parentElement).forEach(x => { const on = +x.dataset.v === it.feel; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    $('#gymSaved').textContent = '✓ Automatisch gespeichert';
  },
  feel(b) { const type = b.dataset.k, it = getAct(type), v = +b.dataset.v; setAct(type, { feel: it.feel === v ? null : v }); render(); },
  homeCheck(b) { const it = getAct('home'), c = { ...(it.checks || {}) }; c[b.dataset.id] = b.checked; setAct('home', { checks: c }); },
  done(b) { const type = b.dataset.type, it = getAct(type), patch = { done: !it.done }; if (type === 'jog') patch.stage = db.get('jog', { stage: 1 }).stage || 1; setAct(type, patch); render(); if (patch.done) toast('Stark. Eingetragen ' + EMO[type]); },
  jogStage(b) { db.set('jog', { stage: +b.dataset.s }); render(); },
  knee(b) { const it = getAct('jog'), v = b.dataset.v; setAct('jog', { knee: it.knee === v ? null : v }); render(); },
  saveWeight() { const v = num($('#wkg').value); if (!v || v < 30 || v > 300) { toast('Bitte das Gewicht in kg eingeben, z. B. 92,4'); return; } db.set('w_' + today(), { kg: v }); render(); toast('Eingetragen'); },
  month(b) { const m = +b.dataset.v < 0 ? prevMonth(S.month) : nextMonth(S.month); if (m > today().slice(0, 7)) return; S.month = m; render(); },
  async healthPaste() {
    try {
      if (!navigator.clipboard?.readText) throw new Error('nope');
      saveHealth(parseHealth(await navigator.clipboard.readText()));
      S.healthManual = false; render();
    } catch (e) {
      if (e.message !== 'nope' && !/denied|allowed|permission|NotAllowed/i.test(e.message + e.name)) { toast(e.message); return; }
      S.healthManual = true; render();
    }
  },
  healthManual() {
    try { saveHealth(parseHealth($('#healthText').value)); S.healthManual = false; render(); } catch (e) { toast(e.message); }
  },
  runImport() {
    const out = $('#importResult');
    try {
      const r = importOld($('#importText').value);
      out.textContent = `Übernommen: ${r.w} Gewichtswerte, ${r.t} Trainings${r.l ? ', Klimmzug-Stufe' : ''}, ${r.r} Lieblingsgerichte${r.p ? ', Vorrat' : ''}.`;
      toast('Import fertig ✓');
    } catch (e) { out.textContent = e.message; }
  },
  guide(b) { openGuide(b.dataset.p); },
  topic(b) { S.factTopic = b.dataset.t; render(); },
  moreFact() { newFact(S.factTopic || TOPICS[dayNum(today()) % TOPICS.length].id); },
  eat(b) { const doc = dayDoc(); doc.eaten[b.dataset.k] = b.checked; saveDay(doc); },
  shop(b) { const s = db.get('shop', { checked: {} }); s.checked = s.checked || {}; s.checked[b.dataset.k] = b.checked; db.set('shop', s); },
  fav(b) { const f = db.get('favs', []), n = b.dataset.n, i = f.indexOf(n); if (i >= 0) f.splice(i, 1); else f.push(n); db.set('favs', f); render(); },
  favDel(b) { db.set('favs', db.get('favs', []).filter(x => x !== b.dataset.n)); render(); },
  newPlan() { generatePlan(); },
  job(b) { runServerJob(b.dataset.job); },
  async propAccept(b) {
    const id = b.dataset.id, unit = $('#u_' + CSS.escape(id))?.value;
    try { const r = await api('catalog/exercise', { method: 'POST', body: JSON.stringify({ id, action: 'accept', unit }) }); db.set('catalog', r.catalog); applyCatalog(); render(); toast('Übernommen ✓'); }
    catch (e) { toast(e.message); }
  },
  async propReject(b) {
    try { const r = await api('catalog/exercise', { method: 'POST', body: JSON.stringify({ id: b.dataset.id, action: 'reject' }) }); db.set('catalog', r.catalog); applyCatalog(); render(); }
    catch (e) { toast(e.message); }
  },
  async planOpen(b) {
    try { showPlanOverlay(await api('history/plan?id=' + encodeURIComponent(b.dataset.id)), b.dataset.id); }
    catch (e) { toast(e.message); }
  },
  rerender() { render(); },
};

const INP = {
  soulWhat(el) { const v = el.value; later('soulWhat', () => { const doc = dayDoc(); doc.soulWhat = v; saveDay(doc); }); },
  set(el) {
    if (el.dataset.i === '0') {
      const old = el.dataset.old ?? '', nv = el.value;
      $$(`input[data-inp=set][data-ex="${el.dataset.ex}"][data-f="${el.dataset.f}"]`).forEach(o => {
        if (o === el) return;
        if (o.value === '' || o.value === old) o.value = nv;
      });
      el.dataset.old = nv;
    }
    const s = $('#gymSaved'); if (s) s.textContent = 'speichert …';
    later('gym', saveGym, 600);
  },
  note(el) { const v = el.value, id = el.dataset.ex; later('note_' + id, () => { const n = db.get('notes', {}); if (v.trim()) n[id] = v; else delete n[id]; db.set('notes', n); }); },
  homeCustom(el) { const v = el.value; later('homeCustom', () => db.set('homeCustom', v)); },
  actField(el) { const v = el.value.trim(), t = el.dataset.type, f = el.dataset.f; later('af_' + t + f, () => setAct(t, { [f]: v })); },
  pantry(el) { const v = el.value; later('pantry', () => db.set('pantry', v)); },
  wish(el) { const v = el.value; later('wish', () => db.set('wish', v)); },
};

function init() {
  applyTheme();
  const view = $('#view');
  view.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    if (b.tagName === 'INPUT' && b.type === 'checkbox') return; // über change
    ACT[b.dataset.act]?.(b, e);
  });
  view.addEventListener('change', e => { const b = e.target; if (b.matches('input[type=checkbox][data-act]')) ACT[b.dataset.act]?.(b, e); });
  view.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el) INP[el.dataset.inp]?.(el, e); });
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
  $('#btnSettings').addEventListener('click', openSettings);

  const ov = $('#overlay');
  ov.addEventListener('click', async e => {
    if (e.target === ov) return closeOverlay();
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = b.dataset.g;
    if (g === 'close') closeOverlay();
    else if (g === 'start') gStart();
    else if (g === 'pause') gPause();
    else if (g === 'saveSettings') { readSettingsForm(); closeOverlay(); render(); toast('Gespeichert ✓'); }
    else if (g === 'test') {
      readSettingsForm(); const out = $('#sTest'); out.textContent = 'Teste …';
      try { const r = await ai('Antworte nur mit dem Wort OK.', 'Test', 20); out.textContent = '✓ Verbindung klappt' + (r ? ` (Antwort: ${r.trim().slice(0, 30)})` : ''); }
      catch (err) { out.textContent = '✗ ' + err.message; }
    }
    else if (g === 'export') exportData();
    else if (g === 'syncNow') { readSettingsForm(); await checkServer(); await syncNow(true); const el = $('#syncStatus'); if (el) el.textContent = syncStatusText(); }
    else if (g === 'planReuse') {
      const p = { ...showPlanOverlay.current, created: today(), validFrom: mondayOf(today()), reused: true };
      delete p.dbId; db.set('plan', p); db.set('shop', { checked: {} }); closeOverlay(); render(); toast('Plan übernommen 🍲');
    }
    else if (g === 'srvBackup') { readSettingsForm(); serverBackup(true); }
    else if (g === 'srvRestore') { readSettingsForm(); serverRestore(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) closeOverlay(); });

  addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushAll();
    else { if (S.day !== today()) render(); serverBackup(); checkServer().then(() => syncNow()); }
  });

  applyCatalog();
  render(false);
  setTimeout(() => serverBackup(), 1500);
  checkServer().then(() => syncNow());
  setInterval(() => { if (!document.hidden) syncNow(); }, 60e3);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
