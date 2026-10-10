// Машина игрока: детальная модель + её свет (габариты, стоп-сигналы, конус фар на асфальте, прожектор).
import * as THREE from 'three';
import { buildCar } from './cardetail.js?v=8';

// конус света на асфальте: начинается у бампера, расширяется и гаснет вдаль
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d'), img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const v = 1 - y / 255, u = (x + 0.5) / 64 * 2 - 1;      // v = 0 у бампера, 1 вдали
    const along = Math.min(1, v / 0.05) * Math.pow(1 - v, 1.6); // быстро загорается, плавно гаснет
    const across = Math.pow(Math.max(0, 1 - u * u), 1.5);       // мягкие края
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(255 * along * across);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makePlayerCar(color, glowTex, envMap) {
  const car = buildCar({ color, envMap });
  const { root, type: t } = car;

  // габариты и стоп-сигналы — светящиеся точки, как у потока
  const tailMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xc01008, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const tails = [-1, 1].map((s) => {
    const sp = new THREE.Sprite(tailMat);
    sp.position.set(s * 0.6, 0.875, -t.len / 2 - 0.03);
    sp.scale.setScalar(1.0);
    sp.renderOrder = 7;
    root.add(sp);
    return sp;
  });

  // свет фар на асфальте: трапеция от бампера вперёд (uv: v — вдоль, u — поперёк)
  const NEAR = 0.9, FAR = 6.5;
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute([-NEAR, 0, 0, NEAR, 0, 0, FAR, 0, 1, -NEAR, 0, 0, FAR, 0, 1, -FAR, 0, 1], 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xfff0cf, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
  const beam = new THREE.Mesh(bg, beamMat);
  beam.position.set(0, 0.13, t.len / 2 - 0.05);
  beam.scale.set(1, 1, 42);
  beam.renderOrder = 5;
  beam.frustumCulled = false;
  root.add(beam);

  // настоящий источник света: фары освещают дома и машины впереди
  const lamp = new THREE.SpotLight(0xfff0d0, 1500, 110, 0.42, 0.8, 1.7);
  lamp.position.set(0, 0.9, t.len / 2 - 0.3);
  lamp.target.position.set(0, 0.2, 45);
  root.add(lamp, lamp.target);

  return {
    ...car,
    setColor(c) { car.mats.paint.color.setHex(c); },
    setBrake(on) { tailMat.color.setHex(on ? 0xff2412 : 0xc01008); for (const sp of tails) sp.scale.setScalar(on ? 2.0 : 1.0); },
    // ближний горит всегда; моргание — вспышка дальнего: луч бьёт дальше и ярче, но только вперёд
    setFlash(k) { beamMat.opacity = 0.55 + k * 0.45; beam.scale.set(1 + k * 0.2, 1, 42 + k * 60); lamp.intensity = 1500 * (1 + k * 1.2); lamp.distance = 110 + k * 90; },
  };
}
