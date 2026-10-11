// Погоня. После полного круга с островка у театра драмы срывается патруль и садится на хвост.
// Едешь быстро и проходишь впритирку — отрываешься; тормозишь — догоняют. Догнали — заезд окончен.
import * as THREE from 'three';
import { vehicleMesh } from './vehicles.js?v=12';
import { halfWidth } from './chain.js?v=12';

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

  // Начать погоню: lap — номер круга, с каждым кругом патруль быстрее.
  // Баланс: на втором круге патруль держит около 94 км/ч, на пятом — около 110. В потоке игрок в среднем
  // идёт 100–120, так что отрыв растёт медленно, а любая заминка (затор, красный свет) его съедает.
  start(lap) {
    this.active = true;
    this.gap = 140;
    this.speed = Math.min(34, 26 + (lap - 2) * 1.5);
    this.cur = 8; // патруль трогается с места и разгоняется
    this.post.g.visible = false;
  }
  // игрок прошёл впритирку — оторвался на несколько корпусов
  boost(m) { if (this.active) this.gap = Math.min(460, this.gap + m); }

  // 'caught' — догнали, 'escaped' — оторвался, иначе null
  update(dt, player, proj, frozen) {
    this.flash += dt;
    const on = Math.floor(this.flash * (this.active ? 5 : 1.4)) % 2 === 0;
    for (const c of [this.post, this.car]) { c.red.scale.setScalar(on ? 2.6 : 0.01); c.blue.scale.setScalar(on ? 0.01 : 2.6); }
    if (!this.active) return null;
    const v = Math.hypot(player.vx, player.vz);
    // далеко отстал — поднажал, сел на хвост — чуть отпустил: погоня не кончается ни слишком быстро, ни внезапно
    const want = this.speed + (this.gap > 260 ? 4 : this.gap < 40 ? -2.5 : 0);
    this.cur += Math.max(-3 * dt, Math.min(3.5 * dt, want - this.cur));
    if (!frozen) this.gap += (v - this.cur) * dt;
    if (this.gap > 450) { this.active = false; this.car.g.visible = false; this.post.g.visible = true; return 'escaped'; }
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
