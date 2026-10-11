// Витрина одной машины: медленно крутится, пальцем или мышью можно вращать и приближать.
import * as THREE from 'three';
import { buildCar, nightEnvironment } from './cardetail.js?v=13';
import { VEHICLES, vehicleMesh } from './vehicles.js?v=13';

const COLORS = [0x1f5fd0, 0x101214, 0xd92b2b, 0xf2f2f0, 0x6d7278, 0x1f9d55, 0xf0b400];
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.fog = new THREE.Fog(0x0b0d12, 14, 40);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const envMap = nightEnvironment(renderer);

scene.add(new THREE.HemisphereLight(0xa9bbe6, 0x4a3d32, 2.2));
const key = new THREE.DirectionalLight(0xffe2bd, 3.4);
key.position.set(4, 7, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9db8ff, 2.6);
rim.position.set(-5, 4, -6);
scene.add(rim);

// асфальт с пятном света под машиной
const gc = document.createElement('canvas');
gc.width = gc.height = 256;
const gg = gc.getContext('2d'), gr = gg.createRadialGradient(128, 128, 10, 128, 128, 128);
gr.addColorStop(0, '#3a3b40'); gr.addColorStop(0.5, '#1c1d21'); gr.addColorStop(1, '#0b0d12');
gg.fillStyle = gr; gg.fillRect(0, 0, 256, 256);
const gt = new THREE.CanvasTexture(gc);
gt.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ map: gt }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

let color = COLORS[0];
const car = buildCar({ color, envMap });
scene.add(car.root);
// кроме машины игрока можно посмотреть любую машину потока — в том виде, в каком она едет в игре
const NAMES = { player: 'Ваша', solaris: 'Седан А', rio: 'Седан Б', polo: 'Седан В', lux: 'Бизнес', paz: 'Маршрутка', bus: 'Автобус' };
let shown = car.root, kind = 'player';
function show(k) {
  kind = k;
  scene.remove(shown);
  if (k === 'player') shown = car.root;
  else { const V = VEHICLES[k]; shown = vehicleMesh(k, V.colors.includes(color) ? color : V.colors[0], envMap); }
  scene.add(shown);
  const len = k === 'player' ? 5 : VEHICLES[k].spec.len;
  view.dist = Math.max(8.2, len * 1.75); view.look = k === 'bus' || k === 'paz' ? 1.4 : 0.62;
  shadow.scale.set((k === 'player' ? 1.9 : VEHICLES[k].spec.wid) / 1.9, len / 5, 1);
  let tris = 0, parts = 0;
  shown.traverse((o) => { if (o.isMesh) { parts++; tris += o.geometry.attributes.position.count / 3; } });
  document.getElementById('info').textContent = `${Math.round(tris).toLocaleString('ru-RU')} треугольников, ${parts} ${parts === 1 ? 'вызов' : 'вызовов'} отрисовки`;
  for (const b of document.getElementById('kinds').children) b.classList.toggle('sel', b.dataset.k === k);
  document.getElementById('sw').style.visibility = k === 'player' ? 'visible' : 'hidden';
}
// мягкая тень под кузовом
const sc = document.createElement('canvas');
sc.width = sc.height = 128;
const sg = sc.getContext('2d'), sr = sg.createRadialGradient(64, 64, 8, 64, 64, 64);
sr.addColorStop(0, 'rgba(0,0,0,0.85)'); sr.addColorStop(0.6, 'rgba(0,0,0,0.55)'); sr.addColorStop(1, 'rgba(0,0,0,0)');
sg.fillStyle = sr; sg.fillRect(0, 0, 128, 128);
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 6.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.01;
scene.add(shadow);

const sw = document.getElementById('sw');
COLORS.forEach((c) => {
  const b = document.createElement('button');
  b.style.background = '#' + c.toString(16).padStart(6, '0');
  b.classList.toggle('sel', c === color);
  b.addEventListener('click', () => { color = c; car.mats.paint.color.setHex(c); for (const o of sw.children) o.classList.toggle('sel', o === b); });
  sw.append(b);
});
// камера: вращение пальцем, приближение щипком или колесом
const view = { yaw: 0.9, pitch: 0.22, dist: 8.2, look: 0.62, auto: true };
const kinds = document.getElementById('kinds');
for (const k of Object.keys(NAMES)) {
  const b = document.createElement('button');
  b.textContent = NAMES[k]; b.dataset.k = k;
  b.addEventListener('click', () => show(k));
  kinds.append(b);
}
show(new URLSearchParams(location.search).get('car') || 'player');
const ptr = new Map();
let pinch = 0;
canvas.addEventListener('pointerdown', (e) => { ptr.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); view.auto = false; });
canvas.addEventListener('pointermove', (e) => {
  const p = ptr.get(e.pointerId);
  if (!p) return;
  if (ptr.size === 1) { view.yaw -= (e.clientX - p[0]) * 0.008; view.pitch = Math.max(0.02, Math.min(1.3, view.pitch + (e.clientY - p[1]) * 0.006)); }
  ptr.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptr.size === 2) {
    const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) view.dist = Math.max(3.2, Math.min(14, view.dist * pinch / d));
    pinch = d;
  }
});
const up = (e) => { ptr.delete(e.pointerId); pinch = 0; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.dist = Math.max(3.2, Math.min(14, view.dist * (1 + e.deltaY * 0.001))); }, { passive: false });
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 58 : 40; // в вертикали машина должна помещаться целиком
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (view.auto) view.yaw += dt * 0.35;
  const cp = Math.cos(view.pitch);
  camera.position.set(Math.sin(view.yaw) * cp * view.dist, 0.55 + Math.sin(view.pitch) * view.dist, Math.cos(view.yaw) * cp * view.dist);
  camera.lookAt(0, view.look, 0);
  for (const w of car.wheels) if (w.front) w.pivot.rotation.y = Math.sin(now / 2600) * 0.25;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__show = { car, view, renderer, scene, camera, show };
