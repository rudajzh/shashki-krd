// Кольцо: у «Авроры» машина уходит налево на Офицерскую, огибает кинотеатр и встаёт на встречную полосу,
// на юге — разворачивается на месте перед гостиницей. Пока идёт разворот, по пути машину ведёт игра,
// а игрок быстрыми нажатиями держит занос: не нажимает — машина просто спокойно поворачивает.
import { laneOffset, halfWidth } from './chain.js?v=18';

const CAP = 26, BRAKE = 13, ALAT = 20; // потолок скорости на развороте, торможение и боковое ускорение, под которое подбирается скорость в дуге

// гладкая кривая через точки (Катмулл — Ром), на выходе — точки примерно через 0,5 м
function spline(ctrl) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(ctrl.at(-1));
  return out;
}

export class Loop {
  constructor(world, data) {
    this.N = world.chains.north; this.S = world.chains.south;
    this.tmp = {};
    // связка у «Авроры»: где она отходит от северной проезжей части
    this.link = [];
    for (let i = 0; i < data.link.pts.length; i += 2) this.link.push([data.link.pts[i], data.link.pts[i + 1]]);
    this.N.project(this.link[0][0], this.link[0][1], -1, this.tmp);
    this.linkS = this.tmp.s;
    this.northS = this.linkS - 46;
    // где на южной проезжей части разворот
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.S.n; i++) { const d = Math.abs(this.S.z[i] - data.turns.southZ); if (d < bd) { bd = d; best = i; } }
    this.southS = this.S.cum[best];
    this.active = null;
  }

  // точка на оси полосы (fromRight: 0 — крайняя правая), out — на сколько метров сдвинуть ещё вправо
  lanePoint(chain, s, fromRight, out = 0) {
    const o = chain.at(s, this.tmp), lane = Math.max(0, o.lanes - 1 - fromRight), off = laneOffset(lane, o.lf) - out;
    return [o.x + o.dz * off, o.z - o.dx * off];
  }

  // сколько метров до ближайшего разворота (для табло)
  distance(proj) {
    const n = proj.north, s = proj.south;
    const onN = n.d < halfWidth(n.lf) + 3 && n.facing > 0, onS = s.d < halfWidth(s.lf) + 3 && s.facing > 0;
    if (onN && (!onS || n.d <= s.d)) return Math.max(0, this.northS - n.s);
    if (onS) return Math.max(0, this.southS - s.s);
    return 0;
  }

  // пора ли начинать разворот; если да — строит путь и берёт управление
  maybeStart(car, proj) {
    if (this.active) return;
    const n = proj.north, s = proj.south, v = Math.hypot(car.vx, car.vz);
    const onN = n.d < halfWidth(n.lf) + 3 && n.facing > 0, onS = s.d < halfWidth(s.lf) + 3 && s.facing > 0;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), here = [car.x, car.z], ahead = [car.x + fx * 12, car.z + fz * 12];
    if (onN && (!onS || n.d <= s.d) && n.s < this.linkS - 6 && this.linkS - n.s <= Math.max(46, (v * v - CAP * CAP) / (2 * BRAKE) + 24)) {
      // К левой полосе, затем по связке на Офицерскую и на встречную. Первые 25 м связки пропускаем:
      // там её ось ещё совпадает с осью Красной, и путь из левой полосы вильнул бы вправо.
      // Последние метры тоже: срезаем прямой угол на выезде, чтобы дуга была шире.
      const ctrl = [here, ahead];
      if (this.linkS - n.s > 30) ctrl.push(this.lanePoint(this.N, this.linkS - 12, 9));
      ctrl.push(this.lanePoint(this.N, this.linkS + 8, 9, -1.2));
      const last = this.link.length - 8;
      for (let i = 6; i <= last; i += 2) ctrl.push(this.link[i]);
      // выезд на встречную — широкой дугой: от конца связки к полосе, через точку, где сходятся их направления
      const A = this.link[last], A0 = this.link[last - 2], B = this.lanePoint(this.S, 40, 1), B1 = this.lanePoint(this.S, 52, 1);
      const ax = A[0] - A0[0], az = A[1] - A0[1], bx = B1[0] - B[0], bz = B1[1] - B[1], den = ax * bz - az * bx;
      const t = Math.abs(den) > 1e-6 ? ((B[0] - A[0]) * bz - (B[1] - A[1]) * bx) / den : 0.5;
      const C = [A[0] + ax * t, A[1] + az * t];
      for (const u of [0.25, 0.5, 0.75]) ctrl.push([(1 - u) * (1 - u) * A[0] + 2 * u * (1 - u) * C[0] + u * u * B[0], (1 - u) * (1 - u) * A[1] + 2 * u * (1 - u) * C[1] + u * u * B[1]]);
      ctrl.push(B, this.lanePoint(this.S, 64, 1), this.lanePoint(this.S, 92, 1));
      this.begin('north', spline(ctrl), car, 9, 0.5);
      this.active.hold = ['south', 0, 660, 100];
      this.active.gates = [];
    } else if (onS && s.s < this.southS + 4) {
      const need = Math.max(46, (v * v - 100) / (2 * BRAKE) + 28);
      if (this.southS - s.s > need) return;
      // широкая дуга от правого бордюра южной стороны до правого бордюра северной
      const a = this.lanePoint(this.S, this.southS, 0, 1.0);
      this.N.project(a[0], a[1], -1, this.tmp);
      const sN = this.tmp.s, b = this.lanePoint(this.N, sN, 0, 1.0);
      this.S.at(this.southS, this.tmp);
      const dx = this.tmp.dx, dz = this.tmp.dz, c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
      const e = [(a[0] - c[0]) / r, (a[1] - c[1]) / r], arc = [];
      for (let k = 1; k < 12; k++) { const f = k / 12 * Math.PI; arc.push([c[0] + r * (Math.cos(f) * e[0] + Math.sin(f) * dx), c[1] + r * (Math.cos(f) * e[1] + Math.sin(f) * dz)]); }
      const pre = [];
      for (const d of [38, 18]) if (this.southS - d > s.s + 16) pre.push(this.lanePoint(this.S, this.southS - d, 0, d < 20 ? 0.7 : 0.2));
      this.begin('south', spline([here, ahead, ...pre, a, ...arc, b, this.lanePoint(this.N, sN + 18, 0, 0.6), this.lanePoint(this.N, sN + 40, 0), this.lanePoint(this.N, sN + 68, 0)]), car, 4.6, 0.85);
      this.active.hold = ['north', sN - 160, sN + 660, sN + 85];
      this.active.center = c;
      // машины позади на своей стороне и те, что подъезжают по встречной, пропускают разворачивающегося
      this.active.gates = [{ key: 'south', s: s.s - 6 }, { key: 'north', s: sN - 12 }];
    }
  }

  begin(kind, pts, car, driftGain, driftMax) {
    // сглаживаем путь, чтобы на стыках опорных точек не было изломов
    for (let pass = 0; pass < 4; pass++) {
      const src = pts.map((q) => q.slice());
      for (let i = 3; i < pts.length - 3; i++) for (const c of [0, 1]) pts[i][c] = (src[i - 3][c] + src[i - 2][c] * 2 + src[i - 1][c] * 3 + src[i][c] * 4 + src[i + 1][c] * 3 + src[i + 2][c] * 2 + src[i + 3][c]) / 16;
    }
    const n = pts.length, cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const v0 = Math.hypot(car.vx, car.vz);
    const a = this.active = { kind, pts, cum, total: cum.at(-1), s: 0, i: 0, v: v0, driftGain, driftMax, drift: 0, power: 0.3, powerSum: 0, time: 0, yaw: 0, fresh: true };
    // скорость по пути: в каждой точке — сколько позволяет кривизна, плюс запас на торможение перед дугой
    const lim = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y0 = this.yawAt(a, cum[i] - 3), y1 = this.yawAt(a, cum[i] + 3);
      const k = Math.abs(Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0))) / 6;
      lim[i] = Math.min(CAP, Math.sqrt(ALAT / Math.max(k, 1e-4)));
    }
    for (let i = n - 2; i >= 0; i--) lim[i] = Math.min(lim[i], Math.sqrt(lim[i + 1] * lim[i + 1] + 2 * BRAKE * (cum[i + 1] - cum[i])));
    a.lim = lim; a.i = 0;
    a.speedAt = (st) => { let i = a.i; while (i < n - 1 && cum[i + 1] < st) i++; return lim[i]; };
    // кузов в момент входа мог смотреть чуть не туда, куда идёт путь, — разницу убираем плавно, а не рывком
    a.yawFix = Math.atan2(Math.sin(car.yaw - this.yawAt(a, 0)), Math.cos(car.yaw - this.yawAt(a, 0)));
  }

  // Место стоянки перед стартом: на площади справа от дороги, носом к проезжей части.
  parking(world) {
    const o = this.N.at(world.startS - 4, this.tmp), off = halfWidth(o.lf) + 7;
    return { x: o.x - o.dz * off, z: o.z + o.dx * off, yaw: Math.atan2(o.dx, o.dz) + Math.PI / 2, s: world.startS - 4 };
  }
  // Вступление: машина срывается с площадки, с заносом вылетает на дорогу и встаёт в полосу.
  intro(car, world) {
    const pk = this.parking(world), fx = Math.sin(pk.yaw), fz = Math.cos(pk.yaw);
    const ctrl = [[pk.x, pk.z], [pk.x + fx * 3.5, pk.z + fz * 3.5], [pk.x + fx * 7, pk.z + fz * 7]];
    for (const d of [13, 24, 38, 54, 70]) ctrl.push(this.lanePoint(this.N, pk.s + d, 0));
    this.begin('intro', spline(ctrl), car, 4.2, 0.42);
    this.active.auto = true; // занос сам, нажимать не нужно
    this.active.hold = ['north', pk.s - 120, pk.s + 640, pk.s + 150];
    this.active.gates = [{ key: 'north', s: pk.s + 2 }]; // поток пропускает выезжающего с площадки
  }

  // игрок держит газ — занос держится (как в жизни: в дрифте газ открыт)
  feed(on, dt) { const a = this.active; if (a && !a.auto) a.power = Math.max(0, Math.min(1, a.power + (on ? 1.9 : -1.1) * dt)); }

  posAt(a, s, out) {
    s = Math.max(0, Math.min(a.total, s));
    let i = a.i;
    while (i < a.pts.length - 2 && a.cum[i + 1] < s) i++;
    while (i > 0 && a.cum[i] > s) i--;
    const seg = a.cum[i + 1] - a.cum[i] || 1, t = (s - a.cum[i]) / seg;
    out[0] = a.pts[i][0] + (a.pts[i + 1][0] - a.pts[i][0]) * t; out[1] = a.pts[i][1] + (a.pts[i + 1][1] - a.pts[i][1]) * t;
    return i;
  }
  // направление пути: по двум точкам в паре метров до и после — плавно, без ступенек
  yawAt(a, s) {
    const p = [0, 0], q = [0, 0];
    s = Math.max(2.2, Math.min(a.total - 2.2, s)); // у самых концов пути обе точки слипались, и направление «прыгало» — отсюда было ложное торможение перед выходом
    this.posAt(a, s - 2.2, p); this.posAt(a, s + 2.2, q);
    return Math.atan2(q[0] - p[0], q[1] - p[1]);
  }

  // ведёт машину по пути; возвращает итог, когда разворот закончен
  update(dt, car) {
    const a = this.active;
    a.fresh = false;
    a.time += dt;
    if (a.auto) a.power = 1;
    a.powerSum += a.power * dt;
    const want = a.auto ? Math.max(a.speedAt(a.s), a.v) : a.speedAt(a.s); // на вступлении только разгон: скорость к концу не сбрасываем
    a.v += Math.max(-BRAKE * dt, Math.min(7 * dt, want - a.v));
    a.s = Math.min(a.total, a.s + a.v * dt);
    const pos = [0, 0];
    a.i = this.posAt(a, a.s, pos);
    const yaw = this.yawAt(a, a.s);
    // занос: нос смотрит внутрь поворота тем сильнее, чем круче путь и чем усерднее игрок жмёт
    const y0 = this.yawAt(a, a.s - 3), y1 = this.yawAt(a, a.s + 3);
    const kappa = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0)) / 6;
    const fade = Math.min(1, (a.total - a.s) / 16);
    const target = Math.max(-a.driftMax, Math.min(a.driftMax, kappa * a.driftGain)) * fade * Math.min(1, a.power * 1.25);
    a.drift += (target - a.drift) * Math.min(1, dt * 2.6);
    const prevYaw = car.yaw;
    car.x = pos[0]; car.z = pos[1]; car.yaw = yaw + a.drift + a.yawFix * Math.exp(-a.time * 5);
    a.yaw = yaw;
    car.vx = Math.sin(yaw) * a.v; car.vz = Math.cos(yaw) * a.v;
    car.u = a.v * Math.cos(a.drift); car.vl = -a.v * Math.sin(a.drift);
    car.r = Math.atan2(Math.sin(car.yaw - prevYaw), Math.cos(car.yaw - prevYaw)) / Math.max(dt, 1e-3);
    car.steer = -a.drift * 0.5;                       // колёса вывернуты против заноса
    car.slip = Math.min(1, Math.abs(a.drift) * 2.6);
    car.ay += (a.v * a.v * kappa - car.ay) * Math.min(1, dt * 6);
    car.ax += ((want - a.v) * 0.6 - car.ax) * Math.min(1, dt * 6);
    car.reverse = false;
    car.updateEngine(dt, 0.75);
    if (a.s < a.total - 0.01) return null;
    car.yaw = yaw; car.r = 0; car.steer = 0; car.slip = 0; car.vl = 0; car.u = a.v;
    this.active = null;
    return { kind: a.kind, drift: a.powerSum / Math.max(0.1, a.time) };
  }
}
