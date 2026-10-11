// Узнаваемые места Красной: Александровская арка, «Аврора», фонтаны, башня Шухова,
// вывески на зданиях и синие таблички с названиями поперечных улиц.
import * as THREE from 'three';
import { halfWidth } from './chain.js?v=14';

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

// Гостиница по фото: в центре — стеклянный цилиндр на всю высоту с ажурной «короной» наверху,
// по бокам от него белые пилоны и стеклянные крылья, слева — отдельная башня с рядами балконов,
// внизу стеклянный стилобат. Красный знак — на правом пилоне под крышей.
function hotel(scene, x, z, levels, chains, textPlane, addSolid, addGlow) {
  const o = {};
  chains.north.project(x, z, -1, o);
  const yaw = Math.atan2(o.dx, o.dz), g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw; // местная ось +x смотрит на дорогу
  const H = Math.min(74, levels * 3.3), PH = 10;
  const lit = (cols, rows, share, seed0) => { // окна: сетка, часть горит
    const c = document.createElement('canvas');
    c.width = cols * 16; c.height = rows * 16;
    const k = c.getContext('2d');
    k.fillStyle = '#000'; k.fillRect(0, 0, c.width, c.height);
    let seed = seed0;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) if (rnd() < share) { k.fillStyle = ['#ffd9a0', '#ffe7c2', '#ffc27a', '#cfe4ff'][Math.floor(rnd() * 4)]; k.globalAlpha = 0.45 + rnd() * 0.5; k.fillRect(q * 16 + 2, r * 16 + 3, 12, 10); k.globalAlpha = 1; }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const glass = (tex) => new THREE.MeshLambertMaterial({ color: 0x3a5068, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.15 });
  const white = L(0xd9d6cf), dark = new THREE.MeshBasicMaterial({ color: 0x14161a });
  const rows = Math.round((H - PH) / 3.3);
  // стеклянные крылья за цилиндром
  const wing = new THREE.Mesh(new THREE.BoxGeometry(15, H - PH, 30), [glass(lit(10, rows, 0.4, 11)), glass(lit(10, rows, 0.4, 12)), dark, dark, glass(lit(6, rows, 0.4, 13)), glass(lit(6, rows, 0.4, 14))]);
  wing.position.set(-3, PH + (H - PH) / 2, 0);
  g.add(wing);
  // цилиндр
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, H + 3 - PH, 24, 1, true), glass(lit(18, rows + 1, 0.5, 21)));
  cyl.position.set(5, PH + (H + 3 - PH) / 2, 0);
  g.add(cyl);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.4, 24), dark);
  cap.position.set(5, H + 3, 0); g.add(cap);
  // «корона»: два кольца на тонких стойках
  for (const [r, y] of [[7.6, H + 5.2], [6.4, H + 7.2]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.14, 6, 28), white); ring.rotation.x = Math.PI / 2; ring.position.set(5, y, 0); g.add(ring); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(g, white, 0.14, 4.4, 0.14, 5 + Math.cos(a) * 6.8, H + 5, Math.sin(a) * 6.8).rotation.z = Math.cos(a) * 0.15; }
  // белые пилоны по обе стороны цилиндра
  for (const sz of [-1, 1]) box(g, white, 6, H + 2 - PH, 2.2, 3.5, PH + (H + 2 - PH) / 2, sz * 7.6);
  // башня с балконами слева
  const bal = lit(6, Math.round(H * 0.8 / 3.3), 0.3, 31);
  const bt = new THREE.Mesh(new THREE.BoxGeometry(12, H * 0.8, 11), new THREE.MeshLambertMaterial({ color: 0x8d9299, emissive: 0xffffff, emissiveMap: bal, emissiveIntensity: 0.9 }));
  bt.position.set(1, H * 0.4, -22); g.add(bt);
  for (let y = 6; y < H * 0.8; y += 3.3) box(g, white, 3.4, 0.35, 9, 7.6, y, -22); // плиты балконов
  // стилобат: стекло, тёмный пояс, светящийся вход
  box(g, new THREE.MeshLambertMaterial({ color: 0x40566c, emissive: 0x6f8aa5, emissiveIntensity: 0.5 }), 22, PH, 42, 2, PH / 2, -3);
  box(g, new THREE.MeshBasicMaterial({ color: 0xffdca6 }), 22.3, 3.2, 26, 2, 1.9, 2);
  for (let i = -3; i <= 3; i++) box(g, L(0x2a2d32), 22.6, 3.5, 0.6, 2, 1.9, 2 + i * 4);
  box(g, L(0x2a2d32), 22.4, 0.7, 42.4, 2, PH + 0.2, -3);
  const sign = textPlane('M', 3.4, 3.4, 'transparent', '#ff2a2a', 128, 'Georgia, "Times New Roman", serif');
  sign.position.set(6.6, H - 2.5, 7.8); sign.rotation.y = Math.PI / 2;
  g.add(sign);
  scene.add(g);
  const cs = Math.cos(yaw), sn = Math.sin(yaw), pts = [];
  for (const [lx, lz] of [[-10, -28], [13, -28], [13, 18], [-10, 18]]) pts.push(x + lx * cs + lz * sn, z - lx * sn + lz * cs);
  addSolid(pts);
  if (addGlow) {
    addGlow(x + 5 * cs, H + 7.6, z - 5 * sn, 0xff2a1a, 1);                                     // красный огонь на короне
    for (const lz of [-4, 2, 8]) addGlow(x + 14 * cs + lz * sn, 3.4, z - 14 * sn + lz * cs, 0xffe2b0, 0.9); // свет у входа
  }
}

// Корпус университета по фото: белое здание, на углу — полукруглая ротонда с пилястрами и высокими окнами.
function rotunda(scene, x, z, chains) {
  const o = {};
  chains.north.project(x, z, -1, o);
  const yaw = Math.atan2(o.dx, o.dz), g = new THREE.Group(), wh = L(0xe9e6dd), win = new THREE.MeshBasicMaterial({ color: 0x2b3a4a }), glow = new THREE.MeshBasicMaterial({ color: 0xffe0a8 });
  // (x, z) — центр ротонды. Здание стоит к западу от улицы: зеркалим модель, чтобы ротонда и окна смотрели на восток,
  // на дорогу; крыло уходит от ротонды на север вдоль улицы.
  g.rotation.y = yaw;
  g.scale.x = -1;
  const lx = -1.5, lz = -28; // где ротонда в осях модели (с учётом зеркала)
  g.position.set(x - (lx * Math.cos(yaw) + lz * Math.sin(yaw)), 0, z - (-lx * Math.sin(yaw) + lz * Math.cos(yaw)));
  box(g, wh, 15, 15, 64, -4, 7.5, 6);                                // длинное крыло вдоль улицы
  for (let i = 0; i < 12; i++) for (const y of [4.2, 8.4, 12.2]) box(g, i % 3 === 1 ? glow : win, 0.2, 2.4, 2.6, 3.55, y, -22 + i * 5.2);
  box(g, wh, 15.6, 0.6, 64.6, -4, 15.2, 6);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 17.5, 28), wh);
  drum.position.set(1.5, 8.75, -28); g.add(drum);
  for (const [r, h, y] of [[10.1, 0.7, 17.6], [9.9, 0.5, 12.6], [10, 0.6, 4.4]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), wh); c.position.set(1.5, y, -28); g.add(c); }
  const attic = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 2.2, 28), wh);
  attic.position.set(1.5, 19, -28); g.add(attic);
  for (let i = 0; i < 9; i++) { // пилястры и окна по дуге, обращённой к улице
    const a = -1.25 + i * 0.3125, cx = 1.5 + Math.cos(a) * 9.6, cz = -28 + Math.sin(a) * 9.6;
    const p = box(g, wh, 0.7, 12.6, 0.9, cx, 10.6, cz); p.rotation.y = -a;
    if (i < 8) { const b = a + 0.156, w = box(g, i % 2 ? glow : win, 0.25, 7.6, 1.5, 1.5 + Math.cos(b) * 9.55, 9.2, -28 + Math.sin(b) * 9.55); w.rotation.y = -b; }
  }
  for (const a of [-0.3, 0, 0.3]) { const d = box(g, new THREE.MeshBasicMaterial({ color: 0x1c1410 }), 0.25, 3.2, 1.7, 1.5 + Math.cos(a) * 9.6, 1.9, -28 + Math.sin(a) * 9.6); d.rotation.y = -a; } // три двери
  scene.add(g);
}

// Вечная стройка напротив: синий забор, серый бетонный каркас без стен и башенный кран с красным огнём.
function construction(scene, x, z, chains, addGlow) {
  const o = {};
  chains.north.project(x, z, -1, o);
  const g = new THREE.Group(), conc = L(0x6a6c70), dark = L(0x3a3c40), fence = L(0x2a5aa8), yel = L(0xd9a514);
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(o.dx, o.dz); // +x — к дороге, z — вдоль улицы
  const W = 16, Ln = 52, floors = 5, H = 3.4;
  for (let f = 1; f <= floors; f++) box(g, conc, W, 0.3, Ln, -5, f * H, 0);                         // перекрытия
  for (let i = 0; i <= 6; i++) for (const cx of [-12.6, -5, 2.6]) box(g, dark, 0.5, floors * H, 0.5, cx, floors * H / 2, -Ln / 2 + 0.4 + i * (Ln - 0.8) / 6); // колонны
  box(g, dark, 5, floors * H + 3, 5, -5, (floors * H + 3) / 2, 6);                                   // лестнично-лифтовой узел
  for (let i = 0; i < 4; i++) box(g, L(0x7f4f2a), 2.2, 1.2, 1.2, 0.5, floors * H + 0.75, -18 + i * 9); // поддоны с кирпичом наверху
  box(g, fence, 0.12, 2.2, Ln + 14, 6.4, 1.1, 0);                                                    // забор вдоль тротуара
  for (let i = 0; i <= 11; i++) box(g, L(0x1d4585), 0.16, 2.3, 0.16, 6.42, 1.15, -(Ln + 14) / 2 + i * (Ln + 14) / 11);
  // кран
  const mh = 40;
  box(g, yel, 1.3, mh, 1.3, -15, mh / 2, -14);
  box(g, yel, 34, 1.0, 1.0, -3, mh + 0.6, -14); box(g, yel, 10, 0.9, 0.9, -24, mh + 0.6, -14);
  box(g, dark, 3, 2, 2.4, -27, mh - 0.4, -14);                                                       // противовес
  box(g, yel, 1.6, 2.4, 1.6, -14, mh + 2.2, -14);                                                    // кабина
  box(g, dark, 0.08, 16, 0.08, 6, mh - 8, -14);                                                      // трос с крюком
  scene.add(g);
  if (addGlow) {
    const cs = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y), at = (ax, az) => [x + ax * cs + az * sn, z - ax * sn + az * cs];
    const [tx, tz] = at(-15, -14); addGlow(tx, mh + 3.8, tz, 0xff2a1a, 1.4);                          // красный огонь на макушке
    const [jx, jz] = at(13, -14); addGlow(jx, mh + 1.4, jz, 0xff2a1a, 0.9);
    const [px, pz] = at(4, 10); addGlow(px, 7, pz, 0xfff0c8, 1.6);                                    // прожектор на площадке
  }
}

// Большой фонтан перед аркой с колоколом-памятником: тёмный «колокол» на арках с золотыми фигурами внутри,
// наверху статуя; вокруг — чаша с рядами струй.
function bellFountain(scene, x, z, addSolid, addGlow) {
  const g = new THREE.Group(), marble = L(0x4a4d55), dark = L(0x2a2b30), gold = new THREE.MeshBasicMaterial({ color: 0xd8a41e });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 15, 0.9, 32), marble); rim.position.y = 0.45; g.add(rim);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 13.6, 0.1, 32), new THREE.MeshBasicMaterial({ color: 0x2a7fb8 })); water.position.y = 0.92; g.add(water);
  const step = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 1.5, 20), marble); step.position.y = 1.2; g.add(step);
  // колокол: расширяется книзу, внутри — золото
  const prof = [[4.0, 0], [3.7, 0.5], [2.9, 2.2], [2.4, 4.0], [2.3, 5.2], [2.6, 5.5], [2.6, 6.0], [1.2, 6.4], [0.9, 6.9]].map(([r, y]) => new THREE.Vector2(r, y));
  const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), dark); bell.position.y = 1.9; g.add(bell);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, m = box(g, gold, 0.3, 2.6, 1.3, Math.cos(a) * 3.0, 3.6, Math.sin(a) * 3.0); m.rotation.y = -a; }
  const band = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.14, 6, 20), gold); band.rotation.x = Math.PI / 2; band.position.y = 7.55; g.add(band);
  const fig = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, 3.6, 8), dark); fig.position.y = 10.6; g.add(fig);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), dark); head.position.y = 12.7; g.add(head);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 6), gold); crown.position.y = 13.25; g.add(crown);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, j = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.6 + (i % 2) * 1.6, 6), JET); j.position.set(Math.cos(a) * 9.6, 0.9 + (2.6 + (i % 2) * 1.6) / 2, Math.sin(a) * 9.6); g.add(j); }
  g.position.set(x, 0, z);
  scene.add(g);
  const pts = [];
  for (let i = 0; i < 14; i++) pts.push(x + Math.cos(i / 14 * 6.283) * 15, z + Math.sin(i / 14 * 6.283) * 15);
  addSolid(pts);
  if (addGlow) for (const a of [0.6, 2.7, 4.8]) addGlow(x + Math.cos(a) * 11, 1.6, z + Math.sin(a) * 11, 0x7fd0ff, 0.8);
}

// Здание с буквами «КРАСНОДАР» на крыше и электронными часами (угол Одесской), по фото:
// светящиеся магазины внизу, золотистая ромбовидная решётка в середине, тёмный ребристый верх.
function store(scene, p, target, textPlane) {
  const { g, W, D } = facing(scene, p, target), H0 = 4.2, H1 = 13.5, H2 = 19;
  box(g, new THREE.MeshBasicMaterial({ color: 0xffdca6 }), W, H0, D, 0, H0 / 2, 0);
  for (let i = 0; i <= 8; i++) box(g, L(0x2a2d32), 0.5, H0, D + 0.3, -W / 2 + i * W / 8, H0 / 2, 0);
  box(g, L(0x26292e), W + 0.4, 0.9, D + 0.4, 0, H0 + 0.45, 0);
  // решётка: золотые ромбы на тёмном фоне
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const k = c.getContext('2d');
  k.fillStyle = '#1a1c20'; k.fillRect(0, 0, 128, 128);
  k.fillStyle = '#ffd98a'; k.globalAlpha = 0.5; k.fillRect(24, 40, 80, 48); k.globalAlpha = 1; // свет за решёткой
  k.strokeStyle = '#c9a028'; k.lineWidth = 9;
  k.beginPath(); k.moveTo(0, 0); k.lineTo(128, 128); k.moveTo(128, 0); k.lineTo(0, 128); k.moveTo(64, -64); k.lineTo(192, 64); k.moveTo(-64, 64); k.lineTo(64, 192); k.moveTo(64, -64); k.lineTo(-64, 64); k.moveTo(192, 64); k.lineTo(64, 192); k.stroke();
  k.fillStyle = '#c9a028'; k.fillRect(0, 0, 7, 128); k.fillRect(121, 0, 7, 128);
  const lt = new THREE.CanvasTexture(c);
  lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.colorSpace = THREE.SRGBColorSpace;
  const lat = (rx) => { const t = lt.clone(); t.needsUpdate = true; t.repeat.set(rx, 2); return new THREE.MeshBasicMaterial({ map: t }); };
  const roofM = new THREE.MeshBasicMaterial({ color: 0x14161a });
  const mid = new THREE.Mesh(new THREE.BoxGeometry(W - 1, H1 - H0 - 0.9, D - 1), [lat(D / 5), lat(D / 5), roofM, roofM, lat(W / 5), lat(W / 5)]);
  mid.position.y = (H1 + H0 + 0.9) / 2; g.add(mid);
  // тёмный верх, нависающий над решёткой, с вертикальными рёбрами
  box(g, L(0x4a3f33), W + 2.4, H2 - H1, D + 2.4, 0, (H1 + H2) / 2, 0);
  const n = Math.round(W / 2.2);
  for (let i = 0; i <= n; i++) box(g, L(0x6b5c48), 0.35, H2 - H1 - 1, 0.5, -W / 2 - 1.2 + i * (W + 2.4) / n, (H1 + H2) / 2 + 0.3, D / 2 + 1.35);
  // буквы на крыше — на раме
  const word = textPlane('КРАСНОДАР', Math.min(W * 0.62, 30), 2.8, 'transparent', '#aebfd2', 512);
  word.position.set(0, H2 + 2.3, D / 2 - 1); g.add(word);
  for (const sx of [-1, 1]) box(g, L(0x3a3f47), 0.2, 2.2, 0.2, sx * Math.min(W * 0.3, 14), H2 + 1.1, D / 2 - 1.1);
  // электронные часы: показывают настоящее время
  const cc = document.createElement('canvas');
  cc.width = 128; cc.height = 48;
  const ct = new THREE.CanvasTexture(cc);
  ct.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.95), new THREE.MeshBasicMaterial({ map: ct }));
  clock.position.set(0, H1 - 1.2, D / 2 + 1.3); g.add(clock);
  const draw = () => {
    const d = new Date(), k2 = cc.getContext('2d');
    k2.fillStyle = '#0a0a0c'; k2.fillRect(0, 0, 128, 48);
    k2.fillStyle = '#ff2a1a'; k2.font = '700 34px "Courier New", monospace'; k2.textAlign = 'center'; k2.textBaseline = 'middle';
    k2.fillText(String(d.getHours()).padStart(2, '0') + ' ' + String(d.getMinutes()).padStart(2, '0'), 64, 26);
    ct.needsUpdate = true;
  };
  draw();
  return draw;
}

// Стадион: поле с разметкой, беговая дорожка, трибуны и четыре мачты прожекторов — их видно издалека поверх крыш.
function stadium(scene, x, z, yaw, addGlow) {
  const g = new THREE.Group(), B = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  const flat = (geo, c, y) => { const m = new THREE.Mesh(geo, B(c)); m.rotation.x = -Math.PI / 2; m.position.y = y; g.add(m); return m; };
  const oval = (w, l) => { const s = new THREE.Shape(), r = w / 2, h = l / 2 - r; s.moveTo(-r, -h); s.absarc(0, -h, r, Math.PI, 0, false); s.lineTo(r, h); s.absarc(0, h, r, 0, Math.PI, false); s.closePath(); return s; };
  flat(new THREE.ShapeGeometry(oval(92, 178), 16), 0x3a3d42, 0.04);   // площадка вокруг
  flat(new THREE.ShapeGeometry(oval(84, 170), 16), 0x8a4030, 0.06);   // беговая дорожка
  flat(new THREE.ShapeGeometry(oval(68, 154), 16), 0x245c2c, 0.08);   // газон за воротами
  flat(new THREE.PlaneGeometry(64, 102), 0x2f8a3c, 0.1);              // поле
  const line = (w, l, px, pz) => { const m = flat(new THREE.PlaneGeometry(w, l), 0xe9efe6, 0.12); m.position.x = px; m.position.z = pz; };
  line(64, 0.3, 0, 51); line(64, 0.3, 0, -51); line(0.3, 102, 32, 0); line(0.3, 102, -32, 0); line(64, 0.3, 0, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(8.8, 9.15, 32), B(0xe9efe6)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  for (const sz of [-1, 1]) { line(0.3, 16, 20, sz * 43); line(0.3, 16, -20, sz * 43); line(40, 0.3, 0, sz * 35); }
  // трибуны ступенями: большая со стороны Красной, поменьше напротив
  const stand = L(0x9aa0a8);
  for (let i = 0; i < 6; i++) box(g, stand, 3, 1.4 + i * 1.5, 120, 46 + i * 3, (1.4 + i * 1.5) / 2, 0);
  for (let i = 0; i < 3; i++) box(g, stand, 3, 1.2 + i * 1.4, 96, -46 - i * 3, (1.2 + i * 1.4) / 2, 0);
  box(g, L(0x2a2d32), 20, 0.6, 122, 55, 11.2, 0); // козырёк
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const [lx, lz] of [[52, 78], [-52, 78], [52, -78], [-52, -78]]) { // мачты
    box(g, L(0x3a3f47), 0.9, 34, 0.9, lx, 17, lz);
    box(g, new THREE.MeshBasicMaterial({ color: 0xf4f8ff }), 5, 3.2, 0.6, lx, 35, lz);
    if (addGlow) for (const k of [-1.6, 0, 1.6]) addGlow(x + (lx + k) * c + lz * s, 35, z - (lx + k) * s + lz * c, 0xf2f6ff, 1.6);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
}

const SIGN_NAMES = {
  'Вкусно — и точка': ['ВКУСНО — И ТОЧКА', 1.6, '#0b5e3b'],
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
  const m = textPlane(text, w, h, 'transparent', '#ffe9c4'); // светящиеся буквы без плашки
  void bg;
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

// название поперечной улицы — парящая над дорогой надпись перед перекрёстком, без столбов и табличек
function streetSign(scene, c, name, chain, textPlane) {
  const o = {};
  chain.project(c.x, c.z, -1, o);
  if (o.s < 60) return;
  chain.at(o.s - 22, o);
  const text = shortStreet(name), h = 1.25, w = text.length * h * 0.6 + 0.6;
  const m = textPlane(text, w, h, 'transparent', '#ffffff', 512);
  m.material.side = THREE.FrontSide;      // со встречной стороны надпись не видна задом наперёд
  m.material.opacity = 0.82; m.material.transparent = true; m.material.alphaTest = 0.2; m.material.fog = false;
  m.position.set(o.x, 6.4, o.z);
  m.rotation.y = Math.atan2(-o.dx, -o.dz); // лицом к подъезжающим
  scene.add(m);
}

// длинный прямоугольный фонтан у «Авроры»: чаша вдоль сквера, два ряда струй, подсветка
function pool(scene, x, z, yaw, addSolid, addGlow) {
  const g = new THREE.Group(), W = 15, Ln = 58;
  box(g, STONE, W + 1.2, 0.7, Ln + 1.2, 0, 0.35, 0);
  box(g, new THREE.MeshBasicMaterial({ color: 0x2a7fb8 }), W, 0.1, Ln, 0, 0.72, 0);
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) {
    const j = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2 + (i % 3) * 1.4, 6), JET);
    j.position.set(sx * 3.4, 0.7 + (3.2 + (i % 3) * 1.4) / 2, -Ln / 2 + 5 + i * (Ln - 10) / 8);
    g.add(j);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  const c = Math.cos(yaw), s = Math.sin(yaw), pts = [];
  for (const [lx, lz] of [[-W / 2 - 0.6, -Ln / 2 - 0.6], [W / 2 + 0.6, -Ln / 2 - 0.6], [W / 2 + 0.6, Ln / 2 + 0.6], [-W / 2 - 0.6, Ln / 2 + 0.6]]) pts.push(x + lx * c + lz * s, z - lx * s + lz * c);
  addSolid(pts);
  if (addGlow) for (const lz of [-20, -7, 7, 20]) addGlow(x + lz * s, 1.4, z + lz * c, 0x7fd0ff, 0.8);
}

// цветочные часы: наклонённая к дороге клумба-циферблат с кольцами цветов, метками часов и стрелками
function flowerClock(scene, x, z, chains, addGlow) {
  const o = {};
  chains.south.project(x, z, -1, o);
  const P = chains.south, i = o.i, tx = P.x[i] - x, tz = P.z[i] - z; // в сторону дороги
  const g = new THREE.Group(), face = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(tx, tz);
  face.rotation.x = -(Math.PI / 2 - 0.45); // наклон к зрителю
  face.position.y = 1.5;
  const B = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  const ring = (r0, r1, c, zf) => { const m = new THREE.Mesh(r0 > 0 ? new THREE.RingGeometry(r0, r1, 40) : new THREE.CircleGeometry(r1, 40), B(c)); m.position.z = zf; face.add(m); };
  ring(0, 5.6, 0x2e5a2f, 0); ring(4.5, 5.2, 0xb8283a, 0.02); ring(3.3, 3.9, 0xd9a520, 0.02); ring(1.6, 2.3, 0xc85a9a, 0.02); ring(0, 0.5, 0xe9e2d0, 0.03);
  for (let h = 0; h < 12; h++) { // метки часов
    const a = h / 12 * Math.PI * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(h % 3 ? 0.22 : 0.4, 0.75), B(0xf2efe6));
    m.position.set(Math.sin(a) * 4.85, Math.cos(a) * 4.85, 0.05); m.rotation.z = -a; face.add(m);
  }
  const hand = (len, wdt, a) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(wdt, len), B(0xf6f3ea)); m.position.set(Math.sin(a) * len / 2, Math.cos(a) * len / 2, 0.08); m.rotation.z = -a; face.add(m); };
  hand(3.0, 0.5, -1.05); hand(4.4, 0.36, 1.05); // «десять минут одиннадцатого»
  for (const [len, a] of [[3.0, -1.05], [4.4, 1.05]]) for (const t of [0.25, 0.55, 0.85]) { // красные полосы на стрелках
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.52, len * 0.14), B(0xd3202a)); m.position.set(Math.sin(a) * len * t, Math.cos(a) * len * t, 0.1); m.rotation.z = -a; face.add(m);
  }
  const lip = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.3, 40), B(0xe9e4d8)); lip.position.z = -0.02; face.add(lip); // белый каменный борт
  g.add(face);
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 0.5, 28), STONE);
  mound.position.y = 0.25; g.add(mound);
  scene.add(g);
  if (addGlow) { const l = Math.hypot(tx, tz) || 1; for (const k of [-1, 1]) addGlow(x + tx / l * 6.5 + tz / l * k * 3, 0.8, z + tz / l * 6.5 - tx / l * k * 3, 0xfff0cf, 0.8); }
}

export const CUSTOM_BUILDINGS = { theatre: 'Краснодарский академический театр драмы им. Горького', cinema: 'Кинотеатр «Аврора»', mall: 'Галерея Краснодар', store: 'Универмаг "Краснодар"' };

export function buildLandmarks(scene, data, chains, { textPlane, addSolid, named, shukhov, custom, addGlow }) {
  const lm = data.landmarks || {}, o = {};
  if (lm.arch) {
    chains.north.project(lm.arch[0], lm.arch[1], -1, o);
    arch(scene, lm.arch[0], lm.arch[1], Math.atan2(o.dx, o.dz), addSolid);
  }
  if (lm.avrora) avrora(scene, lm.avrora[0], lm.avrora[1], addSolid);
  let tick = null;
  for (const [x, z, r] of lm.fountains || []) {
    if (lm.bell && Math.hypot(x - lm.bell[0], z - lm.bell[1]) < 26) continue; // их заменяет большой фонтан с колоколом
    if (r > 8 && lm.avrora && Math.hypot(x - lm.avrora[0], z - lm.avrora[1]) < 220) { // у «Авроры» фонтан длинный, прямоугольный
      chains.north.project(x, z, -1, o);
      pool(scene, x, z, Math.atan2(o.dx, o.dz), addSolid, addGlow);
    } else fountain(scene, x, z, r, addSolid);
  }
  if (lm.clock) flowerClock(scene, lm.clock[0], lm.clock[1], chains, addGlow);
  if (lm.bell) bellFountain(scene, lm.bell[0], lm.bell[1], addSolid, addGlow);
  if (lm.kubgtu) rotunda(scene, lm.kubgtu[0], lm.kubgtu[1], chains);
  if (lm.site) construction(scene, lm.site[0], lm.site[1], chains, addGlow);
  if (custom.store) { chains.south.project(custom.store[0], custom.store[1], -1, o); tick = store(scene, custom.store, [chains.south.x[o.i], chains.south.z[o.i]], textPlane); }
  if (lm.stadium) { chains.north.project(lm.stadium[0], lm.stadium[1], -1, o); stadium(scene, lm.stadium[0], lm.stadium[1], Math.atan2(o.dx, o.dz), addGlow); }
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
  for (const c of data.crossings || []) if (!c.ped && !c.link) streetSign(scene, c, c.n, chains[c.k], textPlane); // у переходов и проездов через бульвар названия нет
  return { tick };
}
