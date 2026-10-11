// Смазывание по краям кадра на скорости: картинка сначала рисуется в текстуру, потом выводится на экран,
// и чем дальше точка от центра (от машины), тем сильнее она «размазана» вдоль луча от центра. Середина остаётся
// резкой. Это главный приём, которым игры передают скорость. Стоит одного лишнего прохода по экрану, поэтому
// если кадры начинают проседать, смазывание само отключается до конца заезда.
import * as THREE from 'three';

export class SpeedBlur {
  constructor(renderer) {
    this.renderer = renderer;
    this.on = true;
    this.slow = 0;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, depthBuffer: true });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace; // тёмная ночная картинка не идёт полосами
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, k: { value: 0 }, c: { value: new THREE.Vector2(0.5, 0.5) }, aspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D map; uniform float k; uniform vec2 c; uniform float aspect; varying vec2 vUv;
        void main() {
          vec2 d = vUv - c;
          float r = length(d * vec2(aspect, 1.0));
          float a = k * smoothstep(0.16, 0.8, r);
          vec4 sum = vec4(0.0);
          for (int i = 0; i < 9; i++) sum += texture2D(map, vUv - d * a * (float(i) / 8.0));
          gl_FragColor = sum / 9.0;
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h, ratio) {
    this.rt.setSize(Math.max(4, Math.round(w * ratio)), Math.max(4, Math.round(h * ratio)));
    this.mat.uniforms.aspect.value = w / h;
  }

  // k — сила от 0 до 1; dt — длительность кадра, по ней следим, тянет ли устройство
  render(scene, camera, k, dt) {
    const r = this.renderer;
    if (!this.on || k < 0.02) { r.setRenderTarget(null); r.render(scene, camera); return; }
    this.slow = dt > 0.028 ? this.slow + dt : Math.max(0, this.slow - dt * 0.5); // меньше ~36 кадров в секунду
    if (this.slow > 3) { this.on = false; r.setRenderTarget(null); r.render(scene, camera); return; }
    this.mat.uniforms.k.value = 0.2 * k;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
