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

const CORRIDOR_ROADS = 330, CORRIDOR_BUILDINGS = 280;
const STREET = 'Красная улица';

const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry);
const nodes = raw.elements.filter((e) => e.type === 'node');

// ---------- две проезжие части Красной: сшиваем куски в цепочки ----------
const street = ways.filter((w) => w.tags.name === STREET && /^(primary|secondary)$/.test(w.tags.highway));
const usedInChains = new Set();

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
  const pts = [], lanes = [];
  for (const w of best.chain) {
    usedInChains.add(w.id);
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
  return { pts: out.flat().map(r1), lanes: outL };
}

const chains = { north: buildChain(true), south: buildChain(false) };

// ---------- расстояние до Красной ----------
const chainPts = [];
for (const c of Object.values(chains)) for (let i = 0; i < c.pts.length; i += 2) chainPts.push([c.pts[i], c.pts[i + 1]]);
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
  const pts = w.geometry.map(proj);
  if (!pts.some((p) => distToStreet(p[0], p[1]) < CORRIDOR_ROADS)) continue;
  roads.push({
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
  if (distToStreet(cx, cz) > CORRIDOR_BUILDINGS) continue;
  let h = parseFloat(t.height);
  if (!(h > 0)) {
    const lv = parseFloat(t['building:levels']);
    if (lv > 0) h = lv * 3.2 + 1.2;
    else if (/garage|shed|kiosk|service|roof/.test(t.building)) h = 3;
    else if (/house|detached/.test(t.building)) h = 4.5;
    else h = 5 + Math.floor(hash(w.id) * 3) * 3.2;
  }
  buildings.push({ h: r1(h), s: Math.floor(hash(w.id + 7) * 1000), p: pts.flat().map(r1) });
}

// ---------- зелень, деревья, светофоры ----------
const greens = [];
for (const w of ways) {
  const t = w.tags;
  if (t.highway || t.building) continue;
  const pts = w.geometry.map(proj);
  if (pts.length < 4) continue;
  if (!pts.some((p) => distToStreet(p[0], p[1]) < CORRIDOR_BUILDINGS)) continue;
  greens.push(pts.slice(0, -1).flat().map(r1));
}
const trees = [], signals = [];
for (const n of nodes) {
  const [x, z] = proj(n);
  if (distToStreet(x, z) > CORRIDOR_BUILDINGS) continue;
  if (n.tags?.natural === 'tree') trees.push(r1(x), r1(z));
  else if (n.tags?.highway === 'traffic_signals') signals.push(r1(x), r1(z));
}

const marks = {
  theatre: proj({ lat: 45.0351356, lon: 38.9772972 }).map(r1),
  avrora: proj({ lat: 45.058117, lon: 38.9826054 }).map(r1),
};

const out = { origin: [LAT0, LON0], chains, roads, buildings, greens, trees, signals, marks };
fs.writeFileSync(new URL('data/krasnaya.json', root), JSON.stringify(out));

const chainLen = (c) => { let l = 0; for (let i = 2; i < c.pts.length; i += 2) l += Math.hypot(c.pts[i] - c.pts[i - 2], c.pts[i + 1] - c.pts[i - 1]); return Math.round(l); };
console.log(`север: ${chainLen(chains.north)} м, юг: ${chainLen(chains.south)} м`);
console.log(`дорог ${roads.length}, зданий ${buildings.length}, зелёных зон ${greens.length}, деревьев ${trees.length / 2}, светофоров ${signals.length / 2}`);
console.log(`размер ${(fs.statSync(new URL('data/krasnaya.json', root)).size / 1024).toFixed(0)} КБ`);
