// Поток: машины едут по полосам Красной, держат дистанцию и иногда перестраиваются с поворотником.
import * as THREE from 'three';
import { laneOffset, LANE_W } from './chain.js?v=5';
import { CAR_TYPES, makeTrafficMesh } from './carmodel.js?v=5';

const TYPES = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'van'];
const COLORS = [0xf2f2f0, 0xf2f2f0, 0xc4c8cc, 0xc4c8cc, 0x1b1c1f, 0x1b1c1f, 0x6b7077, 0x23395d, 0x8c1c1c, 0xd8cdb4, 0x2f4a3a, 0xe0b23a];
const AHEAD = 520, BEHIND = 180;

const blinkGeo = new THREE.BoxGeometry(0.16, 0.14, 0.16);
const blinkMat = new THREE.MeshBasicMaterial({ color: 0xffa51f });

export class Traffic {
  constructor(scene, chains, counts = { north: 44, south: 24 }) {
    this.chains = chains;
    this.cars = [];
    this.time = 0;
    this.proj = { north: { i: -1 }, south: { i: -1 } };
    this.tmp = {};
    let seed = 12345;
    this.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const key of ['north', 'south']) {
      for (let n = 0; n < counts[key]; n++) {
        const type = TYPES[Math.floor(this.rnd() * TYPES.length)];
        const t = CAR_TYPES[type];
        const mesh = makeTrafficMesh(type, COLORS[Math.floor(this.rnd() * COLORS.length)]);
        const blink = [1, -1].map((side) => {
          const g = new THREE.Group();
          for (const z of [t.len / 2 - 0.08, -t.len / 2 + 0.08]) {
            const b = new THREE.Mesh(blinkGeo, blinkMat);
            b.position.set(side * (t.wid / 2 - 0.06), t.belt - 0.2, z);
            g.add(b);
          }
          g.visible = false;
          mesh.add(g);
          return g;
        });
        mesh.visible = false;
        scene.add(mesh);
        this.cars.push({ key, chain: chains[key], mesh, blink, hl: t.len / 2, hw: t.wid / 2, active: false, s: 0, lane: 0, off: 0, v: 0, want: 0, x: 0, z: 0, dx: 0, dz: 1, prevLong: 0, changeIn: 0, blinkT: 0, blinkSide: 0, nextLane: -1, retry: 0, yieldT: 0, hurry: 0 });
      }
    }
  }

  wantSpeed(lane, lanes) {
    // левая полоса быстрее правой
    const base = 11 + (lanes - 1 - lane) * 1.6;
    return base + this.rnd() * 5;
  }

  laneFree(car, lane, s, back, fwd) {
    for (const o of this.cars) {
      if (o === car || !o.active || o.key !== car.key) continue;
      if (o.lane !== lane && o.nextLane !== lane) continue;
      const d = o.s - s;
      if (d > -back && d < fwd) return false;
    }
    return true;
  }

  place(car, s) {
    const c = car.chain;
    if (s < 8 || s > c.total - 8) return false;
    const lanes = c.lanes[c.segAt(s)];
    const lane = Math.floor(this.rnd() * lanes);
    if (!this.laneFree(car, lane, s, 16, 16)) return false;
    car.s = s; car.lane = lane; car.nextLane = -1;
    car.off = laneOffset(lane, lanes);
    car.want = this.wantSpeed(lane, lanes);
    car.v = car.want;
    car.changeIn = 4 + this.rnd() * 14;
    car.blinkT = 0; car.blinkSide = 0; car.yieldT = 0; car.hurry = 0;
    car.prevLong = NaN;
    car.active = true;
    car.mesh.visible = true;
    return true;
  }

  window(key, player) {
    const c = this.chains[key], p = this.proj[key];
    c.project(player.x, player.z, p.i, p);
    if (p.d > 120) c.project(player.x, player.z, -1, p);
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    p.facing = fx * p.dx + fz * p.dz >= 0 ? 1 : -1;
    p.lo = p.s - (p.facing > 0 ? BEHIND : AHEAD);
    p.hi = p.s + (p.facing > 0 ? AHEAD : BEHIND);
    p.vAlong = player.vx * p.dx + player.vz * p.dz;
    return p;
  }

  // Игрок моргнул фарами: ближайшая машина впереди в его полосе уступает дорогу.
  // Возвращает эту машину или null, если моргать некому.
  flash(player) {
    const speed = Math.hypot(player.vx, player.vz), range = 45 + speed * 1.7;
    let best = null, bestD = Infinity;
    for (const key of ['north', 'south']) {
      const p = this.proj[key];
      if (p.facing < 0 || p.d > p.lanes * LANE_W / 2 + 2) continue; // только попутные и только когда мы на этой дороге
      for (const car of this.cars) {
        if (!car.active || car.key !== key) continue;
        const ds = car.s - p.s;
        if (ds < 3 || ds > range || Math.abs(p.lat - car.off) > 1.9) continue;
        if (ds < bestD) { bestD = ds; best = car; }
      }
    }
    if (best) {
      best.hurry = 7;
      // уже перестраивается сама — просто поторопим, иначе просим уступить
      if (best.blinkSide && best.nextLane >= 0) best.blinkT = Math.min(best.blinkT, 0.2);
      else if (!best.blinkSide) best.yieldT = 7;
    }
    return best;
  }

  reset(player) {
    for (const key of ['north', 'south']) this.proj[key].i = -1;
    for (const car of this.cars) { car.active = false; car.mesh.visible = false; }
    for (const key of ['north', 'south']) {
      const p = this.window(key, player);
      for (const car of this.cars) {
        if (car.key !== key) continue;
        for (let k = 0; k < 8 && !car.active; k++) {
          const s = p.lo + this.rnd() * (p.hi - p.lo);
          if (Math.abs(s - p.s) < 45 && p.d < 30) continue; // не ставим машину вплотную к игроку
          this.place(car, s);
        }
      }
    }
    this.pose();
  }

  update(dt, player, pw, events) {
    this.time += dt;
    const blinkOn = (this.time * 2.6) % 1 < 0.55;
    for (const key of ['north', 'south']) this.window(key, player);

    for (const car of this.cars) {
      const p = this.proj[car.key], c = car.chain;
      if (!car.active) {
        car.retry -= dt;
        if (car.retry <= 0) {
          car.retry = 0.4 + this.rnd() * 0.6;
          // новая машина появляется на дальнем краю окна — туда, откуда она поедет к игроку
          const farAhead = p.facing > 0 ? p.hi - this.rnd() * 60 : p.lo + this.rnd() * 60;
          const farBehind = p.facing > 0 ? p.lo + this.rnd() * 30 : p.hi - this.rnd() * 30;
          const fromAhead = p.facing > 0 ? p.vAlong > 9 : true;
          this.place(car, fromAhead ? farAhead : farBehind) || this.place(car, fromAhead ? farBehind : farAhead);
        }
        continue;
      }
      if (car.s < p.lo || car.s > p.hi || car.s > c.total - 8) { car.active = false; car.mesh.visible = false; car.retry = this.rnd() * 0.5; continue; }

      const lanes = c.lanes[c.segAt(car.s)];
      if (car.lane > lanes - 1) { car.lane = lanes - 1; car.nextLane = -1; car.blinkSide = 0; }

      // держим дистанцию до машины впереди
      if (car.hurry > 0) car.hurry -= dt;
      // машина, которой моргнули и которой мешают перестроиться, прибавляет, чтобы встать перед помехой
      let limit = car.want + (car.yieldT > 0 ? 9 : 0), gapBest = Infinity;
      for (const o of this.cars) {
        if (o === car || !o.active || o.key !== car.key) continue;
        if (o.lane !== car.lane && o.nextLane !== car.lane && o.lane !== car.nextLane) continue;
        const gap = o.s - car.s - o.hl - car.hl;
        if (gap > -2 && gap < gapBest) { gapBest = gap; if (gap < 7 + car.v * 1.1) limit = Math.min(limit, gap < 3 ? 0 : o.v); }
      }
      // игрок тоже препятствие: не таранить его сзади, если он стоит или едет медленнее
      const dsP = (p.s - car.s) * 1, latP = p.lat - car.off;
      if (p.d < 14 && dsP > 0 && dsP - car.hl - 2.3 < 6 + car.v && Math.abs(latP) < 2.1 && p.vAlong < car.v) {
        limit = Math.min(limit, dsP - car.hl - 2.3 < 3 ? 0 : Math.max(0, p.vAlong));
      }
      const dv = limit - car.v;
      car.v += Math.max(-7 * dt, Math.min((car.yieldT > 0 ? 5 : 2.2) * dt, dv));
      if (car.v < 0) car.v = 0;
      car.s += car.v * dt;

      // перестроения
      car.changeIn -= dt;
      if (car.blinkSide) {
        car.blinkT -= dt;
        if (car.blinkT <= 0) {
          if (car.nextLane >= 0 && car.nextLane < lanes) { car.lane = car.nextLane; car.want = this.wantSpeed(car.lane, lanes); }
          car.nextLane = -1;
          if (car.blinkT < -1.6) car.blinkSide = 0;
        }
      } else if (car.yieldT > 0) {
        car.yieldT -= dt;
        // сначала вправо (полоса с большим номером), если занято — влево
        for (const nl of [car.lane + 1, car.lane - 1]) {
          if (nl < 0 || nl > lanes - 1 || !this.laneFree(car, nl, car.s, 9, 12)) continue;
          car.nextLane = nl;
          car.blinkSide = nl < car.lane ? 1 : -1;
          car.blinkT = 0.25;
          car.yieldT = 0;
          car.changeIn = 8 + this.rnd() * 10;
          break;
        }
      } else if (car.changeIn <= 0 && lanes > 1 && car.v > 5) {
        car.changeIn = 7 + this.rnd() * 16;
        const dirL = car.lane === 0 ? 1 : car.lane === lanes - 1 ? -1 : this.rnd() < 0.5 ? -1 : 1;
        const nl = car.lane + dirL;
        const playerThere = p.d < 16 && Math.abs(p.lat - laneOffset(nl, lanes)) < 2.4 && Math.abs(dsP) < 28;
        if (!playerThere && this.laneFree(car, nl, car.s, 14, 24)) {
          car.nextLane = nl;
          car.blinkSide = dirL < 0 ? 1 : -1; // полоса с меньшим номером — левее
          car.blinkT = 1.3;
        }
      }
      const tOff = laneOffset(car.lane, lanes), dOff = tOff - car.off;
      const quick = car.hurry > 0 ? 3.4 : 1.5; // уступая, перестраивается вдвое резче обычного
      car.latV = Math.max(-quick, Math.min(quick, dOff * (car.hurry > 0 ? 3.5 : 2.2)));
      car.off += car.latV * dt;
      car.blink[0].visible = car.blinkSide > 0 && blinkOn;
      car.blink[1].visible = car.blinkSide < 0 && blinkOn;
    }

    this.pose();

    // столкновения и «впритирку»
    const pfx = Math.sin(player.yaw), pfz = Math.cos(player.yaw);
    const speed = Math.hypot(player.vx, player.vz);
    for (const car of this.cars) {
      if (!car.active) continue;
      const rx = player.x - car.x, rz = player.z - car.z;
      if (rx * rx + rz * rz > 100) { car.prevLong = NaN; continue; }
      const long = rx * car.dx + rz * car.dz, lat = rx * car.dz - rz * car.dx;
      if (obbOverlap(rx, rz, pfx, pfz, pw.hl, pw.hw, car.dx, car.dz, car.hl, car.hw)) {
        events.crash = car;
        events.crashRel = Math.hypot(player.vx - car.dx * car.v, player.vz - car.dz * car.v);
      } else if (!Number.isNaN(car.prevLong) && (car.prevLong < 0) !== (long < 0)) {
        const gap = Math.abs(lat) - pw.hw - car.hw;
        const rel = Math.abs(player.vx * car.dx + player.vz * car.dz - car.v);
        if (gap < 1.25 && speed > 14 && rel > 4) events.near.push({ gap, oncoming: player.vx * car.dx + player.vz * car.dz < 0, speed });
      }
      car.prevLong = long;
    }
  }

  pose() {
    const o = this.tmp;
    for (const car of this.cars) {
      if (!car.active) continue;
      car.chain.at(car.s, o);
      car.dx = o.dx; car.dz = o.dz;
      car.x = o.x + o.dz * car.off;
      car.z = o.z - o.dx * car.off;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = Math.atan2(o.dx, o.dz) + (car.latV || 0) / Math.max(6, car.v) * 0.9;
    }
  }
}

// пересечение двух прямоугольников (разделяющие оси). r — вектор от B к A; у каждого направление «вперёд» и полуразмеры
function obbOverlap(rx, rz, afx, afz, ahl, ahw, bfx, bfz, bhl, bhw) {
  const axes = [[afx, afz], [afz, -afx], [bfx, bfz], [bfz, -bfx]];
  for (const [nx, nz] of axes) {
    const ra = ahl * Math.abs(afx * nx + afz * nz) + ahw * Math.abs(afz * nx - afx * nz);
    const rb = bhl * Math.abs(bfx * nx + bfz * nz) + bhw * Math.abs(bfz * nx - bfx * nz);
    if (Math.abs(rx * nx + rz * nz) > ra + rb) return false;
  }
  return true;
}
