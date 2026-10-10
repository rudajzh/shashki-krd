// Низкополигональные машины из примитивов: профиль кузова выдавливается на ширину.
import * as THREE from 'three';

export const CAR_TYPES = {
  sedan: { len: 4.6, wid: 1.82, floor: 0.28, belt: 0.92, roof: 1.42, hood: 0.95, roofF: 0.3, roofR: -0.95, tail: -1.6, wheel: 0.33, axle: 1.38 },
  hatch: { len: 4.1, wid: 1.76, floor: 0.28, belt: 0.94, roof: 1.46, hood: 0.85, roofF: 0.25, roofR: -1.4, tail: -1.9, wheel: 0.32, axle: 1.25 },
  suv: { len: 4.75, wid: 1.94, floor: 0.38, belt: 1.1, roof: 1.74, hood: 0.95, roofF: 0.45, roofR: -1.95, tail: -2.25, wheel: 0.39, axle: 1.42 },
  van: { len: 5.5, wid: 2.05, floor: 0.4, belt: 1.2, roof: 2.4, hood: 2.0, roofF: 1.55, roofR: -2.7, tail: -2.72, wheel: 0.36, axle: 1.75 },
  sport: { len: 4.55, wid: 1.9, floor: 0.22, belt: 0.8, roof: 1.24, hood: 0.75, roofF: 0.05, roofR: -0.85, tail: -1.75, wheel: 0.35, axle: 1.36 },
};

const GLASS = new THREE.Color(0x151a22), TYRE = new THREE.Color(0x101113), RIM = new THREE.Color(0x9aa0a8);
const HEAD = new THREE.Color(0xf4f1dc), TAIL = new THREE.Color(0xc21a1a), SHADOW = new THREE.Color(0x1c1d20), TRIM = new THREE.Color(0x17181b);

function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.g.attributes.position.count;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.g.attributes.position.array, o * 3);
    nrm.set(p.g.attributes.normal.array, o * 3);
    for (let i = 0; i < p.g.attributes.position.count; i++) { col[(o + i) * 3] = p.c.r; col[(o + i) * 3 + 1] = p.c.g; col[(o + i) * 3 + 2] = p.c.b; }
    o += p.g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const part = (geo, c, x = 0, y = 0, z = 0) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(x, y, z);
  return { g, c };
};

// профиль в осях (вперёд, вверх) → тело шириной wid, вытянутое вдоль z
function extrude(points, wid) {
  const sh = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: wid, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(wid / 2, 0, 0);
  return g;
}

function wheelGeometry(r) {
  const tyre = new THREE.CylinderGeometry(r, r, 0.25, 14);
  tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.27, 10);
  rim.rotateZ(Math.PI / 2);
  return merge([part(tyre, TYRE), part(rim, RIM)]);
}

function bodyParts(t, color, withWheels) {
  const hl = t.len / 2, c = new THREE.Color(color);
  const body = extrude([
    [-hl, t.floor + 0.16], [-hl + 0.12, t.floor], [hl - 0.16, t.floor], [hl, t.floor + 0.2],
    [hl, t.belt - 0.24], [hl - 0.3, t.belt - 0.07], [t.hood, t.belt], [t.tail, t.belt], [-hl, t.belt - 0.06],
  ], t.wid);
  const cabW = t.wid - 0.26;
  const cabin = extrude([[t.hood, t.belt], [t.roofF, t.roof], [t.roofR, t.roof], [t.tail, t.belt]], cabW);
  const roofLen = t.roofF - t.roofR;
  const parts = [
    part(body, c),
    part(cabin, GLASS),
    part(new THREE.BoxGeometry(cabW + 0.02, 0.06, roofLen + 0.08), c, 0, t.roof, (t.roofF + t.roofR) / 2),
    // стойки, чтобы кабина не выглядела стеклянным колпаком
    part(new THREE.BoxGeometry(cabW + 0.03, t.roof - t.belt, 0.09), c, 0, (t.roof + t.belt) / 2, (t.roofF + t.roofR) / 2 - roofLen * 0.08),
    part(new THREE.BoxGeometry(0.46, 0.13, 0.08), HEAD, t.wid / 2 - 0.36, t.belt - 0.2, hl - 0.03),
    part(new THREE.BoxGeometry(0.46, 0.13, 0.08), HEAD, -t.wid / 2 + 0.36, t.belt - 0.2, hl - 0.03),
    part(new THREE.BoxGeometry(t.wid - 0.5, 0.2, 0.06), TRIM, 0, t.floor + 0.22, hl),
    part(new THREE.BoxGeometry(t.wid - 0.1, 0.12, 0.06), TAIL, 0, t.belt - 0.2, -hl + 0.01),
  ];
  if (withWheels) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = wheelGeometry(t.wheel);
      parts.push({ g: w.translate(sx * (t.wid / 2 - 0.1), t.wheel, sz * t.axle), c: null });
    }
    const sh = new THREE.PlaneGeometry(t.wid + 0.5, t.len + 0.5);
    sh.rotateX(-Math.PI / 2);
    parts.push(part(sh, SHADOW, 0, 0.11, 0));
  }
  return parts;
}

// колёса уже со своими цветами — вклеиваем как есть
function mergeMixed(parts) {
  const baked = parts.map((p) => {
    if (p.c) return merge([p]);
    return p.g;
  });
  let total = 0;
  for (const g of baked) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const g of baked) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

const carMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const cache = new Map();

export function trafficGeometry(type, color) {
  const k = type + color;
  if (!cache.has(k)) cache.set(k, mergeMixed(bodyParts(CAR_TYPES[type], color, true)));
  return cache.get(k);
}

export function makeTrafficMesh(type, color) {
  const m = new THREE.Mesh(trafficGeometry(type, color), carMaterial);
  m.frustumCulled = false;
  return m;
}

export function makePlayerCar(color, glowTex, poolTex) {
  const t = CAR_TYPES.sport;
  const root = new THREE.Group(), chassis = new THREE.Group();
  root.add(chassis);
  const body = new THREE.Mesh(mergeMixed(bodyParts(t, color, false)), carMaterial);
  chassis.add(body);

  // спойлер и стоп-сигналы — отдельными деталями
  const wing = new THREE.Mesh(mergeMixed([
    part(new THREE.BoxGeometry(t.wid - 0.2, 0.05, 0.34), TRIM, 0, t.belt + 0.26, -t.len / 2 + 0.3),
    part(new THREE.BoxGeometry(0.06, 0.26, 0.2), TRIM, t.wid / 2 - 0.4, t.belt + 0.12, -t.len / 2 + 0.3),
    part(new THREE.BoxGeometry(0.06, 0.26, 0.2), TRIM, -t.wid / 2 + 0.4, t.belt + 0.12, -t.len / 2 + 0.3),
  ]), carMaterial);
  chassis.add(wing);
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x6a0d0d });
  const brake = new THREE.Mesh(new THREE.BoxGeometry(t.wid - 0.08, 0.13, 0.05), brakeMat);
  brake.position.set(0, t.belt - 0.2, -t.len / 2 - 0.01);
  chassis.add(brake);

  const wg = wheelGeometry(t.wheel);
  const wheels = [];
  for (const sz of [1, -1]) for (const sx of [1, -1]) { // перед-лево, перед-право, зад-лево, зад-право
    const pivot = new THREE.Group();
    pivot.position.set(sx * (t.wid / 2 - 0.1), t.wheel, sz * t.axle);
    const w = new THREE.Mesh(wg, carMaterial);
    pivot.add(w);
    root.add(pivot);
    wheels.push({ pivot, mesh: w, front: sz > 0 });
  }

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(t.wid + 0.5, t.len + 0.5), new THREE.MeshBasicMaterial({ color: 0x1c1d20 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.11;
  root.add(shadow);

  // свет фар на асфальте: мягкое вытянутое пятно перед машиной; при моргании вспыхивает ярче
  const beamGeo = new THREE.PlaneGeometry(1, 1);
  beamGeo.rotateX(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xfff0cf, transparent: true, opacity: 0.45, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.scale.set(13, 1, 46);
  beam.position.set(0, 0.12, t.len / 2 + 17);
  beam.renderOrder = 5;
  root.add(beam);

  // задние огни светятся точками, как у машин потока
  const tailMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xd01208, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const tails = [-1, 1].map((sx) => {
    const sp = new THREE.Sprite(tailMat);
    sp.position.set(sx * (t.wid / 2 - 0.32), t.belt - 0.2, -t.len / 2 - 0.05);
    sp.scale.setScalar(1.2);
    sp.renderOrder = 7;
    root.add(sp);
    return sp;
  });

  return {
    root, chassis, wheels, type: t,
    setColor(c) { body.geometry.dispose(); body.geometry = mergeMixed(bodyParts(t, c, false)); },
    setBrake(on) { brakeMat.color.setHex(on ? 0xff2a2a : 0x8a1010); tailMat.color.setHex(on ? 0xff2412 : 0xd01208); for (const sp of tails) sp.scale.setScalar(on ? 2.2 : 1.2); },
    setFlash(k) { beamMat.opacity = 0.45 + k * 0.5; beam.scale.set(13 + k * 5, 1, 46 + k * 30); }, // ближний горит всегда, моргание — вспышка дальнего
  };
}
