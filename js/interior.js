// Салон для вида из-за руля. У каждой машины свой: у классики — тонкий руль и круглые стрелочные приборы
// с зеленоватой подсветкой, у народного седана — серый пластик и маленький экранчик между шкалами, у спортивного
// седана и купе — цифровые щитки, у внедорожника — широкая панель из двух экранов, круглые сопла и поручень.
// Снаружи салон не виден — включается, только когда камера внутри. Оси машины: x — влево, y — вверх, z — вперёд.
import * as THREE from 'three';

const flat = (color) => new THREE.MeshBasicMaterial({ color });

const STYLES = {
  // dash/pad/trim — цвета пластика; wheel: [радиус, толщина, спицы, срез снизу]; cluster — вид приборов;
  // screen: [ширина, высота] экрана посередине (0 — нет); vents — 'round' или 'slot'; glow — цвет подсветки-полоски
  classic: { dash: 0x0b0b0c, pad: 0x161616, trim: 0x1c1c1c, wheel: [0.2, 0.011, 2, 0], cluster: 'classic', screen: null, vents: 'slot', glow: 0 },
  budget: { dash: 0x1b1d20, pad: 0x26292d, trim: 0x2b2e33, wheel: [0.185, 0.015, 4, 0], cluster: 'budget', screen: [0.13, 0.06], vents: 'slot', glow: 0 },
  sport: { dash: 0x0c0d10, pad: 0x15171b, trim: 0x23262c, wheel: [0.178, 0.019, 3, 0], cluster: 'sport', screen: [0.3, 0.12], vents: 'slot', glow: 0xff5a1e },
  super: { dash: 0x0a0a0b, pad: 0x141416, trim: 0x2a2c30, wheel: [0.172, 0.018, 3, 0.25], cluster: 'super', screen: null, vents: 'round', glow: 0xd01818 },
  lux: { dash: 0x0e0d0c, pad: 0x2a211a, trim: 0x8d9299, wheel: [0.185, 0.02, 3, 0], cluster: 'lux', screen: [0.34, 0.13], vents: 'round', glow: 0x4f9dff },
};

// балка между двумя точками (стойки крыши)
function beam(g, mat, a, b, w, d) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), m = new THREE.Mesh(new THREE.BoxGeometry(w, va.distanceTo(vb), d), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.add(m);
}

export function buildInterior(spec) {
  const g = new THREE.Group(), E = spec.eye || [0.38, 1.16, -0.05], [ex, ey, ez] = E, K = STYLES[spec.cabinStyle] || STYLES.sport;
  const dark = flat(K.dash), pad = flat(K.pad), trim = flat(K.trim);
  const box = (mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  const half = spec.sw(ez) - 0.06, roofW = spec.tw(ez) + 0.06, dashY = ey - 0.2, dashZ = ez + 0.86;
  box(dark, half * 2, 0.5, 0.55, 0, dashY - 0.25, dashZ);                 // торпедо
  box(pad, half * 2, 0.03, 0.56, 0, dashY + 0.012, dashZ);                // его верх
  const front = (spec.cabin ? spec.cabin[1] : ez + 1.1) + 0.25;           // полка до самого лобового стекла и дальше под капот
  box(dark, half * 2 + 0.1, 0.05, Math.max(0.1, front - (dashZ + 0.2)), 0, dashY - 0.01, (front + dashZ + 0.2) / 2);
  box(dark, half * 2 + 0.1, 0.6, 0.06, 0, dashY - 0.3, front);            // перегородка моторного отсека
  box(dark, 0.44, 0.07, 0.24, ex, dashY + 0.045, dashZ - 0.19);           // козырёк над приборами
  box(dark, 0.3, 0.32, 0.5, 0, dashY - 0.28, ez + 0.42);                  // центральная консоль
  const face = dashZ - 0.285; // плоскость торпедо, обращённая к водителю
  if (K.screen) {
    const [sw, sh] = K.screen, lux = K.cluster === 'lux';
    const scr = box(flat(lux ? 0x10243c : 0x101c2e), sw, sh, 0.012, lux ? -0.02 : 0, dashY - (lux ? 0.035 : 0.07), face); // экран посередине
    scr.rotation.x = 0.25;
    const bar = box(flat(lux ? 0x4f9dff : 0x3f78c0), sw * 0.8, 0.008, 0.014, scr.position.x, scr.position.y + sh * 0.3, face - 0.006);
    bar.rotation.x = 0.25;
  }
  // дефлекторы обдува
  if (K.vents === 'round') for (const x of spec.cabinStyle === 'lux' ? [-0.14, 0, 0.14] : [-0.1, 0.1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 6, 16), trim); ring.position.set(x - 0.02, dashY - (K.screen ? 0.17 : 0.07), face); g.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), flat(0x050506)); core.position.copy(ring.position); core.rotation.y = Math.PI; g.add(core);
  } else for (const x of [-0.09, 0.09]) box(flat(0x050506), 0.12, 0.035, 0.012, x, dashY - (K.screen ? 0.17 : 0.06), face);
  if (K.glow) box(flat(K.glow), half * 2 - 0.1, 0.006, 0.01, 0, dashY - 0.115, face - 0.004);            // полоска подсветки вдоль торпедо
  if (spec.cabinStyle === 'lux') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 8).rotateZ(Math.PI / 2), trim); h.position.set(-half + 0.26, dashY - 0.06, face - 0.02); g.add(h); } // поручень перед пассажиром
  // приборы: рисуются на холсте, стрелки двигаются
  const wide = K.cluster === 'lux';
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dials = new THREE.Mesh(new THREE.PlaneGeometry(wide ? 0.4 : 0.36, wide ? 0.15 : 0.135), new THREE.MeshBasicMaterial({ map: tex }));
  dials.position.set(ex, dashY - 0.035, face - 0.005);
  dials.rotation.set(0.3, Math.PI, 0); // лицом к водителю, слегка завалены
  g.add(dials);
  // руль
  const [wr, wt, spokes, cut] = K.wheel;
  const wheel = new THREE.Group();
  wheel.position.set(ex, dashY - 0.13, ez + 0.47);
  wheel.rotation.x = 0.36;
  const rim = new THREE.Group(), rimMat = flat(0x17181b); // обод всегда тёмный: кожа или пластик, спицы — в цвет отделки
  if (cut) { // срезанный снизу обод: дуга с разрывом внизу и прямая перемычка
    const phi = 0.62, arc = new THREE.Mesh(new THREE.TorusGeometry(wr, wt, 8, 26, Math.PI * 2 - 2 * phi), rimMat);
    arc.rotation.z = -Math.PI / 2 + phi;
    rim.add(arc);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * wr * Math.sin(phi), wt * 2, wt * 2), rimMat);
    bar.position.y = -wr * Math.cos(phi);
    rim.add(bar);
  } else rim.add(new THREE.Mesh(new THREE.TorusGeometry(wr, wt, 8, 28), rimMat));
  const angles = spokes === 2 ? [Math.PI / 2, -Math.PI / 2] : spokes === 4 ? [1.15, -1.15, 2.3, -2.3] : [0, 2.2, -2.2];
  for (const a of angles) { const s = new THREE.Mesh(new THREE.BoxGeometry(spokes === 2 ? 0.05 : 0.03, wr - 0.005, 0.014), trim); s.position.set(Math.sin(a) * wr / 2, -Math.cos(a) * wr / 2, 0); s.rotation.z = a; rim.add(s); }
  const hub = new THREE.Mesh(spokes === 2 ? new THREE.BoxGeometry(0.2, 0.07, 0.03) : new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14).rotateX(Math.PI / 2), pad);
  rim.add(hub);
  if (spec.cabinStyle === 'super') { const b = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), flat(0xd01818)); b.position.set(0.055, -0.06, -0.018); b.rotation.y = Math.PI; rim.add(b); } // красная кнопка пуска на руле
  wheel.add(rim);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 8).rotateX(Math.PI / 2), dark);
  col.position.z = 0.17;
  wheel.add(col);
  const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.018), trim); // подрулевой рычаг света — тот самый «лепесток»
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
  box(dark, half * 2, 0.5, 0.1, 0, dashY - 0.25, ez - 0.75);               // спинки сзади, чтобы не видеть улицу под собой
  box(dark, half * 2, 0.04, 1.7, 0, dashY - 0.5, ez + 0.1);                // пол
  g.visible = false;

  const c = cv.getContext('2d'), A0 = Math.PI * 0.8, A1 = Math.PI * 2.2;
  // стрелочная шкала: o — оформление
  const dial = (cx, cy, R, max, val, o) => {
    c.lineWidth = o.ring || 3; c.strokeStyle = o.rim; c.beginPath(); c.arc(cx, cy, R, A0, A1); c.stroke();
    if (o.red) { c.strokeStyle = '#d0281c'; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, R, A0 + (A1 - A0) * o.red, A1); c.stroke(); }
    c.fillStyle = o.num; c.font = `600 ${o.size || 15}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const n = o.ticks || 8;
    for (let i = 0; i <= n; i++) { const a = A0 + (A1 - A0) * i / n; c.fillText(String(Math.round(max * i / n)), cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16)); }
    if (o.label) { c.fillStyle = o.dim; c.font = '12px system-ui, sans-serif'; c.fillText(o.label, cx, cy + R * 0.55); }
    const a = A0 + (A1 - A0) * Math.max(0, Math.min(1, val / max));
    c.strokeStyle = o.needle; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); c.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); c.stroke();
    c.fillStyle = o.hub || '#1b1e23'; c.beginPath(); c.arc(cx, cy, 9, 0, 6.3); c.fill();
  };
  // цифровое кольцо: дуга заполняется по значению
  const ring = (cx, cy, R, frac, color) => {
    c.lineWidth = 10; c.strokeStyle = '#1c222b'; c.beginPath(); c.arc(cx, cy, R, A0, A1); c.stroke();
    c.strokeStyle = color; c.beginPath(); c.arc(cx, cy, R, A0, A0 + (A1 - A0) * Math.max(0, Math.min(1, frac))); c.stroke();
  };
  const text = (s, x, y, font, color) => { c.fillStyle = color; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, x, y); };
  const draw = {
    // две большие шкалы и три маленьких указателя, зеленоватая подсветка, оранжевые стрелки; никаких цифр на экране
    classic(kmh, rpm) {
      c.fillStyle = '#050605'; c.fillRect(0, 0, 512, 192);
      const o = { rim: '#39453a', num: '#b9d6b2', dim: '#6f8a6c', needle: '#ff8a1e', hub: '#0d0f0d' };
      dial(150, 100, 80, 180, Math.min(180, kmh), { ...o, ticks: 9, label: 'км/ч' });
      dial(350, 100, 62, 8, rpm / 1000, { ...o, red: 0.8, size: 13, label: '×1000' });
      for (const [x, v] of [[452, 0.6], [492, 0.45]]) { c.strokeStyle = '#39453a'; c.lineWidth = 2; c.beginPath(); c.arc(x, 150, 16, Math.PI, 2 * Math.PI); c.stroke(); c.strokeStyle = '#ff8a1e'; c.beginPath(); c.moveTo(x, 150); c.lineTo(x - Math.cos(Math.PI * v) * 14, 150 - Math.sin(Math.PI * v) * 14); c.stroke(); }
    },
    // две шкалы и маленький экранчик между ними: передача и пробег
    budget(kmh, rpm, gear) {
      c.fillStyle = '#0a0b0d'; c.fillRect(0, 0, 512, 192);
      const o = { rim: '#4a5058', num: '#e6e9ee', dim: '#8a9099', needle: '#ff3b20' };
      dial(120, 100, 78, 8, rpm / 1000, { ...o, red: 0.8, label: '×1000' });
      dial(392, 100, 78, 200, Math.min(200, kmh), { ...o, ticks: 10, size: 13, label: 'км/ч' });
      c.fillStyle = '#1d3a2a'; c.fillRect(214, 104, 84, 46);
      text(String(gear), 256, 120, '700 20px ui-monospace, monospace', '#9cf0b4'); text('048213', 256, 140, '12px ui-monospace, monospace', '#6fbf88');
    },
    // цифровой щиток спортивного седана: два кольца, скорость крупно посередине
    sport(kmh, rpm, gear) {
      c.fillStyle = '#07080a'; c.fillRect(0, 0, 512, 192);
      ring(105, 100, 74, kmh / 330, '#ff7a2a'); ring(407, 100, 74, rpm / 8000, rpm > 6600 ? '#ff2a1a' : '#ff7a2a');
      text(String(Math.round(kmh)), 105, 96, '700 34px system-ui, sans-serif', '#eef3fa'); text('км/ч', 105, 126, '12px system-ui, sans-serif', '#8a93a0');
      text((rpm / 1000).toFixed(1), 407, 96, '700 30px system-ui, sans-serif', '#eef3fa'); text('×1000', 407, 126, '12px system-ui, sans-serif', '#8a93a0');
      text(String(gear), 256, 92, '800 54px system-ui, sans-serif', '#ffffff'); text('SPORT', 256, 140, '700 13px system-ui, sans-serif', '#ff7a2a');
    },
    // купе: один экран, огромный тахометр по центру, скорость внутри него
    super(kmh, rpm, gear) {
      c.fillStyle = '#050506'; c.fillRect(0, 0, 512, 192);
      dial(256, 104, 84, 9, rpm / 1000, { rim: '#3b3f46', num: '#f2f4f7', dim: '#8a93a0', needle: '#ff2018', ticks: 9, red: 0.86, ring: 4 });
      c.fillStyle = '#050506'; c.beginPath(); c.arc(256, 104, 44, 0, 6.3); c.fill();
      text(String(Math.round(kmh)), 256, 98, '800 36px system-ui, sans-serif', '#ffffff'); text('км/ч', 256, 124, '11px system-ui, sans-serif', '#8a93a0');
      text(String(gear), 440, 100, '800 46px system-ui, sans-serif', '#ff3a2a'); text('V10', 74, 100, '700 20px system-ui, sans-serif', '#6c737d');
    },
    // внедорожник: широкая панель, две цифровые шкалы с синей подсветкой
    lux(kmh, rpm, gear) {
      const gr = c.createLinearGradient(0, 0, 0, 192); gr.addColorStop(0, '#05080d'); gr.addColorStop(1, '#0a1626');
      c.fillStyle = gr; c.fillRect(0, 0, 512, 192);
      const o = { rim: '#2c6fc0', num: '#dfeaff', dim: '#7ea2d6', needle: '#ffffff', hub: '#0a1626' };
      dial(112, 100, 80, 260, Math.min(260, kmh), { ...o, ticks: 13, size: 12, label: 'км/ч' });
      dial(400, 100, 80, 7, rpm / 1000 * 0.82, { ...o, ticks: 7, red: 0.85, label: '×1000' });
      text(String(Math.round(kmh)), 256, 88, '700 44px system-ui, sans-serif', '#ffffff'); text(String(gear), 256, 134, '700 22px system-ui, sans-serif', '#7fb6ff');
    },
  };
  return {
    group: g, eye: E,
    // kmh — скорость, rpm — обороты, gear — передача (или 'R'), turn — поворот руля в радианах
    update(kmh, rpm, gear, turn) {
      rim.rotation.z = turn;
      draw[K.cluster](kmh, rpm, gear);
      tex.needsUpdate = true;
    },
  };
}
