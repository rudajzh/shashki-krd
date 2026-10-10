// Детальная машина. Кузов — «лофт»: поперечные сечения каждые несколько сантиметров вдоль длины,
// форма каждого сечения задаётся кривыми (высота крыши, ширина, линия плеча, днище с вырезами арок).
// Поверх — детали: решётка, фары, фонари, зеркала, выхлоп, швы дверей, колёса со спицами.
// Модель собрана по фотографиям седана бизнес-класса; названий и эмблем на ней нет.
import * as THREE from 'three';

// гладкая кривая через точки [[z, значение], ...] (кубическая интерполяция Эрмита)
const curve = (pts) => (z) => {
  if (z <= pts[0][0]) return pts[0][1];
  if (z >= pts.at(-1)[0]) return pts.at(-1)[1];
  let i = 0;
  while (z > pts[i + 1][0]) i++;
  const [z0, v0] = pts[i], [z1, v1] = pts[i + 1], h = z1 - z0, t = (z - z0) / h;
  const p = pts[Math.max(0, i - 1)], n = pts[Math.min(pts.length - 1, i + 2)];
  const m0 = (v1 - p[1]) / (z1 - p[0]) * h, m1 = (n[1] - v0) / (n[0] - z0) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
};
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Спортивный седан: 4,97 × 1,90 × 1,47 м, колёсная база 2,98 м. Ось z — вперёд, x — влево.
export const SEDAN = {
  len: 4.97, wid: 1.9, wheel: 0.36, tyreW: 0.285, track: 0.812, axF: 1.6, axR: -1.38,
  // силуэт сбоку: длинный капот, сильно заваленное лобовое, крыша плавно уходит в короткий багажник
  top: curve([[-2.485, 0.93], [-2.44, 1.04], [-2.3, 1.062], [-2.05, 1.082], [-1.92, 1.11], [-1.5, 1.32], [-1.1, 1.432], [-0.6, 1.468], [-0.1, 1.462], [0.3, 1.42], [0.62, 1.25], [1.0, 1.015], [1.25, 0.975], [1.8, 0.915], [2.25, 0.83], [2.42, 0.77], [2.485, 0.69]]),
  sw: curve([[-2.485, 0.83], [-2.43, 0.895], [-2.2, 0.93], [-1.6, 0.95], [0, 0.95], [1.5, 0.95], [2.1, 0.93], [2.38, 0.895], [2.485, 0.81]]),   // полуширина по плечу
  sy: curve([[-2.485, 0.86], [-2.3, 0.975], [-1.7, 0.995], [-0.5, 0.96], [0.9, 0.915], [1.6, 0.855], [2.3, 0.76], [2.485, 0.65]]),             // высота линии плеча
  tw: curve([[-2.485, 0.62], [-2.3, 0.7], [-1.92, 0.7], [-1.1, 0.56], [0.3, 0.56], [1.0, 0.74], [1.6, 0.7], [2.3, 0.64], [2.485, 0.56]]),      // полуширина крыши / капота
  by: curve([[-2.485, 0.29], [-2.2, 0.23], [-1.9, 0.17], [1.9, 0.15], [2.3, 0.14], [2.485, 0.18]]),                                           // низ кузова
  cabin: [-1.92, 1.0], roof: [-1.1, 0.3], pillarB: [-0.33, -0.23], kink: -1.38, doors: [0.8, -0.28, -1.22],
};

const COL = { under: 0x08090a, trim: 0x0c0d0f, glass: 0x0b0f15, roof: 0x0d0e10, chrome: 0x8d939b, tyre: 0x0b0b0c, rim: 0x1c1e21, rimFace: 0x7d838b, disc: 0x55585d, caliper: 0x1d46b0, plate: 0xe9e9e4 };

class Parts {
  constructor() { this.slot = { paint: [], glass: [], dark: [], light: [] }; this.loft = []; }
  // треугольник лофта: нормали посчитаем потом, сгладив по общим вершинам
  loftTri(a, b, c, slot, color) { this.loft.push({ a, b, c, slot, color }); }
  push(slot, pos, nrm, color) {
    const s = this.slot[slot], c = new THREE.Color(color);
    for (let i = 0; i < pos.length; i += 3) s.push(pos[i], pos[i + 1], pos[i + 2], nrm[i], nrm[i + 1], nrm[i + 2], c.r, c.g, c.b);
  }
  // готовая геометрия three.js (коробка, цилиндр, выдавленная фигура), поставленная на место
  add(slot, geo, color, x = 0, y = 0, z = 0, ry = 0, rz = 0, rx = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    this.push(slot, g.attributes.position.array, g.attributes.normal.array, color);
  }
  box(slot, color, w, h, d, x, y, z, ry = 0, rz = 0, rx = 0) { this.add(slot, new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rz, rx); }
  // то же самое зеркально для левой и правой стороны
  pair(fn) { fn(1); fn(-1); }
  // Нормали лофта: в каждой вершине усредняем только те соседние грани, что отличаются не больше чем
  // на ~38°. Плавные поверхности выходят гладкими, а ребро плеча, кромка капота и арки остаются чёткими.
  finishLoft() {
    const key = (p) => Math.round(p[0] * 2000) + ',' + Math.round(p[1] * 2000) + ',' + Math.round(p[2] * 2000);
    const at = new Map(), fn = [];
    this.loft.forEach((t, i) => {
      const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], uz = t.b[2] - t.a[2], vx = t.c[0] - t.a[0], vy = t.c[1] - t.a[1], vz = t.c[2] - t.a[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; // длина = удвоенная площадь
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      fn.push([n[0], n[1], n[2], n[0] / l, n[1] / l, n[2] / l]);
      for (const p of [t.a, t.b, t.c]) { const k = key(p); let a = at.get(k); if (!a) at.set(k, a = []); a.push(i); }
    });
    const COS = Math.cos(38 * Math.PI / 180);
    this.loft.forEach((t, i) => {
      const pos = [], nrm = [], f = fn[i];
      for (const p of [t.a, t.b, t.c]) {
        let x = 0, y = 0, z = 0;
        for (const j of at.get(key(p))) { const o = fn[j]; if (o[3] * f[3] + o[4] * f[4] + o[5] * f[5] >= COS) { x += o[0]; y += o[1]; z += o[2]; } }
        const l = Math.hypot(x, y, z) || 1;
        pos.push(p[0], p[1], p[2]); nrm.push(x / l, y / l, z / l);
      }
      this.push(t.slot, pos, nrm, t.color);
    });
    this.loft.length = 0;
  }
  geometry(slot) {
    const s = this.slot[slot], n = s.length / 9;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { pos[i * 3 + k] = s[i * 9 + k]; nrm[i * 3 + k] = s[i * 9 + 3 + k]; col[i * 3 + k] = s[i * 9 + 6 + k]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
}

// половина сечения кузова на расстоянии z: 12 точек от середины днища до середины крыши.
// Между точками 5 и 6 — узкая полоса под самым плечом: на углах носа она становится фарой, на корме — фонарём.
function section(S, z) {
  const sw = S.sw(z), top = S.top(z), sy = Math.min(S.sy(z), top - 0.035), tw = Math.min(S.tw(z), sw - 0.1), floor = S.by(z);
  let arch = floor;
  for (const za of [S.axF, S.axR]) { // вырез колёсной арки
    const ra = S.wheel + 0.05, dz = z - za;
    if (Math.abs(dz) < ra) arch = Math.max(arch, S.wheel + Math.sqrt(ra * ra - dz * dz));
  }
  const w = sw + (arch > floor ? 0.012 : 0); // лёгкий «раздув» крыла над колесом
  // кабина: стёкла заваливаются внутрь; капот и багажник — плоские, с чёткой кромкой у крыла
  const cab = smooth(S.cabin[0] - 0.12, S.cabin[0] + 0.1, z) * (1 - smooth(S.cabin[1] - 0.1, S.cabin[1] + 0.12, z));
  const mix = (a, b) => a + (b - a) * cab;
  const sx = w - 0.04, a8 = mix(0.16, 0.11), b8 = mix(0.66, 0.07), a9 = mix(0.55, 0.62), b9 = mix(0.95, 0.74);
  const lowY = Math.min(arch + 0.07, sy - 0.09), span = sy - lowY;
  const y5 = sy - Math.min(0.165, span * 0.45), y6 = sy - Math.min(0.05, span * 0.15);
  return [
    [0, floor], [Math.min(0.6, sw - 0.3), floor], [w - 0.05, arch], [w - 0.012, lowY], [w, (lowY + y5) / 2], [w - 0.003, y5], [w - 0.012, y6], [sx, sy],
    [sx - (sx - tw) * a8, sy + (top - sy) * b8], [sx - (sx - tw) * a9, sy + (top - sy) * b9], [tw, top - 0.02], [0, top],
  ];
}
const HALF = 12; // точек в половине сечения

// какой материал и цвет у полоски между точками j и j+1 сечения на расстоянии z
function skin(S, z, j, paint) {
  if (j <= 1) return ['dark', COL.under];
  if (j === 2) return ['dark', COL.trim];
  const hl = S.len / 2;
  if (j === 5 && z > hl - 0.22) return ['light', 0xb9c8ea];  // фара заходит на крыло
  if (j === 5 && z < -hl + 0.34) return ['light', 0xe01610]; // фонарь заходит на крыло
  const inCab = z > S.cabin[0] && z < S.cabin[1], shield = z >= S.roof[1], rear = z <= S.roof[0];
  if (!inCab || j <= 6) return ['paint', paint];
  if (j === 7) return ['dark', COL.trim];                                     // чёрная окантовка окон
  if (j === 10) return shield || rear ? ['glass', COL.glass] : ['dark', COL.roof]; // лобовое, заднее стекло, чёрная крыша
  if (shield) return j === 8 && z < 0.78 ? ['glass', COL.glass] : ['paint', paint]; // передняя стойка и уголок зеркала
  if (rear) return z > S.kink && j === 8 ? ['glass', COL.glass] : ['paint', paint];  // задняя стойка с изгибом
  if (z > S.pillarB[0] && z < S.pillarB[1]) return ['dark', COL.trim];          // средняя стойка
  return ['glass', COL.glass];
}

function buildBody(S, P, paint) {
  // сечения чаще у арок и на скруглениях носа и хвоста
  const zs = [];
  const hl = S.len / 2;
  for (let z = -hl; z <= hl + 1e-6; ) {
    zs.push(Math.min(hl, z));
    const nearArch = Math.min(Math.abs(z - S.axF), Math.abs(z - S.axR)) < S.wheel + 0.12;
    const nearEnd = hl - Math.abs(z) < 0.2;
    z += nearArch ? 0.045 : nearEnd ? 0.035 : 0.11;
  }
  if (zs.at(-1) < hl) zs.push(hl);
  const rings = zs.map((z) => {
    const half = section(S, z), ring = [];
    for (let i = 0; i < HALF; i++) ring.push([half[i][0], half[i][1], z]);
    for (let i = HALF - 2; i >= 1; i--) ring.push([-half[i][0], half[i][1], z]); // правая сторона — зеркально
    return ring;
  });
  const R = rings[0].length; // точек по кругу
  for (let k = 0; k < rings.length - 1; k++) {
    const zMid = (zs[k] + zs[k + 1]) / 2;
    for (let j = 0; j < R; j++) {
      const j2 = (j + 1) % R, seg = j < HALF - 1 ? j : R - 1 - j;
      const [slot, color] = skin(S, zMid, seg, paint);
      const A = rings[k][j], B = rings[k][j2], C = rings[k + 1][j2], D = rings[k + 1][j];
      P.loftTri(A, B, D, slot, color);
      P.loftTri(B, C, D, slot, color);
    }
  }
  // торцы: нос и хвост
  for (const [ring, front] of [[rings.at(-1), true], [rings[0], false]]) {
    const c = [0, (ring[0][1] + ring[HALF - 1][1]) / 2, ring[0][2]];
    for (let j = 0; j < R; j++) {
      const a = ring[j], b = ring[(j + 1) % R];
      if (front) P.loftTri(c, a, b, 'paint', paint); else P.loftTri(c, b, a, 'paint', paint);
    }
  }
  P.finishLoft();
}

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const slab = (w, h, r, d) => new THREE.ExtrudeGeometry(roundRect(w, h, r), { depth: d, bevelEnabled: false, curveSegments: 4 });

function buildDetails(S, P, paint) {
  const hl = S.len / 2, nose = hl, tail = -hl;
  // ---- перёд: сдвоенная решётка, фары, воздухозаборники, сплиттер (всё на плоском торце носа) ----
  const fy = Math.min(S.sy(nose), S.top(nose) - 0.035), fh0 = fy - 0.165, fh1 = fy - 0.05; // высота полосы фар
  P.pair((s) => {
    P.add('dark', slab(0.33, 0.2, 0.05, 0.03), COL.rim, s * 0.185, fy - 0.1, nose - 0.008);     // рамка «ноздри»
    P.add('dark', slab(0.285, 0.155, 0.038, 0.042), 0x040405, s * 0.185, fy - 0.1, nose - 0.008); // её чёрная сетка
    for (let i = -3; i <= 3; i++) P.box('dark', 0x1b1d20, 0.011, 0.14, 0.05, s * 0.185 + i * 0.037, fy - 0.1, nose + 0.012); // ламели
    // фара: тёмный корпус и две яркие «линзы», дальше она уходит на крыло полосой
    P.box('dark', 0x040405, 0.42, fh1 - fh0 + 0.02, 0.03, s * 0.6, (fh0 + fh1) / 2, nose);
    P.add('light', slab(0.15, fh1 - fh0 - 0.03, 0.03, 0.03), 0xf4f8ff, s * 0.49, (fh0 + fh1) / 2, nose);
    P.add('light', slab(0.15, fh1 - fh0 - 0.03, 0.03, 0.03), 0xf4f8ff, s * 0.67, (fh0 + fh1) / 2, nose);
    // боковой воздухозаборник с двумя рёбрами
    P.add('dark', slab(0.3, 0.2, 0.03, 0.03), 0x040405, s * 0.6, 0.33, nose - 0.005);
    for (const y of [0.3, 0.36]) P.box('dark', 0x1b1d20, 0.28, 0.012, 0.04, s * 0.6, y, nose + 0.012);
  });
  P.add('dark', slab(0.74, 0.2, 0.03, 0.03), 0x040405, 0, 0.33, nose - 0.005);                   // центральный воздухозаборник
  for (const y of [0.28, 0.33, 0.38]) P.box('dark', 0x1b1d20, 0.72, 0.01, 0.04, 0, y, nose + 0.012);
  P.box('dark', COL.trim, 1.56, 0.028, 0.14, 0, 0.165, nose - 0.04);                             // сплиттер
  // ---- бока: зеркала, швы дверей, ручки, «жабры», пороги ----
  P.pair((s) => {
    const mz = 0.88, my = S.sy(mz) + 0.105, mx = s * (S.sw(mz) + 0.105);
    P.box('paint', paint, 0.17, 0.09, 0.075, mx, my, mz, s * 0.18);
    P.box('dark', COL.trim, 0.17, 0.028, 0.08, mx, my - 0.055, mz, s * 0.18);
    P.box('dark', COL.trim, 0.1, 0.03, 0.06, s * (S.sw(mz) + 0.02), my - 0.07, mz + 0.01);
    P.box('glass', 0x2a3138, 0.145, 0.07, 0.01, mx, my, mz - 0.04, s * 0.18);                   // само зеркало
    for (const z of S.doors) {                                                                  // швы дверей
      const y0 = S.by(z) + 0.1, y1 = S.sy(z) - 0.03;
      P.box('dark', 0x050506, 0.008, y1 - y0, 0.014, s * (S.sw(z) + 0.001), (y0 + y1) / 2, z);
    }
    for (const z of [S.doors[1] + 0.2, S.doors[2] + 0.2]) P.box('paint', paint, 0.022, 0.028, 0.19, s * (S.sw(z) + 0.004), S.sy(z) - 0.115, z); // ручки
    P.box('dark', 0x050506, 0.008, 0.07, 0.24, s * (S.sw(1.02) + 0.002), 0.71, 1.02, 0, 0, s * 0);  // «жабры» за передним колесом
    P.box('dark', COL.chrome, 0.009, 0.012, 0.2, s * (S.sw(1.02) + 0.003), 0.71, 1.02);
    P.box('dark', COL.trim, 0.05, 0.06, 2.3, s * (S.sw(0) - 0.01), S.by(0) + 0.03, 0.1);           // накладка порога
  });
  // ---- корма: фонари, спойлер, номер, диффузор, четыре трубы ----
  const ry = Math.min(S.sy(tail), S.top(tail) - 0.035), rh0 = ry - 0.165, rh1 = ry - 0.05;       // высота полосы фонарей
  P.pair((s) => {
    P.box('dark', 0x1a0506, 0.6, rh1 - rh0 + 0.02, 0.03, s * 0.52, (rh0 + rh1) / 2, tail);         // корпус фонаря
    P.box('light', 0xff2014, 0.56, 0.03, 0.03, s * 0.52, rh1 - 0.022, tail - 0.012);               // верхняя светящаяся полоса
    P.box('light', 0xc8120c, 0.56, 0.026, 0.03, s * 0.52, rh0 + 0.03, tail - 0.012);               // нижняя
    P.box('light', 0x9c100a, 0.03, 0.14, 0.02, s * 0.74, 0.44, tail - 0.004);                      // вертикальный отражатель
    for (const x of [0.37, 0.52]) {                                                               // трубы выхлопа
      const tip = new THREE.CylinderGeometry(0.052, 0.052, 0.12, 12, 1, true);
      P.add('dark', tip, COL.chrome, s * x, 0.33, tail - 0.01, 0, 0, Math.PI / 2);
      P.add('dark', new THREE.CircleGeometry(0.045, 10), 0x020202, s * x, 0.33, tail + 0.03, Math.PI);
    }
  });
  P.box('dark', COL.trim, 1.34, 0.03, 0.08, 0, S.top(tail + 0.07) + 0.012, tail + 0.07);         // спойлер-«утиный хвост»
  P.box('light', COL.plate, 0.52, 0.11, 0.012, 0, 0.67, tail - 0.004);                           // номерная табличка
  P.box('dark', 0x050506, 1.36, 0.2, 0.07, 0, 0.36, tail + 0.03);                                // диффузор
  for (const x of [-0.16, 0, 0.16]) P.box('dark', 0x1b1d20, 0.014, 0.16, 0.09, x, 0.34, tail + 0.03); // его рёбра
  // ---- крыша: «плавник» антенны ----
  P.box('dark', COL.trim, 0.045, 0.05, 0.17, 0, S.top(-0.98) + 0.02, -0.98, 0, 0, 0.12);
}

// колесо: шина со скруглённым плечом, обод, пять сдвоенных спиц, тормозной диск и суппорт. Ось — x, лицо — в сторону +x.
export function wheelGeometry(R = 0.35, W = 0.275, simple = false) {
  const P = new Parts(), seg = simple ? 14 : 24;
  const lathe = (pts, color) => {
    const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg);
    g.rotateZ(-Math.PI / 2); // ось вращения y → x
    P.add('dark', g, color);
  };
  const rr = R - 0.062; // радиус обода: низкопрофильная шина
  lathe([[rr, -W / 2], [R - 0.018, -W / 2], [R, -W / 2 + 0.03], [R, W / 2 - 0.03], [R - 0.018, W / 2], [rr, W / 2]], COL.tyre);
  lathe([[rr, W / 2], [rr - 0.014, W / 2 - 0.018], [rr - 0.022, -W / 2 + 0.03], [0.05, -W / 2 + 0.03]], COL.rim); // чаша обода
  lathe([[rr - 0.014, W / 2 - 0.018], [rr, W / 2 + 0.002]], COL.rimFace);                                         // полированная кромка
  const face = W / 2 - 0.04;
  const spoke = (a0, a1, wdt) => { // спица от ступицы (под углом a0) к ободу (под углом a1)
    const r0 = 0.06, r1 = rr - 0.02, y0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0, y1 = Math.cos(a1) * r1, z1 = Math.sin(a1) * r1;
    const len = Math.hypot(y1 - y0, z1 - z0), ang = Math.atan2(z1 - z0, y1 - y0);
    P.box('dark', COL.rimFace, 0.028, len, wdt, face, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, ang);
  };
  if (!simple) {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; spoke(a, a - 0.2, 0.03); spoke(a, a + 0.2, 0.03); } // пять Y-образных спиц
    const disc = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20);
    P.add('dark', disc, COL.disc, face - 0.075, 0, 0, 0, Math.PI / 2);
  } else {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; spoke(a, a, 0.06); }
  }
  const hub = new THREE.CylinderGeometry(0.07, 0.075, 0.05, 10);
  P.add('dark', hub, COL.rimFace, face + 0.005, 0, 0, 0, Math.PI / 2);
  return P.geometry('dark');
}

// Отражения ночной улицы для лака и стёкол: тёмное небо, зарево у горизонта, ряды фонарей.
export function nightEnvironment(renderer) {
  const env = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#05070e'); gr.addColorStop(0.5, '#0e1326'); gr.addColorStop(0.62, '#4a3a55'); gr.addColorStop(0.7, '#1a1c22'); gr.addColorStop(1, '#0a0b0d');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const sky = new THREE.CanvasTexture(c);
  sky.colorSpace = THREE.SRGBColorSpace;
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide })));
  const glow = (color, k, w, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  for (let i = -3; i <= 3; i++) { glow(0xffc27a, 9, 1.6, 0.8, 9, 7, i * 9); glow(0xffc27a, 9, 1.6, 0.8, -9, 7, i * 9 + 4); } // фонари по обе стороны
  glow(0xfff0d8, 3, 14, 3, 16, 2.5, 6); glow(0xd8e8ff, 2.5, 14, 3, -16, 2.5, -8);                                         // светящиеся витрины
  glow(0xff3020, 5, 1.2, 0.5, 2, 1, -14); glow(0xffffff, 5, 1.2, 0.5, -3, 1, 14);                                         // чьи-то фонари и фары
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  return tex;
}

export function carMaterials(envMap, paint) {
  return {
    paint: new THREE.MeshStandardMaterial({ color: paint, metalness: 0.72, roughness: 0.26, envMap, envMapIntensity: 1.25 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.06, envMap, envMapIntensity: 1.5 }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42, envMap, envMapIntensity: 0.9 }),
    light: new THREE.MeshBasicMaterial({ vertexColors: true }),
    wheel: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.4, envMap, envMapIntensity: 0.9, side: THREE.DoubleSide }),
  };
}

// Собирает машину. Возвращает корень, кузов (его качает на подвеске) и четыре колеса на поворотных стойках.
export function buildCar({ spec = SEDAN, color = 0x15171a, envMap = null } = {}) {
  const P = new Parts();
  buildBody(spec, P, 0xffffff);
  buildDetails(spec, P, 0xffffff);
  const mats = carMaterials(envMap, color);
  const root = new THREE.Group(), chassis = new THREE.Group();
  root.add(chassis);
  let tris = 0;
  for (const slot of ['paint', 'glass', 'dark', 'light']) {
    const geo = P.geometry(slot);
    if (slot === 'paint') geo.deleteAttribute('color'); // цвет лака — из материала, чтобы его можно было менять
    tris += geo.attributes.position.count / 3;
    chassis.add(new THREE.Mesh(geo, mats[slot]));
  }
  const wg = wheelGeometry(spec.wheel, spec.tyreW);
  const calG = new THREE.BoxGeometry(0.06, 0.09, 0.17), calM = new THREE.MeshStandardMaterial({ color: COL.caliper, metalness: 0.4, roughness: 0.5, envMap });
  const wheels = [];
  for (const z of [spec.axF, spec.axR]) for (const s of [1, -1]) { // перед-лево, перед-право, зад-лево, зад-право
    const pivot = new THREE.Group();
    pivot.position.set(s * spec.track, spec.wheel, z);
    const mesh = new THREE.Mesh(wg, mats.wheel);
    const flip = new THREE.Group(); // правое колесо развёрнуто лицом наружу
    flip.rotation.y = s > 0 ? 0 : Math.PI;
    flip.add(mesh);
    // суппорт стоит на месте, пока колесо крутится
    const caliper = new THREE.Mesh(calG, calM);
    caliper.position.set(spec.tyreW / 2 - 0.105, 0.14, -0.13);
    caliper.rotation.x = 0.75;
    flip.add(caliper);
    pivot.add(flip);
    root.add(pivot);
    wheels.push({ pivot, mesh, front: z > 0, side: s });
    tris += wg.attributes.position.count / 3;
  }
  return { root, chassis, wheels, mats, tris, type: { len: spec.len, wid: spec.wid, wheel: spec.wheel, belt: 0.9 } };
}
