import * as THREE from 'three';
import { buildWorld } from './world.js?v=11';
import { Car, alignSteer, steerLockAt } from './car.js?v=11';
import { LANE_W, laneOffset, halfWidth } from './chain.js?v=11';
import { makePlayerCar } from './playercar.js?v=11';
import { nightEnvironment } from './cardetail.js?v=11';
import { Traffic } from './traffic.js?v=11';
import { Input } from './input.js?v=11';
import { Sound } from './audio.js?v=11';
import { Loop } from './loop.js?v=11';
import { Smoke } from './smoke.js?v=11';
import { Signals } from './signals.js?v=11';
import { Rain } from './weather.js?v=11';
import { Chase } from './chase.js?v=11';

const $ = (id) => document.getElementById(id);
const COLORS = [0xd92b2b, 0xf2f2f0, 0x15171a, 0x1f5fd0, 0xf0b400, 0x1f9d55, 0x7a2bd9];
const FOG = 0x141a2c; // ночная дымка у горизонта
const STEP = 1 / 240;

const store = {
  get(k, d) { try { const v = localStorage.getItem('shashki.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('shashki.' + k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};

// ---------- сцена ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
// ночное небо: тёмный верх, у горизонта — зарево города
{
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#04060d'); gr.addColorStop(0.45, '#0b1122'); gr.addColorStop(0.72, '#1b1f3a'); gr.addColorStop(0.86, '#3a2a40'); gr.addColorStop(1, '#3a2a40');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(FOG, 90, 780);
// мягкий рассеянный свет: холодный сверху, тёплый отсвет фонарей снизу, слабая «луна» для объёма
scene.add(new THREE.HemisphereLight(0x6f84b8, 0x4a3a2c, 1.25));
const moon = new THREE.DirectionalLight(0x9db4e6, 0.55);
moon.position.set(-0.5, 1, 0.4);
scene.add(moon);
const camera = new THREE.PerspectiveCamera(62, 1, 0.6, 1500);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- игра ----------
const data = await (await fetch('data/krasnaya.json?v=11')).json();
const world = buildWorld(data, scene);
const N = world.chains.north;
const car = new Car();
let color = store.get('color', COLORS[0]);
const envMap = nightEnvironment(renderer); // отражения ночной улицы на лаке и стёклах
const model = makePlayerCar(color, world.glowTex, envMap); // детальная машина со своим светом
scene.add(model.root);
const traffic = new Traffic(scene, world.chains, world.glowTex, world.poolTex, envMap);
const loop = new Loop(world, data);
const smoke = new Smoke(scene);
const signals = new Signals(scene, world, world.glowTex, envMap);
traffic.signals = signals;
const rain = new Rain(scene);
const chase = new Chase(scene, world, world.glowTex, envMap, data.turns.patrolZ);
signals.traffic = traffic;
const START_LAP = Math.max(1, Math.min(9, +new URLSearchParams(location.search).get('lap') || 1)); // для проверки: ?lap=3
const input = new Input();
const sound = new Sound();
const PW = { hl: model.type.len / 2, hw: model.type.wid / 2 };

const G = {
  state: 'menu', // menu | drive | crash | finish
  score: 0, combo: 1, comboT: 0, near: 0, top: 0, time: 0, stateT: 0, lap: 1, grace: 0, turns: 0, blend: 1,
  launch: { ready: false, armed: false, greenAt: -1, boost: 0, stall: 0, was: 'g' },
  routeI: -1, shake: 0, camYaw: 0, wheelSpin: 0, roll: 0, pitch: 0, lift: 0, handsOff: 9, flashT: 0,
};
const inp = { steer: 0, throttle: 0, brake: 0, handbrake: false, launch: false };
const idle = { steer: 0, throttle: 0, brake: 0, handbrake: true };
const events = { crash: null, crashRel: 0, near: [], honk: false };
const tmp = {}, rp = { i: -1 };

function placeAtStart() {
  const pk = loop.parking(world); // машина ждёт на площадке у театра, носом к дороге
  car.reset(pk.x, pk.z, pk.yaw);
  G.camYaw = car.yaw;
  G.routeI = -1; rp.i = -1;
  loop.active = null;
  traffic.density = densityFor(1);
  traffic.reset(car);
  traffic.setStalled('north', []); traffic.setStalled('south', []);
  Object.assign(G.launch, { ready: false, armed: false, greenAt: -1, boost: 0, stall: 0, was: 'g' });
  $('launchBtn').hidden = true; $('launchTip').hidden = true;
  signals.setEnabled(false);
  rain.reset();
  chase.reset();
  car.gripK = 1;
}

// где поставить сломанные машины: подальше от разворотов, перекрёстков и друг от друга
function stalledSpots(key, count) {
  const c = world.chains[key], from = key === 'north' ? world.startS + 260 : 260, to = key === 'north' ? loop.linkS - 260 : loop.southS - 260, out = [];
  for (let tries = 0; tries < 60 && out.length < count; tries++) {
    const at = from + Math.random() * (to - from);
    if (world.crossings.some((x) => x.k === key && Math.abs(x.s - at) < 55) || out.some((o) => Math.abs(o - at) < 380) || at > c.total - 60) continue;
    out.push(at);
  }
  return out;
}

// Полный экран. На Android и компьютере разворачиваем сами по нажатию «Поехали».
// На айфоне Safari этого не разрешает — там игра занимает весь экран только при запуске с иконки на «Домой».
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const coarse = matchMedia('(pointer: coarse)').matches;
function goFullscreen() {
  if (!coarse || standalone || document.fullscreenElement || window.self !== window.top) return;
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    Promise.resolve(req.call(el, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => { /* браузер не разрешил — играем как есть */ });
  } catch { /* старый Safari */ }
}

// Сложность растёт от круга к кругу: на первом выезжает 80 % потока, с третьего — весь.
const densityFor = (lap) => Math.min(1, 0.8 + 0.1 * (lap - 1));

function startRun() {
  goFullscreen();
  placeAtStart();
  Object.assign(G, { state: 'drive', score: 0, combo: 1, comboT: 0, near: 0, top: 0, time: 0, stateT: 0, shake: 0, lap: START_LAP, grace: 0, turns: (START_LAP - 1) * 2, blend: 0, why: '' });
  traffic.density = densityFor(G.lap);
  if (G.lap >= 3) signals.setEnabled(true);
  if (G.turns > 0) { traffic.setStalled('north', stalledSpots('north', Math.min(3, Math.ceil(G.turns / 2)))); }
  loop.intro(car, world); // срываемся с площадки на дорогу
  $('menu').hidden = true; $('result').hidden = true; $('hud').hidden = false;
  $('drift').hidden = true;
  $('touch').hidden = !matchMedia('(pointer: coarse)').matches;
  sound.start();
}

function endRun(kind) {
  G.state = kind; G.stateT = 0;
  $('launchBtn').hidden = true; $('launchTip').hidden = true;
  $('drift').hidden = true;
  const best = store.get('best', 0), total = Math.round(G.score);
  if (total > best) store.set('best', total);
  $('resTitle').textContent = kind === 'busted' ? 'Приплыли' : G.why === 'curb' ? 'Зацепил бордюр' : 'Авария';
  $('resText').textContent = (kind === 'busted' ? 'Патруль догнал · ' : '') + `${fmtTime(G.time)} за рулём · максимум ${Math.round(G.top * 3.6)} км/ч` + (total > best && best > 0 ? ' · новый рекорд' : '');
  $('resScore').textContent = total.toLocaleString('ru-RU');
  $('resNear').textContent = G.near;
  $('resTop').textContent = G.lap;
}

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function showMenu() {
  G.state = 'menu';
  placeAtStart();
  $('menu').hidden = false; $('result').hidden = true; $('hud').hidden = true; $('touch').hidden = true;
  const best = store.get('best', 0);
  $('best').textContent = best ? `Рекорд: ${best.toLocaleString('ru-RU')}` : '';
}

let popT = 0;
function pop(text) {
  const el = $('pop');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  popT = 0.9;
}

// ---------- один шаг игры ----------
function tick(dt) {
  const driving = G.state === 'drive';
  input.read(inp);
  const ctl = driving ? inp : idle;
  if (driving && !loop.active) launchControl(dt);
  // Руль отпущен: машина сама вписывается в изгибы улицы (это не возврат, а просто «дорога ведёт»),
  // а лёгкий «магнит» к полосе включается через полсекунды и набирает силу ещё секунду.
  if (inp.steer !== 0) G.handsOff = 0;
  else if (driving) {
    G.handsOff += dt;
    const a = roadAssist();
    if (a) {
      const w = Math.max(0, Math.min(1, (G.handsOff - 0.5) / 1.0));
      inp.steer = Math.max(-1, Math.min(1, a.bend + a.pull * w * w * (3 - 2 * w)));
    }
  }
  // моргнуть фарами: машина впереди уступает полосу
  if (G.flashT > 0) G.flashT -= dt;
  if (input.takeFlash() && driving && G.flashT <= 0.1) {
    G.flashT = 0.42;
    traffic.flash(car);
    sound.flash();
  }
  const px = car.x, pz = car.z;
  if (driving) loop.maybeStart(car, traffic.proj);
  if (driving && loop.active) {
    // разворот: машину ведёт игра, поток расступается, игрок нажатиями держит занос
    const a = loop.active;
    if (a.fresh) {
      if (a.center) traffic.clearNear(a.center[0], a.center[1], 62); else traffic.clearNear(car.x, car.z, a.auto ? 30 : 70);
      traffic.hold(...a.hold);
      $('drift').hidden = !!a.auto;
    }
    loop.feed(inp.throttle > 0, dt); // занос держится, пока нажат газ
    traffic.clearNear(car.x, car.z, 22);
    if (!a.auto) { G.score += a.power * 260 * dt * G.lap; $('driftBar').style.width = Math.round(a.power * 100) + '%'; }
    const done = loop.update(dt, car);
    G.grace = 1.2;
    if (done) turnDone(done);
  } else {
    let acc = dt;
    while (acc > 1e-6) { const h = Math.min(STEP, acc); car.step(h, ctl); acc -= h; }
    // бордюр, дома и деревья: задел на скорости — заезд окончен, на малой просто упираемся
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx;
    const hN = traffic.proj.north.i, hS = traffic.proj.south.i;
    let solid = false;
    for (const [a, b] of [[PW.hl, PW.hw], [PW.hl, -PW.hw], [-PW.hl, PW.hw], [-PW.hl, -PW.hw], [PW.hl, 0]]) {
      const cx = car.x + fx * a + lx * b, cz = car.z + fz * a + lz * b;
      if (world.offRoad(cx, cz, hN, hS) || world.hitsSolid(cx, cz)) { solid = true; break; }
    }
    if (solid) {
      const hit = car.speed;
      car.x = px; car.z = pz;
      car.vx *= -0.25; car.vz *= -0.25; car.r *= 0.3;
      if (driving && hit > 7 && G.grace <= 0) { crash(hit, 'curb'); }
    }
  }
  if (G.grace > 0) G.grace -= dt;

  events.crash = null; events.near.length = 0; events.honk = false;
  traffic.update(dt, car, PW, events);
  signals.update(dt, car, PW, events);
  if (events.honk && driving) sound.horn();
  // дождь: мокрая дорога держит хуже, видно ближе
  if (rain.update(dt, car, driving && !loop.active) && driving) pop(rain.on ? 'Дождь — скользко' : 'Дождь кончился');
  car.gripK = 1 - 0.24 * rain.wet;
  scene.fog.far = 780 - 300 * rain.wet;
  $('rain').hidden = !(driving && rain.wet > 0.4);

  if (driving) {
    G.time += dt;
    const v = car.speed;
    if (v > G.top) G.top = v;
    // очки за скорость: быстрее 60 км/ч начисляются, и чем быстрее — тем больше
    if (v > 16.7) G.score += dt * (v - 12) * (v / 30) * G.combo * 0.5;
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 1; }
    for (const n of events.near) {
      G.near++;
      G.combo = Math.min(10, G.combo + 1);
      chase.boost(14 + G.combo * 1.5); // каждый проход впритирку — ещё несколько корпусов отрыва
      G.comboT = 5;
      const pts = Math.round((n.oncoming ? 300 : 120) * (n.speed / 28) * (n.gap < 0.5 ? 1.5 : 1)) * G.combo;
      G.score += pts;
      pop(`${n.oncoming ? 'В лоб' : n.gap < 0.5 ? 'Впритирку' : 'Близко'} +${pts}`);
      sound.whoosh();
      $('comboBox').classList.add('bump');
      setTimeout(() => $('comboBox').classList.remove('bump'), 140);
    }
    if (events.crash && G.grace > 0) events.crash = null;
    if (events.crash) {
      const o = events.crash;
      // расталкиваем: игрок получает часть скорости встречной машины и теряет свою
      car.vx = car.vx * 0.25 + o.dx * o.v * 0.5; car.vz = car.vz * 0.25 + o.dz * o.v * 0.5;
      car.r += (Math.random() - 0.5) * 3;
      o.v *= 0.3;
      crash(events.crashRel);
    } else {
      G.left = loop.distance(traffic.proj);
    }
    // погоня
    const res = chase.update(dt, car, traffic.proj, !!loop.active);
    if (res === 'caught' && G.state === 'drive') { sound.siren(1); sound.crash(); endRun('busted'); }
    else if (res === 'escaped') { const b = 1500 * G.lap; G.score += b; pop(`Оторвался · +${b}`); }
    $('chase').hidden = !chase.active;
    if (chase.active) { $('chaseGap').textContent = Math.max(0, Math.round(chase.gap)) + ' м'; $('chase').classList.toggle('close', chase.gap < 70); }
  } else {
    G.stateT += dt;
    if ((G.state === 'crash' || G.state === 'busted') && G.stateT > 0.9 && $('result').hidden) { $('result').hidden = false; $('hud').hidden = true; $('touch').hidden = true; }
  }
}

// Старт со светофора. Если игрок стоит первым у стоп-линии на красный, появляется кнопка «ЛАНЧ»:
// зажал газ и её, отпустил ровно на зелёный — машина выстреливает вперёд и даёт очки.
function launchControl(dt) {
  const L = G.launch, key = traffic.only, p = traffic.proj[key];
  if (L.boost > 0) { L.boost -= dt; if (inp.throttle > 0) { const k = 6 * dt; car.vx += Math.sin(car.yaw) * k; car.vz += Math.cos(car.yaw) * k; } }
  if (L.stall > 0) { L.stall -= dt; inp.throttle = 0; }
  const sig = signals.enabled ? signals.ahead(key, p.s + PW.hl) : null;
  const atLine = sig && sig.dist < 11 && sig.dist > -1.5 && p.d < 12 && p.facing > 0;
  // первый ли: между нами и стоп-линией никого
  let first = atLine;
  if (first) for (const c of traffic.cars) if (c.active && c.key === key && c.s > p.s && c.s - c.hl < p.s + PW.hl + sig.dist + 1 && Math.abs(c.off - p.lat) < 1.9) { first = false; break; }
  const red = sig && sig.state !== 'g';
  L.ready = !!(first && (red || L.armed) && car.speed < 1.2);
  if (L.ready && red && inp.launch && inp.throttle > 0) L.armed = true;
  if (L.armed) {
    if (sig && L.was !== 'g' && sig.state === 'g') L.greenAt = G.time;       // загорелся зелёный
    if (inp.launch && inp.throttle > 0) {                                    // держим: машина стоит на тормозе, мотор ревёт
      inp.throttle = 0; inp.brake = 0; car.vx = car.vz = 0; car.r = 0; car.rpm += (5600 - car.rpm) * Math.min(1, dt * 8);
      if (L.greenAt >= 0 && G.time - L.greenAt > 1.6) { L.armed = false; L.greenAt = -1; pop('Проспал'); }
    } else {                                                                 // отпустили
      const late = L.greenAt < 0 ? -1 : G.time - L.greenAt;
      if (late < 0) { L.stall = 0.9; pop('Фальстарт'); }
      else if (late <= 0.4) { const b = 1200 * G.lap; G.score += b; L.boost = 1.8; car.vx += Math.sin(car.yaw) * 5; car.vz += Math.cos(car.yaw) * 5; pop(`Идеальный старт · +${b}`); sound.whoosh(); }
      else if (late <= 1.0) { const b = 400 * G.lap; G.score += b; L.boost = 1.2; pop(`Хороший старт · +${b}`); }
      else pop('Поздно');
      L.armed = false; L.greenAt = -1;
    }
  }
  L.was = sig ? sig.state : 'g';
  $('launchBtn').hidden = !L.ready;
  $('launchTip').hidden = !L.ready;
}

// Помощь, когда руль отпущен. bend — руль, нужный, чтобы ехать по изгибу улицы; pull — слабая
// поправка к направлению и середине полосы. Работает только на проезжей части Красной.
function roadAssist() {
  if (car.speed < 9) return null;
  let best = null;
  for (const key of ['north', 'south']) {
    const p = traffic.proj[key];
    if (p.d < halfWidth(p.lf) + 2 && (!best || p.d < best.d)) best = p;
  }
  if (!best) return null;
  const along = Math.sin(car.yaw) * best.dx + Math.cos(car.yaw) * best.dz >= 0 ? 1 : -1;
  // чуть-чуть тянем к середине ближайшей полосы: цель — точка на её оси в 55 м впереди
  const lane = Math.max(0, Math.min(best.lanes - 1, Math.round(best.lf / 2 - 0.5 - best.lat / LANE_W)));
  const aim = Math.atan2(laneOffset(lane, best.lf) - best.lat, 55);
  const yaw = Math.atan2(best.dx, best.dz) + (along > 0 ? aim : Math.PI - aim);
  const d = Math.atan2(Math.sin(yaw - car.yaw), Math.cos(yaw - car.yaw));
  if (Math.abs(d) > 0.6) return null;
  const wheelbase = car.s.a + car.s.b;
  return { bend: wheelbase * best.kappa * along / steerLockAt(Math.abs(car.u), car.s), pull: alignSteer(car, yaw) };
}

// Разворот пройден: премия (за удержанный занос — больше). С каждым разворотом дорога сложнее:
// появляются сломанные машины, с третьего круга включаются светофоры, после полного круга — погоня.
function turnDone(res) {
  traffic.release();
  traffic.clearNear(car.x, car.z, 30); // на выходе никто не должен стоять вплотную
  G.grace = 1.5;
  $('drift').hidden = true;
  G.handsOff = 9;
  if (res.kind === 'intro') return;
  const k = Math.min(1, res.drift * 1.15), pct = Math.round(k * 100);
  const bonus = Math.round((300 + 900 * k) * G.lap / 10) * 10;
  G.score += bonus;
  G.turns++;
  const what = pct >= 45 ? `Дрифт ${pct}%` : 'Разворот';
  const next = res.kind === 'south' ? 'north' : 'south';
  traffic.setStalled(next, stalledSpots(next, Math.min(3, Math.ceil(G.turns / 2))));
  if (res.kind === 'south') {
    G.lap++;
    traffic.density = densityFor(G.lap);
    if (G.lap >= 3 && !signals.enabled) { signals.setEnabled(true); pop(`${what} · круг ${G.lap} · светофоры!`); }
    else pop(`${what} · круг ${G.lap} · +${bonus}`);
    if (!chase.active) { chase.start(G.lap); sound.siren(1); }
  } else pop(`${what} · +${bonus}`);
}

function crash(rel, why) {
  if (G.state !== 'drive') return;
  G.why = why || 'car';
  G.shake = Math.min(1.2, 0.35 + rel / 30);
  sound.crash();
  endRun('crash');
}

// ---------- картинка ----------
function draw(dt) {
  const v = car.speed, t = model.type;
  model.root.position.set(car.x, 0, car.z);
  model.root.rotation.y = car.yaw;
  const k = Math.min(1, dt * 8);
  G.roll += (Math.max(-0.07, Math.min(0.07, car.ay * 0.0055)) - G.roll) * k;
  G.pitch += (Math.max(-0.045, Math.min(0.045, -car.ax * 0.004)) - G.pitch) * k;
  model.chassis.rotation.z = G.roll;
  model.chassis.rotation.x = G.pitch;
  G.wheelSpin += car.u / t.wheel * dt;
  for (const w of model.wheels) {
    w.mesh.rotation.x = G.wheelSpin * (w.side || 1); // правое колесо развёрнуто, крутится «в другую сторону»
    if (w.front) w.pivot.rotation.y = car.steer;
  }
  model.setFlash(G.flashT > 0.27 || (G.flashT > 0.03 && G.flashT < 0.17) ? 1 : 0);
  model.setBrake(G.state !== 'drive' ? true : loop.active ? loop.active.v > loop.active.speedAt(loop.active.s) + 1 : inp.brake > 0 || inp.handbrake);

  // камера за машиной: поворачивается с запаздыванием, чтобы занос был виден
  let d = (loop.active ? loop.active.yaw : car.yaw) - G.camYaw; // в заносе камера идёт по траектории, кузов поворачивается на глазах
  d = Math.atan2(Math.sin(d), Math.cos(d));
  G.camYaw += d * Math.min(1, dt * 5.5);
  const cx = Math.sin(G.camYaw), cz = Math.cos(G.camYaw);
  // после аварии камера отъезжает вверх, чтобы не оказаться внутри чужой машины
  G.lift += ((G.state === 'crash' ? 1 : 0) - G.lift) * Math.min(1, dt * 3);
  const dist = 6.0 + Math.min(1.9, v * 0.028) + G.lift * 3.5, height = 1.95 + Math.min(0.35, v * 0.005) + G.lift * 4.5;
  G.shake *= Math.exp(-dt * 4);
  const sh = G.shake + Math.max(0, v - 22) * 0.0011;
  // В меню камера медленно обходит машину спереди; на старте плавно перелетает за неё.
  const now = performance.now() / 1000, oa = car.yaw + 0.75 + Math.sin(now * 0.25) * 0.35;
  const mx = car.x + Math.sin(oa) * 7.2, mz = car.z + Math.cos(oa) * 7.2, my = 1.5;
  if (G.state === 'drive' && G.blend < 1) G.blend = Math.min(1, G.blend + dt / 2.6);
  const bl = G.state === 'menu' ? 0 : G.blend * G.blend * (3 - 2 * G.blend);
  const px = car.x - cx * dist, pz = car.z - cz * dist;
  camera.position.set(mx + (px - mx) * bl + (Math.random() - 0.5) * sh, my + (height - my) * bl + (Math.random() - 0.5) * sh, mz + (pz - mz) * bl + (Math.random() - 0.5) * sh);
  camera.lookAt(car.x + cx * 8 * bl, 0.8 + 0.2 * bl, car.z + cz * 8 * bl);
  if (G.freeCam) { const f = G.freeCam; camera.position.set(f[0], f[1], f[2]); camera.lookAt(f[3], f[4], f[5]); } // отладка: свободная камера
  // угол обзора быстро раскрывается до ~100 км/ч и дальше растёт плавно — скорость чувствуется раньше
  const fov = 60 + 22 * (1 - Math.exp(-v / 26));
  if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  $('vig').style.opacity = G.state === 'drive' ? Math.max(0, Math.min(1, (v - 18) / 45)).toFixed(2) : '0';

  if (G.state === 'drive') {
    $('speed').textContent = Math.round(Math.abs(car.u) * 3.6);
    $('gear').textContent = car.reverse && car.u < 0.6 ? 'R' : car.gear;
    $('score').textContent = Math.round(G.score).toLocaleString('ru-RU');
    $('combo').textContent = '×' + G.combo;
    $('comboBox').classList.toggle('live', G.combo > 1);
    $('lapLabel').textContent = `Круг ${G.lap} · до разворота`;
    const left = G.left ?? 0;
    $('left').textContent = left >= 1000 ? (left / 1000).toFixed(1).replace('.', ',') + ' км' : Math.round(left / 10) * 10 + ' м';
  }
  // дым из-под задних колёс в заносе
  if (G.state === 'drive' && car.slip > 0.3 && v > 6) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx;
    for (const s of [-1, 1]) if (Math.random() < car.slip * 0.9) smoke.emit(car.x - fx * 1.4 + lx * s * 0.8, 0.25, car.z - fz * 1.4 + lz * s * 0.8, car.vx * 0.25, car.vz * 0.25, car.slip);
  }
  smoke.update(dt, camera, renderer.domElement.height);
  sound.weather(rain.wet, chase.active && G.state === 'drive' ? Math.max(0, 1 - chase.gap / 200) : 0);
  $('cops').style.opacity = chase.active && G.state === 'drive' && chase.gap < 90 ? (0.55 * (1 - chase.gap / 90) * (Math.floor(chase.flash * 5) % 2 ? 1 : 0.35)).toFixed(2) : '0';
  $('cops').classList.toggle('blue', Math.floor(chase.flash * 5) % 2 === 0);
  sound.update(car.rpm, G.state === 'drive' ? inp.throttle : 0, car.slip, v, G.state === 'drive');
  renderer.render(scene, camera);
}

let last = performance.now(), clockAt = 0;
function frame(now) {
  if (world.tickClock && now - clockAt > 20000) { clockAt = now; world.tickClock(); } // электронные часы на здании идут по-настоящему
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  draw(dt);
  requestAnimationFrame(frame);
}

// ---------- меню ----------
const sw = $('swatches');
COLORS.forEach((c) => {
  const b = document.createElement('button');
  b.style.background = '#' + c.toString(16).padStart(6, '0');
  b.classList.toggle('sel', c === color);
  b.addEventListener('click', () => {
    color = c; store.set('color', c); model.setColor(c);
    for (const o of sw.children) o.classList.toggle('sel', o === b);
  });
  sw.append(b);
});
$('go').addEventListener('click', startRun);
$('again').addEventListener('click', startRun);
$('toMenu').addEventListener('click', showMenu);
$('mute').addEventListener('click', () => { sound.setMuted(!sound.muted); $('mute').textContent = sound.muted ? '🔇' : '🔊'; });
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && G.state !== 'menu') startRun();
  if (e.code === 'Enter' && G.state !== 'drive') startRun();
});
addEventListener('contextmenu', (e) => e.preventDefault());
// Safari на айфоне игнорирует запрет масштаба в meta — гасим щипок и двойное касание сами
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now();
  if (now - lastTouchEnd < 350) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { last = performance.now(); });

$('install').hidden = !(isIOS && !standalone);
showMenu();
requestAnimationFrame(frame);
window.__game = { G, car, world, traffic, input, loop, signals, rain, chase, tick, draw, startRun, renderer, scene, camera, LANE_W };
