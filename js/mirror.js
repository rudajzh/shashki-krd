// Зеркало заднего вида: вторая камера смотрит назад от заднего бампера, картинка рисуется в маленькую текстуру
// и выводится зеркально в рамку вверху экрана. Обновляется через кадр — этого хватает, а отрисовки вдвое меньше.
import * as THREE from 'three';

export class Mirror {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(448, 128, { depthBuffer: true });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.cam = new THREE.PerspectiveCamera(42, 448 / 128, 0.5, 380);
    const geo = new THREE.PlaneGeometry(2, 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // отражение: лево и право меняются местами
    // углы картинки скругляем сами, чтобы она не торчала из рамки
    this.quad = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, aspect: { value: 3.5 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D map; uniform float aspect; varying vec2 vUv;
        void main() {
          vec2 p = (abs(vUv - 0.5) * 2.0) * vec2(aspect, 1.0), q = max(p - (vec2(aspect, 1.0) - 0.22), 0.0);
          if (length(q) > 0.22) discard;
          gl_FragColor = texture2D(map, vUv);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.frame = 0;
    this.size = new THREE.Vector2();
  }

  // x, z, yaw — машина; back — сколько от её центра до заднего бампера; y — высота зеркала;
  // rect — где рамка на экране (как у getBoundingClientRect)
  render(scene, x, z, yaw, back, y, rect) {
    const r = this.renderer;
    if (this.frame++ % 2 === 0) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      this.cam.position.set(x - fx * (back + 0.25), y, z - fz * (back + 0.25));
      this.cam.lookAt(x - fx * 40, y - 1.6, z - fz * 40);
      r.setRenderTarget(this.rt);
      r.render(scene, this.cam);
      r.setRenderTarget(null);
    }
    r.getSize(this.size);
    const b = 3, vx = rect.left + b, vy = this.size.y - rect.bottom + b, vw = rect.width - b * 2, vh = rect.height - b * 2; // внутри рамки
    this.quad.material.uniforms.aspect.value = vw / vh;
    r.setViewport(vx, vy, vw, vh);
    r.setScissor(vx, vy, vw, vh);
    r.setScissorTest(true);
    const auto = r.autoClear;
    r.autoClear = false;
    r.render(this.scene, this.ortho);
    r.autoClear = auto;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.size.x, this.size.y);
  }
}
