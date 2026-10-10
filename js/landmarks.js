// Узнаваемые места Красной: Александровская арка, «Аврора», фонтаны, башня Шухова,
// вывески на зданиях и синие таблички с названиями поперечных улиц.
import * as THREE from 'three';
import { LANE_W } from './chain.js?v=5';

const L = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
const BRICK = L(0xa5452f), WHITE = L(0xf1ece0), TENT = L(0x2f6658), GOLD = L(0xd8a41e, { emissive: 0x4a3400 });
const STONE = L(0xa39c93), GRANITE = L(0x8d7f7a), BRONZE = L(0x5d4e36);
const WATER = new THREE.MeshBasicMaterial({ color: 0x66aee0 });
const JET = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.7 });

const box = (g, mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };

function tent(g, r, h, x, y, z) {
  const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), TENT);
  c.rotation.y = Math.PI / 4;
  c.position.set(x, y + h / 2, z);
  g.add(c);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 8, 6), GOLD);
  tip.position.set(x, y + h + r * 0.12, z);
  g.add(tip);
}

// Александровская триумфальная арка: красный кирпич с белым декором, шатры с золотыми навершиями
function arch(scene, x, z, yaw, addSolid) {
  const g = new THREE.Group();
  const W = 13, H = 10.5, D = 5, OW = 5.2, OH = 5.4;
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H); sh.lineTo(-W / 2, H); sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-OW / 2, 0); hole.lineTo(-OW / 2, OH); hole.absarc(0, OH, OW / 2, Math.PI, 0, true); hole.lineTo(OW / 2, 0); hole.closePath();
  sh.holes.push(hole);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 10 }), BRICK);
  body.position.z = -D / 2;
  g.add(body);
  // белые пояса, карниз и обрамление проезда
  box(g, WHITE, W + 0.5, 0.4, D + 0.5, 0, 4.9, 0);
  box(g, WHITE, W + 0.7, 0.5, D + 0.7, 0, H + 0.25, 0);
  box(g, WHITE, W + 0.3, 0.7, D + 0.3, 0, 0.35, 0).scale.set(1, 1, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, WHITE, 0.45, H - 5.4, 0.3, sx * (OW / 2 + 0.55), 5.1 + (H - 5.4) / 2, sz * (D / 2 + 0.05));
    box(g, WHITE, 0.45, H, 0.3, sx * (W / 2 - 0.4), H / 2, sz * (D / 2 + 0.05));
  }
  // аттик с кокошником и иконой
  box(g, BRICK, W - 2.6, 1.7, D - 0.6, 0, H + 1.35, 0);
  for (const sz of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-2.6, 0); tri.lineTo(2.6, 0); tri.lineTo(0, 2.4); tri.closePath();
    const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.35, bevelEnabled: false }), WHITE);
    ped.position.set(0, H + 0.5, sz > 0 ? D / 2 - 0.1 : -D / 2 - 0.25);
    g.add(ped);
    box(g, GOLD, 1.1, 1.3, 0.12, 0, H + 1.25, sz * (D / 2 + 0.3));
  }
  // четыре угловые башенки и центральный шатёр
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tx = sx * (W / 2 - 1.2), tz = sz * (D / 2 - 1.1);
    box(g, BRICK, 1.9, 2.6, 1.9, tx, H + 1.8, tz);
    box(g, WHITE, 2.15, 0.25, 2.15, tx, H + 3.15, tz);
    tent(g, 1.45, 3.0, tx, H + 3.25, tz);
  }
  box(g, BRICK, 3.0, 1.2, 3.0, 0, H + 2.8, 0);
  tent(g, 2.3, 4.4, 0, H + 3.4, 0);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  // опоры — препятствия, проезд свободен
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const sx of [-1, 1]) {
    const x0 = sx * OW / 2, x1 = sx * W / 2, pts = [];
    for (const [lx, lz] of [[x0, -D / 2], [x1, -D / 2], [x1, D / 2], [x0, D / 2]]) pts.push(x + lx * c + lz * s, z - lx * s + lz * c);
    addSolid(pts);
  }
}

// памятник «Аврора»: девушка со звездой на высоком постаменте
function avrora(scene, x, z, addSolid) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.5, 1.2, 20), STONE);
  base.position.y = 0.6; g.add(base);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 11, 8), GRANITE);
  ped.position.y = 6.7; g.add(ped);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 3.6, 8), BRONZE);
  body.position.y = 14; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), BRONZE);
  head.position.y = 16.2; g.add(head);
  const arm = box(g, BRONZE, 0.28, 2.4, 0.28, 0.75, 16.4, 0);
  arm.rotation.z = -0.35;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), GOLD);
  star.position.set(1.2, 17.9, 0); g.add(star);
  box(g, BRONZE, 0.1, 3.4, 0.1, -0.7, 14.9, 0.2); // винтовка
  g.position.set(x, 0, z);
  scene.add(g);
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push(x + Math.cos(i / 10 * 6.283) * 7.5, z + Math.sin(i / 10 * 6.283) * 7.5);
  addSolid(pts);
}

function fountain(scene, x, z, r, addSolid) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.3, 0.7, 28), STONE);
  rim.position.y = 0.35; g.add(rim);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.5, r - 0.5, 0.1, 28), WATER);
  water.position.y = 0.72; g.add(water);
  const jet = (jx, jz, h, w) => { const j = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6), JET); j.position.set(jx, 0.7 + h / 2, jz); g.add(j); };
  jet(0, 0, r > 8 ? 9 : 2.6, r > 8 ? 0.7 : 0.35);
  if (r > 8) for (let i = 0; i < 12; i++) jet(Math.cos(i / 12 * 6.283) * r * 0.62, Math.sin(i / 12 * 6.283) * r * 0.62, 4.5, 0.4);
  g.position.set(x, 0, z);
  scene.add(g);
  const pts = [];
  for (let i = 0; i < 12; i++) pts.push(x + Math.cos(i / 12 * 6.283) * (r + 0.3), z + Math.sin(i / 12 * 6.283) * (r + 0.3));
  addSolid(pts);
}

// водонапорная башня Шухова: сетчатый гиперболоид с баком наверху
function shukhovTower(scene, x, z) {
  const H = 25, R0 = 6, R1 = 3.1, N = 24, twist = 1.7, pos = [];
  for (let i = 0; i < N; i++) for (const dir of [1, -1]) {
    const a0 = i / N * Math.PI * 2, a1 = a0 + dir * twist;
    pos.push(Math.cos(a0) * R0, 0, Math.sin(a0) * R0, Math.cos(a1) * R1, H, Math.sin(a1) * R1);
  }
  // кольца: радиус гиперболоида на высоте y вдоль прямой стойки
  for (let k = 1; k <= 5; k++) {
    const t = k / 5, ax = R0 + (Math.cos(twist) * R1 - R0) * t, az = Math.sin(twist) * R1 * t, r = Math.hypot(ax, az);
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * 6.283, b = (i + 1) / 32 * 6.283;
      pos.push(Math.cos(a) * r, H * t, Math.sin(a) * r, Math.cos(b) * r, H * t, Math.sin(b) * r);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const g = new THREE.Group();
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3b3f45 })));
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 4.2, 16), L(0x4a4f57));
  tank.position.y = H + 2.1; g.add(tank);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.4, 16), L(0x3b3f45));
  cap.position.y = H + 4.9; g.add(cap);
  g.position.set(x, 0, z);
  scene.add(g);
}

const SIGN_NAMES = {
  'Краснодарский академический театр драмы им. Горького': ['ТЕАТР ДРАМЫ', 3.4, '#7a1f1f'],
  'Кинотеатр «Аврора»': ['АВРОРА', 3.6, '#b3122b'],
  'Галерея Краснодар': ['ГАЛЕРЕЯ КРАСНОДАР', 4.2, '#c8102e'],
  'Вкусно — и точка': ['ВКУСНО — И ТОЧКА', 1.6, '#0b5e3b'],
  'Универмаг "Краснодар"': ['УНИВЕРМАГ «КРАСНОДАР»', 2.2, '#1f3f7a'],
  'МТРК Краснодар': ['МТРК КРАСНОДАР', 2.2, '#1f3f7a'],
  'Гостиница Динамо': ['ГОСТИНИЦА «ДИНАМО»', 1.8, '#1b4fa0'],
  'Дом спорта "Динамо"': ['ДИНАМО · ДОМ СПОРТА', 1.8, '#1b4fa0'],
  'Ibis': ['IBIS', 2.6, '#b3122b'],
  'Райффайзен': ['РАЙФФАЙЗЕН', 1.6, '#222222'],
  'Цирк': ['ЦИРК', 3.0, '#b3122b'],
  'Крытый рынок': ['КРЫТЫЙ РЫНОК', 1.8, '#2f5d3a'],
  'Дом Союзов': ['ДОМ СОЮЗОВ', 1.6, '#3a3f47'],
  'Пенсионный Фонд России': ['ПЕНСИОННЫЙ ФОНД', 1.8, '#1f3f7a'],
  'Жар-Пицца': ['ЖАР-ПИЦЦА', 1.4, '#b3122b'],
  'Бумбараш': ['БУМБАРАШ', 1.3, '#7a4a1f'],
  'Небесный Дракон': ['НЕБЕСНЫЙ ДРАКОН', 1.3, '#8a1f1f'],
  'Птичка-Невеличка': ['ПТИЧКА-НЕВЕЛИЧКА', 1.3, '#7a4a1f'],
  'Ёлки-палки': ['ЁЛКИ-ПАЛКИ', 1.3, '#2f5d3a'],
  'Венский дом': ['ВЕНСКИЙ ДОМ', 2.0, '#3a3f47'],
  'Волна': ['ЖК «ВОЛНА»', 2.0, '#1b4fa0'],
  'Кубаньводпроэкт': ['КУБАНЬВОДПРОЕКТ', 2.0, '#3a3f47'],
  'Краснодарский машиностроительный колледж': ['МАШИНОСТРОИТЕЛЬНЫЙ КОЛЛЕДЖ', 1.5, '#3a3f47'],
  'Учебный корпус КубГТУ': ['КубГТУ', 2.2, '#1f3f7a'],
  'Билайн': ['БИЛАЙН', 1.2, '#222222'],
};

// вывеска на стене, обращённой к Красной
function wallSign(scene, b, spec, chains, textPlane) {
  const [text, sh, bg] = spec, p = b.p, n = p.length / 2, o = {};
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 5) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const nx = -(bz - az) / len, nz = (bx - ax) / len; // наружу
    let d = Infinity, toward = 0;
    for (const c of [chains.north, chains.south]) {
      c.project(mx, mz, -1, o);
      if (o.d < d) { d = o.d; const px = c.x[o.i] - mx, pz = c.z[o.i] - mz; toward = (px * nx + pz * nz) / (Math.hypot(px, pz) || 1); }
    }
    const score = d - Math.min(len, 45) * 0.6 - toward * 25;
    if (!best || score < best.score) best = { score, mx, mz, nx, nz, len, d };
  }
  if (!best || best.d > 230) return;
  const w = Math.min(best.len * 0.85, text.length * sh * 0.68 + sh);
  const h = Math.min(sh, w / text.length * 1.5);
  const m = textPlane(text, w, h, bg, '#ffffff');
  const y = b.h >= h + 5 ? b.h - h / 2 - 0.9 : b.h + h / 2 + 0.25; // на низком доме — над крышей
  m.position.set(best.mx + best.nx * 0.3, y, best.mz + best.nz * 0.3);
  m.rotation.y = Math.atan2(best.nx, best.nz);
  scene.add(m);
}

const shortStreet = (n) => n
  .replace(/^улица имени\s+(?:\S+\s+)?(\S+)$/, 'ул. $1')
  .replace(/^улица\s+(.+)$/, 'ул. $1')
  .replace(/^(.+)\s+улица$/, 'ул. $1')
  .replace(/^(.+)\s+переулок$/, 'пер. $1')
  .replace(/^шоссе\s+(.+)$/, 'ш. $1');

// синяя табличка над правым краем дороги за 30 м до перекрёстка
function streetSign(scene, c, name, chain, textPlane, postMat) {
  const o = {};
  chain.project(c.x, c.z, -1, o);
  if (o.s < 45) return;
  chain.at(o.s - 30, o);
  const edge = o.lanes * LANE_W / 2 + 1.5, rx = -o.dz, rz = o.dx; // вправо от направления движения
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.6, 0.22), postMat);
  post.position.y = 3.3; g.add(post);
  const text = shortStreet(name), w = Math.max(4.2, text.length * 0.52 + 1.2);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.16, 0.16), postMat);
  arm.position.set(-w / 2, 6.5, 0); g.add(arm); // −x в осях таблички — в сторону дороги
  const board = textPlane(text, w, 1.15, '#1d4fa8', '#ffffff');
  board.position.set(-w / 2 - 0.3, 5.75, 0.12);
  g.add(board);
  g.position.set(o.x + rx * edge, 0, o.z + rz * edge);
  // доска смотрит навстречу движению, консоль тянется над дорогой
  g.rotation.y = Math.atan2(-o.dx, -o.dz);
  scene.add(g);
}

export function buildLandmarks(scene, data, chains, { textPlane, addSolid, named, shukhov }) {
  const lm = data.landmarks || {}, o = {};
  if (lm.arch) {
    chains.north.project(lm.arch[0], lm.arch[1], -1, o);
    arch(scene, lm.arch[0], lm.arch[1], Math.atan2(o.dx, o.dz), addSolid);
  }
  if (lm.avrora) avrora(scene, lm.avrora[0], lm.avrora[1], addSolid);
  for (const [x, z, r] of lm.fountains || []) fountain(scene, x, z, r, addSolid);
  if (shukhov) shukhovTower(scene, shukhov[0], shukhov[1]);
  const done = new Set();
  for (const b of named) {
    const spec = SIGN_NAMES[b.n];
    if (!spec || done.has(b.n)) continue;
    done.add(b.n);
    wallSign(scene, b, spec, chains, textPlane);
  }
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6b7078 });
  for (const c of data.crossings || []) streetSign(scene, c, c.n, chains[c.k], textPlane, postMat);
}
