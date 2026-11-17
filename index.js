'use strict';
/* ==========================================================================
   УКРАЇНА: ЕКОНОМІЧНА СТРАТЕГІЯ 2016
   Єдиний файл логіки гри. Без залежностей: працює на GitHub Pages.
   Оптимізація: відсікання об’єктів поза екраном, кеш будиночків міст,
   малювання лише за потреби, щоденний (а не щосекундний) розрахунок економіки.
   ========================================================================== */

/* ---------- 1. Проєкція та геометрія ---------- */
const KX = 111 * Math.cos(48 * Math.PI / 180), KY = 111;
const LON0 = 21.5, LAT0 = 53.0;
const WORLD_W = 20 * KX, WORLD_H = 9.5 * KY;
const P = (lo, la) => ({ x: (lo - LON0) * KX, y: (LAT0 - la) * KY });
const mk = a => a.map(([lo, la]) => P(lo, la));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function segNearest(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = a.x + dx * t, y = a.y + dy * t;
  return { x, y, d: Math.hypot(p.x - x, p.y - y) };
}
function nearestOnLine(p, pts, closed) {
  let best = { d: Infinity }; const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const r = segNearest(p, pts[i], pts[(i + 1) % n]);
    if (r.d < best.d) best = r;
  }
  return best;
}
function segInter(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y, t };
}
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- 2. Географічні дані (спрощено) ---------- */
const UA = mk([[23.55,51.55],[24.1,51.65],[25.0,51.9],[26.2,51.85],[27.2,51.6],[28.5,51.55],[29.3,51.4],[30.2,51.45],[30.6,51.55],[31.8,52.1],[32.4,52.3],[33.7,52.35],[34.4,51.75],[35.3,51.05],[36.2,50.4],[37.5,50.4],[38.1,49.9],[39.2,49.7],[40.1,49.6],[39.8,48.8],[39.9,48.2],[38.9,47.85],[38.25,47.1],[37.6,47.05],[36.8,46.7],[35.4,46.4],[34.8,46.2],[35.2,45.7],[36.1,45.45],[36.6,45.35],[35.4,44.95],[34.4,44.55],[33.6,44.4],[33.4,44.7],[32.6,45.3],[33.1,45.7],[33.6,46.05],[33.0,46.1],[32.4,46.4],[32.0,46.55],[31.55,46.6],[30.75,46.45],[30.3,46.1],[29.65,45.2],[28.9,45.25],[28.2,45.45],[28.6,46.4],[29.15,46.5],[29.7,46.85],[29.95,47.3],[29.55,47.8],[29.1,48.1],[28.4,48.15],[27.6,48.45],[26.6,48.25],[26.0,48.2],[25.2,47.9],[24.5,47.95],[24.0,47.9],[22.9,47.95],[22.1,48.4],[22.55,49.05],[22.7,49.6],[23.5,50.4],[24.1,50.8]]);
const SEA_BLACK = mk([[28.9,45.25],[29.65,45.2],[30.3,46.1],[30.75,46.45],[31.55,46.6],[32.0,46.55],[32.4,46.4],[33.0,46.1],[33.6,46.05],[33.1,45.7],[32.6,45.3],[33.4,44.7],[33.6,44.4],[34.4,44.55],[35.4,44.95],[36.6,45.35],[37.5,45.2],[38.5,44.6],[40.0,43.9],[41.5,43.5],[28.0,43.5],[28.6,44.4]]);
const SEA_AZOV = mk([[34.8,46.2],[35.4,46.4],[36.8,46.7],[37.6,47.05],[38.25,47.1],[39.3,47.2],[39.3,46.6],[38.4,46.2],[37.6,45.6],[36.9,45.35],[36.6,45.35],[36.1,45.45],[35.2,45.7]]);
const OCC_CRIMEA = mk([[34.8,46.2],[35.2,45.7],[36.1,45.45],[36.6,45.35],[35.4,44.95],[34.4,44.55],[33.6,44.4],[33.4,44.7],[32.6,45.3],[33.1,45.7],[33.6,46.05]]);
const OCC_DONBAS = mk([[38.25,47.1],[38.9,47.85],[39.9,48.2],[39.8,48.8],[39.6,49.1],[38.9,48.95],[38.1,48.6],[37.7,48.3],[37.5,47.9],[37.55,47.3],[37.6,47.05]]);
const isOcc = p => inPoly(p, OCC_CRIMEA) || inPoly(p, OCC_DONBAS);
const onSea = p => inPoly(p, SEA_BLACK) || inPoly(p, SEA_AZOV);

const RIVERS = [
  { name: 'Дніпро', w: 3.4, pts: mk([[30.6,51.55],[30.55,51.1],[30.5,50.6],[30.55,50.35],[31.0,50.05],[31.45,49.75],[32.05,49.43],[32.7,49.2],[33.4,49.05],[34.2,48.9],[34.9,48.55],[35.05,48.4],[35.1,47.9],[34.6,47.65],[34.2,47.3],[33.6,47.1],[33.45,46.75],[32.9,46.65],[32.6,46.63],[32.3,46.5]]) },
  { name: 'Дністер', w: 2.2, pts: mk([[22.9,49.0],[23.7,49.1],[24.7,49.1],[25.2,48.9],[25.7,48.65],[26.4,48.55],[27.2,48.5],[27.8,48.45],[28.3,48.15],[28.6,47.7],[29.0,47.2],[29.6,46.8],[29.9,46.45],[30.3,46.1]]) },
  { name: 'Південний Буг', w: 2.0, pts: mk([[26.9,49.6],[27.5,49.35],[28.5,49.2],[29.2,48.7],[30.2,48.45],[30.9,48.05],[31.3,47.6],[31.7,47.3],[31.99,46.97],[31.95,46.8]]) },
  { name: 'Прип’ять', w: 1.8, pts: mk([[24.0,51.45],[25.0,51.5],[26.2,51.45],[27.2,51.5],[28.5,51.45],[29.5,51.45],[30.5,51.4]]) },
  { name: 'Десна', w: 1.8, pts: mk([[33.9,52.3],[33.3,51.95],[32.4,51.65],[31.3,51.5],[30.8,51.1],[30.6,50.6]]) },
  { name: 'Сіверський Донець', w: 1.8, pts: mk([[36.7,50.4],[36.9,49.7],[37.25,49.2],[37.9,49.0],[38.4,48.9],[39.3,48.85],[40.0,48.6]]) },
  { name: 'Ворскла', w: 1.3, pts: mk([[35.4,50.6],[35.3,50.0],[34.9,49.6],[34.6,49.2],[34.5,48.95]]) },
  { name: 'Дунай', w: 2.0, pts: mk([[28.2,45.45],[28.9,45.3],[29.65,45.2]]) }
];
function nearestRiver(p) {
  let best = { d: Infinity };
  for (const r of RIVERS) { const n = nearestOnLine(p, r.pts, false); if (n.d < best.d) best = { ...n, name: r.name }; }
  return best;
}

/* Ресурси і продукція */
const RES = {
  coal: { n: 'Вугілля', ic: '⚫', p: 900, raw: true, col: '#333' },
  iron: { n: 'Залізна руда', ic: '🪨', p: 1200, raw: true, col: '#a0522d' },
  mn: { n: 'Марганець', ic: '🟤', p: 2500, raw: true, col: '#6d4c41' },
  titan: { n: 'Титан', ic: '🔩', p: 4000, raw: true, col: '#78909c' },
  salt: { n: 'Сіль', ic: '🧂', p: 500, raw: true, col: '#cfd8dc' },
  gas: { n: 'Газ', ic: '🔥', p: 1800, raw: true, col: '#ff9800' },
  oil: { n: 'Нафта', ic: '🛢️', p: 2500, raw: true, col: '#212121' },
  grain: { n: 'Зерно', ic: '🌾', p: 700, raw: true, col: '#f9a825' },
  wood: { n: 'Деревина', ic: '🌲', p: 800, raw: true, col: '#2e7d32' },
  fish: { n: 'Риба', ic: '🐟', p: 1500, raw: true, col: '#0288d1' },
  steel: { n: 'Сталь', ic: '🔧', p: 4500 }, fuel: { n: 'Пальне', ic: '⛽', p: 4200 },
  food: { n: 'Продукти', ic: '🍞', p: 2200 }, machine: { n: 'Техніка', ic: '🚜', p: 12000 },
  furn: { n: 'Меблі', ic: '🪑', p: 3500 }, chem: { n: 'Хімія', ic: '⚗️', p: 3800 },
  power: { n: 'Електроенергія', ic: '⚡', p: 600 }
};
// [тип, довгота, широта, радіус км, багатство, море]
const DEPS = [
  ['coal',24.3,50.3,45,1.0],['coal',36.5,48.6,55,1.1],['coal',37.9,48.4,50,1.3],
  ['iron',33.4,47.9,50,1.4],['iron',33.3,49.1,35,1.0],['iron',35.2,47.45,35,0.8],
  ['mn',34.4,47.6,35,1.2],['titan',28.5,50.6,40,1.0],['titan',34.8,48.3,30,1.0],
  ['salt',23.9,48.2,25,1.0],['salt',24.4,49.0,25,1.0],['salt',38.0,48.65,25,1.0],
  ['gas',36.6,49.4,50,1.3],['gas',34.3,50.1,45,1.0],['gas',24.0,49.0,35,0.8],
  ['oil',23.8,49.0,30,0.8],['oil',33.9,50.6,40,1.0],
  ['grain',30.5,49.3,85,1.2],['grain',28.5,49.0,80,1.2],['grain',34.5,49.6,80,1.1],['grain',32.3,48.5,80,1.2],['grain',30.8,47.4,80,1.0],['grain',35.5,47.3,70,1.0],['grain',26.0,50.0,60,1.0],
  ['wood',24.0,48.6,70,1.3],['wood',26.5,51.2,100,1.1],['wood',32.0,51.8,60,1.0],['wood',34.2,51.3,50,0.9],
  ['gas',31.5,45.0,50,1.4,1],['oil',30.3,45.3,40,1.0,1],['fish',36.9,46.2,60,1.2,1],['fish',30.8,45.6,60,1.0,1]
].map((d, i) => { const p = P(d[1], d[2]); return { i, t: d[0], x: p.x, y: p.y, r: d[3], k: d[4], sea: !!d[5], slots: 3, occ: isOcc(p) }; });

const REAL = [['Київ',30.52,50.45],['Харків',36.23,49.99],['Одеса',30.73,46.48],['Дніпро',35.05,48.46],['Запоріжжя',35.14,47.84],['Львів',24.03,49.84],['Кривий Ріг',33.39,47.91],['Миколаїв',31.99,46.97],['Вінниця',28.47,49.23],['Полтава',34.55,49.59],['Чернігів',31.29,51.5],['Черкаси',32.06,49.44],['Житомир',28.66,50.25],['Суми',34.8,50.91],['Рівне',26.25,50.62],['Івано-Франківськ',24.71,48.92],['Тернопіль',25.59,49.55],['Луцьк',25.34,50.75],['Ужгород',22.29,48.62],['Чернівці',25.94,48.29],['Хмельницький',26.99,49.42],['Кропивницький',32.26,48.51],['Херсон',32.61,46.64]].map(c => ({ n: c[0], ...P(c[1], c[2]) }));

const VILLAGES = ['Березівка','Вишневе','Грушівка','Дубове','Затишне','Калинівка','Липівка','Мирне','Озерне','Соснівка','Яблунівка','Лугове','Зелене','Софіївка','Миколаївка','Олександрівка','Петрівка','Іванівка','Михайлівка','Василівка','Андріївка','Катеринівка','Володимирівка','Покровське','Тополівка','Вербове','Лісове','Гірське','Степове','Сонячне','Прибережне','Заріччя','Підгайці','Загір’я','Піщане','Кам’янка','Лозова','Ставки','Богданівка','Гайове','Соколівка','Журавлівка','Лебедівка','Орлівка','Дібрівка','Щасливе','Привілля','Зоряне','Криниця','Малинівка','Роздолля','Тихе','Привітне','Світанок','Калина','Верховина','Рівнопілля','Лугівка','Слобідка','Хутір Вільний'];

const ENEMY_SPOTS = [[40.6,50.1],[40.7,49.3],[40.6,48.5],[40.3,47.6],[31.0,52.7],[33.0,52.7],[34.8,52.4],[34.0,45.2],[35.0,45.4],[38.5,47.8],[39.5,48.7]].map(c => P(c[0], c[1]));

/* ---------- 3. Каталог споруд ---------- */
const CAT = {
  coalmine: { g: 'Видобуток', n: 'Вугільна шахта', ic: '⛏️', cost: 1.2e6, up: 1500, jobs: 400, out: { coal: 7 }, req: 'dep', dep: 'coal', d: 'Будується на родовищі вугілля.' },
  ironmine: { g: 'Видобуток', n: 'Залізорудний кар’єр', ic: '🪨', cost: 1.4e6, up: 1800, jobs: 350, out: { iron: 9 }, req: 'dep', dep: 'iron', d: 'Будується на родовищі залізної руди.' },
  mnmine: { g: 'Видобуток', n: 'Марганцевий кар’єр', ic: '🟤', cost: 1.6e6, up: 1800, jobs: 250, out: { mn: 4 }, req: 'dep', dep: 'mn', d: 'Будується на родовищі марганцю.' },
  titmine: { g: 'Видобуток', n: 'Титановий кар’єр', ic: '🔩', cost: 2e6, up: 2000, jobs: 200, out: { titan: 2 }, req: 'dep', dep: 'titan', d: 'Будується на родовищі титану.' },
  saltmine: { g: 'Видобуток', n: 'Соляна копальня', ic: '🧂', cost: 0.9e6, up: 1200, jobs: 200, out: { salt: 8 }, req: 'dep', dep: 'salt', d: 'Будується на родовищі солі.' },
  gaswell: { g: 'Видобуток', n: 'Газова свердловина', ic: '🔥', cost: 1.8e6, up: 1600, jobs: 120, out: { gas: 8 }, req: 'dep', dep: 'gas', d: 'Будується на газовому родовищі (на суші).' },
  oilwell: { g: 'Видобуток', n: 'Нафтова свердловина', ic: '🛢️', cost: 1.8e6, up: 1600, jobs: 120, out: { oil: 6 }, req: 'dep', dep: 'oil', d: 'Будується на нафтовому родовищі (на суші).' },
  farm: { g: 'Видобуток', n: 'Агрокомплекс', ic: '🌾', cost: 0.8e6, up: 900, jobs: 150, out: { grain: 10 }, req: 'dep', dep: 'grain', d: 'Потрібен чорнозем (зона «Зерно»).' },
  sawmill: { g: 'Видобуток', n: 'Лісозаготівля', ic: '🌲', cost: 0.7e6, up: 800, jobs: 150, out: { wood: 10 }, req: 'dep', dep: 'wood', d: 'Будується в лісовій зоні.' },
  fishbase: { g: 'Видобуток', n: 'Рибальська база', ic: '🐟', cost: 0.9e6, up: 1000, jobs: 120, out: { fish: 6 }, req: 'fish', d: 'На узбережжі, не далі 90 км від рибного району.' },
  platform: { g: 'Видобуток', n: 'Морська платформа', ic: '🏗️', cost: 6e6, up: 9000, jobs: 300, req: 'platform', d: 'У морі на шельфовому родовищі. Потрібен ваш порт у радіусі 250 км. Дає 12 газу або 9 нафти на добу.' },
  port: { g: 'Логістика', n: 'Морський порт', ic: '⚓', cost: 6e6, up: 8000, jobs: 500, req: 'coast', d: 'На узбережжі. Кожен порт додає +12% до цін експорту (до трьох портів). Потрібен для морських платформ.' },
  hub: { g: 'Логістика', n: 'Логістичний хаб', ic: '📦', cost: 3e6, up: 4000, jobs: 150, req: 'city', d: 'Підвищує ефективність усіх споруд у радіусі 100 км на 15%.' },
  steel: { g: 'Промисловість', n: 'Металургійний комбінат', ic: '🏭', cost: 4e6, up: 6000, jobs: 900, inp: { coal: 4, iron: 6 }, out: { steel: 6 }, req: 'city', d: 'Тільки в місті.' },
  machine: { g: 'Промисловість', n: 'Машинобудівний завод', ic: '🚜', cost: 5e6, up: 7000, jobs: 1100, inp: { steel: 5 }, out: { machine: 2 }, req: 'city', d: 'Тільки в місті.' },
  refinery: { g: 'Промисловість', n: 'Нафтопереробний завод', ic: '⛽', cost: 4.5e6, up: 5000, jobs: 500, inp: { oil: 6 }, out: { fuel: 6 }, req: 'city', d: 'Тільки в місті.' },
  food: { g: 'Промисловість', n: 'Харчовий комбінат', ic: '🍞', cost: 2.5e6, up: 3000, jobs: 400, inp: { grain: 10 }, out: { food: 9 }, req: 'city', d: 'Тільки в місті.' },
  furniture: { g: 'Промисловість', n: 'Меблева фабрика', ic: '🪑', cost: 2e6, up: 2500, jobs: 350, inp: { wood: 8 }, out: { furn: 5 }, req: 'city', d: 'Тільки в місті.' },
  chem: { g: 'Промисловість', n: 'Хімічний завод', ic: '⚗️', cost: 3.5e6, up: 4500, jobs: 450, inp: { salt: 5, gas: 4 }, out: { chem: 6 }, req: 'city', d: 'Тільки в місті.' },
  power: { g: 'Промисловість', n: 'Теплова електростанція', ic: '⚡', cost: 3e6, up: 3500, jobs: 250, inp: { coal: 5 }, out: { power: 10 }, req: 'city', d: 'Тільки в місті.' },
  houses: { g: 'Місто', n: 'Житловий квартал', ic: '🏘️', cost: 1e6, up: 500, jobs: 60, req: 'settlement', d: 'Збільшує місткість поселення на 4 000 мешканців.' },
  mall: { g: 'Місто', n: 'Торговий центр', ic: '🛍️', cost: 1.2e6, up: 1500, jobs: 200, req: 'city', d: 'Дає роздрібний дохід і підвищує настрій мешканців.' },
  hospital: { g: 'Місто', n: 'Лікарня', ic: '🏥', cost: 1.5e6, up: 5000, jobs: 300, req: 'city', d: 'Підвищує настрій мешканців.' },
  school: { g: 'Місто', n: 'Університет', ic: '🎓', cost: 2e6, up: 5000, jobs: 250, req: 'city', d: 'Підвищує настрій і швидкість зростання.' },
  base: { g: 'Оборона', n: 'Військова база', ic: '🎖️', cost: 3e6, up: 6000, jobs: 150, req: 'any', d: 'Дозволяє обстрілювати ворога (2 постріли на добу).' },
  aa: { g: 'Оборона', n: 'Протиповітряна оборона', ic: '🛡️', cost: 1.5e6, up: 3000, jobs: 60, req: 'any', d: 'Перехоплює обстріли в радіусі 75 км.' }
};

const WEAPON = {
  art: { n: 'Артилерія', range: 110, cost: 120e3, dB: [14, 26], dBr: [25, 45] },
  rocket: { n: 'Ракетний удар', range: 300, cost: 400e3, dB: [28, 50], dBr: [70, 100] }
};
const BRIDGE = 2.5e6, PONTOON = 250e3, REBUILD = 1.5e6, ROAD_KM = 45e3, RAIL_KM = 130e3, FOUND = 800e3;
const SAVE_KEY = 'ua-econ-2016-v1';
const MONTHS = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];

/* ---------- 4. Стан гри ---------- */
let G = null;
let mode = null;            // поточний режим дій на карті
let net = new Map();        // пропускна здатність дорожньої мережі
const layers = { res: true, rivers: true, labels: true, refs: true };
const fxList = [];
const houseCache = new Map();
const elHours = y => (Date.UTC(y, 2, 31) - Date.UTC(2016, 0, 1)) / 3600000;
const nid = () => G.nid++;

function newGame() {
  G = {
    v: 1, t: 0, money: 8e6, speed: 1, paused: false, over: false, country: null, cap: null, nid: 1,
    st: [], bl: [], rd: [], br: [], stock: {}, pf: {}, prodDay: {},
    fin: { tax: 0, sales: 0, retail: 0, up: 0, svc: 0, net: 0 }, gdp: 0, log: [], mods: { inc: 1, until: 0 },
    el: { next: elHours(2019), lost: 0, camp: 0, warned: false, hist: [] },
    war: { on: false, planned: null, cool: 3 * 365 * 24, bases: [], t0: 0, wins: 0, hits: 0, intercepted: 0, logN: 0 },
    me: { cash: 30000, job: null, shops: [] },
    rv: { cap: null, st: [], charm: 0, founded: false }
  };
  for (const k in RES) { G.stock[k] = 0; G.pf[k] = 1; G.prodDay[k] = 0; }
  houseCache.clear(); fxList.length = 0; mode = null; net = new Map();
}
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); toast('Гру збережено'); } catch (e) { toast('Не вдалося зберегти гру', 'bad'); } }
function loadGame() {
  try {
    const s = localStorage.getItem(SAVE_KEY); if (!s) return false;
    newGame(); const d = JSON.parse(s); Object.assign(G, d);
    for (const k in RES) { if (G.stock[k] == null) G.stock[k] = 0; if (G.pf[k] == null) G.pf[k] = 1; if (G.prodDay[k] == null) G.prodDay[k] = 0; }
    return true;
  } catch (e) { return false; }
}

/* ---------- 5. Допоміжні функції ---------- */
const $ = id => document.getElementById(id);
const fmtN = n => Math.round(n).toLocaleString('uk-UA');
const money = n => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн ₴' : fmtN(n) + ' ₴';
const dateOf = t => new Date(Date.UTC(2016, 0, 1) + t * 3600000);
const dateStr = t => { const d = dateOf(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const capSt = () => G.st.find(s => s.id === G.cap);
const stById = id => G.st.find(s => s.id === id);
const rk = s => 1.4 + Math.sqrt(s.pop) / 85;
function nearestSt(p) { let b = null, bd = Infinity; for (const s of G.st) { const d = dist(s, p); if (d < bd) { bd = d; b = s; } } return b; }
function stAt(p, pad) { for (const s of G.st) if (dist(s, p) <= rk(s) + pad) return s; return null; }
function log(msg, kind) { G.log.unshift({ t: G.t, msg, kind: kind || 'info' }); if (G.log.length > 40) G.log.pop(); toast(msg, kind); }
function toast(msg, kind) {
  const box = $('toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = msg;
  box.appendChild(el); while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => el.remove(), 5200);
}
function fx(p, kind) { fxList.push({ x: p.x, y: p.y, t0: performance.now(), kind }); need = true; }
let need = true;

/* ---------- 6. Правила будівництва ---------- */
function findDep(p, type, sea) {
  let best = null, bd = Infinity;
  for (const d of DEPS) {
    if (sea != null && d.sea !== sea) continue;
    if (type && d.t !== type) continue;
    const dd = dist(d, p); if (dd <= d.r && dd < bd) { bd = dd; best = d; }
  }
  return best;
}
const depUsed = d => G.bl.filter(b => b.dep === d.i).length;
function coastInfo(p) {
  const a = nearestOnLine(p, SEA_BLACK, true), b = nearestOnLine(p, SEA_AZOV, true);
  return a.d < b.d ? a : b;
}
function canPlace(k, p) {
  const d = CAT[k];
  if (isOcc(p)) return { ok: false, why: 'Тимчасово окупована територія' };
  if (d.req === 'platform') {
    if (!onSea(p)) return { ok: false, why: 'Платформа будується в морі' };
    const dep = findDep(p, null, true);
    if (!dep || (dep.t !== 'gas' && dep.t !== 'oil')) return { ok: false, why: 'Потрібне морське родовище газу або нафти' };
    if (!G.bl.some(b => b.k === 'port' && b.hp > 0 && dist(b, p) <= 250)) return { ok: false, why: 'Потрібен ваш порт у радіусі 250 км' };
    if (depUsed(dep) >= dep.slots) return { ok: false, why: 'Усі місця на родовищі зайняті' };
    return { ok: true, dep, pt: p };
  }
  if (!inPoly(p, UA)) return { ok: false, why: 'Це море або чужа територія' };
  if (G.bl.some(b => dist(b, p) < 1.8)) return { ok: false, why: 'Тут уже є споруда' };
  let dep = null, pt = p;
  switch (d.req) {
    case 'dep':
      dep = findDep(p, d.dep, false);
      if (!dep) return { ok: false, why: d.d };
      if (dep.occ) return { ok: false, why: 'Родовище на окупованій території' };
      if (depUsed(dep) >= dep.slots) return { ok: false, why: 'Усі місця на родовищі зайняті' };
      break;
    case 'coast': {
      const c = coastInfo(p); if (c.d > 12) return { ok: false, why: 'Потрібне узбережжя (до 12 км від моря)' };
      pt = { x: c.x, y: c.y }; if (isOcc(pt)) return { ok: false, why: 'Тимчасово окупована територія' };
      break; }
    case 'fish': {
      const c = coastInfo(p); if (c.d > 12) return { ok: false, why: 'Потрібне узбережжя' };
      const f = DEPS.find(x => x.t === 'fish' && dist(x, p) < 90 + x.r);
      if (!f) return { ok: false, why: 'Немає рибного району поблизу' };
      pt = { x: c.x, y: c.y }; break; }
    case 'city': {
      const s = stAt(p, 8); if (!s || s.type !== 'city') return { ok: false, why: 'Споруда потребує міста (клацніть поблизу міста)' };
      break; }
    case 'settlement':
      if (!stAt(p, 8)) return { ok: false, why: 'Потріб