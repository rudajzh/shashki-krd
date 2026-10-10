// Кольцо: у «Авроры» машина сама уходит в занос по Офицерской вокруг кинотеатра и встаёт на встречную
// полосу, на юге — разворачивается на месте перед гостиницей. Пока идёт разворот, управляет игра.
import { laneOffset, halfWidth } from './chain.js?v=9';

const VTURN_N = 25, VTURN_S = 11.5, BRAKE = 13;

// гладкая кривая через точки (Катмулл — Ром), на выходе — точки примерно через 0,7 м
function spline(ctrl) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.7));
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
    this.turns = data.turns;
    // где на южной проезжей части разворот
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.S.n; i++) { const d = Math.abs(this.S.z[i] - data.turns.southZ); if (d < bd) { bd = d; best = i; } }
    this.southS = this.S.cum[best];
    this.northS = this.N.total - 70;
    this.active = null;
    this.tmp = {};
  }

  // точка на оси полосы (lane считается справа: 0 — крайняя правая)
  lanePoint(chain, s, fromRight) {
    const o = chain.at(s, this.tmp), lane = Math.max(0, o.lanes - 1 - fromRight), off = laneOffset(lane, o.lf);
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
    if (onN && (!onS || n.d <= s.d) && n.s >= this.northS && n.s < this.N.total - 20) {
      const ctrl = [here, ahead, this.lanePoint(this.N, this.N.total - 20, 1), ...this.turns.north, this.lanePoint(this.S, 26, 1), this.lanePoint(this.S, 48, 1), this.lanePoint(this.S, 78, 1)];
      this.begin('north', spline(ctrl), v, (st, total) => Math.min(VTURN_N + Math.max(0, st - (total - 45)) * 0.25, Math.max(VTURN_N, v - st * 0.9)), 9, 0.46);
    } else if (onS && s.s < this.southS + 4) {
      const need = Math.max(42, (v * v - VTURN_S * VTURN_S) / (2 * BRAKE) + 24);
      if (this.southS - s.s > need) return;
      // полукруг от правой полосы южной стороны до правой полосы северной
      const a = this.lanePoint(this.S, this.southS, 0);
      this.N.project(a[0], a[1], -1, this.tmp);
      const sN = this.tmp.s, b = this.lanePoint(this.N, sN, 0);
      this.S.at(this.southS, this.tmp);
      const dx = this.tmp.dx, dz = this.tmp.dz, c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
      const e = [(a[0] - c[0]) / r, (a[1] - c[1]) / r], arc = [];
      for (let k = 1; k < 10; k++) { const f = k / 10 * Math.PI; arc.push([c[0] + r * (Math.cos(f) * e[0] + Math.sin(f) * dx), c[1] + r * (Math.cos(f) * e[1] + Math.sin(f) * dz)]); }
      const pre = [];
      for (const d of [28, 12]) if (this.southS - d > s.s + 16) pre.push(this.lanePoint(this.S, this.southS - d, 0));
      const pts = spline([here, ahead, ...pre, a, ...arc, b, this.lanePoint(this.N, sN + 14, 0), this.lanePoint(this.N, sN + 34, 0), this.lanePoint(this.N, sN + 60, 0)]);
      // длина до начала дуги — чтобы вовремя оттормозиться
      let d0 = 0, i0 = 0, bd = Infinity;
      for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]); if (d < bd) { bd = d; i0 = i; } }
      for (let i = 1; i <= i0; i++) d0 += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const arcLen = Math.PI * r;
      this.begin('south', pts, v, (st) => {
        if (st < d0) return Math.max(VTURN_S, Math.min(v, Math.sqrt(VTURN_S * VTURN_S + 2 * BRAKE * (d0 - st))));
        if (st < d0 + arcLen) return VTURN_S;
        return Math.min(24, VTURN_S + (st - d0 - arcLen) * 0.42);
      }, 4.2, 0.8);
    }
  }

  begin(kind, pts, v0, speedAt, driftGain, driftMax) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.active = { kind, pts, cum, total: cum.at(-1), s: 0, i: 0, v: v0, speedAt, driftGain, driftMax, drift: 0 };
  }

  yawAt(a, s) { // направление пути на расстоянии s от начала
    let i = a.i;
    while (i < a.pts.length - 2 && a.cum[i + 1] < s) i++;
    while (i > 0 && a.cum[i] > s) i--;
    return [i, Math.atan2(a.pts[i + 1][0] - a.pts[i][0], a.pts[i + 1][1] - a.pts[i][1])];
  }

  // ведёт машину по пути; возвращает 'north' / 'south', когда разворот закончен
  update(dt, car) {
    const a = this.active;
    const want = a.speedAt(a.s, a.total);
    a.v += Math.max(-BRAKE * dt, Math.min(7 * dt, want - a.v));
    a.s = Math.min(a.total, a.s + a.v * dt);
    const [i, yaw] = this.yawAt(a, a.s);
    a.i = i;
    const seg = a.cum[i + 1] - a.cum[i] || 1, t = Math.max(0, Math.min(1, (a.s - a.cum[i]) / seg));
    const x = a.pts[i][0] + (a.pts[i + 1][0] - a.pts[i][0]) * t, z = a.pts[i][1] + (a.pts[i + 1][1] - a.pts[i][1]) * t;
    // занос: нос смотрит внутрь поворота тем сильнее, чем круче путь
    const y0 = this.yawAt(a, Math.max(0, a.s - 2.5))[1], y1 = this.yawAt(a, Math.min(a.total, a.s + 2.5))[1];
    const kappa = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0)) / 5;
    const fade = Math.min(1, (a.total - a.s) / 14); // к концу выравниваемся
    const target = Math.max(-a.driftMax, Math.min(a.driftMax, kappa * a.driftGain)) * fade;
    a.drift += (target - a.drift) * Math.min(1, dt * 5);
    const prevYaw = car.yaw;
    car.x = x; car.z = z; car.yaw = yaw + a.drift;
    car.vx = Math.sin(yaw) * a.v; car.vz = Math.cos(yaw) * a.v;
    car.u = a.v * Math.cos(a.drift); car.vl = -a.v * Math.sin(a.drift);
    car.r = Math.atan2(Math.sin(car.yaw - prevYaw), Math.cos(car.yaw - prevYaw)) / Math.max(dt, 1e-3);
    car.steer = -a.drift * 0.45;                       // колёса вывернуты против заноса
    car.slip = Math.min(1, Math.abs(a.drift) * 2.4);
    car.ay = a.v * a.v * kappa; car.ax = (want - a.v) * 0.5;
    car.reverse = false;
    car.updateEngine(dt, 0.7);
    if (a.s < a.total - 0.01) return null;
    car.yaw = yaw; car.r = 0; car.steer = 0; car.slip = 0; car.vl = 0; car.u = a.v;
    this.active = null;
    return a.kind;
  }
}
