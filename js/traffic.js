// Поток: машины едут по полосам Красной, держат дистанцию и иногда перестраиваются с поворотником.
// Ночью машину видно по огням: фары, стоп-сигналы и крупные оранжевые поворотники — это светящиеся точки.
import * as THREE from 'three';
import { laneOffset, halfWidth } from './chain.js?v=12';
import { VEHICLES, vehicleMesh, pickKind } from './vehicles.js?v=12';

const AHEAD = 520, BEHIND = 180;
const OFF = [0, 0, 0], HEAD = [1.0, 0.93, 0.78], TAIL = [0.75, 0.04, 0.03], STOP = [1.0, 0.1, 0.06], BLINK = [1.0, 0.55, 0.05];

export class Traffic {
  constructor(scene, chains, glowTex, poolTex, envMap, counts = { north: 62, south: 0 }) {
    this.chains = chains;
    this.cars = [];
    this.time = 0;
    this.density = 1; // доля машин, которым разрешено выезжать: растёт с каждым кругом
    this.only = 'north'; // поток едет только там, где едет игрок: встречную сторону почти не видно, незачем её считать
    this.proj = { north: { i: -1 }, south: { i: -1 } };
    this.tmp = {};
    let seed = 12345;
    this.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const key of ['north', 'south']) {
      for (let n = 0; n < counts[key]; n++) {
        const kind = pickKind(this.rnd), V = VEHICLES[kind], t = V.spec;
        const mesh = vehicleMesh(kind, V.colors[Math.floor(this.rnd() * V.colors.length)], envMap);
        mesh.visible = false;
        scene.add(mesh);
        this.cars.push({ key, chain: chains[key], mesh, kind, behave: V.behave || '', slow: V.slow || 1, rank: this.rnd(), hl: t.len / 2 + (t.bulge ?? 0.05), hw: t.wid / 2, ly: t.belt, active: false, s: 0, lane: 0, off: 0, v: 0, want: 0, x: 0, z: 0, dx: 0, dz: 1, prevLong: 0, changeIn: 0, blinkT: 0, blinkSide: 0, nextLane: -1, retry: 0, yieldT: 0, hurry: 0, braking: 0, latV: 0, honkT: 0 });
      }
    }
    // «гонщики»: ждут красный в первом ряду у стоп-линии, на зелёный срываются и уходят шашками
    for (const color of [0xd92b2b, 0xf0b400, 0x1f5fd0]) {
      const t = VEHICLES.lux.spec, mesh = vehicleMesh('lux', color, envMap);
      mesh.visible = false;
      scene.add(mesh);
      this.cars.push({ key: 'north', chain: chains.north, mesh, kind: 'lux', racer: true, behave: 'racer', slow: 1, rank: 9, hl: t.len / 2 + 0.05, hw: t.wid / 2, ly: t.belt, active: false, s: 0, lane: 0, off: 0, v: 0, want: 44, x: 0, z: 0, dx: 0, dz: 1, prevLong: 0, changeIn: 0, blinkT: 0, blinkSide: 0, nextLane: -1, retry: 0, yieldT: 0, hurry: 0, braking: 0, latV: 0, honkT: 0 });
    }
    // сломанные машины с аварийкой: стоят в правом ряду, поток их объезжает
    const tri = new THREE.Shape();
    tri.moveTo(-0.3, 0); tri.lineTo(0.3, 0); tri.lineTo(0, 0.5); tri.closePath();
    const triGeo = new THREE.ShapeGeometry(tri), triMat = new THREE.MeshBasicMaterial({ color: 0xff3a1a, side: THREE.DoubleSide });
    for (const key of ['north', 'south']) for (let k = 0; k < 3; k++) {
      const kind = ['solaris', 'rio', 'polo'][k], V = VEHICLES[kind], t = V.spec;
      const mesh = vehicleMesh(kind, V.colors[Math.floor(this.rnd() * 6)], envMap);
      const sign = new THREE.Mesh(triGeo, triMat); // знак аварийной остановки позади
      sign.position.set(0, 0.05, -t.len / 2 - 9);
      mesh.add(sign);
      mesh.visible = false;
      scene.add(mesh);
      this.cars.push({ key, chain: chains[key], mesh, kind, stalled: true, behave: 'stalled', slow: 0, rank: 0, hl: t.len / 2 + 0.05, hw: t.wid / 2, ly: t.belt, active: false, s: 0, lane: 0, off: 0, v: 0, want: 0, x: 0, z: 0, dx: 0, dz: 1, prevLong: 0, changeIn: 0, blinkT: 0, blinkSide: 0, nextLane: -1, retry: 0, yieldT: 0, hurry: 0, braking: 0, latV: 0, honkT: 0 });
    }
    // огни: по 4 точки на машину (фары и стопы) и ещё 4 под поворотники
    const n = this.cars.length;
    const points = (size) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
      p.frustumCulled = false;
      p.renderOrder = 7;
      scene.add(p);
      return g;
    };
    this.lights = points(1.9);
    this.blinks = points(4.2);
    // пятно света от фар на асфальте перед каждой машиной
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: poolTex, color: 0xfff0cf, transparent: true, opacity: 0.32, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -20 }), n);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 5;
    scene.add(this.pools);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }

  // У каждого ряда своя скорость: левый самый быстрый, каждый следующий вправо — на ~13 км/ч медленнее.
  // Ряды постоянно смещаются друг относительно друга, поэтому «стенка» из машин долго не держится.
  // Внутри ряда разброс маленький, чтобы машины не сбивались в хвост за самой медленной.
  wantSpeed(lane, lanes) {
    const fromRight = lanes - 1 - lane; // 0 — крайний правый ряд
    return 12.2 + fromRight * 3.6 + (this.rnd() - 0.5) * 1.0;
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
    c.at(s, this.tmp);
    const lanes = this.tmp.lanes, lane = car.behave === 'bus' ? lanes - 1 : Math.floor(this.rnd() * lanes); // автобус — только в правом ряду
    if (!this.laneFree(car, lane, s, 12 + car.hl * 2, 12 + car.hl * 2)) return false;
    car.s = s; car.lane = lane; car.nextLane = -1;
    car.off = laneOffset(lane, this.tmp.lf);
    car.want = this.wantSpeed(lane, lanes) * car.slow;
    car.v = car.want;
    car.changeIn = 4 + this.rnd() * 14;
    car.blinkT = 0; car.blinkSide = 0; car.yieldT = 0; car.hurry = 0; car.braking = 0; car.latV = 0;
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
    // во время разворота держим поток там, куда игрок сейчас выедет, а не там, где он проецируется на ось
    if (this.held && this.held.key === key) { p.facing = 1; p.lo = this.held.s0; p.hi = this.held.s1; }
    return p;
  }

  // Игрок моргнул фарами: ближайшая машина впереди в его полосе уступает дорогу.
  // Возвращает эту машину или null, если моргать некому.
  flash(player) {
    const speed = Math.hypot(player.vx, player.vz), range = 45 + speed * 1.7;
    let best = null, bestD = Infinity;
    for (const key of ['north', 'south']) {
      const p = this.proj[key];
      if (p.facing < 0 || p.d > halfWidth(p.lf) + 1.5) continue; // только попутные и только когда мы на этой дороге
      for (const car of this.cars) {
        if (!car.active || car.key !== key || car.stalled) continue;
        const ds = car.s - p.s;
        if (ds < 3 || ds > range || Math.abs(p.lat - car.off) > 1.9) continue;
        if (ds < bestD) { bestD = ds; best = car; }
      }
    }
    if (best) {
      this.askToYield(best);
      // «по цепочке»: машина прямо перед ней тоже уходит, иначе уступившей некуда ускоряться
      let next = null, gap = 28;
      for (const car of this.cars) {
        if (car === best || !car.active || car.key !== best.key || car.lane !== best.lane) continue;
        const d = car.s - best.s;
        if (d > 0 && d < gap) { gap = d; next = car; }
      }
      if (next) this.askToYield(next);
    }
    return best;
  }

  askToYield(car) {
    if (car.behave === 'bus') return; // автобус никуда не денется — его надо объезжать
    car.hurry = 7;
    // уже перестраивается сама — просто поторопим, иначе просим уступить
    if (car.blinkSide && car.nextLane >= 0) car.blinkT = Math.min(car.blinkT, 0.2);
    else if (!car.blinkSide) car.yieldT = 7;
  }

  // Перед разворотом: закрепить окно потока на полосе, куда выедет игрок, и сразу расставить там машины,
  // чтобы после разворота не ехать полминуты по пустой дороге.
  hold(key, s0, s1, from) {
    this.held = { key, s0, s1 };
    this.only = key;
    for (const car of this.cars) {
      if (!car.stalled && !car.racer && !car.active && car.key !== key) { car.key = key; car.chain = this.chains[key]; } // свободные машины переходят на новую сторону
      if (car.key !== key || car.active || car.stalled || car.racer || car.rank > this.density) continue;
      for (let k = 0; k < 6 && !car.active; k++) this.place(car, from + this.rnd() * (s1 - 40 - from));
    }
  }
  release() { this.held = null; }

  // Поставить гонщиков в первый ряд у стоп-линии (stop — где она вдоль оси). Обычные машины с этих мест убираем.
  stageRacers(key, stop, skipLane = -1) {
    const c = this.chains[key], placed = [];
    c.at(stop - 4, this.tmp);
    const lanes = this.tmp.lanes, lf = this.tmp.lf;
    // сначала ряды рядом с пропущенным (рядом с игроком), остальные — как повезёт
    const free = [...Array(lanes).keys()].filter((l) => l !== skipLane).sort((a, b) => skipLane < 0 ? this.rnd() - 0.5 : Math.abs(a - skipLane) - Math.abs(b - skipLane));
    const taken = new Set(this.cars.filter((q) => q.racer && q.active && q.key === key && Math.abs(q.s - stop) < 12).map((q) => q.lane));
    for (const car of this.cars) {
      if (!car.racer) continue;
      if (car.active) { if (car.key === key && Math.abs(car.s - stop) < 12) placed.push(car); continue; }
      const lane = free.find((l) => !taken.has(l));
      if (lane === undefined || placed.length >= (lanes > 2 ? 2 : 1)) break;
      taken.add(lane);
      car.key = key; car.chain = c; car.s = stop - car.hl - 0.8; car.lane = lane; car.nextLane = -1;
      car.off = laneOffset(lane, lf); car.v = 0; car.want = 40 + this.rnd() * 6; car.blinkSide = 0; car.latV = 0; car.prevLong = NaN;
      car.active = true; car.mesh.visible = true;
      placed.push(car);
      for (const o of this.cars) if (o !== car && o.active && !o.stalled && o.key === key && o.lane === lane && Math.abs(o.s - car.s) < 16) { o.active = false; o.mesh.visible = false; o.retry = 1; }
    }
    return placed;
  }

  // поставить сломанные машины на проезжей части key в точках list (метры вдоль оси); лишние убрать
  setStalled(key, list) {
    let k = 0;
    for (const car of this.cars) {
      if (!car.stalled || car.key !== key) continue;
      const s = list[k++];
      if (s === undefined) { car.active = false; car.mesh.visible = false; continue; }
      car.chain.at(s, this.tmp);
      car.s = s; car.lane = this.tmp.lanes - 1; car.off = laneOffset(car.lane, this.tmp.lf) - 0.5;
      car.v = 0; car.active = true; car.mesh.visible = true; car.prevLong = NaN;
      for (const o of this.cars) if (!o.stalled && o.active && o.key === key && o.lane === car.lane && Math.abs(o.s - s) < 30) { o.active = false; o.mesh.visible = false; }
    }
  }

  // убрать машины вокруг точки (во время разворота поток не должен въехать в игрока)
  clearNear(x, z, r) {
    for (const car of this.cars) {
      if (!car.active || car.stalled || Math.hypot(car.x - x, car.z - z) > r + car.hl) continue;
      car.active = false; car.mesh.visible = false; car.retry = 1.5 + this.rnd();
    }
  }

  reset(player) {
    this.held = null;
    this.only = 'north';
    for (const car of this.cars) if (!car.stalled && !car.racer) { car.key = 'north'; car.chain = this.chains.north; }
    for (const key of ['north', 'south']) this.proj[key].i = -1;
    for (const car of this.cars) { car.active = false; car.mesh.visible = false; }
    for (const key of ['north', 'south']) {
      const p = this.window(key, player);
      for (const car of this.cars) {
        if (car.key !== key || car.stalled || car.racer) continue;
        for (let k = 0; k < 8 && !car.active && car.rank <= this.density; k++) {
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
    this.blinkOn = (this.time * 2.4) % 1 < 0.55;
    for (const key of ['north', 'south']) this.window(key, player);
    const o = this.tmp;

    for (const car of this.cars) {
      if (car.stalled) continue; // стоит на месте, только мигает
      if (!car.active && car.racer) continue; // гонщиков ставит светофор
      if (!car.active && car.key !== this.only) { car.key = this.only; car.chain = this.chains[this.only]; }
      const p = this.proj[car.key], c = car.chain;
      if (!car.active) {
        car.retry -= dt;
        if (car.retry <= 0 && car.rank <= this.density) {
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

      c.at(car.s, o);
      const lanes = o.lanes, lf = o.lf;
      if (car.lane > lanes - 1) { car.lane = lanes - 1; car.nextLane = -1; car.blinkSide = 0; }
      if (car.hurry > 0) car.hurry -= dt;

      // держим дистанцию до машины впереди; та, которой моргнули и которой мешают, прибавляет, чтобы встать перед помехой
      let limit = car.want + (car.yieldT > 0 ? 9 : 0), gapBest = Infinity, boxed = false, stuck = false;
      for (const t of this.cars) {
        if (t === car || !t.active || t.key !== car.key) continue;
        if (t.lane !== car.lane && t.nextLane !== car.lane && t.lane !== car.nextLane) continue;
        const gap = t.s - car.s - t.hl - car.hl;
        if (gap > -2 && gap < gapBest) { gapBest = gap; if (gap < 7 + car.v * 1.1) { limit = Math.min(limit, gap < 3 ? 0 : t.v); boxed = true; } if (t.stalled && gap < 45) stuck = true; }
      }
      // просили уступить, а впереди занято и ускориться нельзя — сбрасываем скорость, чтобы пропустить соседей и уйти за них
      if (car.yieldT > 0 && boxed) limit = Math.min(limit, car.want - 4.5);
      // впереди сломанная машина — объезжаем её слева, как на моргание
      if (stuck && !car.blinkSide && car.yieldT <= 0) { car.yieldT = 4; car.hurry = 4; }
      // красный или жёлтый — тормозим к стоп-линии
      if (this.signals) limit = Math.min(limit, this.signals.limit(car.key, car.s + car.hl, car.v));
      // игрок тоже препятствие: не таранить его сзади, если он стоит или едет медленнее
      const dsP = p.s - car.s, latP = p.lat - car.off;
      if (car.honkT > 0) car.honkT -= dt;
      if (p.d < 14 && dsP > 0 && dsP - car.hl - 2.3 < 6 + car.v && Math.abs(latP) < 2.1 && p.vAlong < car.v) {
        limit = Math.min(limit, dsP - car.hl - 2.3 < 3 ? 0 : Math.max(0, p.vAlong));
        // подрезали: игрок влез вплотную и едет медленнее — водитель тормозит и сигналит
        if (dsP - car.hl - 2.5 < 3 + car.v * 0.35 && car.v - p.vAlong > 2.5 && !(car.honkT > 0)) { car.honkT = 3.5; events.honk = true; }
      }
      // игрок в той полосе рядом или быстро догоняет сзади — туда перестраиваться нельзя, даже если он моргал
      const playerIn = (nl) => p.d < 16 && Math.abs(p.lat - laneOffset(nl, lf)) < 2.3 && dsP < car.hl + 16 && dsP > -(car.hl + 10 + Math.max(0, p.vAlong - car.v) * 1.8);
      const dv = limit - car.v;
      car.braking = dv < -1.5 ? 0.3 : Math.max(0, car.braking - dt);
      car.v += Math.max(-7 * dt, Math.min((car.racer ? 6.2 : car.yieldT > 0 ? 5 : 2.2) * dt, dv));
      if (car.v < 0) car.v = 0;
      car.s += car.v * dt;

      // перестроения
      car.changeIn -= dt;
      if (car.blinkSide) {
        car.blinkT -= dt;
        if (car.blinkT <= 0) {
          if (car.nextLane >= 0 && playerIn(car.nextLane)) { car.nextLane = -1; car.blinkSide = 0; car.changeIn = 2; } // передумал: там игрок
          else if (car.nextLane >= 0 && car.nextLane < lanes) { car.lane = car.nextLane; if (!car.racer) car.want = this.wantSpeed(car.lane, lanes) * car.slow; }
          car.nextLane = -1;
          if (car.blinkT < -1.6) car.blinkSide = 0;
        }
      } else if (car.racer) {
        // упёрся в поток — ныряет в соседний ряд, где свободнее
        if (boxed && car.v > 6) {
          let best = -1, bestGap = gapBest + 14;
          for (const nl of [car.lane - 1, car.lane + 1]) {
            if (nl < 0 || nl > lanes - 1 || playerIn(nl) || !this.laneFree(car, nl, car.s, 7, 9)) continue;
            let g = 200;
            for (const t of this.cars) if (t !== car && t.active && t.key === car.key && t.lane === nl) { const d = t.s - car.s - t.hl - car.hl; if (d > 0 && d < g) g = d; }
            if (g > bestGap) { bestGap = g; best = nl; }
          }
          if (best >= 0) { car.nextLane = best; car.blinkSide = best < car.lane ? 1 : -1; car.blinkT = 0.12; car.hurry = 2; }
        }
      } else if (car.behave === 'bus' && !stuck) {
        if (car.lane < lanes - 1 && this.laneFree(car, car.lane + 1, car.s, 14, 20)) { car.nextLane = car.lane + 1; car.blinkSide = -1; car.blinkT = 1.2; } // возвращается в правый ряд
      } else if (car.yieldT > 0) {
        car.yieldT -= dt;
        // сначала вправо (полоса с большим номером), если занято — влево
        for (const nl of stuck ? [car.lane - 1] : [car.lane + 1, car.lane - 1]) {
          if (nl < 0 || nl > lanes - 1 || playerIn(nl) || !this.laneFree(car, nl, car.s, 9, 12)) continue;
          car.nextLane = nl;
          car.blinkSide = nl < car.lane ? 1 : -1;
          car.blinkT = 0.25;
          car.yieldT = 0;
          car.changeIn = 8 + this.rnd() * 10;
          break;
        }
      } else if (car.changeIn <= 0 && lanes > 1 && car.v > 5) {
        car.changeIn = car.behave === 'pushy' ? 3 + this.rnd() * 6 : 7 + this.rnd() * 16; // маршрутки мечутся между рядами
        const dirL = car.lane === 0 ? 1 : car.lane === lanes - 1 ? -1 : this.rnd() < 0.5 ? -1 : 1;
        const nl = car.lane + dirL;
        if (!playerIn(nl) && !(p.d < 16 && Math.abs(p.lat - laneOffset(nl, lf)) < 2.4 && Math.abs(dsP) < 28) && this.laneFree(car, nl, car.s, 14, 24)) {
          car.nextLane = nl;
          car.blinkSide = dirL < 0 ? 1 : -1; // полоса с меньшим номером — левее
          car.blinkT = 1.5;
        }
      }
      const dOff = laneOffset(car.lane, lf) - car.off;
      const long = car.hl > 3; // автобус и маршрутка: медленно и плавно, чтобы не задевать соседние ряды
      const quick = long ? 0.75 : car.hurry > 0 ? 3.4 : 1.5; // уступая, легковая перестраивается вдвое резче обычного
      car.latV = Math.max(-quick, Math.min(quick, dOff * (long ? 1.1 : car.hurry > 0 ? 3.5 : 2.2)));
      car.off += car.latV * dt;
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
    const o = this.tmp, lp = this.lights.attributes.position.array, lc = this.lights.attributes.color.array;
    const bp = this.blinks.attributes.position.array, bc = this.blinks.attributes.color.array;
    const set = (arr, i, x, y, z) => { arr[i] = x; arr[i + 1] = y; arr[i + 2] = z; };
    this.cars.forEach((car, n) => {
      const b = n * 12;
      if (!car.active) {
        lc.fill(0, b, b + 12); bc.fill(0, b, b + 12);
        this.m4.makeScale(0, 0, 0); this.pools.setMatrixAt(n, this.m4);
        return;
      }
      car.chain.at(car.s, o);
      const yaw = Math.atan2(o.dx, o.dz) + car.latV / Math.max(6, car.v) * (car.hl > 3 ? 0.3 : 0.9);
      const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = fz, lz = -fx;
      car.dx = fx; car.dz = fz;
      car.x = o.x + o.dz * car.off;
      car.z = o.z - o.dx * car.off;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = yaw;
      const w = car.hw - 0.3, y = car.ly;
      // 0,1 — фары; 2,3 — стопы
      [[w, car.hl], [-w, car.hl], [w, -car.hl], [-w, -car.hl]].forEach(([a, f], k) => {
        set(lp, b + k * 3, car.x + lx * a + fx * f, y, car.z + lz * a + fz * f);
        const c = k < 2 ? (car.stalled ? OFF : HEAD) : car.braking > 0 ? STOP : TAIL;
        set(lc, b + k * 3, c[0], c[1], c[2]);
      });
      // поворотники: два слева, два справа — горит только нужная сторона
      const on = car.blinkSide !== 0 && this.blinkOn;
      [[1, car.hl], [1, -car.hl], [-1, car.hl], [-1, -car.hl]].forEach(([sgn, f], k) => {
        set(bp, b + k * 3, car.x + lx * sgn * (car.hw + 0.05) + fx * f, y + 0.05, car.z + lz * sgn * (car.hw + 0.05) + fz * f);
        const lit = car.stalled ? this.blinkOn : on && sgn === car.blinkSide;
        set(bc, b + k * 3, lit ? BLINK[0] : 0, lit ? BLINK[1] : 0, lit ? BLINK[2] : 0);
      });
      if (car.stalled) this.m4.makeScale(0, 0, 0);
      else this.m4.compose(this.v3.set(car.x + fx * (car.hl + 6), 0.11, car.z + fz * (car.hl + 6)), this.q.setFromAxisAngle(this.up, yaw), this.s3.set(6.5, 1, 15));
      this.pools.setMatrixAt(n, this.m4);
    });
    this.lights.attributes.position.needsUpdate = this.lights.attributes.color.needsUpdate = true;
    this.blinks.attributes.position.needsUpdate = this.blinks.attributes.color.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
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
