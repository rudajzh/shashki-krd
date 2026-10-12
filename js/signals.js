// Светофоры (их можно выключить в меню). На каждом перекрёстке цикл: зелёный → жёлтый → красный;
// на красный поток Красной встаёт у стоп-линии, а поперёк проезжают машины с боковой улицы.
// Один ряд перед каждой стоп-линией остаётся пустым (free): по нему игрок всегда может подъехать первым.
import * as THREE from 'three';
import { VEHICLES, vehicleMesh } from './vehicles.js?v=24';

const CYCLE = 27, GREEN = 15, YELLOW = 3; // секунды: красный — оставшиеся 9
const CROSS_V = 13; // скорость машин на поперечной улице, м/с
const COLORS = { g: [0.2, 1, 0.45], y: [1, 0.75, 0.1], r: [1, 0.12, 0.08] };

export class Signals {
  constructor(scene, world, glowTex, envMap) {
    this.enabled = false;
    this.chase = false; // идёт погоня: поперёк никто не выезжает, светофоры впереди игрока держат зелёный
    this.nx = { it: null, d: 0 };
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
    // Улица может называться по-разному по разные стороны бульвара (Кузнечная — Калинина), но перекрёсток один:
    // такие пары сливаем, иначе их светофоры живут каждый своей жизнью и поперечные машины едут на красный.
    for (let i = 0; i < this.groups.length; i++) for (let j = this.groups.length - 1; j > i; j--) {
      const a = this.groups[i], b = this.groups[j];
      if (a.items.some((c) => c.ped) || b.items.some((c) => c.ped)) continue;
      if (a.items.some((p) => b.items.some((q) => p.k === q.k))) continue;
      if (Math.hypot(a.items[0].x - b.items[0].x, a.items[0].z - b.items[0].z) > 75) continue;
      a.items.push(...b.items); this.groups.splice(j, 1);
    }
    this.byChain = { north: [], south: [] };
    for (const g of this.groups) {
      let x = 0, z = 0;
      for (const c of g.items) { x += c.x / g.items.length; z += c.z / g.items.length; this.byChain[c.k].push({ stop: c.stopS, g, key: c.k, c, free: -1, greenT: -99 }); }
      g.cross = g.items.some((c) => !c.ped && !c.link); // есть ли боковая улица, с которой выезжают машины
      g.cx = x; g.cz = z;
      const c0 = g.items[0];
      g.px = c0.dz; g.pz = -c0.dx;   // поперёк Красной
      g.ax = c0.dx; g.az = c0.dz;    // вдоль Красной
      // где вдоль поперечной улицы лежат проезжие части Красной (их может быть две, через бульвар)
      g.e0 = Infinity; g.e1 = -Infinity;
      for (const c of g.items) { const e = (c.x - x) * g.px + (c.z - z) * g.pz; g.e0 = Math.min(g.e0, e - 10); g.e1 = Math.max(g.e1, e + 10); }
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
    const kinds = ['solaris', 'rio', 'polo', 'solaris', 'rio', 'polo', 'lux', 'solaris', 'rio', 'polo', 'solaris', 'rio'];
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
    if (!on) { for (const g of this.groups) g.state = 'g'; for (const c of this.pool) { c.busy = false; c.mesh.visible = false; } this.paint(); return; }
    for (const g of this.groups) { const u = (this.time + g.off) % CYCLE; g.state = u < GREEN ? 'g' : u < GREEN + YELLOW ? 'y' : 'r'; }
    for (const k of ['north', 'south']) for (const it of this.byChain[k]) { it.greenT = -99; it.free = it.g.state === 'g' ? -1 : this.pickFree(it); }
    this.paint();
  }

  // первый светофор впереди — только что загоревшийся зелёный (чтобы заезд не начинался со стоянки)
  calm(key, s) {
    for (const it of this.byChain[key]) {
      if (it.stop < s) continue;
      const u = (this.time + it.g.off) % CYCLE;
      it.g.off += 1 - u; it.g.state = 'g'; it.free = -1;
      break;
    }
    this.paint();
  }

  // какой ряд у этой стоп-линии оставить пустым: тот, где меньше всего машин уже не успевает проскочить;
  // при равенстве — ближайший к ряду игрока
  pickFree(it) {
    const T = this.traffic;
    if (!T) return -1;
    const c = T.chains[it.key], o = T.tmp;
    c.at(Math.max(1, it.stop - 3), o);
    const lo = o.lo, hi = o.hi, count = new Array(hi + 1).fill(0);
    for (const car of T.cars) {
      if (!car.active || car.key !== it.key) continue;
      const d = it.stop - car.s - car.hl;
      if (d < -2 || d > 170 || car.lane > hi || car.lane < lo) continue;
      if (car.stalled) count[car.lane] += 50;
      else if (d > car.v * 3 + 6) count[car.lane] += 1 + (d < 60 ? 2 : 0); // чем ближе к линии, тем труднее ей уйти из ряда
    }
    const pr = T.proj[it.key];
    const mine = pr && pr.facing > 0 && pr.d < 20 && it.stop - pr.s > 0 && it.stop - pr.s < 420 ? Math.max(lo, Math.min(hi, T.ghost.lane)) : lo;
    let best = lo, bs = Infinity;
    for (let l = lo; l <= hi; l++) { const sc = count[l] * 10 + Math.abs(l - mine); if (sc < bs) { bs = sc; best = l; } }
    return best;
  }

  paint() {
    const col = this.geo.attributes.color.array;
    this.lights.forEach((c, i) => col.set(COLORS[this.groupOf.get(c).state], i * 3));
    this.geo.attributes.color.needsUpdate = true;
  }

  // ближайший перекрёсток впереди, даже когда светофоры выключены (нужен тем, кто собирается свернуть)
  peek(key, front) {
    for (const it of this.byChain[key]) { const d = it.stop - front; if (d < -1.5) continue; return d > 230 ? null : it; }
    return null;
  }
  // ближайшая стоп-линия впереди машины потока (front — где её передний бампер); дальше 230 м не смотрим
  next(key, front) {
    if (!this.enabled) return null;
    for (const it of this.byChain[key]) {
      const d = it.stop - front;
      if (d < -1.5) continue;
      if (d > 230) return null;
      this.nx.it = it; this.nx.d = d;
      return this.nx;
    }
    return null;
  }

  // ближайшая стоп-линия впереди на этой проезжей части: сколько до неё, какой там свет и сколько секунд до зелёного
  ahead(key, front) {
    for (const it of this.byChain[key]) {
      const d = it.stop - front;
      if (d <= -2) continue;
      const u = (this.time + it.g.off) % CYCLE;
      return { dist: d, state: this.enabled ? it.g.state : 'g', left: this.enabled && u >= GREEN ? CYCLE - u : 0, stop: it.stop, g: it.g, free: it.free };
    }
    return null;
  }
  // «Зелёная волна» для старта со светофора: два следующих перекрёстка включат зелёный как раз к подъезду,
  // чтобы гонка не кончалась через квартал на чужом красном. stop — откуда стартуем, delay — через сколько секунд.
  wave(key, stop, delay) {
    let n = 0;
    for (const it of this.byChain[key]) {
      if (it.stop <= stop + 5) continue;
      if (n++ >= 2) break;
      this.greenIn(it, delay + (it.stop - stop) / 30 - 1.5);
    }
    this.paint();
  }
  // Погоня: игроку нельзя останавливаться, поэтому три светофора впереди включают зелёный к его подъезду
  // (s — где он сейчас, v — его скорость). Проиграть из-за красного, на котором некуда деться, нечестно.
  chaseGreen(key, s, v) {
    let n = 0;
    for (const it of this.byChain[key]) {
      if (it.stop < s + 6) continue;
      if (n++ >= 3 || it.stop - s > 700) break;
      // зелёный — за шесть секунд до подъезда, чтобы очередь у стоп-линии успела разъехаться; идущий красный
      // обрываем, как только с перекрёстка уедут те, кто уже едет поперёк (новых в погоне не выпускаем)
      if (it.g.state !== 'g' && this.pool.some((c) => c.busy && c.g === it.g && c.t < (c.dir > 0 ? it.g.e1 : -it.g.e0) + 4)) continue;
      this.greenIn(it, (it.stop - s) / Math.max(18, v) - 6, true);
    }
    this.paint();
  }
  // подстроить перекрёсток так, чтобы через T секунд там начался зелёный
  greenIn(it, T, force = false) {
    const now = (this.time + it.g.off) % CYCLE;
    if (it.g.state === 'g' && CYCLE - now > T && GREEN - now < T + 4) { it.g.off -= now - 1; return; } // уже зелёный, но погаснет до подъезда — продлеваем
    let u = ((-T % CYCLE) + CYCLE) % CYCLE;                       // какая фаза должна быть сейчас
    if (u >= GREEN && u < GREEN + YELLOW) u = GREEN + YELLOW;      // жёлтый пропускаем
    if (it.g.state === 'r' && !force && u >= GREEN + YELLOW && u > now) return; // идущий красный не укорачиваем: поперёк ещё едут
    if (it.g.state === 'g' && u < GREEN) return;                   // и так будет зелёный
    it.g.off += u - now;
    const st = u < GREEN ? 'g' : 'r';
    if (st !== it.g.state) {
      it.g.state = st;
      for (const k of ['north', 'south']) for (const j of this.byChain[k]) if (j.g === it.g) { j.free = st === 'g' ? -1 : this.pickFree(j); if (st === 'g') j.greenT = this.time; }
    }
  }
  // сделать так, чтобы до зелёного на этом перекрёстке осталось ровно sec секунд (для стартового отсчёта)
  setLeft(g, sec) {
    const u = (this.time + g.off) % CYCLE;
    g.off += (CYCLE - sec) - u;
    g.state = 'r';
    this.paint();
  }

  update(dt, player, pw, events) {
    if (!this.enabled) return;
    this.time += dt;
    let changed = false;
    for (const g of this.groups) {
      const u = (this.time + g.off) % CYCLE, st = u < GREEN ? 'g' : u < GREEN + YELLOW ? 'y' : 'r';
      if (st === g.state) continue;
      g.state = st; changed = true;
      for (const k of ['north', 'south']) for (const it of this.byChain[k]) {
        if (it.g !== g) continue;
        if (st === 'y') it.free = this.pickFree(it);
        if (st === 'g') it.greenT = this.time;
      }
      // на жёлтый с боковой улицы уже подкатывают машины — если перекрёсток рядом с игроком
      if (st === 'y' && g.cross && !this.chase && Math.hypot(g.cx - player.x, g.cz - player.z) < 320) this.launch(g);
      // к красному в первом ряду встают гонщики — если перекрёсток впереди игрока и ещё не слишком близко
      if (st === 'y' && this.traffic && !this.chase) {
        const key = this.traffic.only, pr = this.traffic.proj[key];
        for (const it of this.byChain[key]) if (it.g === g && it.stop - pr.s > 150 && it.stop - pr.s < 360) this.traffic.stageRacers(key, it.stop, -1, it.free);
        // с боковой улицы едут не только поперёк: кто-то поворачивает на Красную и встраивается в поток —
        // справа направо в правый ряд, слева (из проезда через бульвар) налево в левый. Подъезжают следом за теми, кто едет прямо.
        for (const it of this.byChain[key]) if (it.g === g && !it.c.ped && it.stop - pr.s > 50 && it.stop - pr.s < 420) {
          if (it.c.open[0]) this.traffic.enter(key, it.c, -1, 63);
          if (it.c.open[1]) this.traffic.enter(key, it.c, 1, 78);
        }
      }
    }
    if (changed) this.paint();
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    for (const c of this.pool) {
      if (!c.busy) continue;
      c.t += CROSS_V * dt;
      if (c.t > 85) { c.busy = false; c.mesh.visible = false; continue; }
      const g = c.g, k = c.t * c.dir;
      c.x = g.cx + g.px * k + g.ax * c.lane; c.z = g.cz + g.pz * k + g.az * c.lane;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = Math.atan2(g.px * c.dir, g.pz * c.dir);
      const rx = player.x - c.x, rz = player.z - c.z;
      if (rx * rx + rz * rz < 64 && overlap(rx, rz, fx, fz, pw.hl, pw.hw, g.px * c.dir, g.pz * c.dir, c.hl, c.hw)) { events.crash = { dx: g.px * c.dir, dz: g.pz * c.dir, v: CROSS_V }; events.crashRel = Math.hypot(player.vx - g.px * c.dir * CROSS_V, player.vz - g.pz * c.dir * CROSS_V); }
    }
  }

  // До трёх машин в каждую сторону. Выезжают на жёлтый с таким расчётом, чтобы на Красную попасть уже на её красный,
  // а уйти с дальней проезжей части за секунду до её зелёного: поперечный поток едет только на свой зелёный.
  launch(g) {
    const tIn = YELLOW + 0.5, tOut = CYCLE - GREEN - 1.2;
    for (const dir of [1, -1]) {
      const e0 = dir > 0 ? g.e0 : -g.e1, e1 = dir > 0 ? g.e1 : -g.e0; // вход и выход вдоль своего пути
      const first = CROSS_V * tIn - e0, last = CROSS_V * tOut - e1;
      for (let back = first, n = 0; back <= last && n < 3; back += 15, n++) {
        const c = this.pool.find((q) => !q.busy);
        if (!c) return;
        c.busy = true; c.g = g; c.dir = dir; c.t = -back; c.lane = dir * 2.2; // правостороннее движение: справа по ходу
        c.mesh.visible = true;
      }
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
