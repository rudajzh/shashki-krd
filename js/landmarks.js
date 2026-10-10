// Узнаваемые места Красной: Александровская арка, «Аврора», фонтаны, башня Шухова,
// вывески на зданиях и синие таблички с названиями поперечных улиц.
import * as THREE from 'three';
import { halfWidth } from './chain.js?v=9';

// ночью знаковые объекты подсвечены: материал немного светится собственным цветом
const L = (color, extra) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.28, ...extra });
const BRICK = L(0xb5522f), BRICK_D = L(0x94412a), TRIM = L(0xc7653c), SLATE = L(0x6c7077), DARK = L(0x34373c);
const SLATE_2 = L(0x6c7077, { side: THREE.DoubleSide }); // у зеркальной крыши крыла грани вывернуты
const KOK = L(0x9aa67c), ICON = L(0xe9dfc6), GOLD = L(0xd8a41e, { emissiveIntensity: 0.6 });
const STONE = L(0xa39c93), GRANITE = L(0x5a5653), BRONZE = L(0x3b352d);
const WATER = new THREE.MeshBasicMaterial({ color: 0x2f6f9c });
const JET = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.75 });

const box = (g, mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };

// Александровская триумфальная арка. Сделана по фотографиям: вся из красного кирпича,
// высокая середина с большим проездом, два низких крыла с пешеходными арками под односкатными крышами,
// над серединой — серый шатёр с площадкой, по углам тонкие башенки, над проездом кокошник с иконой.
function arch(scene, x, z, yaw, addSolid) {
  const g = new THREE.Group();
  const W = 9, H = 11, D = 5, OW = 5, OH = 5.6;       // середина и её проезд
  const WW = 5.4, WH = 5.3, WD = 4, PW = 2.1, PH = 2.5; // крыло и его проход
  const wall = (w, h, d, ow, oh, cx) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-ow / 2, 0); hole.lineTo(-ow / 2, oh); hole.absarc(0, oh, ow / 2, Math.PI, 0, true); hole.lineTo(ow / 2, 0); hole.closePath();
    sh.holes.push(hole);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 10 }), BRICK);
    m.position.set(cx, 0, -d / 2);
    g.add(m);
  };
  wall(W, H, D, OW, OH, 0);
  for (const sx of [-1, 1]) {
    const cx = sx * (W / 2 + WW / 2);
    wall(WW, WH, WD, PW, PH, cx);
    // односкатная крыша крыла поднимается к середине
    const rs = new THREE.Shape();
    rs.moveTo(-WW / 2 - 0.2, 0); rs.lineTo(WW / 2, 0); rs.lineTo(WW / 2, 2.3); rs.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(rs, { depth: WD + 0.4, bevelEnabled: false }), SLATE_2);
    roof.scale.x = -sx; // у левого крыла высокая сторона справа, у правого — слева
    roof.position.set(cx, WH + 0.25, -(WD + 0.4) / 2);
    g.add(roof);
    box(g, TRIM, WW + 0.3, 0.3, WD + 0.3, cx, WH + 0.1, 0);
    box(g, TRIM, 0.7, WH + 0.9, WD + 0.2, sx * (W / 2 + WW - 0.35), (WH + 0.9) / 2, 0); // крайний пилон
  }
  // пояса и карниз середины
  box(g, TRIM, W + 0.35, 0.35, D + 0.35, 0, OH + OW / 2 + 0.9, 0);
  box(g, TRIM, W + 0.6, 0.45, D + 0.6, 0, H + 0.2, 0);
  box(g, TRIM, W + 0.3, 0.6, D + 0.3, 0, 0.3, 0);
  // кокошник с иконой и табличка — с обеих сторон
  for (const sz of [-1, 1]) {
    const k = new THREE.Shape();
    k.moveTo(-1.8, 0); k.quadraticCurveTo(-1.7, 1.5, 0, 2.5); k.quadraticCurveTo(1.7, 1.5, 1.8, 0); k.closePath();
    const kok = new THREE.Mesh(new THREE.ExtrudeGeometry(k, { depth: 0.3, bevelEnabled: false, curveSegments: 6 }), KOK);
    kok.position.set(0, H - 0.2, sz > 0 ? D / 2 - 0.05 : -D / 2 - 0.25);
    g.add(kok);
    box(g, ICON, 0.8, 1.1, 0.1, 0, H + 0.55, sz * (D / 2 + 0.28));
    box(g, ICON, 1.5, 0.5, 0.1, 0, OH + OW / 2 + 1.75, sz * (D / 2 + 0.06));
  }
  // серый шатёр с площадкой и ограждением
  const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1, 4.2, 4), SLATE);
  hip.rotation.y = Math.PI / 4;
  hip.scale.set((W - 0.6) / Math.SQRT2, 1, (D - 0.3) / Math.SQRT2);
  hip.position.y = H + 0.4 + 2.1;
  g.add(hip);
  box(g, DARK, (W - 0.6) * 0.45 + 0.3, 0.35, (D - 0.3) * 0.45 + 0.3, 0, H + 4.75, 0);
  // четыре тонкие башенки по углам середины
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tx = sx * (W / 2 - 0.35), tz = sz * (D / 2 - 0.2);
    box(g, BRICK, 1.0, H + 1.6, 1.0, tx, (H + 1.6) / 2, tz);
    box(g, TRIM, 1.25, 0.25, 1.25, tx, H + 1.6, tz);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.72, 2.6, 4), BRICK_D);
    sp.rotation.y = Math.PI / 4;
    sp.position.set(tx, H + 1.7 + 1.3, tz);
    g.add(sp);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), DARK);
    fin.position.set(tx, H + 4.45, tz);
    g.add(fin);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  // всё, кроме большого проезда, — препятствие
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const sx of [-1, 1]) {
    const x0 = sx * OW / 2, x1 = sx * (W / 2 + WW), pts = [];
    for (const [lx, lz] of [[x0, -D / 2], [x1, -D / 2], [x1, D / 2], [x0, D / 2]]) pts.push(x + lx * c + lz * s, z - lx * s + lz * c);
    addSolid(pts);
  }
}

// Памятник «Аврора» по фото: тёмная фигура девушки с поднятой рукой и звездой, винтовка за спиной,
// невысокий тёмный постамент на круглой площадке.
function avrora(scene, x, z, addSolid) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1, 20), STONE);
  base.position.y = 0.5; g.add(base);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 5.5, 6), GRANITE);
  ped.position.y = 3.7; g.add(ped);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.6, 6.2, 8), BRONZE);
  body.position.y = 9.5; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8), BRONZE);
  head.position.y = 13.2; g.add(head);
  const arm = box(g, BRONZE, 0.45, 3.6, 0.45, 1.25, 13.6, 0);
  arm.rotation.z = -0.3;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), GOLD);
  star.position.set(1.85, 15.8, 0); g.add(star);
  const rifle = box(g, BRONZE, 0.14, 4.6, 0.14, -0.9, 11.4, -0.5);
  rifle.rotation.z = 0.18;
  g.position.set(x, 0, z);
  scene.add(g);
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push(x + Math.cos(i / 10 * 6.283) * 8, z + Math.sin(i / 10 * 6.283) * 8);
  addSolid(pts);
}

// Описанный прямоугольник здания, повёрнутый лицом к точке target.
// Возвращает группу в его центре: местная ось +z смотрит на target, W — ширина фасада, D — глубина.
function facing(scene, p, target) {
  const n = p.length / 2;
  let ux = 1, uz = 0, bestLen = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1], len = Math.hypot(dx, dz);
    if (len > bestLen) { bestLen = len; ux = dx / len; uz = dz / len; }
  }
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = p[i * 2] * ux + p[i * 2 + 1] * uz, b = -p[i * 2] * uz + p[i * 2 + 1] * ux;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2, cx = ca * ux - cb * uz, cz = ca * uz + cb * ux;
  const tx = target[0] - cx, tz = target[1] - cz;
  let best = null;
  for (const [fx, fz, w, d] of [[ux, uz, b1 - b0, a1 - a0], [-ux, -uz, b1 - b0, a1 - a0], [-uz, ux, a1 - a0, b1 - b0], [uz, -ux, a1 - a0, b1 - b0]]) {
    const dot = fx * tx + fz * tz;
    if (!best || dot > best.dot) best = { dot, fx, fz, W: w, D: d };
  }
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = Math.atan2(best.fx, best.fz);
  scene.add(g);
  return { g, W: best.W, D: best.D };
}

// Театр драмы по фото: тёмный стеклянный низ, над ним широкий вогнутый фасад
// из вертикальных бежевых панелей, по панелям — буквы «ТЕАТР ДРАМЫ».
function theatre(scene, p, target, textPlane) {
  const { g, W, D } = facing(scene, p, target);
  const H0 = 4, H1 = 10;
  box(g, L(0x23272d), W - 6, H0, D - 6, 0, H0 / 2, 0);
  box(g, L(0xbfae86), W, H1, D - 3, 0, H0 + H1 / 2, -1.5);
  box(g, STONE, W + 14, 0.5, 16, 0, 0.25, D / 2 + 5); // площадка со ступенями
  box(g, STONE, W + 8, 0.9, 9, 0, 0.45, D / 2 + 2);
  const N = Math.max(13, Math.round(W / 4.2)), pw = W / N;
  const letters = ['Т', 'Е', 'А', 'Т', 'Р', '', 'Д', 'Р', 'А', 'М', 'Ы'], first = Math.floor((N - letters.length) / 2);
  const tones = [0xd2c198, 0xc3b188];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N * 2 - 1, zc = D / 2 - 2.6 * (1 - t * t); // вогнутая дуга
    const fin = box(g, L(tones[i % 2]), pw * 0.9, H1, 1.4, (i + 0.5) * pw - W / 2, H0 + H1 / 2, zc);
    fin.rotation.y = -t * 0.12;
    const ch = letters[i - first];
    if (ch) {
      const m = textPlane(ch, pw * 0.8, 2.6, '#' + tones[i % 2].toString(16), '#6b5836', 128);
      m.position.set((i + 0.5) * pw - W / 2, H0 + H1 * 0.52, zc + 0.75);
      m.rotation.y = -t * 0.12;
      g.add(m);
    }
  }
}

// Кинотеатр «Аврора» по фото: стеклянный фасад и огромный тёмный козырёк, нависающий над входом.
function cinema(scene, p, target, textPlane) {
  const { g, W, D } = facing(scene, p, target);
  const H = 9;
  box(g, L(0x88a89c), W - 1.2, H, D, 0, H / 2, 0);
  for (const sx of [-1, 1]) box(g, L(0xd8c078), 0.8, H + 0.4, D + 0.4, sx * (W / 2 - 0.3), (H + 0.4) / 2, 0);
  for (let i = 1; i < 9; i++) box(g, L(0x5d6b66), 0.18, H - 1, 0.2, -W / 2 + i * W / 9, H / 2 + 0.3, D / 2 + 0.05); // переплёты
  box(g, L(0x5d6b66), W - 1.4, 0.2, 0.2, 0, H * 0.45, D / 2 + 0.05);
  // козырёк: плита, которая поднимается и утолщается к переднему краю
  const sh = new THREE.Shape();
  sh.moveTo(-D / 2 - 1, H - 0.2); sh.lineTo(D / 2 + 9, H + 1.2); sh.lineTo(D / 2 + 9, H + 3.4); sh.lineTo(-D / 2 - 1, H + 1.4); sh.closePath();
  const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: W + 5, bevelEnabled: false }), L(0x2a2c30));
  slab.rotation.y = -Math.PI / 2; // профиль (вперёд, вверх) выдавлен по ширине фасада
  slab.position.set((W + 5) / 2, 0, 0);
  g.add(slab);
  const sign = textPlane('АВРОРА', Math.min(W * 0.5, 22), 2.4, '#2a2c30', '#f2e9d0');
  sign.position.set(0, H + 2.25, D / 2 + 9.08);
  g.add(sign);
  box(g, STONE, W + 10, 0.5, 12, 0, 0.25, D / 2 + 6);
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

// «Галерея Краснодар» по фото: терракотовые стены по настоящему контуру здания, тёмный верхний пояс,
// светящиеся витрины внизу, вертикальные стеклянные вставки и высокий стеклянный атриум у входа;
// над входом — белые буквы с засечками прямо на стене, без рекламной плашки.
function mall(scene, p, chains, textPlane) {
  const H = 23, n = p.length / 2, o = {};
  const pos = [], nrm = [];
  const quad = (arr, ax, az, bx, bz, y0, y1, nx, nz, out = 0) => {
    const ex = nx * out, ez = nz * out;
    arr.push(ax + ex, y0, az + ez, bx + ex, y0, bz + ez, bx + ex, y1, bz + ez, ax + ex, y0, az + ez, bx + ex, y1, bz + ez, ax + ex, y1, az + ez);
  };
  const glassPos = [], bandPos = [], shopPos = [];
  let best = null;
  const dist = (x, z) => { chains.north.project(x, z, -1, o); const d = o.d; chains.south.project(x, z, -1, o); return Math.min(d, o.d); };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
    quad(pos, ax, az, bx, bz, 0, H, nx, nz);
    for (let k = 0; k < 6; k++) nrm.push(nx, 0, nz);
    quad(bandPos, ax, az, bx, bz, H - 2.2, H + 0.6, nx, nz, 0.25);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, d = dist(mx, mz);
    const street = d < 130 && dist(mx + nx * 3, mz + nz * 3) < d; // стена смотрит на Красную
    if (!street || len < 8) continue;
    quad(shopPos, ax, az, bx, bz, 0.3, 4.4, nx, nz, 0.12);
    for (let a = 9; a + 4 < len - 6; a += 16) { // стеклянные вставки на всю высоту
      quad(glassPos, ax + ux * a, az + uz * a, ax + ux * (a + 4.5), az + uz * (a + 4.5), 5, H - 2.6, nx, nz, 0.14);
    }
    const score = d - Math.min(len, 60) * 0.5;
    if (!best || score < best.score) best = { score, mx, mz, nx, nz, len };
  }
  const mesh = (arr, mat, normals) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    scene.add(m);
  };
  mesh(pos, new THREE.MeshLambertMaterial({ color: 0xb4633a, emissive: 0xb4633a, emissiveIntensity: 0.3 }), nrm);
  mesh(bandPos, new THREE.MeshBasicMaterial({ color: 0x2a2623, side: THREE.DoubleSide }));
  mesh(shopPos, new THREE.MeshBasicMaterial({ color: 0xffdca6, side: THREE.DoubleSide }));
  mesh(glassPos, new THREE.MeshBasicMaterial({ color: 0x9cc3d6, side: THREE.DoubleSide }));
  const contour = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
  const roof = [];
  for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) for (const k of t) roof.push(contour[k].x, H, contour[k].y);
  mesh(roof, new THREE.MeshBasicMaterial({ color: 0x15171b, side: THREE.DoubleSide }));
  if (!best) return;
  // атриум у входа и надпись рядом
  const g = new THREE.Group();
  g.position.set(best.mx, 0, best.mz);
  g.rotation.y = Math.atan2(best.nx, best.nz);
  const AW = Math.min(26, best.len * 0.4), glass = new THREE.MeshBasicMaterial({ color: 0xb9dcea }), frame = new THREE.MeshBasicMaterial({ color: 0x3a4650 });
  box(g, glass, AW, H + 1.5, 4, 0, (H + 1.5) / 2, 1.9);
  for (let i = 0; i <= 6; i++) box(g, frame, 0.22, H + 1.5, 0.2, -AW / 2 + i * AW / 6, (H + 1.5) / 2, 3.95);
  for (let y = 4.5; y < H; y += 4.5) box(g, frame, AW, 0.2, 0.2, 0, y, 3.95);
  box(g, new THREE.MeshBasicMaterial({ color: 0x2a2623 }), AW + 1.2, 0.8, 5, 0, H + 1.9, 1.9);
  const text = textPlane('ГАЛЕРЕЯ', 15, 2.6, 'transparent', '#f4efe6', 512, 'Georgia, "Times New Roman", serif');
  text.position.set(AW / 2 + 11, H - 5.5, 0.2);
  g.add(text);
  scene.add(g);
}

// Высотная гостиница у южного разворота: стилобат с освещённым входом и козырьком, стеклянная башня
// со светящимися окнами, вертикальные пилоны, подсвеченный венец и красные огни на крыше.
function hotel(scene, x, z, levels, chains, textPlane, addSolid, addGlow) {
  const o = {};
  chains.north.project(x, z, -1, o);
  const yaw = Math.atan2(o.dx, o.dz), g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw; // местная ось +x смотрит на дорогу
  const H = Math.min(72, levels * 3.3), PH = 11, TW = 17, TL = 26;
  // окна башни: сетка 8×16, часть горит
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const k = c.getContext('2d');
  k.fillStyle = '#000'; k.fillRect(0, 0, 128, 256);
  let seed = 31;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let r = 0; r < 16; r++) for (let q = 0; q < 8; q++) {
    if (rnd() < 0.42) { k.fillStyle = ['#ffd9a0', '#ffe7c2', '#ffc27a', '#cfe4ff'][Math.floor(rnd() * 4)]; k.globalAlpha = 0.5 + rnd() * 0.5; k.fillRect(q * 16 + 2, r * 16 + 3, 12, 10); k.globalAlpha = 1; }
  }
  const win = (rx, ry) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshLambertMaterial({ color: 0x2f3b4d, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.2 }); };
  const rows = Math.round((H - PH) / 3.3) / 16, roofM = new THREE.MeshBasicMaterial({ color: 0x14161a });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(TW, H - PH, TL), [win(TL / 26, rows), win(TL / 26, rows), roofM, roofM, win(TW / 26, rows), win(TW / 26, rows)]);
  tower.position.y = PH + (H - PH) / 2;
  g.add(tower);
  const stone = L(0xb9ae9c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, stone, 1.1, H - PH + 1.5, 1.1, sx * TW / 2, PH + (H - PH + 1.5) / 2, sz * TL / 2); // пилоны по углам
  box(g, new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), TW + 0.5, 1.1, TL + 0.5, 0, H - 1.6, 0);                                       // светящийся венец
  box(g, stone, TW + 1.4, 0.9, TL + 1.4, 0, H + 0.2, 0);
  box(g, L(0x3a3f47), 6, 3, 8, 0, H + 2, 0);
  // стилобат: камень, светящийся первый этаж, козырёк над входом
  box(g, stone, 24, PH, 36, 0, PH / 2, 0);
  box(g, new THREE.MeshBasicMaterial({ color: 0xffdca6 }), 24.3, 3.4, 30, 0, 2.2, 0);
  for (let i = -3; i <= 3; i++) box(g, stone, 24.6, 3.6, 0.8, 0, 2.2, i * 4.6);                                                            // простенки между витринами
  box(g, new THREE.MeshBasicMaterial({ color: 0x9cb7c9 }), 24.3, 2.2, 32, 0, 7.6, 0);                                                      // лента окон второго яруса
  box(g, L(0x2a2d32), 7, 0.45, 12, 14.5, 4.6, 0);                                                                                           // козырёк
  for (const sz of [-1, 1]) box(g, L(0x8a8d92), 0.3, 4.6, 0.3, 17.4, 2.3, sz * 5.4);
  const sign = textPlane('MARRIOTT', 15, 2.6, 'transparent', '#ff3b30', 512, 'Georgia, "Times New Roman", serif');
  sign.position.set(TW / 2 + 0.25, H - 5.5, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  scene.add(g);
  const cs = Math.cos(yaw), sn = Math.sin(yaw), pts = [];
  for (const [lx, lz] of [[-12, -18], [12, -18], [12, 18], [-12, 18]]) pts.push(x + lx * cs + lz * sn, z - lx * sn + lz * cs);
  addSolid(pts);
  if (addGlow) {
    for (const [lx, lz] of [[TW / 2, TL / 2], [-TW / 2, -TL / 2]]) addGlow(x + lx * cs + lz * sn, H + 1.4, z - lx * sn + lz * cs, 0xff2a1a, 1);   // красные огни на крыше
    for (const lz of [-4, 0, 4]) addGlow(x + 15 * cs + lz * sn, 4.1, z - 15 * sn + lz * cs, 0xffe2b0, 1);                                      // свет под козырьком
  }
}

const SIGN_NAMES = {
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

const nearest = (list, p) => list.reduce((best, f) => (!best || Math.hypot(f[0] - p[0], f[1] - p[1]) < Math.hypot(best[0] - p[0], best[1] - p[1]) ? f : best), null);

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
  const edge = halfWidth(o.lf) + 1.0, rx = -o.dz, rz = o.dx; // вправо от направления движения
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

export const CUSTOM_BUILDINGS = { theatre: 'Краснодарский академический театр драмы им. Горького', cinema: 'Кинотеатр «Аврора»', mall: 'Галерея Краснодар' };

export function buildLandmarks(scene, data, chains, { textPlane, addSolid, named, shukhov, custom, addGlow }) {
  const lm = data.landmarks || {}, o = {};
  if (lm.arch) {
    chains.north.project(lm.arch[0], lm.arch[1], -1, o);
    arch(scene, lm.arch[0], lm.arch[1], Math.atan2(o.dx, o.dz), addSolid);
  }
  if (lm.avrora) avrora(scene, lm.avrora[0], lm.avrora[1], addSolid);
  for (const [x, z, r] of lm.fountains || []) fountain(scene, x, z, r, addSolid);
  if (shukhov) shukhovTower(scene, shukhov[0], shukhov[1]);
  const bigFountain = (lm.fountains || []).filter((f) => f[2] > 8);
  if (custom.theatre) theatre(scene, custom.theatre, nearest(bigFountain, custom.theatre) || [chains.north.x[0], chains.north.z[0]], textPlane);
  if (custom.cinema) cinema(scene, custom.cinema, lm.avrora || nearest(bigFountain, custom.cinema), textPlane);
  if (custom.mall) mall(scene, custom.mall, chains, textPlane);
  if (lm.hotel) hotel(scene, lm.hotel[0], lm.hotel[1], lm.hotel[2], chains, textPlane, addSolid, addGlow);
  // прожекторы у арки и памятника — тёплые точки света
  if (addGlow && lm.arch) for (const [dx, dz] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) addGlow(lm.arch[0] + dx, 1.2, lm.arch[1] + dz, 0xffc27a, 0.9);
  if (addGlow && lm.avrora) for (const a of [0, 2.1, 4.2]) addGlow(lm.avrora[0] + Math.cos(a) * 7, 1.4, lm.avrora[1] + Math.sin(a) * 7, 0xffd9a8, 0.9);
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
