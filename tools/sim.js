// Проверка потока без рендера: «автопилот» едет по северной проезжей части и ныряет между машинами,
// как это делал бы игрок. Запуск в консоли браузера на странице игры:
//   const { sim } = await import('/tools/sim.js'); sim({ lights: true })
// Возвращает сводку: средняя скорость, сколько секунд автопилот был заперт, столкновения, машины «друг в друге»,
// сколько раз встал на красный и сколько раз при этом оказался первым.
export function sim({ secs = 90, speed = 34, director = true, lights = true, density = 1, stalled = 2, startOff = 80, snapAfter = 0, trace = false, smart = true, log = false } = {}) {
  const g = window.__game, T = g.traffic, S = g.signals, N = g.world.chains.north, car = g.car, LW = g.LANE_W;
  const lo = (l, lf) => (lf / 2 - 0.5 - l) * LW, o = {}, o2 = {}, PW = { hl: 2.48, hw: 0.95 };
  let s = g.world.startS + startOff, lane = 1, v = speed * 0.7, off = 0, first = true, latV = 0;
  const put = () => {
    N.at(s, o);
    if (first) { off = lo(lane, o.lf); first = false; }
    car.x = o.x + o.dz * off; car.z = o.z - o.dx * off; car.yaw = Math.atan2(o.dx, o.dz);
    car.vx = o.dx * v + o.dz * latV; car.vz = o.dz * v - o.dx * latV;
  };
  put();
  T.density = density; S.setEnabled(lights); T.only = 'north'; T.reset(car); T.dirT = 0;
  const spots = [];
  for (let k = 0; k < stalled; k++) spots.push(g.world.startS + 600 + k * 900);
  T.setStalled('north', spots);
  const ev = { crash: null, crashRel: 0, near: [], honk: false }, dt = 1 / 60;
  const R = { dist: 0, time: 0, crashes: 0, honks: 0, near: 0, slowT: 0, redStops: 0, redFirst: 0, ghost: 0, blockedT: 0, clearT: 0, lanechg: 0, nudges: 0, waitRed: 0, run: 0, maxRun: 0, pairs: {} };
  let stoppedAtRed = false, planT = 0;
  const endS = g.loop.linkS - 120;
  for (let t = 0; t < secs && s < endS; t += dt) {
    if (!director) T.dirT = 1e9;
    N.at(s, o);
    const lanes = o.lanes, lf = o.lf;
    if (lane > lanes - 1) lane = lanes - 1;
    const cars = T.cars.filter((c) => c.active && c.key === 'north');
    const ahead = (l) => { let gp = 300, vv = 99; for (const c of cars) { if (Math.abs(c.off - lo(l, lf)) > 2.3 || c.s <= s) continue; const d = c.s - s - c.hl - 2.5; if (d < gp) { gp = d; vv = c.v; } } return [gp, vv]; };
    const side = (l) => cars.every((c) => Math.abs(c.off - lo(l, lf)) > 2.5 || c.s - s > c.hl + 2.5 + 2 || c.s - s < -(c.hl + 2.5 + 1.5));
    const [gp, vl] = ahead(lane), ttc = gp / Math.max(1, v - vl);
    let blocked = smart ? (ttc < 1.0 || gp < 6) : false;
    const sig = lights ? S.ahead('north', s + 2.5) : null;
    const red = sig && sig.state !== 'g' && sig.dist > -1 && sig.dist < v * v / 14 + 10;
    if (smart) {
      // «опытный игрок»: смотрит на 8 секунд вперёд и выбирает ряд, из которого дальше всего можно пройти
      planT -= dt;
      if (Math.abs(lo(lane, lf) - off) < 0.6 && planT <= 0) {
        planT = 0.1;
        const vP = Math.max(v, 27), DT = 0.2, NC = 40, W = 48;
        const occ = new Uint8Array(W * 5), ln = [];
        for (let i = 0; i <= NC; i++) { N.at(s + vP * i * DT, o2); ln[i] = o2.lanes; }
        for (const c of cars) {
          const rel = Math.max(2.5, vP - c.v), ts = (c.s - s) / rel, tau = (c.hl + 2.5 + 2.6) / rel;
          if (c.s - s < -3) continue;
          for (let i = Math.max(0, Math.ceil((ts - tau) / DT)); i <= Math.min(NC, Math.floor((ts + tau) / DT)); i++) { occ[c.lane * W + i] = 1; if (c.nextLane >= 0) occ[c.nextLane * W + i] = 1; }
        }
        const free = (l, i) => { const k = Math.min(i, NC); return l >= 0 && l < ln[k] && !occ[l * W + k]; };
        const farFrom = (l0) => {
          const reach = new Uint8Array(W * 5); reach[l0 * W] = 1; let far = 0;
          for (let i = 0; i < NC; i++) for (let l = 0; l < 5; l++) {
            if (!reach[l * W + i]) continue;
            far = i;
            if (!free(l, i + 1)) continue;
            reach[l * W + i + 1] = 1;
            for (const nl of [l - 1, l + 1]) if (free(nl, i + 1) && free(l, i + 2) && free(nl, i + 2) && free(nl, i + 3)) reach[nl * W + Math.min(NC, i + 3)] = 1;
          }
          for (let l = 0; l < 5; l++) if (reach[l * W + NC]) far = NC;
          return far;
        };
        let best = lane, bf = farFrom(lane) + 2;
        for (const nl of [lane - 1, lane + 1]) { if (nl < 0 || nl > lanes - 1 || !side(nl)) continue; const f = farFrom(nl); if (f > bf) { bf = f; best = nl; } }
        if (best !== lane) { lane = best; R.lanechg++; }
        else if (bf - 2 < 8 && (ttc < 1.3 || gp < 12)) blocked = true;
      }
    } else if (Math.abs(lo(lane, lf) - off) < 0.5 && (ttc < 2.2 || gp < 14)) {
      // обычный игрок: видит, что догоняет, и уходит в соседний ряд, если там впереди просторнее
      let best = -1, bs = gp + 10;
      for (const nl of [lane - 1, lane + 1]) {
        if (nl < 0 || nl > lanes - 1 || !side(nl)) continue;
        const [g2, v2] = ahead(nl);
        if (g2 / Math.max(1, v - v2) < 0.7) continue; // туда не успеть
        if (g2 > bs) { bs = g2; best = nl; }
      }
      if (best >= 0) { lane = best; R.lanechg++; } else if (ttc < 1.3 || gp < 12) blocked = true;
    }
    let target = speed;
    if (ttc < 1.0 || gp < 6) target = Math.min(target, Math.max(0, vl + (gp - 5) * 0.8));
    if (red) target = Math.min(target, Math.sqrt(2 * 7 * Math.max(0, sig.dist - 1.5)));
    v += Math.max(-14 * dt, Math.min(5 * dt, target - v));
    if (v < 0) v = 0;
    s += v * dt;
    latV = Math.max(-4.5, Math.min(4.5, (lo(lane, lf) - off) * 5));
    off += latV * dt;
    put();
    ev.crash = null; ev.near.length = 0; ev.honk = false;
    T.update(dt, car, PW, ev); S.update(dt, car, PW, ev);
    R.time += dt; R.dist += v * dt;
    if (log && Math.floor(t) !== Math.floor(t - dt)) (R.log || (R.log = [])).push([Math.floor(t), Math.round(s), lane, +v.toFixed(0), Math.round(gp), +vl.toFixed(0), lanes, blocked ? 'B' : '', red ? 'R' : ''].join(','));
    if (ev.crash) { R.crashes++; if (!R.firstCrash) { const c = ev.crash; R.firstCrash = { t: +t.toFixed(1), me: { lane, off: +off.toFixed(2), v: +v.toFixed(1), latV: +latV.toFixed(1) }, car: c.kind ? { k: c.kind[0] + (c.racer ? 'R' : ''), ds: +(c.s - s).toFixed(1), lane: c.lane, next: c.nextLane, off: +c.off.toFixed(2), v: +c.v.toFixed(1), latV: +c.latV.toFixed(2), nudge: c.nudgeT > 0 ? +c.nudge.toFixed(1) : 0, hurry: +c.hurry.toFixed(1) } : 'cross' }; } }
    if (ev.honk) R.honks++;
    R.near += ev.near.length;
    if (red && v < 0.5) {
      R.waitRed += dt;
      if (!stoppedAtRed) {
        stoppedAtRed = true; R.redStops++;
        if (sig.dist < 12 && !cars.some((c) => c.s > s && c.s - c.hl < s + 2.5 + sig.dist + 1 && Math.abs(c.off - off) < 1.9)) R.redFirst++;
        else R.notFirst = { dist: +sig.dist.toFixed(1), lane, free: sig.free, lanes, cars: cars.filter((c) => c.s - s > -10 && c.s - s < 60).sort((a, b) => a.s - b.s).map((c) => [Math.round(c.s - s), c.lane, +c.v.toFixed(1), c.kind[0] + (c.racer ? 'R' : '')].join(',')).join(' | ') };
      }
    } else if (v > 3) stoppedAtRed = false;
    if (!red && v < speed * 0.6) R.slowT += dt;
    if (blocked && !red) {
      R.blockedT += dt; R.run += dt; R.maxRun = Math.max(R.maxRun, R.run);
      if (snapAfter && R.run > snapAfter && !R.snap) R.snap = { s: Math.round(s), lane, v: +v.toFixed(1), lanes, cars: cars.filter((c) => c.s - s > -25 && c.s - s < 90).sort((a, b) => a.s - b.s).map((c) => [Math.round(c.s - s), c.lane, +c.off.toFixed(1), +c.v.toFixed(1), c.kind[0] + (c.stalled ? '!' : '') + (c.racer ? 'R' : ''), c.nudgeT > 0 ? +c.nudge.toFixed(1) : 0].join(',')).join(' | ') };
    } else R.run = 0;
    if (T.clearAhead) R.clearT += dt;
    if (trace) for (const c of cars) { (c.hist || (c.hist = [])).push([+t.toFixed(2), +(c.s - s).toFixed(1), +c.off.toFixed(2), c.lane, c.nextLane, +c.v.toFixed(1), c.blinkSide, +c.latV.toFixed(2), lanes]); if (c.hist.length > 240) c.hist.shift(); }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (Math.abs(a.s - b.s) < a.hl + b.hl - 0.6 && Math.abs(a.off - b.off) < a.hw + b.hw - 0.25) {
        R.ghost++;
        const name = (c) => c.kind[0] + (c.racer ? 'R' : '') + (c.stalled ? '!' : '');
        const k = name(a) + '-' + name(b);
        R.pairs[k] = (R.pairs[k] || 0) + 1;
        if (!R.firstGhost) { const d = (c) => ({ k: name(c), ds: +(c.s - s).toFixed(1), s: Math.round(c.s), lane: c.lane, next: c.nextLane, off: +c.off.toFixed(2), v: +c.v.toFixed(1), blink: c.blinkSide, yieldT: +c.yieldT.toFixed(1), lanes }); R.firstGhost = [d(a), d(b), +t.toFixed(1)]; if (trace) R.trace = [a, b].map((c) => c.hist.filter((_, i) => i % 12 === 0).map((h) => h.join(',')).join(' | ')); }
      }
    }
    R.nudges = Math.max(R.nudges, cars.filter((c) => c.nudgeT > 0).length);
  }
  R.avg = +(R.dist / R.time * 3.6).toFixed(1);
  R.avgMoving = +(R.dist / Math.max(1, R.time - R.waitRed) * 3.6).toFixed(1);
  for (const k of ['time', 'slowT', 'blockedT', 'clearT', 'waitRed', 'dist', 'run', 'maxRun']) R[k] = +R[k].toFixed(1);
  S.setEnabled(false); T.dirT = 0;
  return R;
}
