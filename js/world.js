// Строит ночную Красную из data/*.json: асфальт с разметкой и бордюрами, дома со светящимися окнами
// и витринами, бульвар, фонари с пятнами света, светофоры, ограждения боковых улиц.
// Отдаёт проверки столкновений: со зданиями (hitsSolid) и с бордюром (offRoad).
import * as THREE from 'three';
import { Chain, LANE_W, halfWidth, laneOffset } from './chain.js?v=21';
import { buildLandmarks, CUSTOM_BUILDINGS } from './landmarks.js?v=21';

const ROAD_W = { primary: 10.5, secondary: 9, tertiary: 7.5, residential: 6.5, unclassified: 6, living_street: 5, service: 3.6, pedestrian: 5 };
const WALLS = [0xe8dcc0, 0xf0e2b6, 0xe6c9a8, 0xd9d4c8, 0xcfd6dc, 0xe9b89a, 0xc9b79c, 0xf2ead8, 0xb9c4b4, 0xd8a48a];
const GLASS = [0x8fb0c8, 0x9cc0d4, 0x7f9db4];
// ночная палитра для неосвещаемых поверхностей (земля, асфальт, разметка)
const PAL = { ground: 0x1e2126, lawn: 0x17261b, path: 0x35332e, side: 0x141619, asphalt: 0x191b1f, line: 0xb4b4ac, curb: 0x74777b, curbSide: 0x4b4e53, walk: 0x2b2e34, yellow: 0xb08f2a, roof: 0x15171b };

class Mesher {
  constructor() { this.pos = []; this.col = []; this.uv = []; this.nrm = []; }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, c) {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.col.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
  }
  flatQuad(a, b, c, d, y, col) { // a,b,c,d — [x,z] по кругу
    this.tri(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], col);
    this.tri(a[0], y, a[1], c[0], y, c[1], d[0], y, d[1], col);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.nrm.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    return g;
  }
}

// левые нормали в вершинах ломаной (со «срезом» угла)
function miters(p) {
  const n = p.length / 2, out = new Float32Array(n * 2);
  const dir = (a, b) => { const x = p[b * 2] - p[a * 2], z = p[b * 2 + 1] - p[a * 2 + 1], l = Math.hypot(x, z); return l < 1e-6 ? null : [x / l, z / l]; };
  for (let i = 0; i < n; i++) {
    const d1 = dir(Math.max(0, i - 1), i) || dir(i, Math.min(n - 1, i + 1)) || [1, 0];
    const d2 = dir(i, Math.min(n - 1, i + 1)) || d1;
    let nx = d1[1] + d2[1], nz = -(d1[0] + d2[0]);
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-6) { nx = d1[1]; nz = -d1[0]; } else { nx /= nl; nz /= nl; }
    const k = 1 / Math.max(0.5, nx * d1[1] - nz * d1[0]);
    out[i * 2] = nx * k; out[i * 2 + 1] = nz * k;
  }
  return out;
}

// лента вдоль ломаной: середина смещена на offAt(i) влево, полуширина halfAt(i)
function ribbon(m, p, halfAt, y, col, offAt = () => 0, skipSeg = null) {
  const nr = miters(p), n = p.length / 2;
  for (let i = 0; i < n - 1; i++) {
    if (skipSeg && skipSeg(i)) continue;
    const h0 = halfAt(i), h1 = halfAt(i + 1), o0 = offAt(i), o1 = offAt(i + 1);
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
    const n0x = nr[i * 2], n0z = nr[i * 2 + 1], n1x = nr[i * 2 + 2], n1z = nr[i * 2 + 3];
    m.flatQuad(
      [ax + n0x * (o0 + h0), az + n0z * (o0 + h0)], [bx + n1x * (o1 + h1), bz + n1z * (o1 + h1)],
      [bx + n1x * (o1 - h1), bz + n1z * (o1 - h1)], [ax + n0x * (o0 - h0), az + n0z * (o0 - h0)], y, col);
  }
}

// ломаная, сдвинутая влево на своё расстояние в каждой вершине
function offsetLine(p, offAt) {
  const nr = miters(p), out = new Array(p.length);
  for (let i = 0; i < p.length / 2; i++) { const o = offAt(i); out[i * 2] = p[i * 2] + nr[i * 2] * o; out[i * 2 + 1] = p[i * 2 + 1] + nr[i * 2 + 1] * o; }
  return out;
}

function dashed(m, p, half, y, col, on, gap, skip) {
  let phase = 0;
  for (let i = 0; i < p.length - 2; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len, nx = dz * half, nz = -dx * half;
    let t = -phase;
    while (t < len) {
      const s = Math.max(0, t), e = Math.min(len, t + on);
      if (e > s && !(skip && skip(ax + dx * (s + e) / 2, az + dz * (s + e) / 2))) m.flatQuad(
        [ax + dx * s + nx, az + dz * s + nz], [ax + dx * e + nx, az + dz * e + nz],
        [ax + dx * e - nx, az + dz * e - nz], [ax + dx * s - nx, az + dz * s - nz], y, col);
      t += on + gap;
    }
    phase = (phase + len) % (on + gap);
  }
}

function disc(m, x, z, r, y, col) {
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    m.tri(x, y, z, x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r, col);
  }
}

// ---------- текстуры (рисуются на лету) ----------
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, repeat = true) => {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// стена 4×4 окна: дневной рисунок (map) и ночное свечение части окон (emissiveMap)
function windowTextures() {
  const [c1, g1] = canvas(256, 256), [c2, g2] = canvas(256, 256);
  g1.fillStyle = '#fff'; g1.fillRect(0, 0, 256, 256);
  g2.fillStyle = '#000'; g2.fillRect(0, 0, 256, 256);
  const warm = ['#ffd9a0', '#ffc27a', '#ffe7c2', '#f7d08a', '#cfe4ff', '#ffb86b'];
  for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
    const x = q * 64, y = r * 64;
    g1.fillStyle = '#dedede'; g1.fillRect(x, y + 59, 64, 5);          // межэтажный пояс
    g1.fillStyle = '#c9c9c9'; g1.fillRect(x + 13, y + 11, 38, 39);    // рама
    g1.fillStyle = '#26323f'; g1.fillRect(x + 15, y + 13, 34, 35);    // стекло
    g1.fillStyle = '#c9c9c9'; g1.fillRect(x + 31, y + 13, 2, 35); g1.fillRect(x + 15, y + 25, 34, 2);
    if (rnd() < 0.36) { // в этом окне горит свет
      g2.fillStyle = warm[Math.floor(rnd() * warm.length)];
      g2.globalAlpha = 0.55 + rnd() * 0.45;
      g2.fillRect(x + 15, y + 13, 34, 35);
      g2.globalAlpha = 1;
      g2.fillStyle = '#000'; g2.fillRect(x + 31, y + 13, 2, 35); g2.fillRect(x + 15, y + 25, 34, 2);
      if (rnd() < 0.4) { g2.fillStyle = 'rgba(0,0,0,0.45)'; g2.fillRect(x + 15, y + 13, 16, 35); } // штора
    }
  }
  return [tex(c1), tex(c2)];
}

// первый этаж вдоль улицы: четыре витрины с вывесками, светятся сами
function shopTexture() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#15171a'; g.fillRect(0, 0, 512, 128);
  const signs = ['#c8102e', '#1b6fd0', '#f0a51a', '#1f9d55', '#7a2bd9', '#e8e2d0', '#d94a1e', '#0e8a8a'];
  const glass = ['#ffe2b0', '#fff1d6', '#d6ecff', '#ffd08a'];
  for (let i = 0; i < 4; i++) {
    const x = i * 128;
    g.fillStyle = signs[Math.floor(rnd() * signs.length)]; g.fillRect(x + 8, 8, 112, 26);          // вывеска
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + 22 + rnd() * 20, 16, 40 + rnd() * 30, 9); // «надпись»
    const gr = g.createLinearGradient(0, 42, 0, 118);
    const col = glass[Math.floor(rnd() * glass.length)];
    gr.addColorStop(0, col); gr.addColorStop(1, '#7a6a52');
    g.fillStyle = gr; g.fillRect(x + 10, 42, 108, 76);                                               // витрина
    g.fillStyle = '#15171a'; g.fillRect(x + 62, 42, 4, 76); g.fillRect(x + 10, 96, 108, 3);
    if (i % 2) { g.fillStyle = '#2a2420'; g.fillRect(x + 40, 60, 30, 58); g.fillStyle = col; g.fillRect(x + 44, 64, 22, 50); } // дверь
  }
  return tex(c);
}

export function glowTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

// широкое мягкое пятно света на асфальте — для фонарей и фар
export function poolTexture() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gr.addColorStop(0.62, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}

function stripeTexture() {
  const [c, g] = canvas(128, 32);
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#d3202a';
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  return tex(c);
}

const textCache = new Map();
function textPlane(text, w, h, bg, fg, res = 512, font = 'system-ui, -apple-system, Arial, sans-serif') {
  const key = [text, bg, fg, res, font, Math.round(w / h * 20)].join('|');
  let t = textCache.get(key);
  if (!t) {
    const [c, g] = canvas(res, Math.max(16, Math.round(res * h / w)));
    if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let px = Math.round(c.height * 0.62);
    g.font = `900 ${px}px ${font}`;
    const tw = g.measureText(text).width;
    if (tw > c.width * 0.92) { px = Math.floor(px * c.width * 0.92 / tw); g.font = `900 ${px}px ${font}`; }
    g.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04);
    t = tex(c, false);
    textCache.set(key, t);
  }
  // без фона — только буквы, как объёмная надпись на стене
  const see = bg === 'transparent' ? { transparent: true, alphaTest: 0.35 } : {};
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, ...see }));
}

export function buildWorld(data, scene) {
  const chains = { north: new Chain(data.chains.north.pts, data.chains.north.lf, data.chains.north.ls), south: new Chain(data.chains.south.pts, data.chains.south.lf, data.chains.south.ls) };
  const N = chains.north, S = chains.south, other = { north: S, south: N };
  const C = (h) => new THREE.Color(h);
  const tmp = {}, o = {};
  const up = new THREE.Vector3(0, 1, 0);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), tc = new THREE.Color();

  const flat = (geo, order, offset, opts = {}) => {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4, ...opts });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  // ---------- земля и зелень ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: PAL.ground }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const gm = new Mesher(), lawn = C(PAL.lawn);
  for (const p of data.greens) {
    const contour = [];
    for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      gm.tri(contour[t[0]].x, 0.02, contour[t[0]].y, contour[t[1]].x, 0.02, contour[t[1]].y, contour[t[2]].x, 0.02, contour[t[2]].y, lawn);
    }
  }

  // ---------- перекрёстки: где поперечные улицы пересекают каждую проезжую часть ----------
  const crossings = [];
  for (const c of data.crossings || []) {
    const ch = chains[c.k];
    ch.project(c.x, c.z, -1, o);
    if (o.s < 30 || o.s > ch.total - 30) continue;
    const half = c.ped ? 2.5 : /primary|secondary/.test(c.c) ? 8 : 5.5;
    // ped — пешеходный переход посреди квартала, link — проезд через бульвар (боковой улицы нет)
    // С какой стороны на самом деле есть проезд (боковая улица или проезд через бульвар): [справа, слева].
    // Только там нет бордюра и можно немного заехать за край.
    const open = [-1, 1].map((sign) => {
      if (c.ped) return false;
      const d = halfWidth(o.lf) + 7, qx = c.x + o.dz * sign * d, qz = c.z - o.dx * sign * d;
      for (const r of data.roads) {
        if (/foot|path|pedestrian|cycle|steps|track/.test(r.c)) continue;
        for (let i = 0; i < r.p.length - 2; i += 2) {
          const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2] - ax, bz = r.p[i + 3] - az, l2 = bx * bx + bz * bz || 1;
          const t = Math.max(0, Math.min(1, ((qx - ax) * bx + (qz - az) * bz) / l2));
          if (Math.hypot(ax + bx * t - qx, az + bz * t - qz) < 6.5) return true;
        }
      }
      return false;
    });
    crossings.push({ n: c.n, k: c.k, cls: c.c, s: o.s, x: c.x, z: c.z, dx: o.dx, dz: o.dz, half, ped: !!c.ped, link: !!c.link, box: !!c.box, a: c.a || null, zb: c.zb ?? 1, za: c.za ?? 1, open, stopS: c.ped ? o.s - 4.2 : o.s - half - 7 });
  }
  // перед стоп-линией полосы разделены сплошной
  const SOLID = 36;
  const inSolid = (k, x, z) => {
    for (const c of crossings) {
      if (c.k !== k) continue;
      const along = (x - c.x) * c.dx + (z - c.z) * c.dz, st = c.stopS - c.s;
      if (along > st - SOLID && along < st + 0.5 && Math.hypot(x - c.x, z - c.z) < 70) return true;
    }
    return false;
  };
  // точка внутри «коробки» перекрёстка этой проезжей части?
  const inCrossing = (k, x, z, pad = 0) => {
    for (const c of crossings) {
      if (c.k !== k) continue;
      const along = (x - c.x) * c.dx + (z - c.z) * c.dz;
      if (Math.abs(along) < c.half + pad && Math.hypot(x - c.x, z - c.z) < 40) return true;
    }
    return false;
  };

  // точка у края дороги попадает в устье боковой улицы?
  const inMouth = (k, x, z, sign) => {
    for (const c of crossings) {
      if (c.k !== k || c.ped || !c.open[sign > 0 ? 1 : 0]) continue;
      const along = (x - c.x) * c.dx + (z - c.z) * c.dz;
      if (Math.abs(along) < c.half + 2.5 && Math.hypot(x - c.x, z - c.z) < 40) return true;
    }
    return false;
  };
  // точка лежит на асфальте связки у «Авроры»? (нужно раньше, чем связка нарисована)
  const nearLinkLate = (x, z) => {
    const L = data.link;
    for (let i = 0; i < L.pts.length; i += 2) if (Math.hypot(L.pts[i] - x, L.pts[i + 1] - z) < halfWidth(L.lf[i / 2]) + 0.4) return true;
    return false;
  };

  // ---------- дороги ----------
  const rm = new Mesher(), mm = new Mesher(), cm = new Mesher();
  const side = C(PAL.side), asphalt = C(PAL.asphalt), line = C(PAL.line), curb = C(PAL.curb), curbSide = C(PAL.curbSide), walk = C(PAL.walk), yellow = C(PAL.yellow);
  // боковые улицы — только как фон: по ним не ездят, разметка не нужна
  for (const r of data.roads) {
    const w = r.l > 0 ? r.l * 3.4 + 0.6 : (ROAD_W[r.c] || 6);
    ribbon(rm, r.p, () => w / 2, 0.04, r.c === 'pedestrian' ? C(PAL.path) : side);
    disc(rm, r.p[0], r.p[1], w / 2, 0.04, side);
    disc(rm, r.p.at(-2), r.p.at(-1), w / 2, 0.04, side);
  }
  const reflectors = [];
  for (const key of ['north', 'south']) {
    const ch = chains[key], oth = other[key], p = data.chains[key].pts, lf = ch.lf, n = ch.n;
    const half = (i) => halfWidth(lf[i]);
    ribbon(rm, p, half, 0.05, asphalt);
    const skip = (x, z) => inCrossing(key, x, z, 1);
    // Гладкий одноцветный асфальт не даёт глазу зацепиться — скорость не чувствуется. Добавляем то, что есть
    // на любой дороге: поперечные швы, заплаты посветлее и потемнее, люки. Всё это мелькает под машиной.
    {
      let sd = key === 'north' ? 77 : 177;
      const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const seam = asphalt.clone().multiplyScalar(0.62), light = asphalt.clone().multiplyScalar(1.22), darkP = asphalt.clone().multiplyScalar(0.8);
      const quadAt = (s0, s1, l0, l1, col, y) => { // прямоугольник: вдоль от s0 до s1, поперёк от l0 до l1 (влево от оси)
        ch.at(s0, o); const a = [o.x + o.dz * l0, o.z - o.dx * l0], b = [o.x + o.dz * l1, o.z - o.dx * l1];
        ch.at(s1, o); mm.flatQuad(a, b, [o.x + o.dz * l1, o.z - o.dx * l1], [o.x + o.dz * l0, o.z - o.dx * l0], y, col);
      };
      for (let s = 6; s < ch.total - 8; s += 9) {
        ch.at(s, o);
        if (skip(o.x, o.z)) continue;
        const lanesHere = Math.max(1, Math.round(o.lf)), w = o.lf / 2 * LANE_W;
        for (let j = 0; j < lanesHere; j++) {
          const l1 = w - j * LANE_W - 0.2, l0 = w - (j + 1) * LANE_W + 0.2;
          quadAt(s + (j % 2) * 1.5, s + (j % 2) * 1.5 + 0.1, l0, l1, seam, 0.066);                        // шов поперёк ряда
          const r = rr();
          if (r < 0.2) quadAt(s + 2, s + 4 + rr() * 3.5, l0 + 0.15 + rr() * 0.5, l1 - 0.15 - rr() * 0.5, r < 0.1 ? light : darkP, 0.064); // заплата
          else if (r < 0.26) { const m = (l0 + l1) / 2 + (rr() - 0.5) * 1.6; ch.at(s + 5, o); disc(mm, o.x + o.dz * m, o.z - o.dx * m, 0.36, 0.066, seam); } // люк
        }
      }
    }
    // линии между полосами: j-я линия есть там, где правее неё помещается хотя бы полполосы
    // Линия m отделяет ряд m от ряда m + 1 (см. нумерацию рядов в chain.js): карман слева добавляет линию 0
    // и не сдвигает остальные — они идут прямо.
    const ls = ch.ls;
    for (let j = 0; j <= 4; j++) {
      let from = -1;
      for (let i = 0; i <= n; i++) {
        const ok = i < n && j + ls[i] >= 0.5 && lf[i] - j - ls[i] >= 0.5;
        if (ok && from < 0) from = i;
        if (!ok && from >= 0) {
          const f0 = from;
          if (i - f0 >= 2) dashed(mm, offsetLine(p.slice(f0 * 2, i * 2), (k) => (lf[f0 + k] / 2 - j - ls[f0 + k]) * LANE_W), 0.075, 0.08, line, 3, 6, (x, z) => skip(x, z) || inSolid(key, x, z));
          from = -1;
        }
      }
    }
    // сплошные по краям, тротуар справа и бордюры
    const onOther = (i, sign) => { // край в этой точке выходит на соседнюю проезжую часть — бордюра нет
      const nx = ch.z[Math.min(n - 1, i + 1)] - ch.z[Math.max(0, i - 1)], nz = -(ch.x[Math.min(n - 1, i + 1)] - ch.x[Math.max(0, i - 1)]);
      const l = Math.hypot(nx, nz) || 1, e = sign * (half(i) + 0.4);
      oth.project(ch.x[i] + nx / l * e, ch.z[i] + nz / l * e, -1, tmp);
      return !tmp.past && Math.abs(tmp.lat) < halfWidth(tmp.lf) + 0.2;
    };
    for (const sign of [1, -1]) {
      const open = new Uint8Array(n);
      const edgeAll = offsetLine(p, (i) => sign * (half(i) + 0.3));
      // на перекрёстке бордюра нет: там просто невидимая граница (съехать на боковую улицу всё равно нельзя)
      for (let i = 0; i < n; i++) open[i] = onOther(i, sign) || nearLinkLate(edgeAll[i * 2], edgeAll[i * 2 + 1]) || inMouth(key, edgeAll[i * 2], edgeAll[i * 2 + 1], sign) ? 1 : 0;
      const skipSeg = (i) => open[i] || open[i + 1];
      // катафоты на бордюре через каждые 7 м: ночью они бегут навстречу и дают почувствовать скорость
      for (let s = 3.5; s < ch.total - 4; s += 7) {
        ch.at(s, o);
        if (skipSeg(o.i)) continue;
        const e = sign * (halfWidth(o.lf) + 0.12);
        reflectors.push(o.x + o.dz * e, 0.24, o.z - o.dx * e, sign > 0 ? 1 : 1, sign > 0 ? 0.95 : 0.62, sign > 0 ? 0.85 : 0.18);
      }
      dashed(mm, offsetLine(p, (i) => sign * lf[i] / 2 * LANE_W), 0.075, 0.08, line, 4, 0, skip);
      ribbon(cm, p, () => 0.16, 0.17, curb, (i) => sign * (half(i) + 0.16), skipSeg);
      // вертикальная грань бордюра
      const edge = offsetLine(p, (i) => sign * half(i));
      for (let i = 0; i < n - 1; i++) {
        if (skipSeg(i)) continue;
        const ax = edge[i * 2], az = edge[i * 2 + 1], bx = edge[i * 2 + 2], bz = edge[i * 2 + 3];
        cm.tri(ax, 0.05, az, bx, 0.05, bz, bx, 0.17, bz, curbSide);
        cm.tri(ax, 0.05, az, bx, 0.17, bz, ax, 0.17, az, curbSide);
      }
      if (sign < 0) ribbon(cm, p, () => 1.7, 0.17, walk, (i) => -(half(i) + 0.32 + 1.7), skipSeg);
    }
  }
  // связка разворота у «Авроры»: настоящая дорога с полосами, сплошными по краям и бордюрами
  const LK = data.link, lkN = LK.pts.length / 2;
  const nearLink = (x, z, pad = 0) => {
    for (let i = 0; i < lkN; i++) if (Math.hypot(LK.pts[i * 2] - x, LK.pts[i * 2 + 1] - z) < halfWidth(LK.lf[i]) + pad) return true;
    return false;
  };
  const onMain = (x, z, pad = 0.2) => {
    for (const ch of [N, S]) { ch.project(x, z, -1, tmp); if (!tmp.past && Math.abs(tmp.lat) < halfWidth(tmp.lf) + pad) return true; }
    return false;
  };
  {
    const p = LK.pts, lf = LK.lf, half = (i) => halfWidth(lf[i]);
    ribbon(rm, p, half, 0.05, asphalt);
    // Офицерская — улица в обе стороны: связка идёт по её половине «на запад», слева рисуем встречную половину
    // (два ряда за двойной сплошной). На изогнутых концах связки встречной половины нет.
    const EB = (i) => { const t = Math.max(0, Math.min(1, Math.min(i - 8, lkN - 4 - i) / 4)); return 7.6 * t * t * (3 - 2 * t); };
    ribbon(rm, p, (i) => EB(i) / 2, 0.05, asphalt, (i) => half(i) - 0.5 + EB(i) / 2);
    for (const [d, on, gap] of [[0.3, 4, 0], [3.8, 3, 6], [7.3, 4, 0]]) dashed(mm, offsetLine(p, (i) => lf[i] / 2 * LANE_W + d * EB(i) / 7.6), 0.075, 0.08, line, on, gap, (x, z) => onMain(x, z, 1));
    for (let j = 1; j <= 2; j++) {
      let from = -1;
      for (let i = 0; i <= lkN; i++) {
        const ok = i < lkN && lf[i] - j >= 0.5;
        if (ok && from < 0) from = i;
        if (!ok && from >= 0) { const f0 = from; if (i - f0 >= 2) dashed(mm, offsetLine(p.slice(f0 * 2, i * 2), (k) => (lf[f0 + k] / 2 - j) * LANE_W), 0.075, 0.08, line, 3, 6, (x, z) => onMain(x, z)); from = -1; }
      }
    }
    for (const sign of [1, -1]) {
      const edge = offsetLine(p, (i) => sign * half(i)), open = new Uint8Array(lkN);
      for (let i = 0; i < lkN; i++) open[i] = onMain(edge[i * 2], edge[i * 2 + 1], 1.2) ? 1 : 0;
      const skipSeg = (i) => open[i] || open[i + 1];
      dashed(mm, offsetLine(p, (i) => sign * lf[i] / 2 * LANE_W), 0.075, 0.08, line, 4, 0, (x, z) => onMain(x, z, 1));
      const out = (i) => (sign > 0 ? EB(i) : 0); // слева бордюр стоит за встречной половиной
      for (let i = 0; i < lkN; i++) { const e = sign * (half(i) + out(i)), a = Math.max(0, i - 1), b = Math.min(lkN - 1, i + 1), dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1], l = Math.hypot(dx, dz) || 1; edge[i * 2] = p[i * 2] + dz / l * e; edge[i * 2 + 1] = p[i * 2 + 1] - dx / l * e; }
      ribbon(cm, p, () => 0.16, 0.17, curb, (i) => sign * (half(i) + out(i) + 0.16), skipSeg);
      for (let i = 0; i < lkN - 1; i++) {
        if (skipSeg(i)) continue;
        const ax = edge[i * 2], az = edge[i * 2 + 1], bx = edge[i * 2 + 2], bz = edge[i * 2 + 3];
        cm.tri(ax, 0.05, az, bx, 0.05, bz, bx, 0.17, bz, curbSide);
        cm.tri(ax, 0.05, az, bx, 0.17, bz, ax, 0.17, az, curbSide);
      }
      ribbon(cm, p, () => 1.7, 0.17, walk, (i) => sign * (half(i) + out(i) + 0.32 + 1.7), skipSeg);
    }
  }

  // «зебры», стоп-линии, сплошные и стрелки перед ними, жёлтые «вафельницы» — как на схеме разметки Яндекс Карт
  const thick = (a, b, w, col) => { // отрезок толщиной w
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l * w / 2, nz = -(b[0] - a[0]) / l * w / 2;
    mm.flatQuad([a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz], 0.08, col);
  };
  // стрелка в полосе: t — прямо, l — налево, r — направо (u — вперёд, v — влево)
  const arrow = (ox, oz, dx, dz, kind) => {
    const P = (u, v) => [ox + dx * u + dz * v, oz + dz * u - dx * v];
    const head = (u, v, du, dv) => {
      const a = P(u + du * 1.3, v + dv * 1.3), b = P(u - dv * 0.4, v + du * 0.4), c2 = P(u + dv * 0.4, v - du * 0.4);
      mm.tri(a[0], 0.08, a[1], b[0], 0.08, b[1], c2[0], 0.08, c2[1], line);
    };
    const t = kind.includes('t');
    thick(P(0, 0), P(t ? 2.9 : 2.1, 0), 0.17, line);
    if (t) head(2.9, 0, 1, 0);
    for (const [on, sg] of [[kind.includes('l'), 1], [kind.includes('r'), -1]]) {
      if (!on) continue;
      const u0 = t ? 1.4 : 2.0;
      thick(P(u0, 0), P(u0 + 0.5, sg * 0.6), 0.17, line);
      head(u0 + 0.5, sg * 0.6, 0.45, sg * 0.89);
    }
  };
  const arrowRow = (ch, s, a) => {
    if (s < 5) return;
    ch.at(s, o);
    const lanes = Math.max(1, Math.round(o.lf)), n = Math.min(a.length, lanes);
    for (let j = 0; j < n; j++) {
      const off = laneOffset(j, o.lf);
      arrow(o.x + o.dz * off, o.z - o.dx * off, o.dx, o.dz, a[a.length === lanes ? j : j === n - 1 ? a.length - 1 : j]);
    }
  };
  for (const c of crossings) {
    const ch = chains[c.k];
    const cross = (s0, s1, col, fill) => { // полоса поперёк дороги от s0 до s1
      ch.at((s0 + s1) / 2, o);
      const hw = o.lf / 2 * LANE_W - 0.2, lx = o.dz, lz = -o.dx, len = s1 - s0;
      fill(o.x - o.dx * len / 2, o.z - o.dz * len / 2, o.dx, o.dz, lx, lz, hw, len, col);
    };
    const zebra = (x, z, dx, dz, lx, lz, hw, len, col) => {
      for (let a = -hw + 0.3; a < hw - 0.4; a += 1.0) {
        mm.flatQuad([x + lx * a, z + lz * a], [x + lx * (a + 0.5), z + lz * (a + 0.5)],
          [x + lx * (a + 0.5) + dx * len, z + lz * (a + 0.5) + dz * len], [x + lx * a + dx * len, z + lz * a + dz * len], 0.08, col);
      }
    };
    const solid = (x, z, dx, dz, lx, lz, hw, len, col) => {
      mm.flatQuad([x - lx * hw, z - lz * hw], [x + lx * hw, z + lz * hw], [x + lx * hw + dx * len, z + lz * hw + dz * len], [x - lx * hw + dx * len, z - lz * hw + dz * len], 0.08, col);
    };
    if (c.ped) cross(c.s - 2, c.s + 2, line, zebra);
    else {
      if (c.zb) cross(c.s - c.half - 5.5, c.s - c.half - 1.5, line, zebra);
      if (c.za) cross(c.s + c.half + 1.5, c.s + c.half + 5.5, line, zebra);
    }
    cross(c.stopS - 0.2, c.stopS + 0.2, line, solid);
    if (c.box) {
      const grid = (x, z, dx, dz, lx, lz, hw, len, col) => {
        for (let a = -hw; a <= hw; a += 2.2) mm.flatQuad([x + lx * (a - 0.07), z + lz * (a - 0.07)], [x + lx * (a + 0.07), z + lz * (a + 0.07)], [x + lx * (a + 0.07) + dx * len, z + lz * (a + 0.07) + dz * len], [x + lx * (a - 0.07) + dx * len, z + lz * (a - 0.07) + dz * len], 0.08, col);
        for (let b = 0; b <= len; b += 2.2) mm.flatQuad([x - lx * hw + dx * (b - 0.07), z - lz * hw + dz * (b - 0.07)], [x + lx * hw + dx * (b - 0.07), z + lz * hw + dz * (b - 0.07)], [x + lx * hw + dx * (b + 0.07), z + lz * hw + dz * (b + 0.07)], [x - lx * hw + dx * (b + 0.07), z - lz * hw + dz * (b + 0.07)], 0.08, col);
      };
      cross(c.s - c.half + 1, c.s + c.half - 1, yellow, grid);
    }
    // сплошные между полосами на подходе
    for (let j = 1; j <= 4; j++) {
      let pts = [];
      const flush = () => { if (pts.length >= 4) dashed(mm, pts, 0.075, 0.08, line, 4, 0); pts = []; };
      for (let s = c.stopS - SOLID; s <= c.stopS + 0.01; s += 4) {
        if (s < 2) continue;
        ch.at(s, o);
        if (o.lf - j < 0.5) { flush(); continue; }
        const off = (o.lf / 2 - j) * LANE_W;
        pts.push(o.x + o.dz * off, o.z - o.dx * off);
      }
      flush();
    }
    if (c.a) for (const back of [9, 27]) arrowRow(ch, c.stopS - back, c.a);
  }
  for (const m of data.arrows || []) {
    const ch = chains[m.k];
    ch.project(m.x, m.z, -1, tmp);
    for (const back of [0, 24]) arrowRow(ch, tmp.s - back, m.a);
  }
  // остановки: жёлтый зигзаг вдоль правого края
  for (const st of data.stops || []) {
    const ch = chains[st.k];
    ch.project(st.x, st.z, -1, tmp);
    const s0 = tmp.s - st.len / 2;
    let prev = null;
    for (let k = 0; k <= Math.round(st.len / 1.5); k++) {
      ch.at(s0 + k * 1.5, o);
      const off = -(o.lf / 2 * LANE_W) + (k % 2 ? 1.05 : 0.3), pt = [o.x + o.dz * off, o.z - o.dx * off];
      if (prev) thick(prev, pt, 0.12, yellow);
      prev = pt;
    }
  }

  // ---------- дома ----------
  const wm = new Mesher(), roofM = new Mesher(), shopM = new Mesher();
  const cell = 40, grid = new Map(), polys = [];
  const addToGrid = (k, idx) => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(idx); };
  const col = new THREE.Color(), roofCol = C(PAL.roof), whiteC = C(0xffffff);
  let shukhov = null;
  const named = [], custom = {};
  // препятствие для машины: многоугольник в сетке столкновений
  function addSolid(p) {
    const n = p.length / 2;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, p[i * 2]); x1 = Math.max(x1, p[i * 2]); z0 = Math.min(z0, p[i * 2 + 1]); z1 = Math.max(z1, p[i * 2 + 1]); }
    const idx = polys.push({ p: Float32Array.from(p), x0, x1, z0, z1 }) - 1;
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
      for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) addToGrid(gx + ',' + gz, idx);
  }
  const nearStreet = (x, z) => { N.project(x, z, -1, tmp); const d = tmp.d; S.project(x, z, -1, tmp); return Math.min(d, tmp.d); };
  // ---------- город за первой линией ----------
  // В данных есть только дома у самой улицы. Там, где за ними (или вместо них) пусто, игрок видел бы чёрную землю.
  // Достраиваем типовые дома вторым и третьим рядом и редкие высотки вдали: заехать туда нельзя, но город «продолжается».
  const extra = [];
  {
    let sd = 4242;
    const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const blobs = data.buildings.map((b) => { let x = 0, z = 0, r = 0; const k = b.p.length / 2; for (let i = 0; i < k; i++) { x += b.p[i * 2] / k; z += b.p[i * 2 + 1] / k; } for (let i = 0; i < k; i++) r = Math.max(r, Math.hypot(b.p[i * 2] - x, b.p[i * 2 + 1] - z)); return [x, z, r]; });
    const lm = data.landmarks, keep = [];
    for (const f of lm.fountains || []) keep.push([f[0], f[1], 40]);
    for (const [k, r] of [['avrora', 60], ['bell', 40], ['clock', 30], ['stadium', 150], ['kubgtu', 75], ['site', 55], ['hotel', 45], ['arch', 30]]) if (lm[k]) keep.push([lm[k][0], lm[k][1], r]);
    const inGreen = (x, z) => data.greens.some((g) => { let inside = false; for (let i = 0, j = g.length / 2 - 1; i < g.length / 2; j = i++) { const xi = g[i * 2], zi = g[i * 2 + 1], xj = g[j * 2], zj = g[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; });
    const nearRoad = (x, z, r) => {
      for (const rd of data.roads) for (let i = 0; i < rd.p.length - 2; i += 2) {
        const ax = rd.p[i], az = rd.p[i + 1], bx = rd.p[i + 2] - ax, bz = rd.p[i + 3] - az, l2 = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2));
        if (Math.hypot(ax + bx * t - x, az + bz * t - z) < r) return true;
      }
      for (let i = 0; i < data.link.pts.length; i += 2) if (Math.hypot(data.link.pts[i] - x, data.link.pts[i + 1] - z) < r + 12) return true;
      return false;
    };
    const tryBox = (x, z, yaw, w, d, h) => {
      const r = Math.hypot(w, d) / 2;
      if (blobs.some((b) => Math.hypot(b[0] - x, b[1] - z) < b[2] + r + 3) || keep.some((k) => Math.hypot(k[0] - x, k[1] - z) < k[2] + r)) return;
      if (nearRoad(x, z, r * 0.8 + 5) || inGreen(x, z)) return;
      const c = Math.cos(yaw), sn = Math.sin(yaw), q = [];
      for (const [u, v] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) q.push(x + u * c + v * sn, z - u * sn + v * c);
      extra.push({ h, s: Math.floor(rr() * 1000), p: q });
      blobs.push([x, z, r]);
    };
    for (const ch of [N, S]) for (let s = -160; s < ch.total + 160; s += 31) {
      ch.at(Math.max(0.5, Math.min(ch.total - 0.5, s)), o);
      const over = s < 0 ? s : s > ch.total ? s - ch.total : 0; // за концами оси город тоже продолжается
      const ax = o.x + o.dx * over, az = o.z + o.dz * over, yaw = Math.atan2(o.dx, o.dz) + Math.PI / 2;
      for (const sign of [-1, 1]) for (const [dist, hMin, hMax] of [[26, 3, 7], [62, 4, 10], [104, 5, 14], [170, 12, 24], [245, 14, 30]]) {
        const far = dist > 150;
        if (far && rr() < 0.55) continue; // высотки вдали стоят редко
        const dd = halfWidth(o.lf) + dist + rr() * 10, x = ax + o.dz * sign * dd + o.dx * (rr() - 0.5) * 8, z = az - o.dx * sign * dd + o.dz * (rr() - 0.5) * 8;
        if (nearStreet(x, z) < halfWidth(o.lf) + dist - 8) continue; // с этой стороны бульвар или соседняя проезжая часть
        tryBox(x, z, yaw, far ? 20 + rr() * 16 : 14 + rr() * 6, far ? 20 + rr() * 10 : 22 + rr() * 9, (hMin + Math.floor(rr() * (hMax - hMin + 1))) * 3.2 + 1.2);
      }
    }
  }
  for (const b of [...data.buildings, ...extra]) {
    let p = b.p;
    const n = p.length / 2;
    if (n < 3) continue;
    let area = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    if (area > 0) { // обходим так, чтобы наружная нормаль стены была (−dz, dx)
      const rev = [];
      for (let i = n - 1; i >= 0; i--) rev.push(p[i * 2], p[i * 2 + 1]);
      p = rev;
    }
    if (b.n && /Шухова/.test(b.n)) { // вместо коробки ставим саму башню
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += p[i * 2] / n; cz += p[i * 2 + 1] / n; }
      shukhov = [cx, cz];
      continue;
    }
    const ht = data.landmarks.hotel;
    if (ht) { // на месте гостиницы — своя модель, типовые коробки там не нужны
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += p[i * 2] / n; cz += p[i * 2 + 1] / n; }
      if (Math.hypot(cx - ht[0], cz - ht[1]) < 26) continue;
    }
    const special = Object.keys(CUSTOM_BUILDINGS).find((k) => CUSTOM_BUILDINGS[k] === b.n);
    if (special) { custom[special] = p; addSolid(p); continue; } // своя модель вместо коробки
    const h = b.h, tall = h > 34;
    col.setHex(tall ? GLASS[b.s % GLASS.length] : WALLS[b.s % WALLS.length]);
    col.multiplyScalar(0.9 + ((b.s * 7) % 20) / 100);
    // у каждого дома свой сдвиг рисунка окон, чтобы горящие окна не повторялись
    const offU = (b.s % 4) / 4, offV = ((b.s >> 2) % 4) / 4;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      // целое число окон на стену, чтобы окна не резались на углах
      const wins = Math.max(1, Math.round(len / 3.4)), fl = Math.max(1, Math.round(h / 3.2));
      wm.tri(ax, 0, az, bx, 0, bz, bx, h, bz, col);
      wm.tri(ax, 0, az, bx, h, bz, ax, h, az, col);
      const u0 = u / 4 + offU, u1 = (u + wins) / 4 + offU, v1 = fl / 4 + offV;
      wm.uv.push(u0, offV, u1, offV, u1, v1, u0, offV, u1, v1, u0, v1);
      for (let k = 0; k < 6; k++) wm.nrm.push(nx, 0, nz);
      u += wins;
      // витрины первого этажа — на стенах, выходящих к Красной
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, dHere = nearStreet(mx, mz);
      if (len >= 7 && h >= 6 && dHere < 55 && nearStreet(mx + nx * 3, mz + nz * 3) < dHere) {
        const bays = Math.max(1, Math.round(len / 6)), ex = nx * 0.07, ez = nz * 0.07, su = (b.s % 4) / 4;
        shopM.tri(ax + ex, 0.25, az + ez, bx + ex, 0.25, bz + ez, bx + ex, 3.5, bz + ez, whiteC);
        shopM.tri(ax + ex, 0.25, az + ez, bx + ex, 3.5, bz + ez, ax + ex, 3.5, az + ez, whiteC);
        shopM.uv.push(su, 0, su + bays / 4, 0, su + bays / 4, 1, su, 0, su + bays / 4, 1, su, 1);
      }
    }
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      roofM.tri(contour[t[0]].x, h, contour[t[0]].y, contour[t[1]].x, h, contour[t[1]].y, contour[t[2]].x, h, contour[t[2]].y, roofCol);
    }
    if (b.n) named.push({ n: b.n, p, h });
    addSolid(p);
  }
  const [winMap, winGlow] = windowTextures();
  const walls = new THREE.Mesh(wm.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, map: winMap, emissiveMap: winGlow, emissive: 0xffffff, emissiveIntensity: 1.25 }));
  walls.frustumCulled = false;
  scene.add(walls);
  const roofs = new THREE.Mesh(roofM.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  roofs.frustumCulled = false;
  scene.add(roofs);
  const shops = new THREE.Mesh(shopM.geometry(), new THREE.MeshBasicMaterial({ map: shopTexture(), side: THREE.DoubleSide }));
  shops.frustumCulled = false;
  scene.add(shops);

  // ---------- бульвар и деревья ----------
  let boulevardLamps = [], plaza = null;
  const treePos = [];
  for (let i = 0; i < data.trees.length; i += 2) treePos.push([data.trees[i], data.trees[i + 1]]);
  const bm = new Mesher(), pm = new Mesher(), path = C(PAL.path);
  const walkLamps = [], benches = [];
  let lastStrip = null, hint = -1, lastPark = null, lastCorner = null, lastIsl = null;
  // занято ли место: дом, площадь перед кинотеатром, фонтан, памятник
  const insideBuilding = (x, z) => { const list = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)); if (list) for (const k of list) if (pointInPoly(polys[k], x, z)) return true; return false; };
  const keepOut = [];
  for (const f of data.landmarks.fountains || []) keepOut.push([f[0], f[1], f[2] > 8 ? 36 : f[2] + 2]);
  if (data.landmarks.avrora) keepOut.push([data.landmarks.avrora[0], data.landmarks.avrora[1], 12]);
  if (data.landmarks.bell) keepOut.push([data.landmarks.bell[0], data.landmarks.bell[1], 17]);
  if (custom.cinema) { let cx = 0, cz = 0; const k = custom.cinema.length / 2; for (let j = 0; j < k; j++) { cx += custom.cinema[j * 2] / k; cz += custom.cinema[j * 2 + 1] / k; } keepOut.push([cx, cz, 62]); plaza = [cx, cz]; }
  const blocked = (x, z, pad) => insideBuilding(x, z) || keepOut.some((k) => Math.hypot(k[0] - x, k[1] - z) < k[2] + pad);
  for (let i = 0; i < N.n; i += 2) {
    S.project(N.x[i], N.z[i], hint, tmp);
    if (hint < 0 || tmp.d > 80) S.project(N.x[i], N.z[i], -1, tmp);
    hint = tmp.i;
    const wN = halfWidth(N.lf[i]), wS = halfWidth(tmp.lf);
    const free = tmp.d - wN - wS;
    if (tmp.past) continue;
    if (free > 0.8 && free < 6) { // узкий островок между проезжими частями: сплошные по краям и косая штриховка
      const ax = N.x[i], az = N.z[i], dist = tmp.d;
      S.at(tmp.s, o);
      const ox = o.x, oz = o.z, at = (fromN) => { const t = fromN / dist; return [ax + (ox - ax) * t, az + (oz - az) * t]; };
      const isl = { i, a: at(wN - 0.35), b: at(dist - wS + 0.35) };
      if (lastIsl && i - lastIsl.i === 2) {
        rm.flatQuad(lastIsl.a, isl.a, isl.b, lastIsl.b, 0.05, C(PAL.asphalt));
        for (const [u0, u1] of [[0, 0.22], [0.5, 0.72]]) { // две косые полосы на каждые 12 м
          const L0 = (u) => [lastIsl.a[0] + (isl.a[0] - lastIsl.a[0]) * u, lastIsl.a[1] + (isl.a[1] - lastIsl.a[1]) * u];
          const R0 = (u) => [lastIsl.b[0] + (isl.b[0] - lastIsl.b[0]) * u, lastIsl.b[1] + (isl.b[1] - lastIsl.b[1]) * u];
          mm.flatQuad(L0(u0), L0(u0 + 0.07), R0(u1 + 0.07), R0(u1), 0.08, C(PAL.line));
        }
      }
      lastIsl = isl;
      continue;
    }
    if (free < 6) continue;
    if (tmp.d > 70) { // широкий сквер: газон, деревья россыпью, диагональные дорожки, фонари
      if (tmp.d > 165) continue;
      const ax = N.x[i], az = N.z[i], dist = tmp.d;
      S.at(tmp.s, o);
      const ox = o.x, oz = o.z, at = (fromN) => { const t = fromN / dist; return [ax + (ox - ax) * t, az + (oz - az) * t]; };
      const strip = { i, a: at(wN + 0.4), b: at(dist - wS - 0.4) }, step = Math.round(i / 2);
      if (lastPark && i - lastPark.i === 2) bm.flatQuad(lastPark.a, strip.a, strip.b, lastPark.b, 0.03, lawn);
      lastPark = strip;
      for (let r = wN + 5 + (step % 2) * 4; r < dist - wS - 4; r += 9.5) { // деревья
        const [tx, tz] = at(r + (rnd() - 0.5) * 3);
        if (!blocked(tx, tz, 3)) treePos.push([tx + (rnd() - 0.5) * 3, tz + (rnd() - 0.5) * 3]);
      }
      if (step % 10 === 0) { // дорожки идут зигзагом от одной стороны к другой
        const corner = at((step / 10) % 2 ? wN + 5 : dist - wS - 5);
        if (lastCorner && !blocked(corner[0], corner[1], 0)) {
          const dx = corner[0] - lastCorner[0], dz = corner[1] - lastCorner[1], l = Math.hypot(dx, dz) || 1, nx = dz / l * 1.6, nz = -dx / l * 1.6;
          pm.flatQuad([lastCorner[0] + nx, lastCorner[1] + nz], [corner[0] + nx, corner[1] + nz], [corner[0] - nx, corner[1] - nz], [lastCorner[0] - nx, lastCorner[1] - nz], 0.035, path);
          for (const t of [0.2, 0.5, 0.8]) { const lx = lastCorner[0] + dx * t + nx * 1.5, lz = lastCorner[1] + dz * t + nz * 1.5; if (!blocked(lx, lz, 1)) walkLamps.push([lx, lz, 0]); }
        }
        lastCorner = corner;
      }
      continue;
    }
    const ax = N.x[i], az = N.z[i], dist = tmp.d;
    S.at(tmp.s, o);
    const ox = o.x, oz = o.z;
    const at = (fromN) => { const t = fromN / dist; return [ax + (ox - ax) * t, az + (oz - az) * t]; };
    // газон от бордюра до бордюра и плиточная дорожка посередине
    const mid = wN + free / 2;
    const strip = { i, a: at(wN + 0.4), b: at(dist - wS - 0.4), wa: at(mid - 2), wb: at(mid + 2) };
    if (lastStrip && i - lastStrip.i === 2) {
      bm.flatQuad(lastStrip.a, strip.a, strip.b, lastStrip.b, 0.03, lawn);
      if (free > 11) pm.flatQuad(lastStrip.wa, strip.wa, strip.wb, lastStrip.wb, 0.035, path);
    }
    lastStrip = strip;
    // бульвар не пустой: вдоль дорожки низкие фонари-шары, скамейки и клумбы
    if (free > 11) {
      const step = Math.round(i / 2);
      const pt = (fromN, c, turn = 0) => { const [qx, qz] = at(fromN); c.push([qx, qz, Math.atan2(ox - ax, oz - az) + turn]); };
      if (step % 4 === 0) { pt(mid - 2.7, walkLamps); pt(mid + 2.7, walkLamps); }
      if (step % 6 === 2) pt(mid + (step % 12 === 2 ? 2.5 : -2.5), benches, step % 12 === 2 ? Math.PI / 2 : -Math.PI / 2); // скамейка вдоль дорожки, лицом к ней
      if (step % 5 === 1) {
        const [qx, qz] = at(wN + (mid - wN - 2) * 0.5 + 0.6), [rx, rz] = at(mid + 2 + (free / 2 - 2) * 0.5); // клумбы посреди газона по обе стороны дорожки
        for (const [fx2, fz2] of [[qx, qz], [rx, rz]]) disc(bm, fx2, fz2, 1.5, 0.045, C([0xb8324a, 0xd9a520, 0xc85a9a, 0xe2e2d8][step % 4]));
      }
    }
    const arch = data.landmarks.arch;
    if (arch && Math.hypot((strip.a[0] + strip.b[0]) / 2 - arch[0], (strip.a[1] + strip.b[1]) / 2 - arch[1]) < 14) continue;
    const rows = free > 16 ? [0.2, 0.8] : free > 11 ? [0.14, 0.86] : [0.5];
    for (const r of rows) {
      const [tx, tz] = at(wN + 1.6 + (free - 3.2) * r);
      treePos.push([tx + (rnd() - 0.5) * 1.2, tz + (rnd() - 0.5) * 1.2]);
    }
  }
  const trunkG = new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6);
  trunkG.translate(0, 1.3, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x4a3a2e }), treePos.length);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), treePos.length);
  const treeGrid = new Map();
  treePos.forEach(([x, z], i) => {
    const s = 0.8 + rnd() * 0.6;
    mtx.compose(ps.set(x, 0, z), q.identity(), sc.set(s, s, s));
    trunks.setMatrixAt(i, mtx);
    q.setFromAxisAngle(up, rnd() * 6);
    mtx.compose(ps.set(x, 2.6 * s + 1.4 * s, z), q, sc.set(2.1 * s, 2.3 * s, 2.1 * s));
    crowns.setMatrixAt(i, mtx);
    crowns.setColorAt(i, tc.setHSL(0.27 + rnd() * 0.06, 0.4, 0.13 + rnd() * 0.06));
    const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
    let a = treeGrid.get(k); if (!a) treeGrid.set(k, a = []); a.push(x, z);
  });
  trunks.frustumCulled = crowns.frustumCulled = false;
  scene.add(trunks, crowns);

  if (plaza) disc(pm, plaza[0], plaza[1], 58, 0.036, path); // мощёная площадь вокруг кинотеатра
  // мебель бульвара — пачками
  {
    const many = (geo, mat, list, y = 0) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, z, yaw], i) => { mtx.compose(ps.set(x, y, z), q.setFromAxisAngle(up, yaw), sc.set(1, 1, 1)); m.setMatrixAt(i, mtx); });
      m.frustumCulled = false;
      scene.add(m);
    };
    const iron = new THREE.MeshLambertMaterial({ color: 0x23262b });
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 3.4, 6); pole.translate(0, 1.7, 0);
    many(pole, iron, walkLamps);
    many(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), walkLamps, 3.55);
    const seat = new THREE.BoxGeometry(0.5, 0.08, 1.9); seat.translate(0, 0.45, 0);
    const back = new THREE.BoxGeometry(0.07, 0.5, 1.9); back.translate(-0.24, 0.72, 0);
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
    many(seat, wood, benches); many(back, wood, benches);
    boulevardLamps = walkLamps;
  }

  // всё плоское — после того, как собраны все слои
  flat(gm.geometry(), 1, 1);
  flat(bm.geometry(), 1, 1);
  flat(rm.geometry(), 2, 2);
  flat(pm.geometry(), 2, 2);
  flat(mm.geometry(), 3, 3);
  const curbs = new THREE.Mesh(cm.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  curbs.frustumCulled = false;
  scene.add(curbs);

  // ---------- свет: фонари, пятна на асфальте, светофоры ----------
  const glow = { pos: [], col: [] };
  const addGlow = (x, y, z, hex, k = 1) => { tc.setHex(hex).multiplyScalar(k); glow.pos.push(x, y, z); glow.col.push(tc.r, tc.g, tc.b); };
  const lampAt = [];
  for (const c of [N, S]) {
    for (let i = 2; i < c.n - 1; i += 5) {
      const len = c.cum[i + 1] - c.cum[i] || 1;
      const dx = (c.x[i + 1] - c.x[i]) / len, dz = (c.z[i + 1] - c.z[i]) / len;
      const off = halfWidth(c.lf[i]) + 1.2;
      lampAt.push([c.x[i] - dz * off, c.z[i] + dx * off, Math.atan2(dx, dz), dz, -dx]);
    }
  }
  const poleG = new THREE.CylinderGeometry(0.07, 0.1, 8, 6);
  poleG.translate(0, 4, 0);
  const armG = new THREE.BoxGeometry(2.4, 0.09, 0.12);
  armG.translate(1.1, 7.95, 0);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const poles = new THREE.InstancedMesh(poleG, lampMat, lampAt.length);
  const arms = new THREE.InstancedMesh(armG, lampMat, lampAt.length);
  const glowTex = glowTexture(), poolTex = poolTexture();
  {
    const n = reflectors.length / 6, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos.set(reflectors.slice(i * 6, i * 6 + 3), i * 3); col.set(reflectors.slice(i * 6 + 3, i * 6 + 6), i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.55, map: glowTex, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false; pts.renderOrder = 6;
    scene.add(pts);
  }
  const poolG = new THREE.PlaneGeometry(1, 1);
  poolG.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolG, new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffa860, transparent: true, opacity: 0.5, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }), lampAt.length);
  pools.renderOrder = 4;
  lampAt.forEach(([x, z, yaw, lx, lz], i) => {
    mtx.compose(ps.set(x, 0, z), q.setFromAxisAngle(up, yaw), sc.set(1, 1, 1));
    poles.setMatrixAt(i, mtx);
    arms.setMatrixAt(i, mtx);
    const tx = x + lx * 2.2, tz = z + lz * 2.2; // конец консоли над полосой
    addGlow(tx, 7.8, tz, 0xffc27a, 1);
    mtx.compose(ps.set(tx + lx * 1.5, 0.1, tz + lz * 1.5), q.identity(), sc.set(30, 1, 30));
    pools.setMatrixAt(i, mtx);
  });
  poles.frustumCulled = arms.frustumCulled = pools.frustumCulled = false;
  scene.add(poles, arms, pools);
  for (const [x, z] of boulevardLamps) addGlow(x, 3.55, z, 0xffe6bd, 0.55); // шары фонарей на бульваре

  // светофор и ограждение боковой улицы на каждом перекрёстке (всё одинаковое — рисуется пачками)
  const inst = { board: [], leg: [], pole: [], head: [] };
  const put = (list, x, y, z, yaw) => { mtx.compose(ps.set(x, y, z), q.setFromAxisAngle(up, yaw), sc.set(1, 1, 1)); list.push(mtx.clone()); };
  const barrier = (x, z, yaw, len) => { // секции по 3 м вдоль оси ограждения
    const ax = Math.cos(yaw), az = -Math.sin(yaw), k = Math.max(2, Math.round(len / 3));
    for (let i = 0; i < k; i++) {
      const a = (i + 0.5 - k / 2) * 3, bx = x + ax * a, bz = z + az * a;
      put(inst.board, bx, 1.05, bz, yaw); put(inst.board, bx, 0.5, bz, yaw);
      put(inst.leg, bx - ax * 1.35, 0.65, bz - az * 1.35, yaw); put(inst.leg, bx + ax * 1.35, 0.65, bz + az * 1.35, yaw);
    }
  };
  for (const c of crossings) {
    const ch = chains[c.k], oth = other[c.k];
    ch.at(c.s, o);
    const yaw = Math.atan2(o.dx, o.dz), hw = halfWidth(o.lf), lx = o.dz, lz = -o.dx, cx = o.x, cz = o.z;
    for (const sign of []) { // ограждений боковых улиц больше нет: граница невидимая
      const ex = cx + lx * sign * (hw + 1.1), ez = cz + lz * sign * (hw + 1.1);
      oth.project(ex, ez, -1, tmp);
      if (!tmp.past && Math.abs(tmp.lat) < halfWidth(tmp.lf) + 1.5) continue; // с этой стороны соседняя проезжая часть
      barrier(ex, ez, yaw + Math.PI / 2, c.half * 2 + 2);
    }
    // светофор справа перед перекрёстком, горит зелёный
    ch.at(c.stopS - 1.5, o);
    const px = o.x - o.dz * (halfWidth(o.lf) + 0.9), pz = o.z + o.dx * (halfWidth(o.lf) + 0.9);
    put(inst.pole, px, 2.3, pz, 0); put(inst.head, px, 4.2, pz, Math.atan2(o.dx, o.dz));
    c.light = [px - o.dx * 0.25, 3.85, pz - o.dz * 0.25]; // сам огонь рисует модуль светофоров: он меняет цвет
  }
  const batch = (geo, mat, list) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm4, i) => m.setMatrixAt(i, mm4));
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  // доска лежит вдоль местной оси x, а ограждение стоит поперёк улицы — отсюда поворот на 90° выше
  const boardG = new THREE.BoxGeometry(2.9, 0.45, 0.1);
  { const uv = boardG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 1.2); }
  const barriers = [batch(boardG, new THREE.MeshBasicMaterial({ map: stripeTexture() }), inst.board), batch(new THREE.BoxGeometry(0.1, 1.3, 0.1), new THREE.MeshLambertMaterial({ color: 0x8a8d92 }), inst.leg)].filter(Boolean);
  batch(new THREE.BoxGeometry(0.16, 4.6, 0.16), lampMat, inst.pole);
  batch(new THREE.BoxGeometry(0.42, 1.2, 0.36), new THREE.MeshLambertMaterial({ color: 0x1a1c1f }), inst.head);

  // старт — у театра драмы, на северной проезжей части
  const a = {};
  N.project(data.marks.theatre[0], data.marks.theatre[1], -1, a);
  const startS = a.s;

  const live = buildLandmarks(scene, data, chains, { textPlane, addSolid, named, shukhov, custom, addGlow });

  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glow.pos, 3));
  glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(glow.col, 3));
  const glows = new THREE.Points(glowGeo, new THREE.PointsMaterial({ size: 5.5, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  glows.frustumCulled = false;
  glows.renderOrder = 6;
  scene.add(glows);

  // ---------- столкновения ----------
  function pointInPoly(pl, x, z) {
    if (x < pl.x0 || x > pl.x1 || z < pl.z0 || z > pl.z1) return false;
    const p = pl.p, n = p.length / 2;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  function hitsSolid(x, z) {
    const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const list = grid.get(k);
    if (list) for (const i of list) if (pointInPoly(polys[i], x, z)) return true;
    const tl = treeGrid.get(k);
    if (tl) for (let i = 0; i < tl.length; i += 2) if (Math.hypot(tl[i] - x, tl[i + 1] - z) < 0.45) return true;
    return false;
  }
  // точка за бордюром? Дорога — это асфальт любой из двух проезжих частей.
  const probe = {};
  // В устье боковой улицы граница отодвинута на MOUTH метров: можно вильнуть туда, объезжая автобус,
  // но уехать по боковой улице нельзя.
  const MOUTH = 9;
  const mouthAt = (k, s, lat) => {
    for (const c of crossings) if (c.k === k && !c.ped && Math.abs(s - c.s) < c.half + 1.5 && c.open[lat > 0 ? 1 : 0]) return true;
    return false;
  };
  const onRoad = (ch, k, x, z, hint) => {
    ch.project(x, z, hint, probe);
    if (probe.past) return false;
    const a = Math.abs(probe.lat), h = halfWidth(probe.lf);
    return a <= h || (a <= h + MOUTH && mouthAt(k, probe.s, probe.lat));
  };
  function offRoad(x, z, hintN, hintS) { return !onRoad(N, 'north', x, z, hintN) && !onRoad(S, 'south', x, z, hintS); }

  return { chains, startS, hitsSolid, offRoad, glowTex, poolTex, crossings, barriers, tickClock: live.tick, stats: { buildings: polys.length, trees: treePos.length, lamps: lampAt.length } };
}
