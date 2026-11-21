// Erzeugt server/seed_catalog.json und server/prompts/{plan,fact}.md aus data.js.
// Aufruf: node tools/export_seed.js   (nach Änderungen an data.js)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8') + '\n;globalThis.__d={EX,LADDERS,UNITS,HOME_ITEMS,START_PLAN,FACT_SYSTEM,PLAN_SYSTEM,BUILTIN_FACTS};', ctx);
const d = ctx.__d;
const seed = { exercises: [], ladders: [], units: [], dishes: [], plan: d.START_PLAN, facts: d.BUILTIN_FACTS };
for (const [id, e] of Object.entries(d.EX)) seed.exercises.push({ id, category: 'gym', ...e });
d.HOME_ITEMS.forEach((h, i) => seed.exercises.push({ id: h.id, category: 'home', name: h.n, kind: 'check', sort: i }));
for (const [id, l] of Object.entries(d.LADDERS)) seed.ladders.push({ id, name: l.name, stages: l.stages });
for (const [id, u] of Object.entries(d.UNITS)) seed.units.push({ id, ...u });
d.START_PLAN.meals.forEach(m => { if (/mittag|abend/i.test(m.slot)) seed.dishes.push({ name: d.START_PLAN.dishes[/mittag/i.test(m.slot) ? 0 : 1], slot: m.slot, description: m.what, protein: m.protein }); });
fs.writeFileSync(path.join(root, 'server/seed_catalog.json'), JSON.stringify(seed, null, 1));
fs.writeFileSync(path.join(root, 'server/prompts/plan.md'), d.PLAN_SYSTEM + '\n');
fs.writeFileSync(path.join(root, 'server/prompts/fact.md'), d.FACT_SYSTEM + '\n');
console.log('ok', seed.exercises.length, 'Übungen');
