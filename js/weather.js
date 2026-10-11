// Дождь. Начинается и кончается сам: минута-две сухо, полминуты-минута дождя.
// В дождь дорога скользкая (сцепление и тормоза слабее), видно хуже, по экрану летят струи.
import * as THREE from 'three';

const N = 420, BOX = 26, TOP = 14;

export class Rain {
  constructor(scene) {
    this.wet = 0;         // 0 — сухо, 1 — льёт
    this.on = false;
    this.next = 75 + Math.random() * 40; // секунд до смены погоды
    this.pos = new Float32Array(N * 6);
    this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push([(Math.random() - 0.5) * BOX * 2, Math.random() * TOP, (Math.random() - 0.5) * BOX * 2, 22 + Math.random() * 9]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaecbe6, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false; this.lines.renderOrder = 9;
    this.lines.visible = false;
    scene.add(this.lines);
    this.geo = g;
  }

  reset() { this.on = false; this.wet = 0; this.next = 75 + Math.random() * 40; this.lines.visible = false; }

  // возвращает true в тот кадр, когда дождь начался или кончился
  update(dt, car, running) {
    let changed = false;
    if (running) {
      this.next -= dt;
      if (this.next <= 0) { this.on = !this.on; this.next = this.on ? 32 + Math.random() * 22 : 70 + Math.random() * 60; changed = true; }
    }
    this.wet += ((this.on ? 1 : 0) - this.wet) * Math.min(1, dt * 0.5);
    if (this.wet < 0.01 && !this.on) { this.wet = 0; this.lines.visible = false; return changed; }
    this.lines.visible = true;
    this.mat.opacity = 0.42 * this.wet;
    // струи летят вниз и чуть назад — тем сильнее, чем быстрее едем
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), v = Math.hypot(car.vx, car.vz);
    const sx = -fx * v * 0.035, sz = -fz * v * 0.035;
    for (let i = 0; i < N; i++) {
      const d = this.drops[i];
      d[1] -= d[3] * dt; d[0] -= car.vx * dt; d[2] -= car.vz * dt;
      if (d[1] < 0) { d[1] = TOP; d[0] = (Math.random() - 0.5) * BOX * 2 + fx * 10; d[2] = (Math.random() - 0.5) * BOX * 2 + fz * 10; }
      if (Math.abs(d[0]) > BOX + 12) d[0] = -Math.sign(d[0]) * BOX;
      if (Math.abs(d[2]) > BOX + 12) d[2] = -Math.sign(d[2]) * BOX;
      const x = car.x + d[0], z = car.z + d[2];
      this.pos.set([x, d[1], z, x + sx, d[1] + 0.8, z + sz], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
    return changed;
  }
}
