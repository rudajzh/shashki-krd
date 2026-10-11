// Поток: машины едут по полосам Красной, держат дистанцию и иногда перестраиваются с поворотником.
// Ночью машину видно по огням: фары, стоп-сигналы и крупные оранжевые поворотники — это светящиеся точки.
import * as THREE from 'three';
import { rowOffset, rowAt, halfWidth } from './chain.js?v=21';
import { VEHICLES, vehicleMesh, pickKind } from './vehicles.js?v=21';

const AHEAD = 520, BEHIND = 180;
const LANES_FULL = 4.8; // при стольких рядах на дорогу выходит весь поток
const NONE = [];
const RACER_REACT = 0.25; // через сколько секунд после зелёного срывается гонщик
const NUDGE = 2.7; // поправка скорости от «режиссёра», м/с: меньше разницы между рядами, чтобы не получалось езды вровень
const OFF = [0, 0, 0], HEAD = [1.0, 0.93, 0.78], TAIL = [0.75, 0.04, 0.03], STOP = [1.0, 0.1, 0.06], BLINK = [1.0, 0.55, 0.05];

export class Traffic {
  constructor(scene, chains, glowTex, poolTex, envMap, counts = { north: 62, south: 0 }) {
    this.chains = chains; this.scene = scene; this.envMap = envMap;
    this.racerTop = 50; // до какой скорости разгоняются гонщики, м/с
    this.cars = [];
    this.time = 0;
    this.density = 1; // доля машин, которым разрешено выезжать: растёт с каждым кругом
    this.eff = 1;     // она же с поправкой на число рядов там, где сейчас игрок
    this.only = 'north'; // поток едет только там, где едет игрок: встречную сторону почти не видно, незачем её считать
    this.proj = { north: { i: -1 }, south: { i: -1 } };
    this.tmp = {}; this.tmp2 = {};
    let seed = 12345;
    this.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.gates = [];   // «шлагбаумы» {key, s}: машины выше по потоку притормаживают перед этой точкой и пропускают игрока, который сейчас выедет на дорогу
    this.clearRows = []; // участки перед разворотами {key, s0, s1, side}: там крайний левый (side 1) или правый (−1) ряд держим свободным
    this.ghost = { active: true, isPlayer: true, on: false, key: 'north', s: 0, off: 0, v: 0, hl: 2.5, hw: 0.95, latV: 0, lane: 0, nextLane: -1 };
    this.dirT = 0;
    // head — дистанция до передней машины в секундах, react — задержка перед троганием, acc — разгон: у каждого водителя свои
    const blank = () => ({ active: false, s: 0, lane: 0, off: 0, v: 0, want: 0, x: 0, z: 0, dx: 0, dz: 1, prevLong: 0, changeIn: 0, blinkT: 0, blinkSide: 0, nextLane: -1, retry: 0, yieldT: 0, hurry: 0, braking: 0, latV: 0, honkT: 0,
      nudge: 0, nudgeT: 0, nudgeAge: 0, nudgeCd: 0, nudgeHard: false, scare: 0, scareV: 0, hold: 0, wait: 0, seen: null, turn: null, tStar: Infinity, evadeSlow: false, head: 1.3 + this.rnd() * 0.9, react: 0.25 + this.rnd() * 0.7, acc: 1.9 + this.rnd() * 1.0 });
    for (const key of ['north', 'south']) {
      for (let n = 0; n < counts[key]; n++) {
        const kind = pickKind(this.rnd), V = VEHICLES[kind], t = V.spec;
        const mesh = vehicleMesh(kind, V.colors[Math.floor(this.rnd() * V.colors.length)], envMap);
        mesh.visible = false;
        scene.add(mesh);
        this.cars.push({ key, chain: chains[key], mesh, kind, behave: V.behave || '', slow: V.slow || 1, rank: this.rnd(), hl: t.len / 2 + (t.bulge ?? 0.05), hw: t.wid / 2, ly: t.belt, ...blank() });
      }
    }
    // «гонщики»: ждут красный в первом ряду у стоп-линии, на зелёный срываются и уходят шашками
    for (const [kind, color] of [['coupe', 0xd92b2b], ['lux', 0xf0b400], ['coupe', 0x1f5fd0]]) {
      const t = VEHICLES[kind].spec, mesh = vehicleMesh(kind, color, envMap);
      mesh.visible = false;
      scene.add(mesh);
      this.cars.push({ key: 'north', chain: chains.north, mesh, kind, racer: true, behave: 'racer', slow: 1, rank: 9, hl: t.len / 2 + 0.05, hw: t.wid / 2, ly: t.belt, ...blank(), want: 44, head: 0.3, react: 0, acc: 6.2 });
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
      this.cars.push({ key, chain: chains[key], mesh, kind, stalled: true, behave: 'stalled', slow: 0, rank: 0, hl: t.len / 2 + 0.05, hw: t.wid / 2, ly: t.belt, ...blank() });
    }
    this.stalledCars = this.cars.filter((q) => q.stalled);
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

  // У каждого ряда своя скорость: правый — около 40 км/ч, каждый следующий влево — на ~10 км/ч быстрее.
  // Поток заметно медленнее игрока: мимо машины он проходит за секунду и не висит у неё на хвосте.
  // Ряды постоянно смещаются друг относительно друга, поэтому «стенка» из машин долго не держится.
  // Внутри ряда разброс маленький, чтобы машины не сбивались в хвост за самой медленной.
  wantSpeed(lane, hi) {
    const fromRight = hi - lane; // 0 — крайний правый ряд
    return 11.5 + fromRight * 2.7 + (this.rnd() - 0.5) * 1.0;
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

  // Можно ли встать в ряд nl: смотрим не только место, но и скорости — перед быстрой машиной сзади не втискиваемся,
  // в хвост медленной впереди не влетаем. tight — манёвр срочный, запас меньше.
  canMerge(car, nl, tight) {
    const base = tight ? 2.5 : 4;
    for (const o of this.cars) {
      if (o === car || !o.active || o.key !== car.key || (o.lane !== nl && o.nextLane !== nl)) continue;
      const d = o.s - car.s, len = o.hl + car.hl;
      if (d >= 0 ? d - len < base + Math.max(0, car.v - o.v) * 1.2 : -d - len < base + Math.max(0, o.v - car.v) * (tight ? 1.5 : 2.2)) return false;
    }
    return true;
  }

  place(car, s) {
    const c = car.chain;
    if (s < 8 || s > c.total - 8) return false;
    c.at(s, this.tmp);
    const lo = this.tmp.lo, hi = this.tmp.hi, lane = car.behave === 'bus' ? hi : lo + Math.floor(this.rnd() * (hi - lo + 1)); // автобус — только в правом ряду
    if (!this.laneFree(car, lane, s, 12 + car.hl * 2, 12 + car.hl * 2)) return false;
    // тот, кто перестраивается, числится уже в новом ряду, а сам ещё в старом — смотрим и по месту на дороге
    const off = rowOffset(lane, this.tmp);
    for (const o of this.cars) if (o !== car && o.active && o.key === car.key && Math.abs(o.off - off) < 2.8 && Math.abs(o.s - s) < 12 + car.hl * 2) return false;
    c.at(s + 200, this.tmp2);
    if (lane > this.tmp2.hi || lane < this.tmp2.lo) return false; // ряд скоро кончится — незачем в нём появляться
    if (hi > lo) for (const z of this.clearRows) if (z.key === car.key && s > z.s0 - 200 && s < z.s1 && lane === (z.side > 0 ? lo : hi)) return false; // этот ряд перед разворотом свободен
    for (const t of this.stalledCars) if (t.active && t.key === car.key && t.lane === lane && t.s > s && t.s - s < 260) return false; // не в ряд, где впереди сломанная
    car.s = s; car.lane = lane; car.nextLane = -1;
    car.off = off;
    car.want = this.wantSpeed(lane, hi) * car.slow;
    car.v = car.want;
    // впереди в ряду кто-то медленный или стоит — появляемся уже с безопасной скоростью
    for (const o of this.cars) {
      if (o === car || !o.active || o.key !== car.key || o.lane !== lane || o.s <= s) continue;
      const gap = o.s - s - o.hl - car.hl;
      if (gap < 90) car.v = Math.min(car.v, Math.sqrt(o.v * o.v + 2 * 3 * Math.max(0, gap - 6)));
    }
    car.changeIn = 4 + this.rnd() * 14;
    car.blinkT = 0; car.blinkSide = 0; car.yieldT = 0; car.hurry = 0; car.braking = 0; car.latV = 0;
    car.nudge = 0; car.nudgeT = 0; car.nudgeAge = 0; car.nudgeCd = 0; car.scare = 0; car.wait = 0; car.tStar = Infinity; car.evadeSlow = false; car.seen = null; car.turn = null;
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
    // w0…w1 — окно вдоль оси, в котором живёт поток (lo и hi в этом же объекте — диапазон рядов)
    p.w0 = p.s - (p.facing > 0 ? BEHIND : AHEAD);
    p.w1 = p.s + (p.facing > 0 ? AHEAD : BEHIND);
    p.vAlong = player.vx * p.dx + player.vz * p.dz;
    // во время разворота держим поток там, куда игрок сейчас выедет, а не там, где он проецируется на ось
    if (this.held && this.held.key === key) { p.facing = 1; p.w0 = this.held.s0; p.w1 = this.held.s1; }
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
      this.chains[key].at(from + 60, this.tmp);
      if (car.key !== key || car.active || car.entering || car.stalled || car.racer || car.rank > this.density * Math.min(1, this.tmp.lanes / LANES_FULL)) continue;
      for (let k = 0; k < 6 && !car.active; k++) this.place(car, from + this.rnd() * (s1 - 40 - from));
    }
  }
  release() { this.held = null; }

  // Соперники подбираются под машину игрока: kinds — на чём они ездят, top — их потолок скорости
  setRacers(kinds, top) {
    const colors = [0xd92b2b, 0xf0b400, 0x1f5fd0];
    let i = 0;
    for (const car of this.cars) {
      if (!car.racer) continue;
      const kind = kinds[i % kinds.length], t = VEHICLES[kind].spec;
      if (car.kind !== kind) {
        const vis = car.mesh.visible;
        this.scene.remove(car.mesh);
        car.mesh = vehicleMesh(kind, colors[i % 3], this.envMap);
        car.mesh.visible = vis;
        this.scene.add(car.mesh);
        car.kind = kind; car.hl = t.len / 2 + 0.05; car.hw = t.wid / 2; car.ly = t.belt;
      }
      i++;
    }
    this.racerTop = top;
  }

  // Поставить гонщиков в первый ряд у стоп-линии (stop — где она вдоль оси). Обычные машины с этих мест убираем.
  stageRacers(key, stop, skipLane = -1, banLane = -1) {
    const c = this.chains[key], placed = [];
    c.at(stop - 4, this.tmp);
    const lanes = this.tmp.lanes, at = { lf: this.tmp.lf, ls: this.tmp.ls }, lo = this.tmp.lo;
    // сначала ряды рядом с пропущенным (рядом с игроком), остальные — как повезёт
    const free = [...Array(lanes).keys()].map((l) => l + lo).filter((l) => l !== skipLane && l !== banLane).sort((a, b) => skipLane < 0 ? this.rnd() - 0.5 : Math.abs(a - skipLane) - Math.abs(b - skipLane));
    const taken = new Set(this.cars.filter((q) => q.racer && q.active && q.key === key && Math.abs(q.s - stop) < 12).map((q) => q.lane));
    for (const car of this.cars) {
      if (!car.racer) continue;
      if (car.active) { if (car.key === key && Math.abs(car.s - stop) < 12) placed.push(car); continue; }
      const lane = free.find((l) => !taken.has(l));
      if (lane === undefined || placed.length >= (lanes > 2 ? 2 : 1)) break;
      taken.add(lane);
      car.key = key; car.chain = c; car.s = stop - car.hl - 0.8; car.lane = lane; car.nextLane = -1;
      car.off = rowOffset(lane, at); car.v = 0; car.want = this.racerTop * (0.93 + this.rnd() * 0.1); car.blinkSide = 0; car.latV = 0; car.prevLong = NaN; car.wait = 0; car.hold = 0; car.scare = 0;
      car.active = true; car.mesh.visible = true;
      placed.push(car);
      for (const o of this.cars) if (o !== car && o.active && !o.stalled && o.key === key && (o.lane === lane || Math.abs(o.off - car.off) < 2.7) && Math.abs(o.s - car.s) < 16) { o.active = false; o.mesh.visible = false; o.retry = 1; }
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
      car.s = s; car.lane = this.tmp.hi; car.off = rowOffset(car.lane, this.tmp) - 0.5;
      car.v = 0; car.active = true; car.mesh.visible = true; car.prevLong = NaN;
      for (const o of this.cars) if (!o.stalled && o.active && o.key === key && o.lane === car.lane && Math.abs(o.s - s) < 30) { o.active = false; o.mesh.visible = false; }
    }
  }

  // Машина выезжает с боковой улицы и встраивается в поток. c — перекрёсток (точка на оси и направление),
  // side: −1 — приезжает справа и поворачивает направо в правый ряд, +1 — слева (из проезда через бульвар
  // или с той стороны улицы) и поворачивает налево в левый ряд. run — сколько метров ей ещё ехать до поворота.
  enter(key, c, side, run) {
    const car = this.cars.find((q) => !q.active && !q.entering && !q.stalled && !q.racer && q.hl < 3);
    if (!car) return null;
    const ch = this.chains[key], o = this.tmp;
    ch.at(c.s + 8, o);
    const sg = -side, R = side < 0 ? 6.5 : 10.5, lane = side < 0 ? o.hi : o.lo, latEnd = rowOffset(lane, o);
    car.key = key; car.chain = ch; car.entering = true; car.active = false;
    car.entry = { c, sg, R, wa: latEnd - sg * R, u0: 2.2 * sg, run, d: 0, lane, latEnd, sEnd: c.s + 2.2 * sg + R };
    car.v = 9; car.blinkSide = side < 0 ? -1 : 1; car.braking = 0; car.latV = 0; car.prevLong = NaN; car.scare = 0;
    car.mesh.visible = true;
    this.advanceEntry(car, 0);
    return car;
  }

  // Машина потока сворачивает с Красной: из правого ряда направо, из левого — налево (в проезд через бульвар).
  // Дуга, потом прямая по боковой улице; через 70 м она пропадает из виду и возвращается в запас.
  startExit(car, t, here) {
    const R = t.side < 0 ? 6.5 : 10;
    car.entry = { exit: true, c: t.c, q: t.side, R, lat: car.off, u0: car.s - t.c.s, d: 0 };
    car.active = false; car.entering = true; car.turn = null;
    car.blinkSide = t.side < 0 ? -1 : 1; car.latV = 0; car.prevLong = NaN;
    this.advanceEntry(car, 0);
  }
  advanceExit(car, dt) {
    const e = car.entry, arc = e.R * Math.PI / 2, c = e.c;
    const want = e.d < arc ? 5.5 : 10;
    car.v += Math.max(-6 * dt, Math.min(2.5 * dt, want - car.v));
    e.d += car.v * dt;
    let w, u, hw, hu;
    if (e.d < arc) { const th = e.d / e.R; w = e.lat + e.q * e.R * (1 - Math.cos(th)); u = e.u0 + e.R * Math.sin(th); hw = e.q * Math.sin(th); hu = Math.cos(th); }
    else { w = e.lat + e.q * (e.R + e.d - arc); u = e.u0 + e.R; hw = e.q; hu = 0; }
    car.x = c.x + c.dz * w + c.dx * u; car.z = c.z - c.dx * w + c.dz * u;
    car.dx = c.dz * hw + c.dx * hu; car.dz = -c.dx * hw + c.dz * hu;
    car.braking = 0;
    if (e.d > arc + 70) { car.entering = false; car.entry = null; car.mesh.visible = false; car.blinkSide = 0; car.retry = 1 + this.rnd() * 2; }
  }

  // едет по боковой улице, поворачивает по дуге и становится обычной машиной потока
  advanceEntry(car, dt) {
    if (car.entry.exit) return this.advanceExit(car, dt);
    const e = car.entry, arc = e.R * Math.PI / 2;
    // перед поворотом притормаживает; если в ряду кто-то едет — пропускает
    let want = e.d > e.run - 14 ? 5.5 : 9;
    if (e.d > e.run - 3 && e.d < e.run + 1 && !this.laneFree(car, e.lane, e.sEnd, 12, 9)) want = 0;
    car.v += Math.max(-9 * dt, Math.min(3 * dt, want - car.v));
    if (car.v < 0) car.v = 0;
    e.d += car.v * dt;
    let w, u, hw, hu;
    if (e.d < e.run) { w = e.wa - e.sg * (e.run - e.d); u = e.u0; hw = e.sg; hu = 0; }
    else { const th = Math.min(Math.PI / 2, (e.d - e.run) / e.R); w = e.wa + e.sg * e.R * Math.sin(th); u = e.u0 + e.R * (1 - Math.cos(th)); hw = e.sg * Math.cos(th); hu = Math.sin(th); }
    const c = e.c;
    car.x = c.x + c.dz * w + c.dx * u; car.z = c.z - c.dx * w + c.dz * u;
    car.dx = c.dz * hw + c.dx * hu; car.dz = -c.dx * hw + c.dz * hu;
    car.braking = want < car.v - 0.5 ? 0.3 : 0;
    if (e.d >= e.run + arc) { // доехала: дальше она — обычная машина в своём ряду
      this.chains[car.key].at(e.sEnd, this.tmp);
      car.entering = false; car.active = true; car.entry = null;
      car.s = e.sEnd; car.lane = e.lane; car.nextLane = -1; car.off = e.latEnd;
      car.want = this.wantSpeed(e.lane, this.tmp.hi) * car.slow;
      car.changeIn = 6 + this.rnd() * 8; car.blinkT = -1; car.yieldT = 0; car.hurry = 0; car.wait = 0;
      car.nudge = 0; car.nudgeT = 0; car.nudgeAge = 0; car.nudgeCd = 0; car.tStar = Infinity; car.evadeSlow = false; car.seen = null; car.turn = null;
    }
  }

  // убрать машины вокруг точки (во время разворота поток не должен въехать в игрока)
  clearNear(x, z, r) {
    for (const car of this.cars) {
      if (!car.active || car.stalled || Math.hypot(car.x - x, car.z - z) > r + car.hl) continue;
      car.active = false; car.mesh.visible = false; car.retry = 1.5 + this.rnd();
    }
  }

  // skip — участок {key, s0, s1}, где машин ставить не надо (туда сейчас выедет игрок)
  reset(player, skip = null) {
    this.held = null; this.gates = [];
    this.only = 'north';
    for (const car of this.cars) if (!car.stalled && !car.racer) { car.key = 'north'; car.chain = this.chains.north; }
    for (const key of ['north', 'south']) this.proj[key].i = -1;
    for (const car of this.cars) { car.active = false; car.entering = false; car.entry = null; car.mesh.visible = false; }
    for (const key of ['north', 'south']) {
      const p = this.window(key, player);
      for (const car of this.cars) {
        if (car.key !== key || car.stalled || car.racer) continue;
        for (let k = 0; k < 8 && !car.active && car.rank <= this.density * Math.min(1, p.lanes / LANES_FULL); k++) {
          const s = p.w0 + this.rnd() * (p.w1 - p.w0);
          if (Math.abs(s - p.s) < 45 && p.d < 30) continue; // не ставим машину вплотную к игроку
          if (skip && skip.key === key && s > skip.s0 && s < skip.s1) continue;
          this.place(car, s);
        }
      }
    }
    this.pose();
  }

  // есть ли в ряду nl место для машины car: никого рядом и сразу впереди. Возвращает просвет до ближайшей впереди
  // (200 — ряд пуст) или −1, если рядом кто-то есть. me — игрок, он считается наравне с машинами.
  laneRoom(car, nl, me, back, fwd) {
    let g = 200;
    const look = (t) => {
      if (t.lane !== nl && t.nextLane !== nl) return true;
      const ds = t.s - car.s, len = t.hl + car.hl;
      if (ds > -(len + back + Math.max(0, t.v - car.v) * 0.9) && ds < len + fwd) return false;
      if (ds > 0 && ds - len < g) { g = ds - len; this.roomV = t.v; }
      return true;
    };
    this.roomV = 0;
    for (const t of this.cars) if (t !== car && t.active && t.key === car.key && !look(t)) return -1;
    if (me && !look(me)) return -1;
    return g;
  }

  // «Режиссёр потока». Смотрит на 11 секунд вперёд по ходу игрока: можно ли пройти между машинами, меняя ряды?
  // Время режется на клетки по 0,2 с; машина занимает в своём ряду клетки вокруг момента, когда игрок её догонит.
  // Если впереди глухая стенка — одной из её машин незаметно меняем скорость на десяток км/ч,
  // и к подъезду игрока в стенке появляется щель.
  direct(P) {
    for (const car of this.cars) car.tStar = Infinity;
    this.clearAhead = true;
    if (!P.on || P.v < 3) return;
    const key = P.key, c = this.chains[key], DT = 0.2, vP = Math.max(P.v, 27), W = 64, ML = 5;
    let T = 11;
    const sg = this.signals ? this.signals.next(key, P.s) : null;
    if (sg && sg.it.g.state !== 'g') T = Math.min(T, (sg.d - 30) / vP); // очередь у красного не трогаем
    const NC = Math.min(W - 4, Math.floor(T / DT));
    if (NC < 6) return;
    const plan = this.plan || (this.plan = { cars: [], lo: new Int8Array(W), hi: new Int8Array(W), occ: new Uint8Array(W * (ML + 1)), reach: new Uint8Array(W * (ML + 1)) });
    const { cars, lo, hi, occ, reach } = plan;
    cars.length = 0;
    for (let i = 0; i <= NC; i++) { c.at(P.s + vP * i * DT, this.tmp); lo[i] = this.tmp.lo; hi[i] = this.tmp.hi; }
    for (const car of this.cars) {
      if (!car.active || car.key !== key || car.racer) continue;
      const ds = car.s - P.s;
      if (ds > -16 && ds < 380) cars.push(car); // и те, что идут рядом чуть позади: они запирают игрока сбоку
    }
    const speedOf = (car, ovs) => {
      for (const ov of ovs) if (ov.car === car) return ov.v;
      return car.stalled ? 0 : car.nudgeT > 0 ? Math.max(3, car.want + car.nudge) : car.v;
    };
    const free = (l, i) => { const k = i > NC ? NC : i; return l >= lo[k] && l <= hi[k] && !occ[l * W + k]; };
    const solve = (ovs) => {
      occ.fill(0); reach.fill(0);
      for (const car of cars) {
        const rel = Math.max(2.5, vP - speedOf(car, ovs)), ts = (car.s - P.s) / rel, tau = (car.hl + P.hl + 2.6) / rel;
        const i0 = Math.max(0, Math.ceil((ts - tau) / DT)), i1 = Math.min(NC, Math.floor((ts + tau) / DT));
        for (let i = i0; i <= i1; i++) { occ[car.lane * W + i] = 1; if (car.nextLane >= 0) occ[car.nextLane * W + i] = 1; }
      }
      reach[P.lane * W] = 1;
      for (const l of [P.lane - 1, P.lane + 1]) if (free(l, 0) && free(l, 1)) reach[l * W] = 1;
      let far = 0;
      for (let i = 0; i < NC; i++) for (let l = 0; l <= ML; l++) {
        if (!reach[l * W + i]) continue;
        far = i;
        if (!free(l, i + 1)) continue;
        reach[l * W + i + 1] = 1;
        // нырок в соседний ряд: две клетки машина идёт «на два ряда», на третьей уже в новом
        for (const nl of [l - 1, l + 1]) if (free(nl, i + 1) && free(l, i + 2) && free(nl, i + 2) && free(nl, i + 3)) reach[nl * W + Math.min(NC, i + 3)] = 1;
      }
      for (let l = 0; l <= ML; l++) if (reach[l * W + NC]) far = NC;
      return far;
    };
    // Ближний план: машина A — ближайшая впереди в ряду игрока. К моменту, когда он её догонит (или уже догнал
    // и висит на хвосте), хотя бы в одном соседнем ряду вдоль A должно быть окно для нырка. Если с обеих сторон
    // занято — в том ряду, где проще, машины расступаются: кто впереди — чуть прибавляет, кто сзади — отпускает.
    let A = null, gapA = Infinity;
    for (const car of cars) {
      if ((car.lane !== P.lane && car.nextLane !== P.lane) || car.s <= P.s) continue;
      const gp = car.s - P.s - car.hl - P.hl;
      if (gp < gapA) { gapA = gp; A = car; }
    }
    if (A && A.v < 26 && A.v > 6) { // стоящую (сломанную или очередь у светофора) объезжают и так
      const relA = P.v - A.v, tA = relA > 1.5 ? gapA / relA : gapA < 10 + P.v * 0.9 ? 0 : Infinity;
      if (tA <= 5) {
        // окно относительно A: от «корпус игрока + запас» позади до «встать перед ней»; чем быстрее игрок, тем дальше вперёд
        const z0 = -(A.hl + 2 * P.hl + 9), z1 = A.hl + 2 * P.hl + 5 + Math.min(16, Math.max(0, relA) * 0.7);
        let pick = null, pickCost = Infinity;
        for (const nl of [P.lane - 1, P.lane + 1]) {
          if (nl < lo[0] || nl > hi[0] || nl < lo[Math.min(NC, 10)] || nl > hi[Math.min(NC, 10)]) continue;
          const moves = [];
          let cost = 0;
          for (const car of cars) {
            if (car === A || (car.lane !== nl && car.nextLane !== nl)) continue;
            const x = car.s - A.s + (speedOf(car, NONE) - A.v) * tA; // где она будет относительно A
            if (x + car.hl < z0 || x - car.hl > z1) continue;
            if (car.stalled) { cost = Infinity; break; }
            const fwd = z1 - (x - car.hl), back = x + car.hl - z0, dir = fwd * 1.6 < back ? 1 : -1;
            moves.push({ car, dir });
            cost += dir > 0 ? fwd * 1.6 : back; // отпустить назад естественнее, чем разгонять
          }
          if (cost < pickCost) { pickCost = cost; pick = moves; }
        }
        if (pick) for (const m of pick) {
          const w = m.car.want, v = m.dir > 0 ? Math.min(w + 6, Math.max(w, A.v + 4.5)) : Math.max(5, w - 6, Math.min(w, A.v - 4.5));
          m.car.nudge = v - m.car.want; m.car.nudgeT = 0.6; m.car.nudgeAge = 0; m.car.nudgeHard = true;
        }
        if (A.nudgeT > 0 && A.nudge < 0) A.nudgeT = 0;
      }
    }
    if (P.v < 14) return; // дальний план нужен только на ходу
    const ovs = [];
    let far = solve(ovs);
    for (let round = 0; round < 3 && far < NC; round++) {
      const tw = far * DT;
      let best = null, bestFar = far;
      for (const car of cars) {
        if (car.stalled || car.nudgeT > 0 || car.nudgeCd > 0 || ovs.some((ov) => ov.car === car)) continue;
        const v0 = car.v, ts = (car.s - P.s) / Math.max(2.5, vP - v0);
        if (ts < 1.2 || ts < tw - 0.8 || ts > tw + 2.6) continue; // только машины самой стенки; совсем близкие уже не успеют
        for (const dir of [-1, 1]) {
          // есть ли куда: ускоряться — нужен запас впереди, притормаживать — позади
          const need = NUDGE * Math.min(ts, 6) * 0.8 + 7;
          let room = true;
          for (const t of this.cars) {
            if (t === car || !t.active || t.key !== key || (t.lane !== car.lane && t.nextLane !== car.lane)) continue;
            const d = (t.s - car.s) * dir - t.hl - car.hl;
            if (d > 0 && d < need) { room = false; break; }
          }
          if (!room) continue;
          const ov = { car, v: Math.max(4, v0 + dir * NUDGE), dir };
          ovs.push(ov);
          const f = solve(ovs);
          ovs.pop();
          if (f > bestFar) { bestFar = f; best = ov; }
        }
      }
      if (!best) break;
      ovs.push(best); far = bestFar;
    }
    for (const ov of ovs) { ov.car.nudge = ov.dir * NUDGE; ov.car.nudgeT = 1.2; ov.car.nudgeAge = 0; ov.car.nudgeHard = false; }
    for (const car of cars) {
      const ts = (car.s - P.s) / Math.max(2.5, vP - car.v);
      car.tStar = ts;
      // держим поправку, пока игрок не проедет, но не дольше 6 с: иначе машина начнёт ехать вровень с соседним рядом
      if (car.nudgeT > 0 && ts > 0.4 && ts < T && car.nudgeAge < 6) car.nudgeT = Math.max(car.nudgeT, 0.5);
    }
    this.clearAhead = far >= NC;
  }

  update(dt, player, pw, events) {
    this.time += dt;
    this.blinkOn = (this.time * 2.4) % 1 < 0.55;
    for (const key of ['north', 'south']) this.window(key, player);
    const o = this.tmp;

    // игрок для потока — такая же машина: у неё есть ряд, скорость и боковое движение
    const P = this.ghost, pp = this.proj[this.only];
    P.key = this.only;
    P.on = pp.facing > 0 && pp.d < halfWidth(pp.lf) + 2.5;
    P.s = pp.s; P.off = pp.lat; P.v = Math.max(0, pp.vAlong); P.hl = pw.hl; P.hw = pw.hw;
    P.latV = player.vx * pp.dz - player.vz * pp.dx;
    P.lane = rowAt(pp.lat, pp);
    this.dirT -= dt;
    if (this.dirT <= 0) { this.dirT = 0.2; this.direct(P); }
    // Машин столько, сколько вмещает дорога: на трёх рядах их меньше, чем на четырёх, иначе все ряды
    // забиваются под завязку и между машинами не остаётся места.
    this.eff = this.density * Math.min(1, pp.lanes / LANES_FULL);

    for (const car of this.cars) {
      if (car.stalled) continue; // стоит на месте, только мигает
      if (car.entering) { this.advanceEntry(car, dt); continue; } // ещё на боковой улице или в повороте
      if (!car.active && car.racer) continue; // гонщиков ставит светофор
      if (!car.active && car.key !== this.only) { car.key = this.only; car.chain = this.chains[this.only]; }
      const p = this.proj[car.key], c = car.chain;
      if (!car.active) {
        car.retry -= dt;
        if (car.retry <= 0 && car.rank <= this.eff) {
          car.retry = 0.4 + this.rnd() * 0.6;
          // новая машина появляется на дальнем краю окна — туда, откуда она поедет к игроку
          const farAhead = p.facing > 0 ? p.w1 - this.rnd() * 60 : p.w0 + this.rnd() * 60;
          const farBehind = p.facing > 0 ? p.w0 + this.rnd() * 30 : p.w1 - this.rnd() * 30;
          const fromAhead = p.facing > 0 ? p.vAlong > 9 : true;
          this.place(car, fromAhead ? farAhead : farBehind) || this.place(car, fromAhead ? farBehind : farAhead);
        }
        continue;
      }
      if (car.s < p.w0 || car.s > p.w1 || car.s > c.total - 8) { car.active = false; car.mesh.visible = false; car.retry = this.rnd() * 0.5; continue; }
      // лишние (дорога сузилась) уходят там, где этого не видно: позади игрока или далеко впереди
      if (!car.racer && car.rank > this.eff + 0.03 && (car.s - p.s < -45 || car.s - p.s > 420)) { car.active = false; car.mesh.visible = false; continue; }

      c.at(car.s, o);
      const lo = o.lo, hi = o.hi, here = { lf: o.lf, ls: o.ls };
      if (car.lane > hi) { car.lane = hi; car.nextLane = -1; car.blinkSide = 0; }
      if (car.lane < lo) { car.lane = lo; car.nextLane = -1; car.blinkSide = 0; }
      c.at(car.s + 190, this.tmp2);
      let hiA = Math.min(hi, this.tmp2.hi), loA = Math.max(lo, this.tmp2.lo); // через пару сотен метров рядов может стать меньше — справа или слева
      // перед разворотом крайний ряд, через который поедет игрок, освобождаем заранее
      if (hi - lo >= 1) for (const z of this.clearRows) if (z.key === car.key && car.s > z.s0 - 190 && car.s < z.s1) { if (z.side > 0) loA = Math.max(loA, lo + 1); else hiA = Math.min(hiA, hi - 1); }
      if (car.hurry > 0) car.hurry -= dt;
      if (car.nudgeT > 0) { car.nudgeT -= dt; car.nudgeAge += dt; if (car.nudgeT <= 0) car.nudgeCd = 4; } else if (car.nudgeCd > 0) car.nudgeCd -= dt;
      if (car.scare > 0) car.scare -= dt;
      if (car.honkT > 0) car.honkT -= dt;
      const me = P.on && car.key === P.key ? P : null;
      const long = car.hl > 3; // автобус и маршрутка: медленно и плавно, чтобы не задевать соседние ряды
      const quick = car.racer ? 5.2 : long ? 0.75 : car.hurry > 0 ? 3.4 : 1.5; // боковая скорость, м/с
      const tgt = rowOffset(car.lane, here);

      // --- кто впереди на пути: по ряду и «по железу» (перекрытие бортами), чтобы никто не проезжал сквозь соседа ---
      let lead = null, gapBest = Infinity, leadHard = false, laneLead = null, laneGap = Infinity;
      const scan = (t) => {
        if (t.s <= car.s) return;
        const gap = t.s - car.s - t.hl - car.hl;
        if (gap > 140) return;
        const sep = Math.abs(t.off - car.off) - car.hw - t.hw - 0.35; // боковой просвет
        const same = t.lane === car.lane || t.nextLane === car.lane;
        if (same && gap < laneGap) { laneGap = gap; laneLead = t; }
        let inPath = same || sep < 0 || (car.nextLane >= 0 && t.lane === car.nextLane);
        if (!same && sep < 0 && Math.abs(tgt - car.off) > 0.3 && (car.off - t.off) * (tgt - car.off) > 0) {
          // уходим из её ряда и разойдёмся бортами раньше, чем догоним, — она не мешает
          if (-sep / quick < gap / Math.max(0.5, car.v - t.v) - 0.12) inPath = false;
        }
        if (inPath && gap < gapBest) { gapBest = gap; lead = t; leadHard = sep < 0; }
      };
      for (const t of this.cars) if (t !== car && t.active && t.key === car.key) scan(t);
      if (me) scan(me);

      // --- скорость: держим дистанцию по времени (очередь после светофора растягивается, а не едет бампер в бампер) ---
      const want = car.want + (car.nudgeT > 0 ? car.nudge : 0) + (car.yieldT > 0 ? 9 : 0);
      let limit = want, boxed = false, stuck = false;
      if (lead) {
        limit = Math.min(limit, Math.sqrt(lead.v * lead.v + 2 * (car.racer ? 9 : 5) * Math.max(0, gapBest - 2)));
        const desired = 3.5 + car.v * car.head;
        if (gapBest < desired * 1.6) {
          let vt = lead.v + (gapBest - desired) * 0.7;
          if (gapBest > 4) vt = Math.max(vt, Math.min(car.v, lead.v) - 2.5); // дистанцию восстанавливаем мягко, без резкого торможения
          limit = Math.min(limit, Math.max(0, vt));
          if (lead.v < car.want - 1) boxed = true;
        }
        if (lead.stalled && gapBest < 90) stuck = true;
        // подрезали: игрок влез вплотную и едет медленнее — водитель тормозит и сигналит
        if (lead === me && gapBest < 2 + car.v * 0.2 && car.v - P.v > 4 && !(car.honkT > 0)) { car.honkT = 8; events.honk = true; }
      }
      // просили уступить, а впереди занято и ускориться нельзя — сбрасываем скорость, чтобы пропустить соседей и уйти за них
      if (car.yieldT > 0 && boxed) limit = Math.min(limit, car.want - 4.5);
      // впереди сломанная машина — объезжаем её слева, как на моргание
      if (stuck && !car.blinkSide && car.yieldT <= 0) { car.yieldT = 4; car.hurry = 4; }
      // красный или жёлтый — тормозим к стоп-линии. Свободный ряд (free) освобождаем: близкие проскакивают на жёлтый,
      // остальные уходят в соседний ряд. Перестраиваться в него нельзя, пока очередь не разъедется.
      let evade = (car.lane > hiA || car.lane < loA) && car.nextLane < 0, ban = -1; // наш ряд скоро кончится — перестраиваемся заранее
      let dead = -1; // ряд, где впереди стоит сломанная машина: из него уходим заранее, в него не лезем
      for (const t of this.stalledCars) if (t.active && t.key === car.key && t.s > car.s && t.s - car.s < 230) { dead = t.lane; if (car.lane === dead && car.nextLane < 0) evade = true; }
      const sg = this.signals ? this.signals.next(car.key, car.s + car.hl) : null;
      if (sg) {
        const it = sg.it, st = it.g.state;
        if (st !== 'g') {
          if (sg.d < 120) ban = it.free; // свободный ряд держим только на подъезде к линии, а не за два квартала до неё
          let stop = st === 'r' || sg.d > car.v * 1.1;
          if (car.lane === ban) {
            if (st === 'y' && sg.d < car.v * 3 + 6) { stop = false; limit = Math.min(limit + 3, want + 3); }
            else if (sg.d > 3) evade = true;
          }
          if (stop) limit = Math.min(limit, Math.sqrt(2 * 3.4 * Math.max(0, sg.d - 1)));
          if (evade && car.evadeSlow) limit = Math.min(limit, Math.max(3, car.want * 0.55)); // не пускают — отстаём и встаём за соседями
        } else if (sg.d < 120 && this.signals.time - it.greenT < 3) ban = it.free;
      }
      // Игрок смещается в наш ряд прямо перед капотом. Если он при этом почти не быстрее нас и окажется вплотную —
      // это опасно: водитель тормозит и сигналит. Если просто близко — слегка отпускает газ, без гудка.
      // А когда игрок пролетает мимо с большим запасом скорости, это обычные шашки: никто не реагирует.
      if (me && !car.racer && !(car.scare > 0)) {
        const dsP = P.s - car.s, side = P.off - car.off, latGap = Math.abs(side) - P.hw - car.hw, gapL = dsP - car.hl - P.hl;
        const closing = -Math.sign(side) * (P.latV - car.latV), near = 5 + car.v * 0.3, rel = P.v - car.v;
        if (dsP > 1.2 && gapL < near && latGap > -0.2 && latGap < 1.6 && closing > 0.6) {
          const tLat = Math.max(0, latGap) / closing, gapIn = gapL + rel * tLat; // сколько останется до бампера, когда игрок встанет в ряд
          if (tLat < 0.9 && gapIn < 2 + car.v * 0.12 && rel < 9) {
            car.scare = 0.6; car.scareV = Math.max(0, car.v - 3.5);
            if (!(car.honkT > 0)) { car.honkT = 8; events.honk = true; }
          } else if (tLat < 0.9 && gapIn < near && rel < 14) { car.scare = 0.35; car.scareV = Math.max(0, car.v - 1.5); }
        }
      }
      if (car.scare > 0) limit = Math.min(limit, car.scareV);
      // Часть потока сворачивает с Красной там, где это разрешено: решаем один раз на подъезде к каждому перекрёстку
      const cr = sg ? sg.it : this.signals ? this.signals.peek(car.key, car.s + car.hl) : null;
      if (cr && car.seen !== cr) {
        car.seen = cr; car.turn = null;
        const c = cr.c;
        if (!c.ped && !car.racer && car.hl < 3 && car.nextLane < 0 && this.rnd() < 0.4) {
          const right = car.lane === hi && c.open[0] && (!c.a || /r/.test(c.a[c.a.length - 1]));
          const left = car.lane === lo && c.open[1] && !!c.a && /l/.test(c.a[0]);
          if (right || left) car.turn = { c, side: right ? -1 : 1 };
        }
      }
      if (car.turn) {
        const t = car.turn, R = t.side < 0 ? 6.5 : 10, dA = t.c.s + (t.side < 0 ? -2.2 - R : 2.2 - R) - car.s;
        if (dA <= 0) {
          if (dA > -3 && car.lane === (t.side < 0 ? hi : lo) && Math.abs(tgt - car.off) < 0.5 && car.v < 9) { this.startExit(car, t); continue; }
          car.turn = null; car.blinkSide = 0; // не вышло (оказалась не в том ряду) — едет прямо
        } else if (dA < 90) {
          limit = Math.min(limit, Math.sqrt(30 + 5 * dA)); // к повороту подкатывает на 20 км/ч
          car.blinkSide = t.side < 0 ? -1 : 1; car.blinkT = 1; car.nextLane = -1; car.changeIn = 4; car.yieldT = 0;
        }
      }
      // игрок сейчас выедет на дорогу (с площадки или с разворота): кто успевает — притормаживает и пропускает, кто уже рядом — проезжает раньше
      for (const gt of this.gates) if (gt.key === car.key && car.s < gt.s) {
        const d = gt.s - 9 - car.s - car.hl;
        if (d > car.v * car.v / 9 - 2) limit = Math.min(limit, Math.sqrt(2 * 3.5 * Math.max(0, d)));
      }
      if (evade && car.evadeSlow && (car.lane > hiA || car.lane < loA || car.lane === dead)) limit = Math.min(limit, Math.max(4, car.want * 0.6)); // ряд кончается, а сбоку не пускают

      const dv = limit - car.v;
      const soft = car.nudgeT > 0 && limit >= want - 0.01; // поправка режиссёра — плавно и без стоп-сигналов
      car.braking = (dv < -1.5 && !soft) || car.scare > 0 ? 0.3 : Math.max(0, car.braking - dt);
      // с места трогаются не все разом: у каждого своя реакция
      let go = true;
      if (car.racer) { if (car.v < 0.3 && dv > 0.5) { car.hold += dt; go = car.hold >= RACER_REACT; } else if (car.v > 2) car.hold = 0; }
      else if (car.v < 0.4 && dv > 0) { car.wait += dt; go = car.wait >= car.react; } else if (car.v > 2) car.wait = 0;
      const hard = car.nudgeT > 0 && car.nudgeHard; // пропускает игрока — действует живее
      // гонщик разгоняется как машина игрока (кривую разгона задаёт игра), просто трогается чуть позже идеального старта
      const racerAcc = car.racer ? (this.launchAcc ? this.launchAcc(car.v) : 6.2) : 0;
      const maxDec = soft ? (hard ? 2.6 : 1.3) : car.racer ? 10 : lead === me && gapBest < 5 ? 11 : 7;
      car.v += Math.max(-maxDec * dt, Math.min(go ? (car.racer ? racerAcc : car.yieldT > 0 ? 5 : hard ? 3.2 : car.acc) * dt : 0, dv));
      if (car.v < 0) car.v = 0;
      car.s += car.v * dt;
      // страховка: бампер в бампер можно, насквозь — нельзя
      if (lead && leadHard) {
        const g2 = lead.s - car.s - lead.hl - car.hl;
        if (g2 < 0.4 && g2 > -0.9) {
          car.v = Math.min(car.v, lead.v);
          if (lead !== me) car.s -= Math.min(0.4 - g2, 3 * dt); // отползаем плавно, без скачков назад
        }
      }

      // --- перестроения ---
      // игрок в том ряду рядом или быстро догоняет сзади — туда нельзя, даже если он моргал
      const dsP = P.s - car.s;
      const playerIn = (nl) => me && Math.abs(P.off - rowOffset(nl, here)) < 2.3 && dsP < car.hl + 16 && dsP > -(car.hl + 10 + Math.max(0, P.v - car.v) * 2.2);
      car.changeIn -= dt;
      if (car.racer) {
        // гонщик идёт шашками: догоняет машину — ныряет в соседний ряд, где дальше свободно; некуда — висит на хвосте и ждёт щель
        if (car.blinkSide && (car.blinkT -= dt) < -0.7) car.blinkSide = 0;
        if (Math.abs(tgt - car.off) < 0.7 && car.v > 5 && (evade || laneLead)) {
          const ttc = laneLead ? laneGap / Math.max(1, car.v - laneLead.v) : 99;
          if (evade || ttc < 1.6 || laneGap < 14) {
            // выбираем соседний ряд, где впереди свободнее, чем в своём
            let best = -1, bestRoom = evade ? -1 : laneGap + 5;
            for (const nl of [car.lane - 1, car.lane + 1]) {
              if (nl < loA || nl > hiA || nl === ban || (nl === dead && !evade)) continue;
              const g = this.laneRoom(car, nl, me, 2, 2.5);
              if (g > bestRoom) { bestRoom = g; best = nl; }
            }
            if (best >= 0) { car.blinkSide = best < car.lane ? 1 : -1; car.blinkT = 0; car.lane = best; car.wait = 0; }
            else if (laneLead && laneLead !== me && laneGap < 16 && car.v < car.want - 8) {
              // некуда нырнуть — висит на хвосте и «моргает»: передняя машина уступает, как игроку
              car.wait += dt;
              if (car.wait > 0.7) { car.wait = -1.8; if (!laneLead.racer && !laneLead.stalled) this.askToYield(laneLead); }
            }
          }
        }
      } else if (car.scare > 0) {
        if (car.blinkSide && car.nextLane >= 0) { car.nextLane = -1; car.blinkSide = 0; car.changeIn = 3; } // не до перестроений
      } else if (car.blinkSide) {
        car.blinkT -= dt;
        if (car.blinkT <= 0) {
          if (car.nextLane >= 0 && playerIn(car.nextLane)) { car.nextLane = -1; car.blinkSide = 0; car.changeIn = 2; } // передумал: там игрок
          else if (car.nextLane >= lo && car.nextLane <= hi) {
            // за время, пока мигал поворотник, рядом мог кто-то оказаться — ждём, не лезем
            if (this.canMerge(car, car.nextLane, true)) { car.lane = car.nextLane; car.want = this.wantSpeed(car.lane, hi) * car.slow; car.nextLane = -1; car.blinkT = 0; }
            else if (car.blinkT < -2.5) { car.nextLane = -1; car.blinkSide = 0; car.changeIn = 3; }
          } else car.nextLane = -1;
          if (car.nextLane < 0 && car.blinkT < -1.6) car.blinkSide = 0;
        }
      } else if (evade) {
        car.evadeSlow = true;
        for (const nl of car.lane < loA ? [car.lane + 1] : (car.lane - lo) * 2 >= hi - lo ? [car.lane - 1, car.lane + 1] : [car.lane + 1, car.lane - 1]) {
          if (nl < loA || nl > hiA || nl === dead || playerIn(nl) || !this.canMerge(car, nl, true)) continue;
          car.nextLane = nl; car.blinkSide = nl < car.lane ? 1 : -1; car.blinkT = 0.35; car.hurry = 3; car.evadeSlow = false;
          break;
        }
      } else if (car.behave === 'bus' && !stuck) {
        if (car.lane < hiA && car.lane + 1 !== ban && car.lane + 1 !== dead && this.laneFree(car, car.lane + 1, car.s, 14, 20)) { car.nextLane = car.lane + 1; car.blinkSide = -1; car.blinkT = 1.2; } // возвращается в правый ряд
      } else if (car.yieldT > 0) {
        car.yieldT -= dt;
        // сначала вправо (полоса с большим номером), если занято — влево
        for (const nl of stuck ? [car.lane - 1] : [car.lane + 1, car.lane - 1]) {
          if (nl < loA || nl > hiA || nl === ban || nl === dead || playerIn(nl) || !this.laneFree(car, nl, car.s, 9, 12) || !this.canMerge(car, nl, true)) continue;
          car.nextLane = nl;
          car.blinkSide = nl < car.lane ? 1 : -1;
          car.blinkT = 0.25;
          car.yieldT = 0;
          car.changeIn = 8 + this.rnd() * 10;
          break;
        }
      } else if (car.changeIn <= 0 && hi > lo && car.v > 5) {
        car.changeIn = car.behave === 'pushy' ? 3 + this.rnd() * 6 : 7 + this.rnd() * 16; // маршрутки мечутся между рядами
        const dirL = car.lane <= lo ? 1 : car.lane >= hi ? -1 : this.rnd() < 0.5 ? -1 : 1;
        const nl = car.lane + dirL;
        // игрок подъедет через пару секунд — не дёргаемся у него перед носом; в свободный ряд у светофора тоже нельзя
        if (nl >= loA && nl <= hiA && nl !== ban && nl !== dead && !(car.tStar > 0 && car.tStar < 4.5) && !playerIn(nl) && !(me && Math.abs(P.off - rowOffset(nl, here)) < 2.4 && Math.abs(dsP) < 28) && this.laneFree(car, nl, car.s, 14, 24) && this.canMerge(car, nl, false)) {
          car.nextLane = nl;
          car.blinkSide = dirL < 0 ? 1 : -1; // полоса с меньшим номером — левее
          car.blinkT = 1.5;
        }
      }
      if (!evade) car.evadeSlow = false;
      const dOff = rowOffset(car.lane, here) - car.off;
      car.latV = Math.max(-quick, Math.min(quick, dOff * (car.racer ? 4.5 : long ? 1.1 : car.hurry > 0 ? 3.5 : 2.2)));
      // сбоку вплотную кто-то есть — в него не смещаемся
      if (Math.abs(car.latV) > 0.05) {
        const dir = Math.sign(car.latV);
        const beside = (t) => Math.abs(t.s - car.s) < t.hl + car.hl + 0.6 && (t.off - car.off) * dir > 0 && Math.abs(t.off - car.off) - t.hw - car.hw < 0.3;
        let hit = me ? beside(me) : false;
        if (!hit) for (const t of this.cars) if (t !== car && t.active && t.key === car.key && beside(t)) { hit = true; break; }
        if (hit) car.latV = 0;
      }
      car.off += car.latV * dt;
    }

    this.pose();

    // столкновения и «впритирку»
    const pfx = Math.sin(player.yaw), pfz = Math.cos(player.yaw);
    const speed = Math.hypot(player.vx, player.vz);
    for (const car of this.cars) {
      if (!car.active && !car.entering) continue;
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
      if (!car.active && !car.entering) {
        lc.fill(0, b, b + 12); bc.fill(0, b, b + 12);
        this.m4.makeScale(0, 0, 0); this.pools.setMatrixAt(n, this.m4);
        return;
      }
      if (!car.entering) car.chain.at(car.s, o);
      const yaw = car.entering ? Math.atan2(car.dx, car.dz) : Math.atan2(o.dx, o.dz) + car.latV / Math.max(6, car.v) * (car.hl > 3 ? 0.3 : 0.9);
      const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = fz, lz = -fx;
      car.dx = fx; car.dz = fz;
      if (!car.entering) { car.x = o.x + o.dz * car.off; car.z = o.z - o.dx * car.off; }
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
