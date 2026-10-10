// Ось проезжей части: ломаная с накопленной длиной и числом полос на каждом отрезке.
export const LANE_W = 3.5;

export class Chain {
  constructor(pts, lanes) {
    const n = pts.length / 2;
    this.n = n;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.cum = new Float32Array(n);
    this.lanes = lanes;
    for (let i = 0; i < n; i++) {
      this.x[i] = pts[i * 2];
      this.z[i] = pts[i * 2 + 1];
      if (i) this.cum[i] = this.cum[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    this.total = this.cum[n - 1];
  }

  segAt(s) {
    let lo = 0, hi = this.n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // точка на оси по пройденному пути s; dx,dz — направление движения
  at(s, out) {
    s = Math.max(0, Math.min(this.total - 0.01, s));
    const i = this.segAt(s);
    const len = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / len;
    const dx = (this.x[i + 1] - this.x[i]) / len, dz = (this.z[i + 1] - this.z[i]) / len;
    out.x = this.x[i] + dx * len * t;
    out.z = this.z[i] + dz * len * t;
    // направление сглаживаем между соседними отрезками, чтобы машины не дёргались на стыках
    const j = t < 0.5 ? Math.max(0, i - 1) : Math.min(this.n - 2, i + 1);
    const lj = this.cum[j + 1] - this.cum[j] || 1;
    const w = Math.abs(t - 0.5);
    const ex = (this.x[j + 1] - this.x[j]) / lj, ez = (this.z[j + 1] - this.z[j]) / lj;
    let ox = dx * (1 - w) + ex * w, oz = dz * (1 - w) + ez * w;
    const ol = Math.hypot(ox, oz) || 1;
    out.dx = ox / ol; out.dz = oz / ol;
    out.lanes = this.lanes[i];
    out.i = i;
    return out;
  }

  // ближайшая точка оси: s — путь, lat — смещение влево от оси, d — расстояние
  project(x, z, hint, out) {
    let from = 0, to = this.n - 2;
    if (hint >= 0) { from = Math.max(0, hint - 25); to = Math.min(this.n - 2, hint + 25); }
    let best = Infinity, bi = from, bt = 0;
    for (let i = from; i <= to; i++) {
      const ax = this.x[i], az = this.z[i];
      const bx = this.x[i + 1] - ax, bz = this.z[i + 1] - az;
      const l2 = bx * bx + bz * bz || 1;
      let t = ((x - ax) * bx + (z - az) * bz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + bx * t - x, pz = az + bz * t - z;
      const d = px * px + pz * pz;
      if (d < best) { best = d; bi = i; bt = t; }
    }
    const len = this.cum[bi + 1] - this.cum[bi] || 1;
    const dx = (this.x[bi + 1] - this.x[bi]) / len, dz = (this.z[bi + 1] - this.z[bi]) / len;
    const rx = x - (this.x[bi] + dx * len * bt), rz = z - (this.z[bi] + dz * len * bt);
    out.s = this.cum[bi] + len * bt;
    out.lat = rx * dz - rz * dx; // влево от направления (dz, −dx)
    out.d = Math.sqrt(best);
    out.i = bi;
    out.dx = dx; out.dz = dz;
    out.lanes = this.lanes[bi];
    return out;
  }
}

// смещение центра полосы влево от оси; полоса 0 — крайняя левая
export const laneOffset = (lane, lanes) => (lanes / 2 - 0.5 - lane) * LANE_W;
