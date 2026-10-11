// Погоня. После полного круга с островка у театра драмы срывается патруль и садится на хвост.
// Едешь быстро и проходишь впритирку — отрываешься; тормозишь — догоняют. Догнали — заезд окончен.
import * as THREE from 'three';
import { vehicleMesh } from './vehicles.js?v=19';
import { halfWidth } from './chain.js?v=19';

export class Chase {
  constructor(scene, world, glowTex, envMap, patrolZ) {
    this.chains = world.chains;
    this.active = false; this.gap = 0; this.speed = 26; this.cur = 8; this.flash = 0;
    const mk = (color) => {
      const g = new THREE.Group(), body = vehicleMesh('solaris', color, envMap);
      const red = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const blue = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x2a62ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      red.position.set(0.42, 1.62, -0.2); blue.position.set(-0.42, 1.62, -0.2);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0x1a1c20 }));
      bar.position.set(0, 1.52, -0.2);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.16, 3.3), new THREE.MeshBasicMaterial({ color: 0x1b4fd0 }));
      stripe.position.set(0, 0.72, -0.1);
      g.add(body, bar, stripe, red, blue);
      scene.add(g);
      return { g, red, blue };
    };
    // патруль на островке: стоит всегда, лениво мигает
    this.post = mk(0xf2f2f0);
    // стоит на островке безопасности между проезжими частями, сразу за перекрёстком с Будённого
    const N = world.chains.north, S = world.chains.south, o = {}, q = {};
    let iN = 0, bd = Infinity;
    for (let i = 0; i < N.n; i++) { const d = Math.abs(N.z[i] - patrolZ); if (d < bd) { bd = d; iN = i; } }
    N.at(N.cum[iN], o);
    S.project(o.x, o.z, -1, q);
    const edgeN = halfWidth(o.lf), edgeS = halfWidth(q.lf), mid = (edgeN + (q.d - edgeS)) / 2; // середина между бордюрами
    this.postPos = [o.x + o.dz * mid, o.z - o.dx * mid, Math.atan2(o.dx, o.dz)];
    this.post.g.position.set(this.postPos[0], 0, this.postPos[1]);
    this.post.g.rotation.y = this.postPos[2];
    // преследователь
    this.car = mk(0xf2f2f0);
    this.car.g.visible = false;
    this.tmp = {};
  }

  reset() { this.active = false; this.car.g.visible = false; this.post.g.visible = true; this.gap = 0; }

  // Начать погоню: lap — номер круга, с каждым кругом патруль настырнее.
  // Патруль подстраивается под темп игрока: едет чуть медленнее, чем тот в среднем за последние секунды.
  // Поэтому на любой скорости погоня остаётся рядом: отрыв растёт медленно и в основном за счёт проходов
  // впритирку, а любая заминка — затор, красный свет — его тут же съедает. Кончается она либо отрывом,
  // либо на следующем развороте.
  start(lap, v = 20) {
    this.active = true;
    this.gap = 150;
    this.lap = lap;
    this.avg = Math.max(30, v);     // средняя скорость игрока, м/с
    this.cur = Math.max(10, v - 4); // патруль срывается следом, почти с той же скоростью
    this.post.g.visible = false;
  }
  // игрок прошёл впритирку — оторвался на несколько корпусов
  boost(m) { if (this.active) this.gap = Math.min(440, this.gap + m); }
  // игрок ушёл на разворот — патруль потерял его из виду
  lose() { if (!this.active) return false; this.active = false; this.car.g.visible = false; this.post.g.visible = true; return true; }

  // 'caught' — догнали, 'escaped' — оторвался, иначе null
  update(dt, player, proj, frozen) {
    this.flash += dt;
    const on = Math.floor(this.flash * (this.active ? 5 : 1.4)) % 2 === 0;
    for (const c of [this.post, this.car]) { c.red.scale.setScalar(on ? 2.6 : 0.01); c.blue.scale.setScalar(on ? 0.01 : 2.6); }
    if (!this.active) return null;
    const v = Math.hypot(player.vx, player.vz);
    if (!frozen) this.avg += (v - this.avg) * Math.min(1, dt / 6);
    // Держится в темпе игрока, но не тише 115 км/ч. Чем дальше отстал, тем сильнее жмёт; сел на хвост — чуть отпускает.
    // При ровной езде отрыв сам устанавливается около 150 м (с каждым кругом — ближе): уйти можно только серией
    // проходов впритирку, а остановка на красный почти наверняка кончается поимкой.
    const hold = Math.max(90, 165 - (this.lap - 2) * 15);
    const want = Math.min(72, Math.max(32, this.avg + Math.max(-3.5, Math.min(8, (this.gap - hold) * 0.03))));
    this.cur += Math.max(-4 * dt, Math.min(4.5 * dt, want - this.cur));
    if (!frozen) this.gap += (v - this.cur) * dt;
    if (this.gap > 420) { this.active = false; this.car.g.visible = false; this.post.g.visible = true; return 'escaped'; }
    if (this.gap < 5) { this.active = false; return 'caught'; }
    // показываем машину на той же проезжей части позади игрока
    const key = proj.north.d <= proj.south.d ? 'north' : 'south', p = proj[key], c = this.chains[key];
    const s = p.s - this.gap * p.facing;
    this.car.g.visible = !frozen && this.gap < 220 && s > 4 && s < c.total - 4;
    if (this.car.g.visible) {
      c.at(s, this.tmp);
      const off = Math.max(-this.tmp.lf * 1.75 + 1.2, Math.min(this.tmp.lf * 1.75 - 1.2, p.lat));
      this.car.g.position.set(this.tmp.x + this.tmp.dz * off, 0, this.tmp.z - this.tmp.dx * off);
      this.car.g.rotation.y = Math.atan2(this.tmp.dx * p.facing, this.tmp.dz * p.facing);
    }
    return null;
  }
}
