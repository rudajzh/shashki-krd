import * as THREE from 'three';
import { buildWorld } from './world.js?v=23';
import { Car, alignSteer, steerLockAt, CARS } from './car.js?v=23';
import { LANE_W, laneOffset, rowOffset, rowAt, halfWidth } from './chain.js?v=23';
import { makePlayerCar } from './playercar.js?v=23';
import { nightEnvironment, SEDAN, COUPE } from './cardetail.js?v=23';
import { GELIK, PRIORA, CLASSIC } from './vehicles.js?v=23';
import { Traffic } from './traffic.js?v=23';
import { Input } from './input.js?v=23';
import { Sound } from './audio.js?v=23';
import { Loop } from './loop.js?v=23';
import { Smoke } from './smoke.js?v=23';
import { Signals } from './signals.js?v=23';
import { Rain } from './weather.js?v=23';
import { Chase } from './chase.js?v=23';
import { Streaks } from './streaks.js?v=23';
import { SpeedBlur } from './post.js?v=23';
import { Mirror } from './mirror.js?v=23';
import { Ads } from './ads.js?v=23';

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
const blur = new SpeedBlur(renderer);
const mirror = new Mirror(renderer);
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
  blur.setSize(w, h, renderer.getPixelRatio());
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- игра ----------
const data = await (await fetch('data/krasnaya.json?v=23')).json();
const world = buildWorld(data, scene);
const N = world.chains.north;
const SPECS = { sedan: SEDAN, coupe: COUPE, gelik: GELIK, lada: PRIORA, seven: CLASSIC };
// ---------- экономика ----------
// За заезд игрок получает «рубли» — по rate за каждое очко. На них открываются машины (по порядку ORDER) и цвета.
// Цены прикинуты так: «Лада» — за 20–30 минут игры на «Семёрке», купе — за 10–12 часов; ролик удваивает выручку.
// Все цифры — здесь, чтобы их было легко подкрутить после первых живых заездов.
const ECON = { rate: 1.5, prices: { seven: 0, lada: 150000, sedan: 900000, gelik: 2000000, coupe: 4000000 }, color: 40000, freeColors: [0xf2f2f0, 0x15171a, 0xd92b2b] };
const ORDER = ['seven', 'lada', 'sedan', 'gelik', 'coupe'];
const UNLOCK_ALL = new URLSearchParams(location.search).has('all'); // для проверки: всё открыто
let cash = store.get('cash', 0);
const owned = new Set(store.get('owned', ['seven'])), ownedColors = new Set(store.get('colors', ECON.freeColors));
const has = (id) => UNLOCK_ALL || owned.has(id), hasColor = (c) => UNLOCK_ALL || ownedColors.has(c);
const money = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
let carId = store.get('car', 'seven'); // на какой машине ездим
if (!CARS[carId] || !has(carId)) carId = 'seven';
const car = new Car(CARS[carId].setup);
let color = store.get('color', ECON.freeColors[2]);
if (!hasColor(color)) color = ECON.freeColors[2];
let lightsOn = store.get('lights', true); // играть со светофорами или без
const envMap = nightEnvironment(renderer); // отражения ночной улицы на лаке и стёклах
let model = makePlayerCar(color, world.glowTex, envMap, SPECS[carId]); // детальная машина со своим светом
scene.add(model.root);
const traffic = new Traffic(scene, world.chains, world.glowTex, world.poolTex, envMap);
const loop = new Loop(world, data);
// перед разворотами крайний ряд свободен: у «Авроры» заходим через левый, у театра — от правого бордюра
traffic.clearRows = [{ key: 'north', s0: loop.linkS - 330, s1: loop.linkS + 40, side: 1 }, { key: 'south', s0: loop.southS - 300, s1: loop.southS + 20, side: -1 }];
const smoke = new Smoke(scene);
const streaks = new Streaks(scene);
const spray = new Smoke(scene, 260, 0xb9d0ea); // водяная пыль из-под колёс в дождь
// Лужи: блестящие пятна на асфальте, видны только в дождь. Проехал по луже — всплеск.
const puddles = { north: [], south: [] };
{
  let sd = 9001;
  const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647, o = {}, list = [];
  for (const key of ['north', 'south']) {
    const ch = world.chains[key];
    for (let s = 40 + rr() * 30; s < ch.total - 30; s += 18 + rr() * 26) {
      ch.at(s, o);
      if (world.crossings.some((c) => c.k === key && Math.abs(c.s - s) < c.half + 8)) continue;
      const lat = (rr() - 0.5) * (o.lf * LANE_W - 2.2), rx = 0.9 + rr() * 1.3, rz = 1.3 + rr() * 2.4;
      puddles[key].push({ s, lat, r: Math.max(rx, rz) });
      list.push([o.x + o.dz * lat, o.z - o.dx * lat, Math.atan2(o.dx, o.dz), rx, rz]);
    }
  }
  const geo = new THREE.CircleGeometry(1, 14);
  geo.rotateX(-Math.PI / 2);
  puddles.mat = new THREE.MeshBasicMaterial({ color: 0x8fb0dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
  puddles.mesh = new THREE.InstancedMesh(geo, puddles.mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  list.forEach(([x, z, yaw, rx, rz], i) => { m4.compose(new THREE.Vector3(x, 0.09, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(rx, 1, rz)); puddles.mesh.setMatrixAt(i, m4); });
  puddles.mesh.frustumCulled = false; puddles.mesh.renderOrder = 5; puddles.mesh.visible = false;
  scene.add(puddles.mesh);
}
const signals = new Signals(scene, world, world.glowTex, envMap);
traffic.signals = signals;
const rain = new Rain(scene);
const chase = new Chase(scene, world, world.glowTex, envMap, data.turns.patrolZ);
signals.traffic = traffic;
const START_LAP = Math.max(1, Math.min(9, +new URLSearchParams(location.search).get('lap') || 1)); // для проверки: ?lap=3
const input = new Input();
const sound = new Sound();
let soundOn = store.get('sound', true);
sound.setMuted(!soundOn);
// реклама: пока она идёт, игра стоит и молчит
const ads = new Ads({ onPause: () => { G.adPause = true; sound.setMuted(true); }, onResume: () => { G.adPause = false; sound.setMuted(!soundOn); } });
const PW = { hl: model.type.len / 2, hw: model.type.wid / 2 };
sound.setEngine(CARS[carId].engine);

// Как разгоняется машина игрока с места: гонщики со светофора стартуют по той же кривой, только с небольшой
// задержкой. Поэтому точный старт их обгоняет, а фальстарт или опоздание — нет.
function launchCurve(setup) {
  const probe = new Car(setup), full = { steer: 0, throttle: 1, brake: 0, handbrake: false }, vAt = [];
  probe.reset(0, 0, 0);
  for (let i = 0; i < 240 * 10; i++) { probe.step(1 / 240, full); if (i % 24 === 23) vAt.push(probe.speed); } // скорость каждые 0,1 с
  const table = new Float32Array(61);
  for (let v = 0; v <= 60; v++) {
    const k = vAt.findIndex((x) => x >= v);
    if (k < 0) { table[v] = 1.5; continue; }
    const a = Math.max(0, k - 2), b = Math.min(vAt.length - 1, k + 2);
    table[v] = Math.max(1.5, (vAt[b] - vAt[a]) / ((b - a) * 0.1));
  }
  return (v) => table[Math.max(0, Math.min(60, Math.round(v)))] * 1.06; // чуть резвее игрока: без точного старта их не обойти
}
traffic.launchAcc = launchCurve(CARS[carId].setup);

// На какой высоте держать камеру за машиной: ищем такую, с которой поверх крыши асфальт виден с нужного расстояния
// перед носом (4,2 м на месте, 4,8 м на скорости, когда камера подъезжает ближе). У высокой машины камера ещё и дальше.
const fits = {};
function chaseFit(id, S) {
  if (fits[id]) return fits[id];
  const tall = Math.max(0, S.top(-0.3) - 1.47), d0 = 6.7 + tall * 2;
  const seen = (dist, H) => { // с какого расстояния перед носом видна дорога
    let D = 0;
    for (let z = -S.len / 2; z <= S.len / 2; z += 0.05) { const t = S.top(z); if (t >= H - 0.05) return 99; D = Math.max(D, (dist + z) * H / (H - t)); }
    return D - dist - S.len / 2;
  };
  const solve = (dist, want) => { let lo = 1.6, hi = 7; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (seen(dist, m) > want) lo = m; else hi = m; } return hi; };
  return (fits[id] = { tall, d0, h0: solve(d0, 4.2), h1: solve(d0 - 0.9, 4.8) });
}

// сменить машину: другая модель, другой характер и другой голос мотора
const models = { [carId]: model }; // построенные машины: вторая примерка той же модели — мгновенная
function setCar(id, save = true) {
  carId = id; if (save) store.set('car', id);
  scene.remove(model.root);
  model = models[id] || (models[id] = makePlayerCar(color, world.glowTex, envMap, SPECS[id]));
  model.setColor(color);
  scene.add(model.root);
  PW.hl = model.type.len / 2; PW.hw = model.type.wid / 2;
  car.s = CARS[id].setup;
  sound.setEngine(CARS[id].engine);
  traffic.launchAcc = launchCurve(CARS[id].setup);
  matchRivals(id);
}
// Соперники со светофора — одного класса с игроком: к «Семёрке» подъезжают заряженные «Жигули» и «Лады»,
// к «Гелику» — спортивные седаны, к купе — такие же купе. Разгоняются они как сам игрок и держат до 80 % его максималки.
const RIVALS = { coupe: ['coupe', 'coupe', 'coupe'], sedan: ['lux', 'coupe', 'lux'], gelik: ['lux', 'gelik', 'lux'], lada: ['lada', 'seven', 'lada'], seven: ['seven', 'lada', 'seven'] };
function matchRivals(id) { traffic.setRacers(RIVALS[id], Math.min(72, carStats(id).top / 3.6 * 0.8)); }

const G = {
  state: 'menu', // menu | drive | crash | finish
  score: 0, combo: 1, comboT: 0, near: 0, top: 0, time: 0, stateT: 0, lap: 1, grace: 0, turns: 0, blend: 1,
  launch: { ready: false, armed: false, greenAt: -1, boost: 0, stall: 0, was: 'g', cine: 0, cineOn: false, mix: 0, rivals: [], winAt: 0, line: null },
  garage: false, orbit: 0, routeI: -1, shake: 0, camYaw: 0, wheelSpin: 0, roll: 0, pitch: 0, lift: 0, handsOff: 9, flashT: 0, push: 0, bank: 0, wheelTurn: 0, view: 0,
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
  traffic.reset(car, { key: 'north', s0: pk.s - 25, s1: pk.s + 135 }); // там, куда машина сейчас выедет с площадки, пусто
  traffic.setStalled('north', []); traffic.setStalled('south', []);
  Object.assign(G.launch, { ready: false, armed: false, greenAt: -1, boost: 0, stall: 0, was: 'g', cine: 0, cineOn: false, mix: 0, rivals: [], winAt: 0, line: null, jump: false, rev: false, align: null });
  $('launchBtn').hidden = true; $('launchTip').hidden = true; $('lights').hidden = true;
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
  if (input.mode === 'tilt') input.setMode('tilt'); // разрешение на датчик наклона дают только по нажатию
  placeAtStart();
  Object.assign(G, { state: 'drive', score: 0, combo: 1, comboT: 0, near: 0, top: 0, time: 0, stateT: 0, shake: 0, lap: START_LAP, grace: 0, turns: (START_LAP - 1) * 2, blend: 0, why: '' });
  traffic.density = densityFor(G.lap);
  signals.setEnabled(lightsOn); // светофоры — по выбору в меню, работают с первого круга
  if (lightsOn) signals.calm('north', world.startS);
  if (G.turns > 0) { traffic.setStalled('north', stalledSpots('north', Math.min(3, Math.ceil(G.turns / 2)))); }
  loop.intro(car, world); // срываемся с площадки на дорогу
  $('menu').hidden = true; $('garage').hidden = true; $('result').hidden = true; $('hud').hidden = false;
  $('drift').hidden = true;
  $('touch').hidden = true; // кнопки появятся, когда машина выедет на дорогу и ей можно будет управлять
  $('pauseBtn').hidden = false;
  G.paid = 0; G.continued = false; G.doubled = false;
  ads.gameplay(true);
  sound.start();
}

function endRun(kind) {
  G.state = kind; G.stateT = 0;
  G.launch.armed = false; G.launch.cineOn = false;
  $('launchBtn').hidden = true; $('launchTip').hidden = true; $('lights').hidden = true;
  $('drift').hidden = true;
  $('pauseBtn').hidden = true;
  ads.gameplay(false);
  const best = store.get('best', 0), total = Math.round(G.score);
  if (total > best) store.set('best', total);
  // выручка за заезд (после «продолжить» — только за то, что набрано с прошлой аварии)
  G.earn = Math.round((G.score - G.paid) * ECON.rate / 100) * 100;
  G.paid = G.score; G.doubled = false;
  addCash(G.earn);
  $('resCash').textContent = '+' + money(G.earn);
  $('resDouble').hidden = G.earn <= 0;
  $('resContinue').hidden = G.continued;
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
  trial = null; // тест-драйв кончился
  if (carId !== picked) setCar(picked, false);
  G.garage = false; G.paused = false;
  ads.gameplay(false);
  $('menu').hidden = false; $('garage').hidden = true; $('result').hidden = true; $('hud').hidden = true; $('touch').hidden = true; $('pause').hidden = true; $('pauseBtn').hidden = true;
  paintCash();
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
      traffic.hold(...a.hold);
      traffic.gates = a.gates || []; // машины не исчезают: поток сам пропускает игрока
      $('drift').hidden = !!a.auto;
    }
    loop.feed(inp.throttle > 0, dt); // занос держится, пока нажат газ
    traffic.clearNear(car.x, car.z, 4.5); // страховка: только если кто-то оказался прямо в машине
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
  if (G.hornT > 0) G.hornT -= dt;
  if (events.honk && driving && !(G.hornT > 0)) { sound.horn(); G.hornT = 2.5; }
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
      chase.boost(7 + G.combo * 0.9); // каждый проход впритирку — ещё пара корпусов отрыва
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
    // В погоне: светофоры впереди дают зелёный, машина впереди уступает на сирену. Если красный всё же застал
    // (его не успели переключить — поперёк ещё едут), патруль не приближается, пока игрок перед ним стоит.
    let waitRed = false;
    if (chase.active && !loop.active) {
      const key = traffic.only, p = traffic.proj[key];
      G.chaseT = (G.chaseT || 0) - dt;
      if (G.chaseT <= 0) { G.chaseT = 0.7; if (signals.enabled) signals.chaseGreen(key, p.s, car.speed); traffic.flash(car); }
      const sg = signals.enabled ? signals.ahead(key, p.s + PW.hl) : null;
      waitRed = !!sg && sg.state !== 'g' && sg.dist < 70 && sg.dist > -2;
    }
    const res = chase.update(dt, car, traffic.proj, !!loop.active || waitRed);
    if (res === 'caught' && G.state === 'drive') { sound.siren(1); sound.crash(); endRun('busted'); }
    else if (res === 'escaped') { const b = 1500 * G.lap; G.score += b; pop(`Оторвался · +${b}`); }
    $('chase').hidden = !chase.active;
    if (chase.active) { $('chaseGap').textContent = Math.max(0, Math.round(chase.gap)) + ' м'; $('chase').classList.toggle('close', chase.gap < 70); }
  } else {
    G.stateT += dt;
    if ((G.state === 'crash' || G.state === 'busted') && G.stateT > 0.9 && $('result').hidden) {
      $('result').hidden = false; $('hud').hidden = true; $('touch').hidden = true;
      if (G.time >= 30) ads.interstitial(); // полноэкранная реклама — только после настоящего заезда; чаще раза в три минуты она сама не покажется
    }
  }
}

// Старт со светофора — мини-игра. Игрок стоит первым у стоп-линии на красный: появляется кнопка «ЛАНЧ».
// Зажал газ и её — камера пролетает вдоль стартового ряда (рядом встают соперники), на экране загораются
// пять красных огней по одному в секунду. Все погасли и вспыхнул зелёный — отпускай. Чем точнее, тем сильнее рывок.
const LIGHTS = 5, COUNT = 5.2; // огней и секунд отсчёта
function launchControl(dt) {
  const L = G.launch, key = traffic.only, p = traffic.proj[key];
  if (L.boost > 0) { L.boost -= dt; if (inp.throttle > 0) { const k = 6 * dt; car.vx += Math.sin(car.yaw) * k; car.vz += Math.cos(car.yaw) * k; } }
  if (L.stall > 0) { L.stall -= dt; inp.throttle = 0; }
  // через несколько секунд после старта смотрим, кто впереди
  if (L.winAt > 0 && G.time >= L.winAt) {
    L.winAt = 0;
    const lead = L.rivals.filter((c) => c.active).every((c) => c.s < p.s);
    if (lead && L.rivals.length) { const b = 800 * G.lap; G.score += b; pop(`Первый со светофора · +${b}`); }
    else if (L.rivals.length) pop('Со светофора ушли быстрее');
    L.rivals = [];
  }
  // Стоп-линия считается «нашей», даже если чуть не доехали или немного проскочили: машина сама подравняется
  const front = p.s + PW.hl, sig = signals.enabled ? signals.ahead(key, front - 8) : null;
  if (sig) sig.dist = sig.stop - front;
  const atLine = sig && sig.dist < 15 && sig.dist > -8 && p.d < 12 && p.facing > 0;
  let first = atLine; // первый ли: между нами и стоп-линией никого
  if (first) for (const c of traffic.cars) if (c.active && c.key === key && c.s > p.s && c.s - c.hl < sig.stop + 1 && Math.abs(c.off - p.lat) < 1.9) { first = false; break; }
  const red = sig && sig.state !== 'g';
  if (L.jump) { // фальстарт: мотор заглох — стоим до зелёного и ещё секунду, соперники уезжают
    inp.throttle = 0; car.vx = car.vz = 0; car.r = 0;
    if (!red) { L.jump = false; L.stall = 1.0; if (L.rivals.length) L.winAt = G.time + 4; }
  }
  L.ready = !!(first && (red || L.armed) && car.speed < 1.2 && !L.jump);
  if (L.ready && red && !L.armed && inp.launch && inp.throttle > 0) {
    // взвели: отсчёт всегда полный, соперники встают в соседние ряды, камера уходит в пролёт
    L.armed = true; L.greenAt = -1; L.cine = 0; L.lit = 0; L.goSnd = false;
    if (sig.left < COUNT) signals.setLeft(sig.g, COUNT);
    signals.wave(key, sig.stop, Math.max(sig.left, COUNT)); // дальше — «зелёная волна» на два перекрёстка
    L.rivals = traffic.stageRacers(key, sig.stop, traffic.ghost.lane);
    // куда подравняться за время пролёта камеры: бампер в 0,8 м перед линией, по середине своего ряда
    world.chains[key].at(sig.stop - PW.hl - 0.8, tmp);
    const off = rowOffset(traffic.ghost.lane, tmp), sT = sig.stop - PW.hl - 0.8;
    L.align = { x: tmp.x + tmp.dz * off, z: tmp.z - tmp.dx * off, yaw: Math.atan2(tmp.dx, tmp.dz) };
    for (const c of traffic.cars) if (c.active && c.key === key && Math.abs(c.off - off) < 1.9 && Math.abs(c.s - sT) < c.hl + PW.hl + 0.5) L.align = null; // место занято — стоим где стоим
    world.chains[key].at(sig.stop, tmp);
    L.line = { x: tmp.x, z: tmp.z, dx: tmp.dx, dz: tmp.dz, w: tmp.lf * LANE_W / 2 };
  }
  let lit = 0, go = false;
  L.rev = false;
  if (L.armed) {
    const left = sig ? sig.left : 0;
    if (sig && L.was !== 'g' && sig.state === 'g') L.greenAt = G.time;       // загорелся зелёный
    lit = L.greenAt >= 0 ? 0 : Math.max(0, Math.min(LIGHTS, Math.floor(COUNT - left) + 1));
    go = L.greenAt >= 0;
    L.cine += dt;
    L.cineOn = L.greenAt < 0 && left > 1.3; // пролёт камеры идёт, пока до зелёного больше секунды с небольшим
    if (lit > L.lit && !go) sound.lightOn();                                 // очередной огонь — сигнал
    if (go && !L.goSnd) { L.goSnd = true; sound.lightsGo(); }
    L.lit = lit;
    if (inp.launch && inp.throttle > 0) {                                    // держим: машина стоит, мотор бьётся в отсечку
      inp.throttle = 0; inp.brake = 0; car.vx = car.vz = 0; car.r = 0; L.rev = true;
      if (L.align) { // откатываемся или подкатываемся к линии
        const a = L.align, ax = a.x - car.x, az = a.z - car.z, d = Math.hypot(ax, az), m = Math.min(d, 4.5 * dt);
        if (d > 0.02) { car.x += ax / d * m; car.z += az / d * m; G.wheelSpin += m * Math.sign(ax * Math.sin(car.yaw) + az * Math.cos(car.yaw)) / model.type.wheel; }
        const dy = Math.atan2(Math.sin(a.yaw - car.yaw), Math.cos(a.yaw - car.yaw));
        car.yaw += Math.max(-0.9 * dt, Math.min(0.9 * dt, dy));
      }
      car.rpm += (6300 + (Math.sin(G.time * 55) > 0 ? 500 : -500) - car.rpm) * Math.min(1, dt * 14);
      if (go && G.time - L.greenAt > 1.6) { L.armed = false; pop('Проспал'); if (L.rivals.length) L.winAt = G.time + 3; }
    } else {                                                                 // отпустили
      const late = L.greenAt < 0 ? -1 : G.time - L.greenAt, ms = `${late.toFixed(2).replace('.', ',')} с`;
      if (late < 0) { L.jump = true; pop('Фальстарт'); sound.falseStart(); }
      else if (late <= 0.35) { const b = 1200 * G.lap; G.score += b; L.boost = 1.8; car.vx += Math.sin(car.yaw) * 5; car.vz += Math.cos(car.yaw) * 5; pop(`Идеальный старт · ${ms} · +${b}`); sound.launch(1); sound.whoosh(); }
      else if (late <= 0.7) { const b = 400 * G.lap; G.score += b; L.boost = 1.3; pop(`Хороший старт · ${ms} · +${b}`); sound.launch(0.6); }
      else pop(`Поздно · ${ms}`);
      L.armed = false;
      if (L.rivals.length) L.winAt = late < 0 ? -1 : G.time + 4; // после фальстарта отсчёт пойдёт с зелёного
    }
  }
  if (!L.armed) L.cineOn = false;
  // плавное включение и выключение пролёта
  L.mix += ((L.cineOn ? 1 : 0) - L.mix) * Math.min(1, dt * (L.cineOn ? 5 : 3.2));
  L.was = sig ? sig.state : 'g';
  $('launchBtn').hidden = !L.ready;
  $('launchTip').hidden = !(L.ready && !L.armed);
  // стартовые огни
  const box = $('lights');
  box.hidden = !L.armed;
  if (L.armed) {
    for (let i = 0; i < LIGHTS; i++) box.children[i].className = go ? 'go' : i < lit ? 'on' : '';
    $('lightsText').textContent = go ? 'ОТПУСКАЙ!' : 'ДЕРЖИ…';
    box.classList.toggle('go', go);
  }
}

// Помощь, когда руль отпущен. bend — руль, нужный, чтобы ехать по изгибу улицы; pull — слабая
// поправка к направлению и середине полосы. Работает только на проезжей части Красной.
function roadAssist() {
  if (car.speed < 9) return null;
  let best = null, chain = null;
  for (const key of ['north', 'south']) {
    const p = traffic.proj[key];
    if (p.d < halfWidth(p.lf) + 2 && (!best || p.d < best.d)) { best = p; chain = world.chains[key]; }
  }
  if (!best) return null;
  const along = Math.sin(car.yaw) * best.dx + Math.cos(car.yaw) * best.dz >= 0 ? 1 : -1;
  // чуть-чуть тянем к середине ближайшей полосы: цель — точка на её оси в 55 м впереди
  const lane = Math.max(0, Math.min(best.lanes - 1, Math.round(best.lf / 2 - 0.5 - best.lat / LANE_W)));
  const aim = Math.atan2(laneOffset(lane, best.lf) - best.lat, 55);
  const yaw = Math.atan2(best.dx, best.dz) + (along > 0 ? aim : Math.PI - aim);
  const d = Math.atan2(Math.sin(yaw - car.yaw), Math.cos(yaw - car.yaw));
  if (Math.abs(d) > 0.6) return null;
  // Изгиб берём не под колёсами, а средний на ближайшую секунду пути: на коротком S-образном изгибе (как в конце
  // бульвара у Будённого) машина иначе доворачивала поздно и слишком резко — и уезжала в бордюр.
  let k = 0, n = 0;
  for (let d = 0, win = Math.max(18, car.speed * 1.0); d <= win; d += 6) {
    const s = best.s + along * d;
    if (s < 1 || s > chain.total - 1) break;
    k += chain.kappa[chain.segAt(s)]; n++;
  }
  const wheelbase = car.s.a + car.s.b, bend = wheelbase * (n ? k / n : best.kappa) * along / steerLockAt(Math.abs(car.u), car.s);
  return { bend: Math.max(-0.35, Math.min(0.35, bend * 0.85)), pull: alignSteer(car, yaw) };
}

// Разворот пройден: премия (за удержанный занос — больше). С каждым разворотом дорога сложнее:
// появляются сломанные машины, после полного круга — погоня.
function turnDone(res) {
  traffic.release();
  traffic.gates = [];
  G.grace = 1.5;
  $('drift').hidden = true;
  G.handsOff = 9;
  $('touch').hidden = !coarse;
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
    pop(`${what} · круг ${G.lap} · +${bonus}`);
    if (!chase.active) { chase.start(G.lap, car.speed); sound.siren(1); setTimeout(() => { if (G.state === 'drive' && chase.active) pop('Погоня! Не сбавляй'); }, 1600); }
  } else if (chase.lose()) { const b = 1000 * G.lap; G.score += b; pop(`Ушёл от погони · +${b}`); }
  else pop(`${what} · +${bonus}`);
}

// Продолжить после аварии (за ролик, один раз за заезд): машина снова на своей стороне дороги, в ближайшем ряду,
// на 60 км/ч, первые три секунды её нельзя разбить.
function continueRun() {
  const key = traffic.only, ch = world.chains[key], p = traffic.proj[key];
  let s = Math.max(30, Math.min(ch.total - 80, p.s));
  const turnS = key === 'north' ? loop.linkS : loop.southS;
  if (turnS - s < 90 && turnS - s > -20) s = turnS - 90; // не ставим прямо перед разворотом
  ch.at(s, tmp);
  const off = rowOffset(rowAt(p.lat, tmp), tmp), yaw = Math.atan2(tmp.dx, tmp.dz);
  car.reset(tmp.x + tmp.dz * off, tmp.z - tmp.dx * off, yaw);
  car.vx = tmp.dx * 16.7; car.vz = tmp.dz * 16.7;
  traffic.clearNear(car.x, car.z, 16);
  loop.active = null; traffic.release(); traffic.gates = [];
  if (chase.active) chase.gap = Math.max(chase.gap, 200);
  Object.assign(G, { state: 'drive', stateT: 0, grace: 3, continued: true, shake: 0, combo: 1, comboT: 0, camYaw: yaw, handsOff: 9 });
  $('result').hidden = true; $('hud').hidden = false; $('touch').hidden = !coarse; $('pauseBtn').hidden = false;
  ads.gameplay(true);
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
  // у каждой машины свой характер: купе стоит как вкопанное, «Гелик» и «Лады» заметно валятся в повороте и клюют носом
  const feel = CARS[carId].feel, rollK = feel.roll;
  G.roll += (Math.max(-0.05 * (1 + rollK * 0.55), Math.min(0.05 * (1 + rollK * 0.55), car.ay * 0.0055 * rollK)) - G.roll) * k;
  G.pitch += (Math.max(-0.03 * (1 + rollK * 0.5), Math.min(0.03 * (1 + rollK * 0.5), -car.ax * 0.004 * Math.sqrt(rollK))) - G.pitch) * k;
  model.chassis.rotation.z = G.roll;
  model.chassis.rotation.x = G.pitch;
  G.wheelSpin += car.u / t.wheel * dt;
  for (const w of model.wheels) {
    w.mesh.rotation.x = G.wheelSpin * (w.side || 1); // правое колесо развёрнуто, крутится «в другую сторону»
    if (w.front) w.pivot.rotation.y = car.steer;
  }
  model.setFlash(G.flashT > 0.27 || (G.flashT > 0.03 && G.flashT < 0.17) ? 1 : 0);
  model.setBrake(G.state !== 'drive' ? true : loop.active ? loop.active.v > loop.active.speedAt(loop.active.s) + 1 : inp.brake > 0 || inp.handbrake);

  // ---------- камера ----------
  // Три вида: сзади, с капота и из-за руля. Во всех — одни и те же приёмы, которые дают ощущение скорости:
  // обзор раскрывается, камера прижимается к машине и к асфальту, на разгоне её «оттягивает» назад,
  // на торможении бросает вперёд, на скорости она мелко дрожит и кренится в повороты.
  let d = (loop.active ? loop.active.yaw : car.yaw) - G.camYaw; // в заносе камера идёт по траектории, кузов поворачивается на глазах
  d = Math.atan2(Math.sin(d), Math.cos(d));
  G.camYaw += d * Math.min(1, dt * 5.5);
  const cx = Math.sin(G.camYaw), cz = Math.cos(G.camYaw);
  // после аварии камера отъезжает вверх, чтобы не оказаться внутри чужой машины
  G.lift += ((G.state === 'crash' ? 1 : 0) - G.lift) * Math.min(1, dt * 3);
  // vs — скорость «по ощущению»: на «Семёрке» 90 км/ч подаются как почти 200 на купе
  const driving = G.state === 'drive', vs = v * feel.sense, spd = 1 - Math.exp(-vs / 16), low = Math.max(0, feel.sense - 1);
  G.push += ((driving && !loop.active ? Math.max(-12, Math.min(9, car.ax)) : 0) - G.push) * Math.min(1, dt * 3.2); // тяга и торможение, сглаженные
  G.bank += ((driving ? Math.max(-0.022, Math.min(0.022, -car.ay * 0.0014)) : 0) - G.bank) * Math.min(1, dt * 4);
  G.shake *= Math.exp(-dt * 4);
  const now = performance.now() / 1000, sk = Math.min(1, vs / 52) ** 2 * feel.shake;
  const jx = (Math.sin(now * 31.7) + Math.sin(now * 47.3 + 1.3)) * 0.5, jy = (Math.sin(now * 39.1 + 0.7) + Math.sin(now * 57.9)) * 0.5; // дрожь — плавная, а не случайный шум
  // В меню камера медленно обходит машину спереди; на старте плавно перелетает на своё место.
  // В гараже камера ближе, машину можно крутить. Панель занимает правую часть экрана (в портрете — низ),
  // поэтому смотрим чуть мимо машины, чтобы она встала в свободную часть кадра.
  const tallCar = Math.max(0, model.spec.top(-0.3) - 1.47), rad = (G.garage ? 6.2 : 7.2) + tallCar * 2.2;
  const oa = car.yaw + 0.75 + (G.garage ? now * 0.12 - G.orbit : Math.sin(now * 0.25) * 0.35);
  const mx = car.x + Math.sin(oa) * rad, mz = car.z + Math.cos(oa) * rad, my = 1.5 + tallCar * 0.6;
  const wide = camera.aspect > 1, sideShift = wide ? 1.7 : 0, mlx = car.x + Math.cos(oa) * sideShift, mlz = car.z - Math.sin(oa) * sideShift, mly = (wide ? 0.8 : 0.1) + tallCar * 0.3;
  if (driving && G.blend < 1) G.blend = Math.min(1, G.blend + dt / 2.6);
  const bl = G.state === 'menu' ? 0 : G.blend * G.blend * (3 - 2 * G.blend);
  // после аварии смотрим со стороны; на выезде с площадки камера сначала долетает за машину и только потом
  // переключается на капот или в салон — иначе она пролетала бы сквозь кузов
  const view = G.state === 'crash' || G.state === 'busted' || bl < 1 ? 0 : G.view;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  let px, py, pz, lx, ly, lz, fovBase, fovGain, amp;
  if (view === 0) {
    // Камера стоит выше крыши и смотрит на дорогу далеко перед машиной. Высота подобрана под каждый кузов так,
    // чтобы поверх своей крыши асфальт был виден уже в четырёх-пяти метрах перед носом — машину впереди видно целиком.
    const fit = chaseFit(carId, model.spec);
    const dist = fit.d0 - 0.9 * spd + G.push * 0.08 + G.lift * 3.5, height = fit.h0 + (fit.h1 - fit.h0) * spd + G.lift * 4.5, tall = fit.tall;
    px = car.x - cx * dist; pz = car.z - cz * dist; py = height;
    lx = car.x + cx * 17; ly = 0.5 + tall * 0.6; lz = car.z + cz * 17;
    fovBase = 60; fovGain = 24; amp = 0.016;
  } else if (view === 1) {
    const [h, f] = model.spec.hoodCam;
    px = car.x + fx * (f - G.push * 0.012); pz = car.z + fz * (f - G.push * 0.012); py = h - 0.06 * spd;
    lx = car.x + fx * 40; ly = 0.7; lz = car.z + fz * 40;
    fovBase = 66; fovGain = 18; amp = 0.007;
  } else {
    const [ex, ey, ez] = model.interior.eye, back = G.push * 0.006; // на разгоне вжимает в кресло
    px = car.x + fz * ex + fx * (ez - back); pz = car.z - fx * ex + fz * (ez - back); py = ey;
    const look = car.yaw + car.steer * 0.35; // взгляд чуть уходит в сторону поворота
    lx = px + Math.sin(look) * 30; ly = ey - 1.2; lz = pz + Math.cos(look) * 30;
    fovBase = 68; fovGain = 15; amp = 0.004;
  }
  const a = G.shake + sk * amp, rx = cz, rz = -cx; // дрожь — вбок и вверх-вниз
  px += rx * jx * a + (Math.random() - 0.5) * G.shake; py += jy * a * 0.7 + (Math.random() - 0.5) * G.shake; pz += rz * jx * a + (Math.random() - 0.5) * G.shake;
  camera.position.set(mx + (px - mx) * bl, my + (py - my) * bl, mz + (pz - mz) * bl);
  camera.lookAt(mlx + (lx - mlx) * bl, mly + (ly - mly) * bl, mlz + (lz - mlz) * bl);
  camera.rotateZ((G.bank + jx * sk * 0.0012 + (view ? G.roll * 0.5 : 0)) * bl);
  // салон виден только изнутри; из-за руля ближняя граница обзора ближе, иначе руль и приборы обрежет
  const inside = view === 2 && G.launch.mix < 0.5 && !G.freeCam;
  if (model.interior.group.visible !== inside) {
    model.interior.group.visible = inside;
    // изнутри кузов виден с изнанки: без этого сквозь капот и стойки просвечивала бы дорога
    model.mats.paint.side = model.mats.dark.side = inside ? THREE.DoubleSide : THREE.FrontSide;
    model.mats.paint.needsUpdate = model.mats.dark.needsUpdate = true;
  }
  const near = view !== 0 && G.launch.mix < 0.5 && !G.freeCam ? 0.12 : 0.6;
  if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
  if (inside) {
    G.wheelTurn += (-car.steer / Math.max(0.02, steerLockAt(Math.abs(car.u), car.s)) * 1.5 - G.wheelTurn) * Math.min(1, dt * 12);
    model.interior.update(Math.abs(car.u) * 3.6, car.rpm, car.reverse && car.u < 0.6 ? 'R' : car.gear, G.wheelTurn);
  }
  // Пролёт перед стартом: камера идёт низко вдоль стоп-линии, слева направо, лицом к машинам —
  // видно, кто стоит рядом. К последней секунде она возвращается за машину игрока.
  if (G.launch.mix > 0.002 && G.launch.line) {
    const Ln = G.launch.line, m = G.view === 0 ? G.launch.mix : G.launch.mix > 0.5 ? 1 : 0, u = Math.min(1, G.launch.cine / 3.6), e = u * u * (3 - 2 * u); // из салона — резкой сменой плана
    const lat = (0.9 - 1.8 * e) * (Ln.w + 2.5), ahead = 9.5 - 2.5 * e;
    const qx = Ln.x + Ln.dx * ahead + Ln.dz * lat, qz = Ln.z + Ln.dz * ahead - Ln.dx * lat, qy = 0.9 + 0.5 * e;
    const tx = Ln.x - Ln.dx * 3.5 + Ln.dz * lat * 0.45, tz = Ln.z - Ln.dz * 3.5 - Ln.dx * lat * 0.45;
    const cp = camera.position, chaseLook = [car.x + cx * 8, 1.0, car.z + cz * 8];
    cp.set(cp.x + (qx - cp.x) * m, cp.y + (qy - cp.y) * m, cp.z + (qz - cp.z) * m);
    camera.lookAt(chaseLook[0] + (tx - chaseLook[0]) * m, chaseLook[1] + (0.75 - chaseLook[1]) * m, chaseLook[2] + (tz - chaseLook[2]) * m);
  }
  if (G.freeCam) { const f = G.freeCam; camera.position.set(f[0], f[1], f[2]); camera.lookAt(f[3], f[4], f[5]); } // отладка: свободная камера
  // угол обзора раскрывается уже к 60–80 км/ч и дополнительно «дышит» на разгоне и торможении
  const fov = fovBase + fovGain * spd + G.push * 0.4;
  if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  $('vig').style.opacity = G.state === 'drive' ? Math.max(0, Math.min(1, (v - 18) / 45)).toFixed(2) : '0';

  if (G.state === 'drive') {
    $('speed').textContent = Math.round(Math.abs(car.u) * 3.6);
    $('gear').textContent = car.reverse && car.u < 0.6 ? 'R' : car.gear;
    $('score').textContent = Math.round(G.score).toLocaleString('ru-RU');
    $('combo').textContent = '×' + G.combo;
    $('comboBox').classList.toggle('live', G.combo > 1);
    $('lapLabel').textContent = `Круг ${G.lap} · до разворота`;
    // за 400 м до разворота подсказываем, в какой ряд встать
    const tip = $('turnTip'), near = !loop.active && (G.left ?? 999) < 400 && (G.left ?? 0) > 25;
    if (near !== !tip.hidden) tip.hidden = !near;
    if (near) tip.textContent = traffic.only === 'north' ? '← Разворот: в левый ряд' : 'Разворот: в правый ряд →';
    const left = G.left ?? 0;
    $('left').textContent = left >= 1000 ? (left / 1000).toFixed(1).replace('.', ',') + ' км' : Math.round(left / 10) * 10 + ' м';
  }
  // дым из-под задних колёс в заносе
  if (G.state === 'drive' && car.slip > 0.3 && v > 6) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx;
    for (const s of [-1, 1]) if (Math.random() < car.slip * 0.9) smoke.emit(car.x - fx * 1.4 + lx * s * 0.8, 0.25, car.z - fz * 1.4 + lz * s * 0.8, car.vx * 0.25, car.vz * 0.25, car.slip);
  }
  // тормозим в пол на скорости — шины визжат и дымят; в дождь вместо дыма летит вода
  const hardBrake = G.state === 'drive' && !loop.active && inp.brake > 0 && v > 9 ? Math.min(1, (v - 9) / 24) : 0;
  if (hardBrake > 0.15 || (rain.wet > 0.25 && G.state === 'drive' && v > 7)) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = fz, lz = -fx, wet = rain.wet;
    for (const s of [-1, 1]) {
      if (hardBrake > 0.15 && wet < 0.5 && Math.random() < hardBrake * 0.6) smoke.emit(car.x + fx * 1.3 + lx * s * 0.8, 0.2, car.z + fz * 1.3 + lz * s * 0.8, car.vx * 0.3, car.vz * 0.3, hardBrake * 0.55);
      // водяная пыль за задними колёсами: чем быстрее, тем гуще; на торможении — ещё и из-под передних
      if (wet > 0.25) for (let n = Math.random() < Math.min(1, v / 22) ? (v > 30 ? 2 : 1) : 0; n > 0; n--) spray.emit(car.x - fx * 1.9 + lx * s * 0.8, 0.25, car.z - fz * 1.9 + lz * s * 0.8, car.vx * 0.45, car.vz * 0.45, wet * 0.42);
      if (wet > 0.25 && hardBrake > 0.2 && Math.random() < 0.7) spray.emit(car.x + fx * 1.4 + lx * s * 0.8, 0.2, car.z + fz * 1.4 + lz * s * 0.8, car.vx * 0.5, car.vz * 0.5, wet * 0.5);
    }
  }
  if (rain.wet > 0.25) {
    // машины потока поблизости тоже поднимают воду
    for (const c of traffic.cars) if ((c.active || c.entering) && c.v > 6 && Math.random() < 0.3 && Math.abs(c.x - car.x) + Math.abs(c.z - car.z) < 90) spray.emit(c.x - c.dx * c.hl, 0.25, c.z - c.dz * c.hl, c.dx * c.v * 0.4, c.dz * c.v * 0.4, rain.wet * 0.35);
    // лужи
    const key = traffic.only, p = traffic.proj[key];
    if (G.state === 'drive' && v > 6 && p.d < 12) for (const pd of puddles[key]) {
      if (Math.abs(pd.s - p.s) > pd.r + 1.5 || Math.abs(pd.lat - p.lat) > pd.r * 0.7 + 0.8) continue;
      if (pd.hit === G.time) continue;
      if (!(G.time - (pd.at || -9) < 0.8)) { sound.splash(); const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw); for (let n = 0; n < 14; n++) spray.emit(car.x + (Math.random() - 0.5) * 1.8 + fx, 0.3, car.z + (Math.random() - 0.5) * 1.8 + fz, car.vx * 0.5 + (Math.random() - 0.5) * 6, car.vz * 0.5 + (Math.random() - 0.5) * 6, 1); }
      pd.at = G.time;
    }
  }
  puddles.mesh.visible = rain.wet > 0.03;
  puddles.mat.opacity = rain.wet * 0.2;
  spray.update(dt, camera, renderer.domElement.height);
  smoke.update(dt, camera, renderer.domElement.height);
  streaks.update(camera.position, G.camYaw, G.state === 'drive' ? v * CARS[carId].feel.sense : 0);
  sound.weather(rain.wet, chase.active && G.state === 'drive' ? Math.max(0, 1 - chase.gap / 200) : 0);
  $('cops').style.opacity = chase.active && G.state === 'drive' && chase.gap < 90 ? (0.55 * (1 - chase.gap / 90) * (Math.floor(chase.flash * 5) % 2 ? 1 : 0.35)).toFixed(2) : '0';
  $('cops').classList.toggle('blue', Math.floor(chase.flash * 5) % 2 === 0);
  sound.update(car.rpm, G.state === 'drive' ? (G.launch.rev ? 1 : inp.throttle) : 0, Math.max(car.slip, hardBrake * (0.75 - 0.5 * rain.wet)), v, G.state === 'drive' && !G.paused && !G.adPause, car.gear);
  // зеркало заднего вида — во всех видах, кроме пролёта перед стартом
  const showMirror = driving && !G.freeCam && bl > 0.95 && G.launch.mix < 0.15;
  if ($('mirror').hidden === showMirror) $('mirror').hidden = !showMirror;
  blur.render(scene, camera, driving && !G.freeCam ? Math.min(1, Math.max(0, (v - 18) / 55) + Math.max(0, G.push) * 0.02) : 0, dt); // размытие — от настоящей скорости, у всех машин одинаково
  if (showMirror) mirror.render(scene, car.x, car.z, car.yaw, model.type.len / 2, 1.2 + Math.max(0, model.spec.top(-0.3) - 1.47) * 0.8, $('mirror').getBoundingClientRect());
}

let last = performance.now(), clockAt = 0;
function frame(now) {
  if (world.tickClock && now - clockAt > 20000) { clockAt = now; world.tickClock(); } // электронные часы на здании идут по-настоящему
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.paused && !G.adPause) tick(dt);
  draw(G.paused || G.adPause ? 0 : dt);
  requestAnimationFrame(frame);
}

// ---------- меню, гараж, пауза ----------
// Быстрые кнопки срабатывают по касанию, а не по отпусканию: так они не «проглатывают» частые нажатия.
const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(e); });
function paintCash() { $('cash').textContent = $('gCash').textContent = money(cash); }
function addCash(n) { cash = Math.max(0, cash + n); store.set('cash', cash); paintCash(); }

// цвета: свои — сразу, остальные можно примерить, а потом купить или получить за ролик
const sw = $('swatches');
let tryColor = null; // цвет, который примеряют
function paintSwatches() {
  [...sw.children].forEach((b, i) => { b.classList.toggle('sel', COLORS[i] === (tryColor ?? color)); b.classList.toggle('lock', !hasColor(COLORS[i])); });
  const locked = tryColor !== null && !hasColor(tryColor);
  $('gColorBar').hidden = !locked;
  if (locked) { $('gColorBuy').textContent = 'Цвет · ' + money(ECON.color); $('gColorBuy').disabled = cash < ECON.color; }
}
function takeColor(c) { ownedColors.add(c); store.set('colors', [...ownedColors]); color = c; store.set('color', c); tryColor = null; model.setColor(c); paintSwatches(); }
COLORS.forEach((c) => {
  const b = document.createElement('button');
  b.style.background = '#' + c.toString(16).padStart(6, '0');
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    model.setColor(c);
    if (hasColor(c)) { color = c; store.set('color', c); tryColor = null; } else tryColor = c;
    paintSwatches();
  });
  sw.append(b);
});
$('gColorBuy').addEventListener('click', () => { if (tryColor !== null && cash >= ECON.color) { addCash(-ECON.color); takeColor(tryColor); } });
$('gColorAd').addEventListener('click', () => { const c = tryColor; if (c !== null) ads.rewarded().then((ok) => { if (ok) takeColor(c); }); });

// вид: сзади → с капота → из-за руля
const VIEWS = ['Сзади', 'С капота', 'Из салона'];
function nextView() { G.view = (G.view + 1) % 3; store.set('view', G.view); $('viewName').textContent = VIEWS[G.view]; }
G.view = store.get('view', 0) % 3;
$('viewName').textContent = VIEWS[G.view];
$('viewBtn').addEventListener('click', nextView);

// характеристики машины для гаража: разгон и максималку меряем на той же физике, что и в игре
const statCache = {};
function carStats(id) {
  if (statCache[id]) return statCache[id];
  const probe = new Car(CARS[id].setup), full = { steer: 0, throttle: 1, brake: 0, handbrake: false };
  probe.reset(0, 0, 0);
  let t100 = 0;
  for (let i = 0; i < 240 * 36; i++) { probe.step(1 / 240, full); if (!t100 && probe.speed >= 27.78) t100 = (i + 1) / 240; }
  return (statCache[id] = { t100, top: probe.speed * 3.6, mass: CARS[id].setup.mass, roll: CARS[id].feel.roll });
}
let picked = carId; // машина, на которой поедем; в гараже можно примерить другую и не выбрать
let trial = null;   // машина, взятая на один заезд за ролик
const paintCar = () => { $('carName').textContent = CARS[picked].name; };
function paintGarage() {
  const c = CARS[carId], st = carStats(carId), price = ECON.prices[carId], mine = has(carId);
  $('gName').textContent = c.name; $('gNote').textContent = c.note;
  const rows = [
    ['Разгон 0–100', (9.5 - st.t100) / 7, st.t100.toFixed(1).replace('.', ',') + ' с'],
    ['Максималка', st.top / 350, Math.round(st.top / 5) * 5 + ' км/ч'],
    ['Устойчивость', 1.08 - st.roll / 2.9, st.roll < 0.7 ? 'как рельсы' : st.roll < 1.5 ? 'ровная' : 'валкая'],
    ['Масса', st.mass / 2700, (st.mass / 1000).toFixed(2).replace('.', ',') + ' т'],
  ];
  $('gStats').innerHTML = rows.map(([n, k, v]) => `<div><span>${n}</span><em><u style="width:${Math.round(Math.max(0.06, Math.min(1, k)) * 100)}%"></u></em><b>${v}</b></div>`).join('');
  const btn = $('gSelect');
  btn.textContent = mine ? (carId === picked ? 'Выбрано' : 'Выбрать') : cash >= price ? 'Купить · ' + money(price) : 'Нужно ещё ' + money(price - cash);
  btn.disabled = !mine && cash < price;
  btn.classList.toggle('locked', !mine && cash < price);
  $('gTrial').hidden = mine;
  paintSwatches();
}
function stepCar(step) {
  setCar(ORDER[(ORDER.indexOf(carId) + step + ORDER.length) % ORDER.length], false);
  paintGarage();
}
function openGarage(open) {
  G.garage = open; G.orbit = 0;
  $('garage').hidden = !open; $('menu').hidden = open;
  if (open) {
    paintGarage();
    // остальные машины строим заранее, по одной, пока игрок смотрит на первую: листание не будет подвисать
    const rest = ORDER.filter((id) => !models[id]);
    const next = () => { const id = rest.shift(); if (!id || !G.garage) return; models[id] = makePlayerCar(color, world.glowTex, envMap, SPECS[id]); setTimeout(next, 120); };
    setTimeout(next, 300);
  } else {
    if (carId !== picked) setCar(picked, false); // ушли, не выбрав — возвращаем свою
    tryColor = null; model.setColor(color);       // и свой цвет
  }
}
tap('carPrev', () => stepCar(-1));
tap('carNext', () => stepCar(1));
$('garageBtn').addEventListener('click', () => openGarage(true));
$('garageBack').addEventListener('click', () => openGarage(false));
$('gSelect').addEventListener('click', () => {
  if (!has(carId)) { // покупка
    const price = ECON.prices[carId];
    if (cash < price) return;
    addCash(-price); owned.add(carId); store.set('owned', [...owned]);
  }
  picked = carId; store.set('car', picked); paintCar(); openGarage(false);
});
// тест-драйв: один заезд на закрытой машине за ролик
$('gTrial').addEventListener('click', () => { const id = carId; ads.rewarded().then((ok) => { if (!ok) return; trial = id; G.garage = false; $('garage').hidden = true; if (carId !== id) setCar(id, false); startRun(); }); });
// экран результата: удвоить выручку и продолжить — за ролик
$('resDouble').addEventListener('click', () => { if (G.doubled || $('result').hidden || G.state === 'drive') return; ads.rewarded().then((ok) => { if (!ok || G.doubled || G.state === 'drive') return; G.doubled = true; addCash(G.earn); $('resCash').textContent = '+' + money(G.earn * 2); $('resDouble').hidden = true; }); });
$('resContinue').addEventListener('click', () => { if (G.continued || G.state === 'drive') return; ads.rewarded().then((ok) => { if (ok && G.state !== 'drive' && G.state !== 'menu') continueRun(); }); });
// в гараже машину можно покрутить пальцем или мышью
let dragX = null;
canvas.addEventListener('pointerdown', (e) => { if (G.garage) dragX = e.clientX; });
addEventListener('pointermove', (e) => { if (dragX !== null && G.garage) { G.orbit += (e.clientX - dragX) * 0.008; dragX = e.clientX; } });
addEventListener('pointerup', () => { dragX = null; });
paintCar();
matchRivals(carId);
// способ рулить на экране телефона: стрелки, руль или наклон
const ctlButtons = [...$('ctlSeg').children, ...$('ctlSeg2').children]; // один и тот же выбор — в меню и в паузе
const paintCtl = () => { for (const b of ctlButtons) b.classList.toggle('sel', b.dataset.m === input.mode); };
for (const b of ctlButtons) b.addEventListener('click', () => { input.setMode(b.dataset.m); store.set('ctl', input.mode); paintCtl(); });
input.setMode(store.get('ctl', 'arrows'));
$('ctlRow').hidden = $('ctlRow2').hidden = !coarse;
paintCtl();
// звук — в меню и в паузе
const paintSound = () => { for (const id of ['soundBtn', 'soundBtn2']) { $(id).classList.toggle('on', soundOn); $(id).setAttribute('aria-checked', soundOn); } };
for (const id of ['soundBtn', 'soundBtn2']) $(id).addEventListener('click', () => { soundOn = !soundOn; store.set('sound', soundOn); sound.setMuted(!soundOn); paintSound(); });
paintSound();
// пауза: игра стоит, здесь же вид, руль и звук
function setPause(on) {
  if (on && G.state !== 'drive') return;
  G.paused = on;
  $('pause').hidden = !on; $('pauseBtn').hidden = on || G.state !== 'drive';
  ads.gameplay(!on && G.state === 'drive');
  last = performance.now();
}
tap('pauseBtn', () => setPause(true));
$('resume').addEventListener('click', () => setPause(false));
$('pauseMenu').addEventListener('click', () => { setPause(false); showMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); }); // свернули игру — пауза
const paintLights = () => { $('lightsBtn').classList.toggle('on', lightsOn); $('lightsBtn').setAttribute('aria-checked', lightsOn); };
$('lightsBtn').addEventListener('click', () => { lightsOn = !lightsOn; store.set('lights', lightsOn); paintLights(); });
paintLights();
$('go').addEventListener('click', startRun);
$('again').addEventListener('click', startRun);
$('toMenu').addEventListener('click', showMenu);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && G.state !== 'menu' && !G.paused) startRun();
  if (e.code === 'KeyC' || e.code === 'KeyV') nextView();
  if (e.code === 'Escape' || e.code === 'KeyP') setPause(!G.paused);
  if (e.code === 'Enter' && G.state !== 'drive' && !G.garage) startRun();
});
addEventListener('contextmenu', (e) => e.preventDefault());
// Safari на айфоне игнорирует запрет масштаба в meta — гасим щипок и двойное касание сами
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now();
  // двойное касание увеличивало страницу — гасим его, но только мимо кнопок: иначе второе быстрое нажатие на кнопку пропадало
  if (now - lastTouchEnd < 350 && !(e.target.closest && e.target.closest('button, .seg, .swatches, .steer'))) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { last = performance.now(); });

$('install').hidden = !(isIOS && !standalone);
showMenu();
requestAnimationFrame(frame);
window.__game = { G, car, world, traffic, input, loop, signals, rain, chase, sound, setCar, tick, draw, startRun, renderer, scene, camera, LANE_W };
