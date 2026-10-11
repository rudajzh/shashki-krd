// Дым из-под колёс: мягкие серые клубы, которые растут, поднимаются и тают. Один вызов отрисовки на всё.
import * as THREE from 'three';

export class Smoke {
  constructor(scene, count = 180, color = 0xc9ccd2) {
    this.n = count; this.next = 0;
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);   // сколько осталось жить, с
    this.vel = new Float32Array(count * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float size; attribute float alpha; varying float vA; uniform float uScale;\nvoid main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; vA = alpha; }',
      fragmentShader: 'varying float vA; uniform vec3 uColor;\nvoid main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.15, d) * vA; if (a < 0.004) discard; gl_FragColor = vec4(uColor, a); }',
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.geo = g;
  }

  emit(x, y, z, vx, vz, strength = 1) {
    const i = this.next; this.next = (i + 1) % this.n;
    this.pos[i * 3] = x + (Math.random() - 0.5) * 0.3; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
    this.vel[i * 3] = vx + (Math.random() - 0.5) * 1.2; this.vel[i * 3 + 1] = 0.5 + Math.random() * 0.7; this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * 1.2;
    this.life[i] = 1.25; this.size[i] = 0.9; this.alpha[i] = 0.3 * strength;
  }

  update(dt, camera, viewportH) {
    this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      this.vel[i * 3] *= 1 - dt * 1.8; this.vel[i * 3 + 2] *= 1 - dt * 1.8;
      this.size[i] += dt * 3.4;
      this.alpha[i] *= 1 - dt * 1.7;
    }
    this.geo.attributes.position.needsUpdate = this.geo.attributes.size.needsUpdate = this.geo.attributes.alpha.needsUpdate = true;
  }
}
