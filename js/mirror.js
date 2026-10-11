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
    this.quad = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.rt.texture, depthTest: false, depthWrite: false, fog: false }));
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
    r.setViewport(rect.left, this.size.y - rect.bottom, rect.width, rect.height);
    r.setScissor(rect.left, this.size.y - rect.bottom, rect.width, rect.height);
    r.setScissorTest(true);
    const auto = r.autoClear;
    r.autoClear = false;
    r.render(this.scene, this.ortho);
    r.autoClear = auto;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.size.x, this.size.y);
  }
}
