// «Ветер» вокруг дороги: тонкие светлые штрихи висят в воздухе и проносятся мимо камеры.
// На месте их не видно; чем быстрее едешь, тем они длиннее и ярче — скорость чувствуется уже на 80–100 км/ч.
import * as THREE from 'three';

export class Streaks {
  constructor(scene, count = 130) {
    // штрих — две скрещённые узкие полоски длиной 1 м вдоль оси z: видно и сбоку, и сверху
    const w = 0.018, pos = [];
    for (const [ax, ay] of [[w, 0], [0, w]]) pos.push(-ax, -ay, 0, ax, ay, 0, ax, ay, 1, -ax, -ay, 0, ax, ay, 1, -ax, -ay, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.mat = new THREE.MeshBasicMaterial({ color: 0xcfdcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.p = new Float32Array(count * 3);
    this.fresh = true;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }

  // cam — где камера, yaw — куда едем, v — скорость, м/с
  update(cam, yaw, v) {
    const k = Math.max(0, Math.min(1, (v - 8) / 26));
    this.mesh.visible = k > 0.02;
    if (!this.mesh.visible) { this.fresh = true; return; }
    this.mat.opacity = 0.5 * k;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), len = 0.4 + v * 0.06, n = this.p.length / 3;
    this.q.setFromAxisAngle(this.up, yaw);
    for (let i = 0; i < n; i++) {
      let x = this.p[i * 3], y = this.p[i * 3 + 1], z = this.p[i * 3 + 2];
      const rx = x - cam.x, rz = z - cam.z, ahead = rx * fx + rz * fz, side = rx * fz - rz * fx;
      if (this.fresh || ahead < -len - 2 || ahead > 140 || Math.abs(side) > 16) {
        // новый штрих появляется далеко впереди, в стороне от оси взгляда, чтобы не мельтешить прямо перед машиной
        const a = this.fresh ? Math.random() * 130 : 70 + Math.random() * 60, sgn = Math.random() < 0.5 ? -1 : 1, s = sgn * (1.3 + Math.random() * 10);
        x = cam.x + fx * a + fz * s; z = cam.z + fz * a - fx * s; y = 0.2 + Math.random() * 2.4;
        this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      }
      this.m4.compose(this.v3.set(x, y, z), this.q, this.s3.set(1, 1, len));
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.fresh = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
