// Собирает data/krasnaya.json из сырого ответа Overpass (data/raw-krasnaya.json).
// Запуск: node tools/build-map.mjs
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const raw = JSON.parse(fs.readFileSync(new URL('data/raw-krasnaya.json', root)));

const LAT0 = 45.0465, LON0 = 38.979;
const D2R = Math.PI / 180, R = 6378137;
const KX = Math.cos(LAT0 * D2R) * R * D2R, KZ = R * D2R;
// x — на восток, z — на юг (север = −z), метры
const proj = (p) => [(p.lon - LON0) * KX, -(p.lat - LAT0) * KZ];
const r1 = (v) => Math.round(v * 10) / 10;
const key = (p) => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);

const CORRIDOR_ROADS = 60, CORRIDOR_BUILDINGS = 80; // с дороги теперь не съехать — дальние кварталы не нужны
const KEEP = /театр драмы|Аврора|Галерея Краснодар|Шухова|Marriott/; // знаковые здания оставляем, даже если они дальше
const STREET = 'Красная улица';

const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry);
const nodes = raw.elements.filter((e) => e.type === 'node');

// ---------- две проезжие части Красной: сшиваем куски в цепочки ----------
const street = ways.filter((w) => w.tags.name === STREET && /^(primary|secondary)$/.test(w.tags.highway));
const usedInChains = new Set();
const turnWays = { north: [], south: [] };

function buildChain(northbound) {
  const set = street.filter((w) => (w.geometry.at(-1).lat > w.geometry[0].lat) === northbound);
  const byStart = new Map();
  for (const w of set) {
    const k = key(w.geometry[0]);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k).push(w);
  }
  const ends = new Set(set.map((w) => key(w.geometry.at(-1))));
  const starts = set.filter((w) => !ends.has(key(w.geometry[0])));
  const dirOf = (a, b) => {
    const [ax, az] = proj(a), [bx, bz] = proj(b);
    const l = Math.hypot(bx - ax, bz - az) || 1;
    return [(bx - ax) / l, (bz - az) / l];
  };
  let best = null;
  for (const start of starts) {
    const chain = [start], seen = new Set([start.id]);
    let cur = start;
    for (;;) {
      const g = cur.geometry;
      const d = dirOf(g.at(-2), g.at(-1));
      const cands = (byStart.get(key(g.at(-1))) || []).filter((w) => !seen.has(w.id));
      if (!cands.length) break;
      // продолжаем тем куском, который идёт прямее всего; при равенстве — где больше полос
      cands.sort((a, b) => {
        const da = dirOf(a.geometry[0], a.geometry[1]), db = dirOf(b.geometry[0], b.geometry[1]);
        const sa = da[0] * d[0] + da[1] * d[1], sb = db[0] * d[0] + db[1] * d[1];
        return sb - sa || (+b.tags.lanes || 1) - (+a.tags.lanes || 1);
      });
      cur = cands[0];
      seen.add(cur.id);
      chain.push(cur);
    }
    let len = 0;
    for (const w of chain) for (let i = 1; i < w.geometry.length; i++) {
      const [ax, az] = proj(w.geometry[i - 1]), [bx, bz] = proj(w.geometry[i]);
      len += Math.hypot(bx - ax, bz - az);
    }
    if (!best || len > best.len) best = { chain, len };
  }
  // Южная проезжая часть в OSM начинается только от шоссе Нефтяников: мимо «Авроры» встречный поток
  // идёт по отрезку, который там подписан как это шоссе. Пристраиваем его в начало, чтобы круг замкнулся.
  if (!northbound) {
    const extra = ways.find((w) => w.id === 26940200);
    if (extra && key(extra.geometry.at(-1)) === key(best.chain[0].geometry[0])) best.chain.unshift(extra);
    else console.warn('не нашёлся отрезок у «Авроры» — круг не замкнётся');
  }
  const pts = [], lanes = [];
  for (const w of best.chain) {
    usedInChains.add(w.id);
    // стрелки на асфальте перед перекрёстком: в OSM это turn:lanes на подходе к нему
    const tl = w.tags['turn:lanes'];
    if (tl && /left|right/.test(tl)) turnWays[northbound ? 'north' : 'south'].push({ at: proj(w.geometry.at(-1)), t: tl.split('|').map((v) => (/left/.test(v) ? 'l' : '') + (/through|none/.test(v) || !v ? 't' : '') + (/right/.test(v) ? 'r' : '')) });
    const n = Math.max(1, +w.tags.lanes || 2);
    w.geometry.forEach((p, i) => {
      const q = proj(p);
      if (pts.length && i === 0) return; // стык: точка уже есть
      if (pts.length) lanes.push(n);
      pts.push(q);
    });
  }
  return resample(pts, lanes, 6);
}

// сглаживание углов (Чайкин) + равномерный шаг, чтобы поток ехал плавно
function resample(pts, lanes, step) {
  let P = pts, L = lanes;
  for (let pass = 0; pass < 2; pass++) {
    const np = [P[0]], nl = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const q = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25];
      const r = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75];
      if (i > 0) { np.push(q); nl.push(L[i]); }
      else nl.push(L[i]);
      if (i < P.length - 2) { np.push(r); nl.push(L[i]); } else { np.push(b); }
    }
    // длины nl и np-1 могут разойтись на единицу — выравниваем
    while (nl.length < np.length - 1) nl.push(L.at(-1));
    nl.length = np.length - 1;
    P = np; L = nl;
  }
  const out = [P[0]], outL = [];
  let carry = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      outL.push(L[i]);
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = P.at(-1), tail = out.at(-1);
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1) { out.push(last); outL.push(L.at(-1)); }
  // убираем мелкую «дрожь» оси (в OSM на перекрёстках много коротких кусочков): скользящее среднее
  for (let pass = 0; pass < 3; pass++) {
    const src = out.map((q) => q.slice());
    for (let i = 2; i < out.length - 2; i++) {
      out[i] = [0, 1].map((k) => (src[i - 2][k] + src[i - 1][k] * 2 + src[i][k] * 3 + src[i + 1][k] * 2 + src[i + 2][k]) / 9);
    }
  }
  // число полос в каждой точке — дробное и плавное: там, где полос становится больше,
  // дорога расширяется постепенно, и линии разметки не ломаются
  let lf = out.map((_, i) => (outL[Math.max(0, i - 1)] + outL[Math.min(outL.length - 1, i)]) / 2);
  for (let pass = 0; pass < 3; pass++) {
    const src = lf.slice();
    for (let i = 0; i < lf.length; i++) {
      let sum = 0, n = 0;
      for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < lf.length) { sum += src[j]; n++; } }
      lf[i] = sum / n;
    }
  }
  return { pts: out.flat().map(r1), lf: lf.map((v) => Math.round(v * 100) / 100) };
}

const chains = { north: buildChain(true), south: buildChain(false) };

// Разворот у «Авроры» в жизни — это левый поворот с Красной на Офицерскую, квартал на запад и ещё раз налево
// на встречную полосу. Сшиваем эти куски OSM в одну дорогу: по ней пойдёт машина и по ней рисуется разметка.
function buildLink(ids) {
  const pts = [], lanes = [];
  for (const id of ids) {
    const w = ways.find((x) => x.id === id);
    if (!w) { console.warn('нет отрезка', id); continue; }
    usedInChains.add(id);
    const n = Math.max(2, Math.min(3, +w.tags.lanes || 2));
    w.geometry.forEach((p, i) => {
      if (pts.length && i === 0) return;
      if (pts.length) lanes.push(n);
      pts.push(proj(p));
    });
  }
  return resample(pts, lanes, 5);
}
const link = buildLink([26942032, 42442416, 47075255, 293181760, 37349718]);

// ---------- расстояние до Красной ----------
const chainPts = [];
for (const c of [...Object.values(chains), link]) for (let i = 0; i < c.pts.length; i += 2) chainPts.push([c.pts[i], c.pts[i + 1]]);
function distToStreet(x, z) {
  let best = Infinity;
  for (let i = 0; i < chainPts.length; i += 3) {
    const d = Math.hypot(chainPts[i][0] - x, chainPts[i][1] - z);
    if (d < best) best = d;
  }
  return best;
}

// ---------- остальные дороги ----------
const roads = [];
for (const w of ways) {
  const t = w.tags;
  if (!t.highway || usedInChains.has(w.id)) continue;
  let pts = w.geometry.map(proj);
  if (!pts.some((p) => distToStreet(p[0], p[1]) < CORRIDOR_ROADS)) continue;
  const far = pts.map((p) => distToStreet(p[0], p[1]) > 170);
  let i0 = far.indexOf(false), i1 = far.lastIndexOf(false);
  pts = pts.slice(Math.max(0, i0 - 1), i1 + 2);
  if (pts.length < 2) continue;
  roads.push({
    n: t.name || undefined,
    c: t.highway.replace('_link', ''),
    l: +t.lanes || 0,
    o: t.oneway === 'yes' ? 1 : 0,
    p: pts.flat().map(r1),
  });
}

// ---------- здания ----------
const hash = (n) => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const buildings = [];
for (const w of ways) {
  const t = w.tags;
  if (!t.building) continue;
  const g = w.geometry;
  if (g.length < 4) continue;
  const pts = g.slice(0, -1).map(proj);
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= pts.length; cz /= pts.length;
  const nearestVertex = Math.min(...pts.map((q) => distToStreet(q[0], q[1])));
  if (nearestVertex > CORRIDOR_BUILDINGS && !(t.name && KEEP.test(t.name) && distToStreet(cx, cz) < 300)) continue;
  let h = parseFloat(t.height);
  if (!(h > 0)) {
    const lv = parseFloat(t['building:levels']);
    if (lv > 0) h = lv * 3.2 + 1.2;
    else if (/garage|shed|kiosk|service|roof/.test(t.building)) h = 3;
    else if (/house|detached/.test(t.building)) h = 4.5;
    else h = 5 + Math.floor(hash(w.id) * 3) * 3.2;
  }
  buildings.push({ h: r1(h), s: Math.floor(hash(w.id + 7) * 1000), p: pts.flat().map(r1), n: t.name || undefined });
}

// ---------- зелень, деревья, светофоры ----------
const greens = [];
for (const w of ways) {
  const t = w.tags;
  if (t.highway || t.building) continue;
  const pts = w.geometry.map(proj);
  if (pts.length < 4) continue;
  if (!pts.some((p) => distToStreet(p[0], p[1]) < 120)) continue;
  greens.push(pts.slice(0, -1).flat().map(r1));
}
const trees = [], signals = [];
for (const n of nodes) {
  const [x, z] = proj(n);
  if (distToStreet(x, z) > 120) continue;
  if (n.tags?.natural === 'tree') trees.push(r1(x), r1(z));
  else if (n.tags?.highway === 'traffic_signals') signals.push(r1(x), r1(z));
}

const marks = {
  theatre: proj({ lat: 45.0351356, lon: 38.9772972 }).map(r1),
  avrora: proj({ lat: 45.058117, lon: 38.9826054 }).map(r1),
};

// ---------- перекрёстки: где названные улицы пересекают каждую проезжую часть ----------
const crossings = [];
for (const [key, c] of Object.entries(chains)) {
  const seen = new Set();
  for (const r of roads) {
    if (!r.n || r.n === STREET || !/^(primary|secondary|tertiary|residential)$/.test(r.c) || seen.has(r.n)) continue;
    let hit = null;
    for (let i = 0; i < r.p.length - 2 && !hit; i += 2) {
      const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
      for (let j = 0; j < c.pts.length - 2; j += 2) {
        const cx = c.pts[j], cz = c.pts[j + 1], dx = c.pts[j + 2], dz = c.pts[j + 3];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { hit = [r1(ax + (bx - ax) * t), r1(az + (bz - az) * t)]; break; }
      }
    }
    if (hit) { seen.add(r.n); crossings.push({ n: r.n, k: key, x: hit[0], z: hit[1], c: r.c }); }
  }
}

// ---------- правки по схеме разметки Яндекс Карт (просмотрена вся улица на приближении 18–19) ----------
// точка оси проезжей части на заданной широте (z)
const chainAtZ = (c, z) => {
  for (let j = 0; j < c.pts.length - 2; j += 2) {
    const a = c.pts[j + 1], b = c.pts[j + 3];
    if ((a - z) * (b - z) <= 0 && a !== b) { const t = (z - a) / (b - a); return [r1(c.pts[j] + (c.pts[j + 2] - c.pts[j]) * t), z]; }
  }
  return null;
};
// Курганный переулок — просто примыкание без светофора и перехода
for (let i = crossings.length - 1; i >= 0; i--) if (/Курганный/.test(crossings[i].n)) crossings.splice(i, 1);
const addCrossing = (n, k, z, c, extra = {}) => { const q = chainAtZ(chains[k], z); if (q) crossings.push({ n, k, x: q[0], z: q[1], c, ...extra }); else console.warn('нет точки для', n, k, z); };
// площадь с фонтаном у арки объезжают два поперечных проезда: Бабушкина с севера и безымянный с юга
if (!crossings.some((c) => c.k === 'north' && /Бабушкина/.test(c.n))) addCrossing('улица Бабушкина', 'north', 18, 'secondary');
addCrossing('проезд у фонтана', 'north', 84, 'tertiary', { link: 1 });
addCrossing('проезд у фонтана', 'south', 76, 'tertiary', { link: 1 });
// Одесская упирается и в западную проезжую часть — там тоже светофор
if (!crossings.some((c) => c.k === 'south' && /Одесская/.test(c.n))) addCrossing('Одесская улица', 'south', -443, 'tertiary');
// пешеходные переходы со светофором посреди квартала (только на западной проезжей части)
addCrossing('переход у «Шурика и Лиды»', 'south', 362, 'ped', { ped: 1 });
addCrossing('переход у сквера Дзержинского', 'south', -885, 'ped', { ped: 1 });
for (const c of crossings) {
  if (/Северная|Хакурате|Гаврилова/.test(c.n)) c.box = 1; // жёлтая «вафельница» на обеих проезжих частях
  // стрелки: ближайший кусок со стрелками, который кончается прямо перед этим перекрёстком
  let best = null, bd = 45;
  for (const w of turnWays[c.k]) {
    const d = Math.hypot(w.at[0] - c.x, w.at[1] - c.z), before = c.k === 'north' ? w.at[1] >= c.z - 6 : w.at[1] <= c.z + 6;
    if (before && d < bd) { bd = d; best = w; }
  }
  if (best) c.a = best.t;
}
// стрелки перед развилкой у «Авроры»: левые ряды уходят на Офицерскую (туда же — разворот)
const arrows = [{ k: 'north', z: -1300, a: ['l', 'lr', 'r'] }].map((m) => ({ ...m, x: chainAtZ(chains[m.k], m.z)[0] }));
// остановки с жёлтым зигзагом у правого бордюра: [проезжая часть, z середины, длина]
const stops = [
  ['south', 1241, 24], ['south', 783, 24], ['south', 555, 24], ['south', 120, 24], ['south', -416, 26], ['south', -732, 24], ['south', -1318, 30],
  ['north', 1291, 24], ['north', 576, 24], ['north', 0, 24], ['north', -499, 24], ['north', -947, 30],
].map(([k, z, len]) => { const q = chainAtZ(chains[k], z); return q ? { k, x: q[0], z, len } : null; }).filter(Boolean);

// ---------- достопримечательности ----------
const poi = JSON.parse(fs.readFileSync(new URL('data/raw-poi.json', root))).elements;
const at = (e) => proj(e.center || e).map(r1);
const landmarks = { fountains: [] };
for (const e of poi) {
  const t = e.tags || {};
  if (t.name === 'Marriott' && t.tourism === 'hotel') landmarks.hotel = [...at(e), +t['building:levels'] || 20];
  if (t.building === 'triumphal_arch') landmarks.arch = at(e);
  else if (t.historic === 'memorial' && t.name === 'Аврора') landmarks.avrora = at(e);
  else if (t.amenity === 'fountain' && e.type === 'way') {
    const [x, z] = at(e);
    if (distToStreet(x, z) < 130) landmarks.fountains.push([x, z, /музык/i.test(t.name || '') ? 13 : 4.5]);
  }
}

// арка в OSM — отношение 7636786 (building=triumphal_arch); в выгрузке POI её нет, берём центр оттуда же
if (!landmarks.arch) landmarks.arch = [-57, -1];
// южный разворот и пост ДПС — по схеме движения с Яндекс Карт, которую прислал пользователь
const turns = { southZ: 1246, patrolZ: 1197 }; // разворот — в разрыве разметки напротив площади; патруль — на островке сразу за Будённого
// цветочные часы у Гаврилова (в OSM — точка «Цветочные часы», в выгрузке достопримечательностей её нет)
landmarks.clock = [76, -837];
// стадион «Динамо»: в OSM его чаши нет, место и размер сняты со схемы Яндекс Карт (овал с дорожкой восточнее Красной)
landmarks.stadium = [274, -502];
// корпус КубГТУ с круглым углом (в OSM это отношение, в выгрузку домов не попало)
landmarks.kubgtu = [-149, 604];
// колокол-памятник святой Екатерине в большом фонтане перед аркой
landmarks.bell = [-70, 47];

const out = { origin: [LAT0, LON0], chains, roads, buildings, greens, trees, signals, marks, crossings, landmarks, turns, link, stops, arrows };
fs.writeFileSync(new URL('data/krasnaya.json', root), JSON.stringify(out));

const chainLen = (c) => { let l = 0; for (let i = 2; i < c.pts.length; i += 2) l += Math.hypot(c.pts[i] - c.pts[i - 2], c.pts[i + 1] - c.pts[i - 1]); return Math.round(l); };
console.log(`север: ${chainLen(chains.north)} м, юг: ${chainLen(chains.south)} м`);
console.log(`дорог ${roads.length}, зданий ${buildings.length}, зелёных зон ${greens.length}, деревьев ${trees.length / 2}, светофоров ${signals.length / 2}`);
console.log(crossings.map((c) => `${c.k[0]} ${c.n} z=${c.z} ${c.a ? c.a.join('|') : '—'}${c.box ? ' вафельница' : ''}`).join('\n'));
console.log(`перекрёстков ${crossings.length}, остановок ${stops.length}, арка ${landmarks.arch}, Аврора ${landmarks.avrora}, фонтанов ${landmarks.fountains.length}, зданий с названием ${buildings.filter((b) => b.n).length}`);
console.log(`размер ${(fs.statSync(new URL('data/krasnaya.json', root)).size / 1024).toFixed(0)} КБ`);
if (process.argv.includes('--turns')) for (const k of ['north', 'south']) console.log(k, turnWays[k].map((w) => `${w.at.map(Math.round)}:${w.t.join('|')}`).join('  '));
