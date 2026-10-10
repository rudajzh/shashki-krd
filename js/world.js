// Строит город из data/*.json: дороги, разметка, дома, деревья + проверка столкновений со зданиями.
import * as THREE from 'three';
import { Chain, LANE_W } from './chain.js';

const ROAD_W = { primary: 10.5, secondary: 9, tertiary: 7.5, residential: 6.5, unclassified: 6, living_street: 5, service: 3.6, pedestrian: 5 };
const WALLS = [0xe8dcc0, 0xf0e2b6, 0xe6c9a8, 0xd9d4c8, 0xcfd6dc, 0xe9b89a, 0xc9b79c, 0xf2ead8, 0xb9c4b4, 0xd8a48a];
const GLASS = [0x8fb0c8, 0x9cc0d4, 0x7f9db4];

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
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let d1x = p[i * 2] - p[a * 2], d1z = p[i * 2 + 1] - p[a * 2 + 1];
    let d2x = p[b * 2] - p[i * 2], d2z = p[b * 2 + 1] - p[i * 2 + 1];
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-6) { d1x = d2x; d1z = d2z; } else { d1x /= l1; d1z /= l1; }
    if (l2 < 1e-6) { d2x = d1x; d2z = d1z; } else { d2x /= l2; d2z /= l2; }
    const l1b = Math.hypot(d1x, d1z) || 1;
    d1x /= l1b; d1z /= l1b;
    let nx = d1z + d2z, nz = -(d1x + d2x);
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-6) { nx = d1z; nz = -d1x; } else { nx /= nl; nz /= nl; }
    const k = 1 / Math.max(0.5, nx * d1z + nz * -d1x);
    out[i * 2] = nx * k; out[i * 2 + 1] = nz * k;
  }
  return out;
}

function ribbon(m, p, halfAt, y, col, off = 0) {
  const nr = miters(p), n = p.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const h0 = halfAt(i), h1 = halfAt(i + 1);
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
    const n0x = nr[i * 2], n0z = nr[i * 2 + 1], n1x = nr[i * 2 + 2], n1z = nr[i * 2 + 3];
    m.flatQuad(
      [ax + n0x * (off + h0), az + n0z * (off + h0)], [bx + n1x * (off + h1), bz + n1z * (off + h1)],
      [bx + n1x * (off - h1), bz + n1z * (off - h1)], [ax + n0x * (off - h0), az + n0z * (off - h0)], y, col);
  }
}

function offsetLine(p, off) {
  const nr = miters(p), out = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) { out[i] = p[i] + nr[i] * off; out[i + 1] = p[i + 1] + nr[i + 1] * off; }
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

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 118, 128, 10); // межэтажный пояс
  g.fillStyle = '#cfcfcf'; g.fillRect(26, 22, 76, 78);
  const grd = g.createLinearGradient(0, 26, 0, 96);
  grd.addColorStop(0, '#56708a'); grd.addColorStop(1, '#2c3a4a');
  g.fillStyle = grd; g.fillRect(30, 26, 68, 70);
  g.fillStyle = '#cfcfcf'; g.fillRect(62, 26, 4, 70); g.fillRect(30, 50, 68, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textPlane(text, w, h, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(c.height * 0.62)}px system-ui, -apple-system, Arial, sans-serif`;
  g.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
}

function gate(scene, x, z, dx, dz, width, text, bg) {
  const g = new THREE.Group();
  const post = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5), post);
    p.position.set(s * (width / 2 + 0.6), 3.75, 0);
    g.add(p);
  }
  const banner = textPlane(text, width + 1.2, 1.8, bg, '#ffffff');
  banner.position.y = 6.6;
  banner.rotation.y = Math.PI;
  g.add(banner);
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(dx, dz);
  scene.add(g);
}

export function buildWorld(data, scene) {
  const chains = { north: new Chain(data.chains.north.pts, data.chains.north.lanes), south: new Chain(data.chains.south.pts, data.chains.south.lanes) };
  const C = (h) => new THREE.Color(h);
  const asphalt = C(0x3b3e44), asphaltMain = C(0x34373d), paving = C(0xb5ab99), white = C(0xe9e9e4);

  const flat = (geo, order, offset) => {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset * 4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  // земля
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: 0x9c9d96 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // зелень
  const gm = new Mesher(), green = C(0x6f9a55);
  for (const p of data.greens) {
    const contour = [];
    for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      gm.tri(contour[t[0]].x, 0.02, contour[t[0]].y, contour[t[1]].x, 0.02, contour[t[1]].y, contour[t[2]].x, 0.02, contour[t[2]].y, green);
    }
  }
  flat(gm.geometry(), 1, 1);

  // дороги
  const rm = new Mesher(), mm = new Mesher();
  const probe = { north: { i: -1 }, south: { i: -1 } };
  const onMain = (x, z) => {
    for (const key of ['north', 'south']) {
      const c = chains[key], o = probe[key];
      c.project(x, z, o.i, o);
      if (o.d > 60) c.project(x, z, -1, o);
      if (o.d < o.lanes * LANE_W / 2 + 1.5) return true;
    }
    return false;
  };
  for (const r of data.roads) {
    const w = r.l > 0 ? r.l * 3.4 + 0.6 : (ROAD_W[r.c] || 6);
    const col = r.c === 'pedestrian' ? paving : asphalt;
    ribbon(rm, r.p, () => w / 2, 0.04, col);
    disc(rm, r.p[0], r.p[1], w / 2, 0.04, col);
    disc(rm, r.p.at(-2), r.p.at(-1), w / 2, 0.04, col);
    if (r.c === 'pedestrian' || r.c === 'service') continue;
    if (r.o && r.l >= 2) {
      for (let j = 1; j < r.l; j++) dashed(mm, offsetLine(r.p, (j - r.l / 2) * 3.4), 0.07, 0.07, white, 3, 6, onMain);
    } else if (!r.o && w >= 7) {
      dashed(mm, r.p, 0.07, 0.07, white, 4, 0, onMain);
    }
  }
  // Красная: две проезжие части со своей разметкой
  for (const key of ['north', 'south']) {
    const src = data.chains[key], p = src.pts, L = src.lanes;
    const lanesAt = (i) => (L[Math.max(0, i - 1)] + L[Math.min(L.length - 1, i)]) / 2;
    ribbon(rm, p, (i) => lanesAt(i) * LANE_W / 2 + 0.5, 0.05, asphaltMain);
    // участки с одинаковым числом полос
    let from = 0;
    for (let i = 1; i <= L.length; i++) {
      if (i < L.length && L[i] === L[from]) continue;
      const part = p.slice(from * 2, (i + 1) * 2), k = L[from];
      for (let j = 1; j < k; j++) dashed(mm, offsetLine(part, (j - k / 2) * LANE_W), 0.075, 0.08, white, 3, 6);
      dashed(mm, offsetLine(part, k / 2 * LANE_W), 0.075, 0.08, white, 1e6, 0);
      dashed(mm, offsetLine(part, -k / 2 * LANE_W), 0.075, 0.08, white, 1e6, 0);
      from = i;
    }
  }
  flat(rm.geometry(), 2, 2);
  flat(mm.geometry(), 3, 3);

  // дома
  const wm = new Mesher(), roofM = new Mesher();
  const cell = 40, grid = new Map(), polys = [];
  const addToGrid = (k, idx) => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(idx); };
  const col = new THREE.Color(), roofCol = new THREE.Color();
  for (const b of data.buildings) {
    let p = b.p;
    const n = p.length / 2;
    if (n < 3) continue;
    let area = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    if (area > 0) { // обходим так, чтобы наружная нормаль стены была (−dz, dx)
      const q = [];
      for (let i = n - 1; i >= 0; i--) q.push(p[i * 2], p[i * 2 + 1]);
      p = q;
    }
    const h = b.h, tall = h > 34;
    col.setHex(tall ? GLASS[b.s % GLASS.length] : WALLS[b.s % WALLS.length]);
    const shade = 0.9 + ((b.s * 7) % 20) / 100;
    col.multiplyScalar(shade);
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
      wm.uv.push(u, 0, u + wins, 0, u + wins, fl, u, 0, u + wins, fl, u, fl);
      for (let k = 0; k < 6; k++) wm.nrm.push(nx, 0, nz);
      u += wins;
    }
    roofCol.copy(col).multiplyScalar(0.55).lerp(C(0x6d6f73), 0.5);
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      roofM.tri(contour[t[0]].x, h, contour[t[0]].y, contour[t[1]].x, h, contour[t[1]].y, contour[t[2]].x, h, contour[t[2]].y, roofCol);
    }
    // сетка для столкновений
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, p[i * 2]); x1 = Math.max(x1, p[i * 2]); z0 = Math.min(z0, p[i * 2 + 1]); z1 = Math.max(z1, p[i * 2 + 1]); }
    const idx = polys.push({ p: Float32Array.from(p), x0, x1, z0, z1 }) - 1;
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
      for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) addToGrid(gx + ',' + gz, idx);
  }
  const walls = new THREE.Mesh(wm.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture() }));
  walls.frustumCulled = false;
  scene.add(walls);
  const roofs = new THREE.Mesh(roofM.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  roofs.frustumCulled = false;
  scene.add(roofs);

  // деревья: из карты + ряд по бульвару между проезжими частями
  const treePos = [];
  for (let i = 0; i < data.trees.length; i += 2) treePos.push([data.trees[i], data.trees[i + 1]]);
  const N = chains.north, S = chains.south, tmp = {};
  let hint = -1, seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N.n; i += 2) {
    S.project(N.x[i], N.z[i], hint, tmp);
    if (hint < 0 || tmp.d > 80) S.project(N.x[i], N.z[i], -1, tmp);
    hint = tmp.i;
    const wN = N.lanes[Math.min(i, N.lanes.length - 1)] * LANE_W / 2, wS = tmp.lanes * LANE_W / 2;
    const free = tmp.d - wN - wS;
    if (free < 7 || tmp.d > 70) continue;
    const ax = N.x[i], az = N.z[i];
    const o = {};
    S.at(tmp.s, o);
    const rows = free > 16 ? [0.3, 0.7] : [0.5];
    for (const r of rows) {
      const fromN = wN + 2 + (free - 4) * r, t = fromN / tmp.d;
      treePos.push([ax + (o.x - ax) * t + (rnd() - 0.5) * 1.5, az + (o.z - az) * t + (rnd() - 0.5) * 1.5]);
    }
  }
  const trunkG = new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6);
  trunkG.translate(0, 1.3, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5a4636 }), treePos.length);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), treePos.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), tc = new THREE.Color();
  const treeGrid = new Map();
  treePos.forEach(([x, z], i) => {
    const s = 0.8 + rnd() * 0.6;
    mtx.compose(ps.set(x, 0, z), q.identity(), sc.set(s, s, s));
    trunks.setMatrixAt(i, mtx);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
    mtx.compose(ps.set(x, 2.6 * s + 1.4 * s, z), q, sc.set(2.1 * s, 2.3 * s, 2.1 * s));
    crowns.setMatrixAt(i, mtx);
    crowns.setColorAt(i, tc.setHSL(0.27 + rnd() * 0.06, 0.42, 0.3 + rnd() * 0.1));
    const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
    let a = treeGrid.get(k); if (!a) treeGrid.set(k, a = []); a.push(x, z);
  });
  trunks.frustumCulled = crowns.frustumCulled = false;
  scene.add(trunks, crowns);

  // фонари по правому краю каждой проезжей части: мелькают мимо и дают ощущение скорости
  const lampAt = [];
  for (const c of [N, S]) {
    for (let i = 2; i < c.n - 1; i += 5) {
      const len = c.cum[i + 1] - c.cum[i] || 1;
      const dx = (c.x[i + 1] - c.x[i]) / len, dz = (c.z[i + 1] - c.z[i]) / len;
      const off = c.lanes[Math.min(i, c.lanes.length - 1)] * LANE_W / 2 + 1.4;
      lampAt.push([c.x[i] - dz * off, c.z[i] + dx * off, Math.atan2(dx, dz)]);
    }
  }
  const poleG = new THREE.CylinderGeometry(0.07, 0.1, 8, 6);
  poleG.translate(0, 4, 0);
  const armG = new THREE.BoxGeometry(2.2, 0.09, 0.12);
  armG.translate(1.0, 7.95, 0);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const poles = new THREE.InstancedMesh(poleG, lampMat, lampAt.length);
  const arms = new THREE.InstancedMesh(armG, lampMat, lampAt.length);
  const up = new THREE.Vector3(0, 1, 0);
  lampAt.forEach(([x, z, yaw], i) => {
    mtx.compose(ps.set(x, 0, z), q.setFromAxisAngle(up, yaw), sc.set(1, 1, 1));
    poles.setMatrixAt(i, mtx);
    arms.setMatrixAt(i, mtx);
  });
  poles.frustumCulled = arms.frustumCulled = false;
  scene.add(poles, arms);

  // старт у театра драмы и финиш у «Авроры» — на северной проезжей части
  const a = {}, bb = {}, o = {};
  N.project(data.marks.theatre[0], data.marks.theatre[1], -1, a);
  N.project(data.marks.avrora[0], data.marks.avrora[1], -1, bb);
  const startS = a.s, finishS = Math.min(bb.s, N.total - 30);
  N.at(startS + 14, o);
  gate(scene, o.x, o.z, o.dx, o.dz, o.lanes * LANE_W, 'СТАРТ · ТЕАТР ДРАМЫ', '#1f6feb');
  N.at(finishS, o);
  gate(scene, o.x, o.z, o.dx, o.dz, o.lanes * LANE_W, 'ФИНИШ · АВРОРА', '#d1242f');

  // столкновения: точка внутри здания / рядом со стволом
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

  return { chains, startS, finishS, hitsSolid, stats: { buildings: polys.length, trees: treePos.length } };
}
