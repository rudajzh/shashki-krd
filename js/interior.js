// Салон для вида из-за руля: торпедо, приборы со стрелками, руль, стойки, крыша, двери.
// Снаружи его не видно — включается только когда камера внутри. Оси машины: x — влево, y — вверх, z — вперёд.
import * as THREE from 'three';

const flat = (color) => new THREE.MeshBasicMaterial({ color });

// балка между двумя точками (стойки крыши)
function beam(g, mat, a, b, w, d) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), m = new THREE.Mesh(new THREE.BoxGeometry(w, va.distanceTo(vb), d), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.add(m);
}

export function buildInterior(spec) {
  const g = new THREE.Group(), E = spec.eye || [0.38, 1.16, -0.05], [ex, ey, ez] = E;
  const dark = flat(0x0c0d10), pad = flat(0x15171b), trim = flat(0x23262c), box = (mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  const half = spec.sw(ez) - 0.06, roofW = spec.tw(ez) + 0.06, dashY = ey - 0.2, dashZ = ez + 0.86;
  box(dark, half * 2, 0.5, 0.55, 0, dashY - 0.25, dashZ);                 // торпедо
  box(pad, half * 2, 0.03, 0.56, 0, dashY + 0.012, dashZ);                // его верх
  box(dark, 0.44, 0.07, 0.24, ex, dashY + 0.045, dashZ - 0.19);           // козырёк над приборами
  box(dark, 0.3, 0.32, 0.5, 0, dashY - 0.28, ez + 0.42);                  // центральная консоль
  const screen = box(flat(0x16304f), 0.2, 0.11, 0.012, 0, dashY - 0.07, dashZ - 0.285); // экран посередине
  screen.rotation.x = 0.25;
  box(flat(0x3f78c0), 0.16, 0.008, 0.014, 0, dashY - 0.04, dashZ - 0.292).rotation.x = 0.25;
  // приборы: рисуются на холсте, стрелки двигаются
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dials = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.135), new THREE.MeshBasicMaterial({ map: tex }));
  dials.position.set(ex, dashY - 0.035, dashZ - 0.29);
  dials.rotation.set(0.3, Math.PI, 0); // лицом к водителю, слегка завалены
  g.add(dials);
  // руль
  const wheel = new THREE.Group();
  wheel.position.set(ex, dashY - 0.13, ez + 0.47);
  wheel.rotation.x = 0.36;
  const rim = new THREE.Group();
  rim.add(new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.017, 8, 28), trim));
  for (const a of [0, 2.2, -2.2]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.014), trim); s.position.set(Math.sin(a) * 0.085, -Math.cos(a) * 0.085, 0); s.rotation.z = a; rim.add(s); }
  rim.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14).rotateX(Math.PI / 2), pad));
  wheel.add(rim);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 8).rotateX(Math.PI / 2), dark);
  col.position.z = 0.17;
  wheel.add(col);
  // подрулевой рычаг света — тот самый «лепесток»
  const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.018), trim);
  stalk.position.set(0.14, 0.02, 0.07);
  wheel.add(stalk);
  g.add(wheel);
  // стойки, крыша, двери
  for (const s of [1, -1]) {
    beam(g, dark, [s * (half + 0.06), dashY - 0.02, dashZ + 0.22], [s * (roofW + 0.04), ey + 0.27, ez + 0.32], 0.055, 0.075);
    box(dark, 0.1, 0.42, 1.5, s * (half + 0.03), dashY - 0.21, ez + 0.1);  // дверь до подоконника
    box(pad, 0.11, 0.03, 1.5, s * (half + 0.03), dashY + 0.01, ez + 0.1);
    beam(g, dark, [s * (half + 0.02), dashY, ez - 0.55], [s * roofW, ey + 0.27, ez - 0.5], 0.08, 0.14); // средняя стойка
  }
  box(dark, roofW * 2 + 0.2, 0.06, 1.3, 0, ey + 0.31, ez - 0.25);          // потолок
  box(dark, roofW * 2 + 0.2, 0.09, 0.14, 0, ey + 0.27, ez + 0.33);         // кромка над лобовым
  box(trim, 0.2, 0.06, 0.03, 0, ey + 0.18, ez + 0.36);                     // зеркало в салоне
  box(dark, half * 2, 0.5, 0.1, 0, dashY - 0.25, ez - 0.75);               // спинки сзади, чтобы не видеть улицу под собой
  box(dark, half * 2, 0.04, 1.7, 0, dashY - 0.5, ez + 0.1);                // пол
  g.visible = false;

  const c = cv.getContext('2d');
  const dial = (cx, max, val, label, red) => {
    const R = 78, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    c.lineWidth = 3; c.strokeStyle = '#3a4350'; c.beginPath(); c.arc(cx, 100, R, a0, a1); c.stroke();
    if (red) { c.strokeStyle = '#d0281c'; c.lineWidth = 5; c.beginPath(); c.arc(cx, 100, R, a0 + (a1 - a0) * red, a1); c.stroke(); }
    c.fillStyle = '#c9d3e0'; c.font = '600 15px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; c.fillText(String(Math.round(max * i / 8)), cx + Math.cos(a) * (R - 16), 100 + Math.sin(a) * (R - 16)); }
    c.fillStyle = '#7d8896'; c.font = '12px system-ui, sans-serif'; c.fillText(label, cx, 142);
    const a = a0 + (a1 - a0) * Math.max(0, Math.min(1, val / max));
    c.strokeStyle = '#ff4a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - Math.cos(a) * 10, 100 - Math.sin(a) * 10); c.lineTo(cx + Math.cos(a) * (R - 6), 100 + Math.sin(a) * (R - 6)); c.stroke();
    c.fillStyle = '#1b1e23'; c.beginPath(); c.arc(cx, 100, 9, 0, 6.3); c.fill();
  };
  return {
    group: g, eye: E,
    // kmh — скорость, rpm — обороты, gear — передача (или 'R'), turn — поворот руля в радианах
    update(kmh, rpm, gear, turn) {
      rim.rotation.z = turn;
      c.fillStyle = '#07080a'; c.fillRect(0, 0, 512, 192);
      dial(110, 8, rpm / 1000, '×1000 об/мин', 0.84);
      dial(402, 320, kmh, 'км/ч');
      c.fillStyle = '#eef3fa'; c.font = '700 44px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(Math.round(kmh)), 256, 92);
      c.fillStyle = '#8fd0ff'; c.font = '700 22px system-ui, sans-serif'; c.fillText(String(gear), 256, 138);
      tex.needsUpdate = true;
    },
  };
}
