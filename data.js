'use strict';
/* Sakina – feste Inhalte */

const QUOTES = [
  { t: 'Dein Körper trägt dich jeden Tag. Sei heute nett zu ihm.' },
  { t: 'Du musst heute nicht perfekt sein, nur gut zu dir.' },
  { ar: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا', src: 'البقرة: ٢٨٦' },
  { t: 'Stark ist, wer auf sich achtet.' },
  { t: 'Kleine Schritte zählen genauso.' },
  { t: 'Ruhe ist auch Fortschritt.' },
  { ar: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا، إِنَّ مَعَ الْعُسْرِ يُسْرًا', src: 'الشرح: ٥–٦' },
  { t: 'Dein Körper hat dich schon durch so viel getragen.' },
  { t: 'Du darfst stolz auf dich sein, auch für Kleinigkeiten.' },
  { ar: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ', src: 'الرعد: ٢٨' },
  { t: 'Du bist genug, so wie du heute bist.' },
  { t: 'Pausen machen dich nicht schwächer, sondern stärker.' },
  { ar: 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', src: 'الطلاق: ٣' },
  { t: 'Du bist nicht allein mit dem, was du trägst.' },
];

const SCALES = [
  { k: 'sleep', q: 'Wie haben wir heute Nacht geschlafen?', short: '🌙 Schlaf' },
  { k: 'energy', q: 'Wie ist unser Energielevel heute?', short: '⚡ Energie' },
  { k: 'body', q: 'Wie fühlt sich unser Körper heute an?', short: '💪 Körper' },
  { k: 'head', q: 'Wie ruhig ist dein Kopf heute?', short: '🧠 Kopf' },
];

const SOUL_IDEAS = [
  'Spaziergang ohne Handy',
  'Schwimmen oder Therme',
  'Ein Gebet in Ruhe, ohne Eile',
  'Jemanden anrufen, den du magst',
  'Tee und 10 Minuten nichts tun',
  'Lieblingsmusik laut hören',
  'Etwas Warmes essen, ganz in Ruhe',
];

const MOVES = [
  { k: 'gym', e: '🏋️', n: 'Gym' },
  { k: 'home', e: '🧘', n: 'Zuhause' },
  { k: 'box', e: '🥊', n: 'Boxen' },
  { k: 'jog', e: '🏃', n: 'Joggen' },
  { k: 'swim', e: '🏊', n: 'Schwimmen' },
  { k: 'relax', e: '♨️', n: 'Entspannung' },
];
const EMO = Object.fromEntries(MOVES.map(m => [m.k, m.e]));

/* Gym ------------------------------------------------------------------ */
/* kind: kg (kg + Wdh.), bw (Wdh.), sec (Sekunden), assist (Hilfe kg + Wdh.), dist (kg + Meter) */
const EX = {
  incline_db:   { name: 'Schrägbankdrücken Kurzhantel', sets: 3, lo: 8, hi: 12, kind: 'kg' },
  chest_press:  { name: 'Brustpresse Maschine', sets: 3, lo: 10, hi: 12, kind: 'kg' },
  lateral_raise:{ name: 'Seitheben leicht', sets: 2, lo: 12, hi: 15, kind: 'kg' },
  triceps_cable:{ name: 'Trizepsdrücken Kabel', sets: 2, lo: 10, hi: 12, kind: 'kg' },
  plank:        { name: 'Plank', sets: 3, lo: 30, hi: 45, kind: 'sec' },
  inverted_row: { name: 'Rudern im Hang', sets: 3, lo: 8, hi: 12, kind: 'bw', hint: 'An der Stange oder im Smith-Rack, Körper gerade wie ein Brett.' },
  cable_row:    { name: 'Rudern am Kabel sitzend', sets: 3, lo: 10, hi: 12, kind: 'kg' },
  face_pull:    { name: 'Face Pulls', sets: 3, lo: 12, hi: 15, kind: 'kg' },
  biceps_curl:  { name: 'Bizeps-Curls', sets: 2, lo: 10, hi: 12, kind: 'kg' },
  dead_bug:     { name: 'Dead Bug', sets: 3, lo: 8, hi: 8, kind: 'bw', side: true },
  box_squat:    { name: 'Kniebeuge auf Kasten mit Kurzhantel', sets: 3, lo: 8, hi: 12, kind: 'kg', hint: 'Kurzhantel vor der Brust, kontrolliert auf den Kasten setzen.' },
  hip_thrust:   { name: 'Hip Thrust', sets: 3, lo: 10, hi: 12, kind: 'kg' },
  leg_curl:     { name: 'Beinbeuger sitzend', sets: 2, lo: 10, hi: 12, kind: 'kg' },
  calf_raise:   { name: 'Wadenheben', sets: 2, lo: 12, hi: 15, kind: 'kg' },
  side_plank:   { name: 'Seitstütz', sets: 2, lo: 20, hi: 30, kind: 'sec', side: true },
  bird_dog:     { name: 'Bird Dog', sets: 2, lo: 8, hi: 8, kind: 'bw', side: true },
  hanging_knee: { name: 'Knieheben im Hang', sets: 3, lo: 8, hi: 12, kind: 'bw' },
  farmers_walk: { name: "Farmer's Walk", sets: 3, lo: 30, hi: 30, kind: 'dist' },
  pallof_press: { name: 'Pallof Press', sets: 2, lo: 10, hi: 10, kind: 'kg', side: true },
  glute_bridge_sl: { name: 'Glute Bridge einbeinig', sets: 2, lo: 10, hi: 10, kind: 'bw', side: true, sideWord: 'pro Bein' },
};

const LADDERS = {
  push: {
    name: 'Liegestütz-Weg',
    stages: [
      { n: 'erhöht an der Bank', sets: 3, lo: 8, hi: 12, kind: 'bw' },
      { n: 'am Boden', sets: 3, lo: 6, hi: 12, kind: 'bw' },
      { n: 'langsam (3 s runter)', sets: 3, lo: 6, hi: 10, kind: 'bw' },
      { n: 'eng', sets: 3, lo: 6, hi: 10, kind: 'bw' },
    ],
  },
  pull: {
    name: 'Klimmzug-Weg',
    stages: [
      { n: 'Dead Hang', sets: 3, lo: 20, hi: 30, kind: 'sec' },
      { n: 'negative Klimmzüge (langsam runter)', sets: 3, lo: 3, hi: 5, kind: 'bw' },
      { n: 'assistiert', sets: 3, lo: 5, hi: 8, kind: 'assist' },
      { n: 'echte Klimmzüge', sets: 3, lo: 3, hi: 6, kind: 'bw' },
    ],
  },
};

const UNITS = {
  A: { name: 'Drücken', sub: 'Brust, Schultern, Trizeps', ex: ['push', 'incline_db', 'chest_press', 'lateral_raise', 'triceps_cable', 'plank'] },
  B: { name: 'Ziehen', sub: 'Rücken, Bizeps, Griffkraft', ex: ['pull', 'inverted_row', 'cable_row', 'face_pull', 'biceps_curl', 'dead_bug'] },
  C: { name: 'Beine & Rumpf', sub: 'knie- und rückenschonend', ex: ['box_squat', 'hip_thrust', 'leg_curl', 'calf_raise', 'side_plank', 'bird_dog'] },
  D: { name: 'Ganzkörper & Skills', sub: 'Liegestütz, Klimmzug, Rumpf und Griff', ex: ['push', 'pull', 'hanging_knee', 'farmers_walk', 'pallof_press', 'glute_bridge_sl'] },
};

const FIELDS = {
  kg: { a: 'kg', b: 'Wdh.' },
  assist: { a: 'Hilfe kg', b: 'Wdh.' },
  dist: { a: 'kg', b: 'm', unit: 'm' },
  bw: { a: null, b: 'Wdh.' },
  sec: { a: null, b: 'Sek.', unit: 's' },
};

/* Zuhause / Tipps / Joggen ---------------------------------------------- */
const HOME_ITEMS = [
  { id: 'catcow', n: 'Katze-Kuh, 10× langsam' },
  { id: 'birddog', n: 'Bird Dog, 2×8 pro Seite' },
  { id: 'deadbug', n: 'Dead Bug, 2×8 pro Seite' },
  { id: 'bridge', n: 'Glute Bridge, 2×12' },
  { id: 'sideknee', n: 'Seitstütz auf den Knien, 2×20 s pro Seite' },
  { id: 'child', n: 'Kindhaltung, 1 Minute atmen' },
];

const TIPS = {
  box: {
    title: '🥊 Boxen',
    tips: [
      'Schultern und Handgelenke gut aufwärmen: Armkreisen, Handgelenke kreisen, leichtes Schattenboxen.',
      'Immer bandagieren, das schützt die Handgelenke und Knöchel.',
      'Zieht es in der Schulter: heute Technik am Sack oder Pratzen statt Sparring.',
      'Aus der Hüfte drehen, nicht aus dem unteren Rücken.',
      'Zwischen den Runden bewusst lang ausatmen.',
    ],
  },
  swim: {
    title: '🏊 Schwimmen',
    tips: [
      'Kraul und Rückenschwimmen sind meist rückenschonender als Brustschwimmen mit dem Kopf über Wasser.',
      'Ruhig einschwimmen, die ersten 2–3 Bahnen ganz locker.',
      'Lieber gleichmäßig als schnell. Pausen am Beckenrand sind völlig okay.',
      'Danach gut trinken. Auch im Wasser schwitzt man.',
    ],
  },
  relax: {
    title: '♨️ Entspannung',
    tips: [
      'Therme oder Sauna: zwischen den Gängen abkühlen, ausruhen und viel trinken.',
      'Sanft dehnen, nur so weit, wie es angenehm zieht.',
      'Ein ruhiger Spaziergang zählt auch.',
      'In der Pause wachsen die Muskeln. Erholung ist Teil vom Training.',
    ],
  },
};

const JOG_STAGES = [
  '8× (1 Min laufen / 2 Min gehen)',
  '6× (2 Min laufen / 2 Min gehen)',
  '5× (3 Min laufen / 1,5 Min gehen)',
  '4× (5 Min laufen / 2 Min gehen)',
  '3× (8 Min laufen / 2 Min gehen)',
  '2× (12 Min laufen / 2 Min gehen)',
  '20 Min am Stück',
  '25–30 Min am Stück',
];
const JOG_TIPS = [
  '5 Minuten gehen davor und danach.',
  'Tempo so, dass du noch reden kannst.',
  'Eine Stufe so oft wiederholen, bis sie leicht fällt. Kein Stress.',
];

const ORTHO_HINT = 'Bis zum Orthopäden-Termin gilt: nur, was schmerzfrei geht. Bei ausstrahlendem Schmerz ins Bein, Kribbeln oder Taubheit sofort aufhören und abklären lassen.';

/* Wissen ---------------------------------------------------------------- */
const CALM = [
  {
    id: 'breath', e: '🌬️', n: 'Länger aus- als einatmen',
    why: 'Eine lange Ausatmung schaltet den Teil des Nervensystems ein, der für Ruhe und Erholung zuständig ist. Beim Ausatmen wird der Herzschlag ganz natürlich etwas langsamer.',
    steps: ['Setz dich bequem hin, Schultern locker.', '4 Sekunden ruhig durch die Nase einatmen.', '6 Sekunden langsam durch den Mund ausatmen, als würdest du durch einen Strohhalm pusten.', '6–10 Runden, oder so lange es guttut.'],
  },
  {
    id: 'hum', e: '🐝', n: 'Summen',
    why: 'Summen macht die Ausatmung von selbst lang. Die Vibration spürst du in Hals und Brust, genau dort, wo der Vagusnerv verläuft, der dem Körper beim Runterfahren hilft.',
    steps: ['Mund schließen, Zunge und Kiefer locker.', '4 Sekunden durch die Nase einatmen.', 'Beim Ausatmen „mmmm“ summen, so lange es angenehm ist.', 'Spür die Vibration in Hals und Brust.', '5–8 Runden.'],
  },
  {
    id: 'sigh', e: '😮‍💨', n: 'Doppelt einatmen, lang seufzen',
    why: 'Das zweite kurze Einatmen öffnet die Lunge noch ein Stück. Das lange Seufzen danach entlastet schnell. In einer Studie (2023) hob schon ein paar Minuten davon am Tag die Stimmung.',
    steps: ['Tief durch die Nase einatmen.', 'Ohne auszuatmen noch einmal kurz nachziehen.', 'Langsam und lang durch den Mund ausatmen, wie ein Seufzer.', '3–5 Mal, oder 1–2 Minuten lang.'],
  },
  {
    id: 'senses', e: '👀', n: '5 Sinne: zurück ins Hier',
    why: 'Wenn Gedanken kreisen, holt dich bewusstes Wahrnehmen in den Moment zurück. Der Kopf hat dann etwas Konkretes zu tun.',
    steps: ['5 Dinge, die du siehst.', '4 Dinge, die du spürst (Füße am Boden, Stuhl, Stoff …).', '3 Dinge, die du hörst.', '2 Dinge, die du riechst.', '1 Sache, die du schmeckst, oder ein Schluck Wasser.'],
  },
  {
    id: 'shoulders', e: '🤷', n: 'Schultern fallen lassen',
    why: 'Anspannung sitzt oft unbemerkt in Schultern und Kiefer. Kurz bewusst anspannen und loslassen zeigt dem Körper den Unterschied.',
    steps: ['Schultern hoch zu den Ohren ziehen, 5 Sekunden halten.', 'Mit dem Ausatmen fallen lassen.', 'Kiefer lockern, Zunge vom Gaumen lösen.', '3 Mal wiederholen, dann die Schultern langsam kreisen.'],
  },
  {
    id: 'walk', e: '🚶', n: '10 Minuten raus',
    why: 'Bewegung hilft dem Körper, Stresshormone abzubauen. Tageslicht und frische Luft tun dem Kopf zusätzlich gut.',
    steps: ['Handy in die Tasche oder zuhause lassen.', 'Raus, egal wohin, ruhiges Tempo.', 'Achte auf Dinge um dich herum: Himmel, Bäume, Geräusche.', 'Nach 10 Minuten kurz spüren, wie es dir jetzt geht.'],
  },
  {
    id: 'park', e: '📝', n: 'Gedanken parken',
    why: 'Was auf Papier steht, muss der Kopf nicht mehr festhalten. Das schafft Platz.',
    steps: ['Zettel oder Notizen-App nehmen.', 'Alles aufschreiben, was gerade im Kopf herumgeht, ohne zu sortieren.', 'Bei Erledigungen einen kleinen nächsten Schritt dazuschreiben.', 'Zettel weglegen: „Darum kümmere ich mich später.“'],
  },
  {
    id: 'dhikr', e: '📿', n: 'Dhikr mit ruhigem Atem',
    why: 'Eine ruhige Wiederholung im Atemrhythmus verlangsamt den Atem und gibt dem Kopf einen festen Halt.',
    steps: ['Setz dich ruhig hin, gern mit Gebetskette.', 'Ruhig einatmen.', 'Beim langsamen Ausatmen leise „SubhanAllah“ oder einen Dhikr deiner Wahl.', 'So viele Runden, wie es sich gut anfühlt, zum Beispiel je 33× SubhanAllah, Alhamdulillah, Allahu Akbar.'],
  },
];

const PATTERNS = {
  breath: { name: 'Länger aus- als einatmen', total: 120, phases: [['Einatmen', 4, 'in'], ['Lang ausatmen', 6, 'out']] },
  hum: { name: 'Summen', total: 96, phases: [['Einatmen', 4, 'in'], ['Summen „mmmm“', 8, 'out']] },
  sigh: { name: 'Doppelt einatmen, lang seufzen', total: 90, phases: [['Einatmen', 2, 'in'], ['Nochmal kurz einatmen', 1, 'in2'], ['Lang ausatmen', 6, 'out']] },
};

const TOPICS = [
  { id: 'darm', e: '🦠', n: 'Darm' },
  { id: 'haut', e: '✨', n: 'Haut' },
  { id: 'stress', e: '🌊', n: 'Stress' },
  { id: 'schlaf', e: '🌙', n: 'Schlaf' },
  { id: 'immun', e: '🛡️', n: 'Immunsystem' },
  { id: 'muskeln', e: '💪', n: 'Muskeln & Erholung' },
  { id: 'essen', e: '🥦', n: 'Essen' },
  { id: 'haus', e: '🍯', n: 'Hausmittel' },
  { id: 'kopf', e: '🌿', n: 'Kopf & Entspannung' },
];

const BUILTIN_FACTS = [
  { topic: 'essen', title: 'Knoblauch mag 10 Minuten Pause', text: 'Beim Hacken oder Pressen reagiert ein Stoff im Knoblauch mit einem Enzym, dabei entsteht Allicin. Hitze bremst dieses Enzym schnell aus. Lässt du den gehackten Knoblauch etwa 10 Minuten liegen, bevor er in die Pfanne kommt, bleibt mehr davon erhalten.', tip: 'Knoblauch als Erstes schneiden und dann in Ruhe den Rest vorbereiten.' },
  { topic: 'muskeln', title: 'Muskeln wachsen nachts', text: 'Das Training ist der Reiz, gebaut wird in der Erholung. Im Tiefschlaf schüttet der Körper mehr Wachstumshormon aus und repariert die beanspruchten Muskelfasern. Guter Schlaf ist deshalb echter Teil des Trainings.', tip: 'Nach Gym-Tagen lieber eine halbe Stunde früher ins Bett.' },
  { topic: 'darm', title: 'Dein Darm liebt Ballaststoffe', text: 'Darmbakterien vergären Ballaststoffe zu kurzkettigen Fettsäuren. Die versorgen die Darmwand mit Energie und halten sie stabil. Je bunter die pflanzlichen Lebensmittel über die Woche, desto vielfältiger die Bakterien.', tip: 'Bohnen, Haferflocken, Bulgur und TK-Gemüse sind einfache Ballaststoff-Lieferanten.' },
  { topic: 'kopf', title: 'Bewegung hebt die Laune', text: 'Schon 10 bis 20 Minuten Bewegung können die Stimmung messbar heben. Dabei werden körpereigene Botenstoffe ausgeschüttet, die sich gut anfühlen. Es muss kein hartes Training sein, ein flotter Spaziergang reicht oft.', tip: 'Wenn der Tag zäh ist: einmal um den Block gehen.' },
  { topic: 'schlaf', title: 'Morgenlicht stellt die innere Uhr', text: 'Helles Tageslicht am Morgen ist das stärkste Signal für die innere Uhr. Es hilft dem Körper, abends rechtzeitig müde zu werden. Selbst an grauen Tagen ist draußen viel mehr Licht als drinnen.', tip: 'Nach dem Aufstehen 10 Minuten raus oder ans offene Fenster.' },
  { topic: 'stress', title: 'Dein Körper hat eine Bremse', text: 'Bei Anspannung schaltet der Körper auf Leistung: Puls und Atmung gehen hoch. Das ist normal und geht von allein wieder runter. Eine lange, ruhige Ausatmung ist wie ein Tritt auf die Bremse und hilft beim Runterfahren.', tip: '4 Sekunden ein, 6 Sekunden aus, ein paar Runden lang.' },
  { topic: 'haut', title: 'Deine Haut erneuert sich ständig', text: 'Die oberste Hautschicht erneuert sich ungefähr alle vier Wochen. Nachts ist die Zellteilung besonders aktiv. Guter Schlaf, genug Trinken und Eiweiß unterstützen diesen Prozess ganz einfach.', tip: 'Abends Gesicht waschen und kurz eincremen, dann darf die Haut in Ruhe arbeiten.' },
  { topic: 'immun', title: 'Bewegung hält die Abwehr wach', text: 'Bei regelmäßiger, moderater Bewegung zirkulieren Immunzellen besser durch den Körper. In Studien hatten aktive Menschen im Schnitt weniger Erkältungstage. Wichtig ist das Regelmäßige, nicht das Extreme.', tip: 'Lieber 3–5 entspannte Einheiten pro Woche als eine sehr harte.' },
  { topic: 'essen', title: 'Protein mag Verteilung', text: 'Muskeln können Protein besser nutzen, wenn es über den Tag verteilt kommt. Grob 25 bis 40 Gramm pro Mahlzeit sind ein guter Richtwert. So hat der Körper immer wieder Baumaterial zur Verfügung.', tip: 'Skyr am Morgen und ein Shake nach dem Gym machen das ganz nebenbei.' },
  { topic: 'haus', title: 'Thymian, Zitrone, Ingwer und Honig', text: 'Honig kann laut mehreren Studien Hustenreiz bei Erkältung lindern. Thymian ist als traditionelles Mittel bei Husten anerkannt. Für Ingwer und Zitrone ist die Studienlage dünn, sie wärmen aber und schmecken gut. Ein Wundermittel ist der Sirup nicht, aber eine angenehme Unterstützung.', tip: 'Honig erst einrühren, wenn der Tee nicht mehr kochend heiß ist.' },
  { topic: 'haus', title: 'Fermentierter Honig-Knoblauch', text: 'Knoblauch in Honig fermentiert ein paar Wochen und wird dabei milder. Ob er Erkältungen verkürzt, ist ehrlich gesagt kaum untersucht. Die wenigen Knoblauch-Studien sind klein. Als Hausmittel ist er harmlos und lecker, aber kein Ersatz für Ruhe und Schlaf.', tip: 'Glas nicht ganz voll machen und in den ersten Wochen täglich kurz öffnen.' },
];

/* Meal Prep ------------------------------------------------------------- */
const EAT = [
  { k: 'fr', e: '🌅', n: 'Frühstück', t: '9–10 Uhr' },
  { k: 'mi', e: '☀️', n: 'Mittag', t: '14–15 Uhr' },
  { k: 'ab', e: '🌙', n: 'Abendessen', t: 'ca. 19 Uhr' },
  { k: 'sh', e: '🥤', n: 'Shake', t: 'nach dem Gym' },
];

const START_PLAN = {
  title: 'Hähnchen-Bulgur & Chili mit Reis',
  meals: [
    { slot: 'Frühstück', time: '9–10 Uhr', what: 'Skyr (1 Becher, ca. 450–500 g) mit 4 EL Haferflocken und einer Handvoll TK-Beeren. Ohne Kochen, gern abends schon in eine Schüssel geben.', protein: 50 },
    { slot: 'Mittag', time: '14–15 Uhr', what: 'Hähnchen-Gemüse-Pfanne mit Bulgur, kräftig gewürzt mit Paprika, Kreuzkümmel und Knoblauch.', protein: 50 },
    { slot: 'Abend', time: 'ca. 19 Uhr', what: 'Chili mit Rinderhack, Kidneybohnen, Mais und Reis.', protein: 50 },
    { slot: 'Shake', time: 'nach dem Gym', what: '1 Messlöffel Whey (halal-zertifiziert) mit 300 ml Milch und einer Banane.', protein: 35 },
  ],
  fruit: 'Obst ohne Aufwand: Beeren in den Skyr, Banane zum Shake. An Tagen ohne Gym die Banane einfach so essen.',
  note: 'Die Dosen halten im Kühlschrank etwa 3–4 Tage. Dosen für Tag 5–7 direkt einfrieren und am Vorabend in den Kühlschrank stellen.',
  prep: [
    { step: '700 g Reis mit 1,4 l Wasser und 1 TL Salz aufkochen, zugedeckt 15 Minuten leise köcheln, dann 10 Minuten bei ausgeschaltetem Herd ziehen lassen. Knoblauch (4 Zehen) jetzt schon hacken und liegen lassen.', tools: 'großer Topf' },
    { step: 'Währenddessen 3 Packungen Hähnchenbrust (1,5 kg) in Stücke schneiden. In der großen Pfanne mit 2 EL Öl portionsweise anbraten, mit 2 TL Paprika, 1 TL Kreuzkümmel, dem Knoblauch und Salz würzen.', tools: 'große Pfanne' },
    { step: '1 kg TK-Pfannengemüse zum Hähnchen geben und 8–10 Minuten mitbraten. Pfanne vom Herd nehmen.', tools: 'große Pfanne' },
    { step: 'Fertigen Reis in Schüssel 1 umfüllen. Topf kurz ausspülen.', tools: 'großer Topf · Schüssel 1' },
    { step: '700 g Bulgur mit 1,4 l Wasser und 2 Brühwürfeln (halal) im großen Topf aufkochen, Herd aus, zugedeckt 15 Minuten quellen lassen.', tools: 'großer Topf' },
    { step: 'Hähnchen-Gemüse aus der Pfanne zum Bulgur in den Topf geben, gut umrühren und auf 7 Dosen verteilen (Mittag). Topf ausspülen, Pfanne auswischen.', tools: 'großer Topf · große Pfanne · 7 Dosen' },
    { step: '3 Packungen Rinderhack (1,5 kg) in der großen Pfanne krümelig braten. 1 Beutel TK-Zwiebeln, 2 EL Tomatenmark, 2 TL Paprika, 1 TL Kreuzkümmel, Chili nach Geschmack und Salz dazu. 3 Dosen Kidneybohnen und 1 Dose Mais in Schüssel 2 abspülen (Wasser abgießen).', tools: 'große Pfanne · Schüssel 2' },
    { step: 'Hack in den großen Topf geben, 2 Dosen gehackte Tomaten, Bohnen und Mais dazu, 20 Minuten leise köcheln. Reis aus Schüssel 1 und Chili auf 7 Dosen verteilen (Abend).', tools: 'großer Topf · Schüssel 1 · 7 Dosen' },
  ],
  shop: {
    'Protein': ['Hähnchenbrust, 3 × 500 g (halal)', 'Rinderhack, 3 × 500 g (halal)', 'Skyr natur, 7 Becher à 450–500 g', 'Whey-Protein (halal-zertifiziert), falls leer'],
    'Beilagen': ['Reis, 1 kg', 'Bulgur, 1 kg', 'Haferflocken, 500 g'],
    'Gemüse & Obst': ['TK-Pfannengemüse, 1 kg', 'TK-Zwiebeln, 1 Beutel', 'TK-Beeren, 2 Beutel', 'Bananen, 5–6 Stück', 'Knoblauch, 1 Knolle', 'Gehackte Tomaten, 2 Dosen', 'Kidneybohnen, 3 Dosen', 'Mais, 1 Dose'],
    'Sonstiges': ['Milch, 2–3 l', 'Tomatenmark, 1 Tube', 'Gemüsebrühe (halal), Würfel', 'Paprikapulver, Kreuzkümmel, Chili', 'Öl'],
  },
  dishes: ['Hähnchen-Gemüse-Pfanne mit Bulgur', 'Chili mit Rinderhack, Bohnen und Reis'],
  starter: true,
};

/* KI-Prompts ------------------------------------------------------------ */
const FACT_SYSTEM = `Du schreibst kurze, warme Wissenshäppchen auf Deutsch (du-Form, locker) für eine Wohlfühl-App eines aktiven Mannes.

Regeln, unbedingt einhalten:
- Nur gesichertes Wissen. Wenn die Studienlage dünn ist, sag das ehrlich. Keine Heilversprechen, keine Diagnosen.
- Kein Thema Abnehmen, Kalorien, Körperfett, Gewicht oder Aussehen.
- Ausnahmslos: keine psychischen Erkrankungen, Störungen, Diagnosen oder Krankheitsbezeichnungen. Keine Themen wie Trauma, Kindheit, Missbrauch oder Gewalt. Keine Symptomlisten, keine Selbsttests. Nichts, was zum Grübeln über die eigene Psyche anregt oder in eine Schublade steckt. Nichts, was Angst macht oder Schäden betont. Immer stärkend: was dem Körper guttut.
- Ernährungsbeispiele immer halal (kein Schwein, kein Alkohol, keine Schweinegelatine).
- Thema Hausmittel: Bezug auf fermentierten Honig-Knoblauch und/oder einen Sirup aus Thymian, Zitrone, Ingwer und Honig gegen Erkältungen, mit ehrlicher Einordnung der Studienlage.
- Thema Stress: was im Körper passiert, sachlich und ohne Angst zu machen, Schwerpunkt auf dem Runterfahren.
- Nichts wiederholen, was in der Liste der schon gezeigten Titel steht, auch nicht inhaltlich.

Form: ein kurzer, neugierig machender Titel, 3–5 Sätze Text, ein konkreter Alltagstipp in einem Satz.
Antworte NUR mit JSON, ohne Erklärung davor oder danach:
{"title":"…","text":"…","tip":"…"}`;

const PLAN_SYSTEM = `Du erstellst einen Meal-Prep-Wochenplan auf Deutsch (du-Form, locker) für einen aktiven, 1,91 m großen Mann, der 3–5× pro Woche trainiert.

Regeln, unbedingt einhalten:
- Keine Diät. Großzügige, sättigende Portionen, genug Protein. Kalorien niemals erwähnen.
- Streng halal: kein Schwein, keine Gelatine, kein Alkohol (auch nicht zum Kochen). Fleisch halal-zertifiziert.
- Feste Struktur:
  • Frühstück = Skyr mit Haferflocken (abwandelbar, ohne Kochen)
  • Mittag und Abend = 2 verschiedene Prep-Gerichte, jedes auf genau 7 Dosen (14 Dosen insgesamt)
  • nach dem Gym ein Proteinshake (Whey, halal-zertifiziert) mit Milch
- Er liebt Reis, Bulgur, Nudeln, Kartoffeln und nutzt gern vorgeschnittenes TK-Gemüse. Einfach, schnell, wenige Zutaten, aber abwechslungsreich und gut gewürzt.
- Er isst sonst kein Obst: jeden Tag 1–2 Portionen ohne Aufwand einbauen (z. B. Beeren in den Skyr, Banane zum Shake).
- Seine Küche: 1 großer Topf, 1 mittlerer bis kleiner Topf, 1 sehr kleiner Topf, 1 große Pfanne, 1 kleine Pfanne, 2 Schüsseln, 14 Dosen, Herd. Backofen nur, wenn es Arbeit spart.
- Die Schritte dürfen NIE mehr Geräte gleichzeitig brauchen, als da sind. Wenn etwas nacheinander im selben Topf passiert, schreib das ausdrücklich („Topf ausspülen“, „in Schüssel 1 umfüllen“).
- 90–120 Minuten Kochzeit insgesamt. Mengen möglichst ohne Waage (Packungen, Dosen, EL, TL).
- Einkaufsliste in deutschen Supermarkt-Packungsgrößen. Was er noch zuhause hat, verbrauchen und NICHT auf die Einkaufsliste setzen.
- Andere Gerichte als in den letzten Wochen. Seinen Wunsch und die Lieblingsgerichte berücksichtigen.
- "protein" ist die grobe Menge Protein pro Portion in Gramm, als Zahl.
- Bei jedem Prep-Schritt in "tools" die Geräte nennen, die der Schritt braucht, z. B. "großer Topf · Schüssel 1".

Antworte NUR mit JSON in genau dieser Form, ohne Text davor oder danach:
{"title":"kurzer Name des Plans",
 "meals":[{"slot":"Frühstück","time":"9–10 Uhr","what":"…","protein":45},
          {"slot":"Mittag","time":"14–15 Uhr","what":"…","protein":45},
          {"slot":"Abend","time":"ca. 19 Uhr","what":"…","protein":45},
          {"slot":"Shake","time":"nach dem Gym","what":"…","protein":35}],
 "fruit":"Obst-Hinweis",
 "note":"Aufbewahrungstipp",
 "prep":[{"step":"…","tools":"großer Topf · Schüssel 1"}],
 "shop":{"Protein":["…"],"Beilagen":["…"],"Gemüse & Obst":["…"],"Sonstiges":["…"]},
 "dishes":["Name Mittagsgericht","Name Abendgericht"]}`;
