// Светофоры. До третьего круга всегда зелёный. Потом на каждом перекрёстке цикл: зелёный → жёлтый → красный;
// на красный поток Красной встаёт у стоп-линии, а поперёк проезжают машины с боковой улицы.
import * as THREE from 'three';
import { VEHICLES, vehicleMesh } from './vehicles.js?v=11';

const CYCLE = 27, GREEN = 15, YELLOW = 3; // секунды: красный — оставшиеся 9
const COLORS = { g: [0.2, 1, 0.45], y: [1, 0.75, 0.1], r: [1, 0.12, 0.08] };

export class Signals {
  constructor(scene, world, glowTex, envMap) {
    this.enabled = false;
    this.time = 0;
    this.barriers = world.barriers;
    // перекрёстки одной улицы на обеих проезжих частях переключаются вместе
    const groups = new Map();
    let seed = 91;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const c of world.crossings) {
      if (!groups.has(c.n)) groups.set(c.n, { name: c.n, items: [], off: rnd() * CYCLE, state: 'g', cars: [] });
      groups.get(c.n).items.push(c);
    }
    this.groups = [...groups.values()];
    this.byChain = { north: [], south: [] };
    for (const g of this.groups) {
      let x = 0, z = 0;
      for (const c of g.items) { x += c.x / g.items.length; z += c.z / g.items.length; this.byChain[c.k].push({ stop: c.s - c.half - 7, g }); }
      g.cx = x; g.cz = z;
      const c0 = g.items[0];
      g.px = c0.dz; g.pz = -c0.dx;   // поперёк Красной
      g.ax = c0.dx; g.az = c0.dz;    // вдоль Красной
    }
    for (const k of ['north', 'south']) this.byChain[k].sort((a, b) => a.stop - b.stop);
    // огни: по одной светящейся точке на светофор
    this.lights = world.crossings.filter((c) => c.light);
    const geo = new THREE.BufferGeometry(), n = this.lights.length;
    const pos = new Float32Array(n * 3);
    this.lights.forEach((c, i) => pos.set(c.light, i * 3));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4.2, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false; pts.renderOrder = 6;
    scene.add(pts);
    this.geo = geo;
    this.groupOf = new Map();
    for (const g of this.groups) for (const c of g.items) this.groupOf.set(c, g);
    // машины поперечного движения: общий запас на все перекрёстки
    this.pool = [];
    const kinds = ['solaris', 'rio', 'polo', 'solaris', 'rio', 'polo', 'lux', 'solaris'];
    kinds.forEach((kind, i) => {
      const V = VEHICLES[kind], mesh = vehicleMesh(kind, V.colors[(i * 3) % 8], envMap);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0cf, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      head.position.set(0, 0.7, V.spec.len / 2); head.scale.setScalar(2.2);
      const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xc01008, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      tail.position.set(0, 0.8, -V.spec.len / 2); tail.scale.setScalar(1.6);
      mesh.add(head, tail);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, hl: V.spec.len / 2 + 0.05, hw: V.spec.wid / 2, busy: false, t: 0, dir: 1, lane: 0, g: null, x: 0, z: 0 });
    });
    this.paint();
  }

  setEnabled(on) {
    this.enabled = on;
    for (const b of this.barriers) b.visible = !on; // боковые улицы открываются: теперь оттуда едут
    if (!on) { for (const g of this.groups) g.state = 'g'; for (const c of this.pool) { c.busy = false; c.mesh.visible = false; } this.paint(); }
  }

  paint() {
    const col = this.geo.attributes.color.array;
    this.lights.forEach((c, i) => col.set(COLORS[this.groupOf.get(c).state], i * 3));
    this.geo.attributes.color.needsUpdate = true;
  }

  // до какой скорости должна сбросить машина потока, чтобы встать у стоп-линии (front — где её передний бампер)
  limit(key, front, v) {
    if (!this.enabled) return Infinity;
    for (const it of this.byChain[key]) {
      const d = it.stop - front;
      if (d < -1.5) continue;
      if (d > 90) break;
      if (it.g.state === 'r' || (it.g.state === 'y' && d > v * 1.1)) return Math.sqrt(2 * 3.4 * Math.max(0, d - 1));
      break;
    }
    return Infinity;
  }

  // ближайшая стоп-линия впереди на этой проезжей части: сколько до неё и какой там свет
  ahead(key, front) {
    for (const it of this.byChain[key]) { const d = it.stop - front; if (d > -2) return { dist: d, state: this.enabled ? it.g.state : 'g' }; }
    return null;
  }

  update(dt, player, pw, events) {
    if (!this.enabled) return;
    this.time += dt;
    let changed = false;
    for (const g of this.groups) {
      const u = (this.time + g.off) % CYCLE, st = u < GREEN ? 'g' : u < GREEN + YELLOW ? 'y' : 'r';
      if (st === g.state) continue;
      g.state = st; changed = true;
      // на жёлтый с боковой улицы уже подкатывают машины — если перекрёсток рядом с игроком
      if (st === 'y' && Math.hypot(g.cx - player.x, g.cz - player.z) < 320) this.launch(g);
      // к красному в первом ряду встают гонщики — если перекрёсток впереди игрока и ещё не слишком близко
      if (st === 'y' && this.traffic) {
        const key = this.traffic.only, pr = this.traffic.proj[key];
        for (const it of this.byChain[key]) if (it.g === g && it.stop - pr.s > 95 && it.stop - pr.s < 330) this.traffic.stageRacers(key, it.stop);
      }
    }
    if (changed) this.paint();
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    for (const c of this.pool) {
      if (!c.busy) continue;
      c.t += 10.5 * dt;
      if (c.t > 75) { c.busy = false; c.mesh.visible = false; continue; }
      const g = c.g, k = c.t * c.dir;
      c.x = g.cx + g.px * k + g.ax * c.lane; c.z = g.cz + g.pz * k + g.az * c.lane;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = Math.atan2(g.px * c.dir, g.pz * c.dir);
      const rx = player.x - c.x, rz = player.z - c.z;
      if (rx * rx + rz * rz < 64 && overlap(rx, rz, fx, fz, pw.hl, pw.hw, g.px * c.dir, g.pz * c.dir, c.hl, c.hw)) { events.crash = { dx: g.px * c.dir, dz: g.pz * c.dir, v: 10.5 }; events.crashRel = Math.hypot(player.vx - g.px * c.dir * 10.5, player.vz - g.pz * c.dir * 10.5); }
    }
  }

  // три машины в каждую сторону; к началу красного они как раз подъезжают к Красной
  launch(g) {
    let i = 0;
    for (const dir of [1, -1]) for (const back of [62, 78, 96]) {
      const c = this.pool.find((q) => !q.busy);
      if (!c || i++ >= 6) return;
      c.busy = true; c.g = g; c.dir = dir; c.t = -back; c.lane = dir * -2.2; // правостороннее движение
      c.mesh.visible = true;
    }
  }
}

function overlap(rx, rz, afx, afz, ahl, ahw, bfx, bfz, bhl, bhw) {
  for (const [nx, nz] of [[afx, afz], [afz, -afx], [bfx, bfz], [bfz, -bfx]]) {
    const ra = ahl * Math.abs(afx * nx + afz * nz) + ahw * Math.abs(afz * nx - afx * nz);
    const rb = bhl * Math.abs(bfx * nx + bfz * nz) + bhw * Math.abs(bfz * nx - bfx * nz);
    if (Math.abs(rx * nx + rz * nz) > ra + rb) return false;
  }
  return true;
}
