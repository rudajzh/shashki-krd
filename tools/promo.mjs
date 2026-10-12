// Промо-материалы для площадки: скриншоты, иконка, обложка и ролик геймплея. Снимает настоящую игру в безголовом
// браузере: машину ведёт автопилот, кадры идут строго по игровому времени (поэтому ролик ровный на любом железе).
//   node tools/promo.mjs shots|video|art [--out promo]
// Нужен запущенный локальный сервер игры (порт 8091) и puppeteer с ffmpeg (берутся из навыка reels-motion).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const SKILL = join(process.env.HOME, '.claude/skills/reels-motion');
const require = createRequire(join(SKILL, 'package.json'));
const puppeteer = require('puppeteer');
const what = process.argv[2] || 'shots';
const OUT = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'promo');
const URL = 'http://localhost:8091/?all=1&promo=' + Date.now();
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

// Страница с игрой. store — что положить в сохранение до загрузки (машина, цвет, светофоры, вид).
async function open({ width, height, dpr = 1, touch = false, store = {} }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch, isLandscape: true });
  await page.evaluateOnNewDocument((st) => { for (const k in st) localStorage.setItem('shashki.' + k, JSON.stringify(st[k])); }, { car: 'coupe', color: 0xd92b2b, lights: false, view: 0, sound: false, coins: 12480, ctl: 'arrows', ...store });
  page.on('pageerror', (e) => console.error('страница:', e.message));
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__game && window.__game.G.state === 'menu', { timeout: 60000 });
  await page.evaluate(driver);
  return page;
}

// Всё, что выполняется внутри страницы: автопилот и шаг игрового времени.
function driver() {
  const g = window.__game, T = g.traffic, car = g.car;
  const P = window.__P = { t: 0, vmax: 44, bonus: 2.2, margin: 0.5, why: '', crashed: false, hunt: true, nearAt: -9, lastNear: 0 };
  g.G.adPause = true; // свой цикл игры стоит: время двигаем сами, кадр за кадром
  // анимации интерфейса (вылетающие числа, монеты, плашки) идут по игровому времени, а не по настоящему
  const anims = () => {
    for (const a of document.getAnimations()) {
      if (a.__s === undefined) { a.__s = P.t; a.pause(); }
      const t = (P.t - a.__s) * 1000, end = a.effect.getComputedTiming().endTime;
      if (Number.isFinite(end) && t >= end) a.finish(); else a.currentTime = t;
    }
  };
  // Автопилот: выбирает, где проехать, чтобы пройти вплотную к машинам, но никого не задеть.
  const pilot = () => {
    if (g.loop.active) return { steer: 0, throttle: 1, brake: 0, handbrake: false, launch: false };
    const key = T.only, p = T.proj[key], v = car.speed, me = 0.98;
    const cars = T.cars.filter((c) => (c.active || c.entering) && c.key === key && !Number.isNaN(c.s));
    // ширина дороги — с запасом на то, что впереди она сужается
    const ch = g.world.chains[key], o = {}; let lf = p.lf;
    for (const d of [0.7, 1.4, 2.2, 3]) { const sq = p.s + v * d; if (sq < ch.total - 2) { ch.at(sq, o); lf = Math.min(lf, o.lf); } }
    const half = lf * 1.75 - 1.35, H = 3.2;
    // через сколько секунд мы упрёмся в машину, если встанем на отметку lat (99 — свободно)
    const reach = (c) => { const d = c.s - p.s - c.hl - 2.6; return d < -(c.hl * 2 + 5.4) ? 99 : d <= 0 ? 0 : d / Math.max(1.5, v - c.v); };
    // машина, которая перестраивается, занимает всю полосу от своего места до того, куда едет
    const span = (c, ts) => { const to = c.off + c.latV * Math.min(ts + 0.4, 1.6); return [Math.min(c.off, to) - c.hw - me - P.margin, Math.max(c.off, to) + c.hw + me + P.margin]; };
    const free = (lat) => { let best = 99; for (const c of cars) { const ts = reach(c); if (ts > H) continue; const [a, b] = span(c, ts); if (lat > a && lat < b) best = Math.min(best, ts); } return best; };
    let bestLat = p.lat, bestScore = -1e9, bestFree = 0;
    for (let lat = -half; lat <= half + 0.01; lat += 0.35) {
      const f = free(lat), move = Math.abs(lat - p.lat), tm = move / 4.2;
      // по дороге к этой отметке нельзя задеть тех, кто между нами и ею
      let ok = true;
      for (const c of cars) { const ts = reach(c); if (ts > tm + 0.35) continue; const lo = Math.min(lat, p.lat) - c.hw - me - 0.3, hi = Math.max(lat, p.lat) + c.hw + me + 0.3; if (c.off > lo && c.off < hi && Math.abs(p.lat - c.off) > c.hw + me + 0.2) { ok = false; break; } }
      if (!ok) continue;
      let sc = Math.min(f, H) * 3 - move * 0.55;
      // впритирку — лучше: рядом в ближайшие полторы секунды есть машина в полуметре от борта
      if (P.hunt) for (const c of cars) { const ts = reach(c); if (ts > 0.2 && ts < 1.6) { const gap = Math.abs(lat - c.off) - c.hw - me; if (gap > 0.42 && gap < 1.0) sc += P.bonus; } }
      if (sc > bestScore) { bestScore = sc; bestLat = lat; bestFree = f; }
    }
    const ry = Math.atan2(p.dx, p.dz), yawErr = Math.atan2(Math.sin(car.yaw - ry), Math.cos(car.yaw - ry));
    const want = Math.max(-0.2, Math.min(0.2, (bestLat - p.lat) * 0.07));
    const steer = Math.max(-1, Math.min(1, (want - yawErr) * 4.5));
    const here = free(p.lat), tight = Math.min(here, bestFree < 1 ? bestFree : 99);
    return { steer, throttle: v < P.vmax && tight > 0.9 ? 1 : 0, brake: tight < 0.55 ? 1 : 0, handbrake: false, launch: false };
  };
  // один шаг игрового времени (1/60 с) с отрисовкой
  P.step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (g.G.state === 'drive') g.input.override = pilot();
      g.tick(1 / 60); P.t += 1 / 60;
      if (g.G.near > P.lastNear) { P.lastNear = g.G.near; P.nearAt = P.t; }
      if ((g.G.state === 'crash' || g.G.state === 'busted') && !P.crashed) { P.crashed = true; P.why = (g.G.why || g.G.state) + ' на ' + P.t.toFixed(1) + ' с'; }
      g.draw(1 / 60);
    }
    anims();
    return { t: P.t, state: g.G.state, near: g.G.near, v: Math.round(car.speed * 3.6), sinceNear: P.t - P.nearAt, combo: g.G.combo, score: Math.round(g.G.score), crashed: P.crashed, why: P.why };
  };
  P.start = () => { P.crashed = false; P.lastNear = 0; P.nearAt = -9; g.startRun(); g.G.adPause = true; };
}

const step = (page, n) => page.evaluate((k) => window.__P.step(k), n);
const shot = async (page, name) => { const f = join(OUT, name); writeFileSync(f, await page.screenshot({ type: name.endsWith('.png') ? 'png' : 'jpeg', ...(name.endsWith('.png') ? {} : { quality: 93 }) })); console.log('  ✓', name); };

// Ехать, пока не случится подходящий момент (ok(state)), не дольше secs секунд игрового времени.
async function driveUntil(page, ok, secs) {
  let s;
  for (let i = 0; i < secs * 20; i++) { s = await step(page, 3); if (s.crashed) return null; if (ok(s)) return s; }
  return s;
}

if (what === 'probe') {
  const page = await open({ width: 1280, height: 720 });
  const t0 = Date.now();
  await page.evaluate(() => window.__P.start());
  let s;
  for (let i = 0; i < 300; i++) s = await step(page, 2);
  console.log('300 кадров за', Date.now() - t0, 'мс', s);
  await shot(page, 'probe.jpg');
}

if (what === 'shots') {
  // настольные: 1920×1080
  for (const [name, setup, when] of [
    ['desktop-1.jpg', {}, (s) => s.t > 9 && s.sinceNear > 0.2 && s.sinceNear < 0.3 && s.combo >= 3 && s.v > 120],
    ['desktop-2.jpg', { view: 2, car: 'sedan', color: 0x1f5fd0 }, (s) => s.t > 9 && s.sinceNear > 0.2 && s.sinceNear < 0.3 && s.v > 110],
    ['desktop-3.jpg', { car: 'gelik', color: 0x15171a, chase: true }, (s) => s.t > 11 && s.sinceNear > 0.2 && s.sinceNear < 0.3 && s.v > 100],
    ['desktop-4.jpg', { car: 'seven', color: 0xf2f2f0, rain: true, vmax: 34 }, (s) => s.t > 10 && s.sinceNear > 0.2 && s.sinceNear < 0.3 && s.v > 80],
  ]) await grab(name, { width: 1920, height: 1080 }, setup, when);
  // телефон в горизонтали: тот же кадр 16:9, но с экранным управлением
  for (const [name, setup, when] of [
    ['mobile-1.jpg', {}, (s) => s.t > 9 && s.sinceNear > 0.2 && s.sinceNear < 0.3 && s.combo >= 2 && s.v > 120],
    ['mobile-2.jpg', { car: 'gelik', color: 0xf2f2f0, chase: true }, (s) => s.t > 11 && s.sinceNear > 0.2 && s.sinceNear < 0.3 && s.v > 100],
    ['mobile-3.jpg', { view: 2, car: 'lada', color: 0xf0b400, vmax: 38 }, (s) => s.t > 9 && s.sinceNear > 0.2 && s.sinceNear < 0.3 && s.v > 90],
  ]) await grab(name, { width: 853, height: 480, dpr: 3, touch: true }, setup, when);
}

async function grab(name, view, setup, when) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { chase, rain, vmax, ...store } = setup;
    const page = await open({ ...view, store });
    await page.evaluate((o) => {
      const g = window.__game, P = window.__P;
      if (o.vmax) P.vmax = o.vmax;
      P.start();
      if (o.rain) { g.rain.on = true; g.rain.wet = 1; g.rain.next = 999; }
      P.chase = !!o.chase;
    }, { chase, rain, vmax });
    await step(page, 60 * 7); // вступление: съезд с площадки
    if (chase) await page.evaluate(() => { const g = window.__game; g.chase.start(2, g.car.speed); g.chase.gap = 55; });
    const s = await driveUntil(page, (st) => { return when(st); }, 60);
    if (s && !s.crashed && when(s)) { await shot(page, name); await page.close(); return; }
    console.log('  … ещё попытка для', name, s ? `(t=${s.t.toFixed(0)}, впритирку ${s.near})` : '(авария)');
    await page.close();
  }
  console.log('  ✗ не вышло:', name);
}

// пробный прогон без съёмки: какой дубль получится удачным (проходов побольше и без аварии)
if (what === 'dry') {
  for (let attempt = 0; attempt < 10; attempt++) {
    const page = await open({ width: 1280, height: 720 });
    await page.evaluate((k) => { const P = window.__P; P.bonus = 3; P.vmax = 40 + k * 1.2; P.start(); }, attempt);
    const s = await step(page, 60 * 29.6);
    console.log(`дубль ${attempt}: ${s.crashed ? 'авария (' + s.why + ')' : 'цел'}, впритирку ${s.near}, очки ${s.score}`);
    await page.close();
  }
}

if (what === 'video') {
  const W = 1920, Hh = 1080, FPS = 30, SECS = 27, tmp = join(OUT, 'frames');
  const from = process.argv.includes('--take') ? +process.argv[process.argv.indexOf('--take') + 1] : 0;
  for (let attempt = from; attempt < from + 8; attempt++) {
    rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
    const page = await open({ width: W, height: Hh });
    await page.evaluate((k) => { const P = window.__P; P.bonus = 3; P.vmax = 40 + k * 1.2; P.start(); }, attempt); // каждый дубль чуть другой: тот же заезд дважды не повторяется
    await step(page, 60 * 2.6); // начало вступления пропускаем: в кадре сразу срыв с места
    let ok = true, s;
    for (let i = 0; i < FPS * SECS; i++) {
      s = await step(page, 60 / FPS);
      if (s.crashed) { ok = false; break; }
      writeFileSync(join(tmp, `f${String(i).padStart(5, '0')}.jpg`), await page.screenshot({ type: 'jpeg', quality: 92 }));
      if (i % 90 === 0) console.log(`  кадр ${i}/${FPS * SECS}: ${s.v} км/ч, впритирку ${s.near}, очки ${s.score}`);
    }
    await page.close();
    if (!ok || s.near < 5) { console.log(`  … дубль ${attempt + 1} не удался (${ok ? 'проходов впритирку всего ' + s.near : 'авария'}), ещё попытка`); continue; }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(tmp, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'slow', '-movflags', '+faststart', join(OUT, 'gameplay.mp4')]);
    rmSync(tmp, { recursive: true, force: true });
    console.log('  ✓ gameplay.mp4');
    break;
  }
}

// Иконка и обложка — не скриншоты (их для этого брать нельзя), а постановочный кадр: машина крупно, снизу и спереди,
// за ней поток и ночной город, поверх — название.
if (what === 'art') {
  const stage = async (page, cam, html) => page.evaluate((cam, html) => {
    const g = window.__game, c = g.car, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = fz, lz = -fx; // lx, lz — влево от машины
    for (const id of ['hud', 'touch', 'fx', 'pauseBtn', 'vig', 'cops', 'drift']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    const [f, l, h, tf, tl, th] = cam;
    g.G.freeCam = [c.x + fx * f + lx * l, h, c.z + fz * f + lz * l, c.x + fx * tf + lx * tl, th, c.z + fz * tf + lz * tl];
    g.camera.fov = cam[6] || 38; g.camera.updateProjectionMatrix();
    g.scene.fog.far = 900;
    g.draw(0); g.draw(0);
    let o = document.getElementById('__art');
    if (!o) { o = document.createElement('div'); o.id = '__art'; document.body.append(o); }
    o.innerHTML = html;
  }, cam, html);
  const css = `<style>
    #__art { position: fixed; inset: 0; z-index: 99; font-family: system-ui, -apple-system, sans-serif; color: #fff; overflow: hidden; }
    #__art .shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 62% 62%, transparent 30%, rgba(4, 6, 12, 0.6) 100%), linear-gradient(180deg, rgba(6, 8, 16, 0.55) 0%, transparent 42%); }
    #__art h1 { position: absolute; margin: 0; font-weight: 900; font-style: italic; letter-spacing: 0.01em; line-height: 0.9; transform: skewX(-6deg);
      background: linear-gradient(180deg, #fff 28%, #ffc79f 62%, #ff6a3c 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 0 rgba(0, 0, 0, 0.55)) drop-shadow(0 0 26px rgba(255, 106, 60, 0.55)); }
    #__art p { position: absolute; margin: 0; font-weight: 800; letter-spacing: 0.34em; text-transform: uppercase; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8); }
  </style>`;
  // заезд до красивого момента: скорость, рядом машины
  const ready = async (page) => {
    await page.evaluate(() => window.__P.start());
    await step(page, 60 * 7);
    return driveUntil(page, (s) => s.t > 12 && s.sinceNear > 0.1 && s.sinceNear < 0.22 && s.v > 130, 60);
  };
  // обложка 800×470
  for (let k = 0; k < 6; k++) {
    const page = await open({ width: 800, height: 470, dpr: 2 });
    const s = await ready(page);
    if (!s || s.crashed) { await page.close(); continue; }
    await stage(page, [7.4, 3.3, 0.62, 0.6, -0.9, 0.78, 34], css + `<div class="shade"></div><h1 style="left:34px;top:26px;font-size:112px">ШАШКИ</h1><p style="left:42px;top:136px;font-size:19px">Краснодар · ночь</p>`);
    writeFileSync(join(OUT, 'cover@2x.png'), await page.screenshot({ type: 'png' }));
    execFileSync('sips', ['-z', '470', '800', join(OUT, 'cover@2x.png'), '--out', join(OUT, 'cover.png')], { stdio: 'ignore' });
    // иконка 512×512: та же сцена, машина крупнее
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await stage(page, [6.2, 2.9, 0.6, 0.2, -0.25, 0.74, 36], css + `<div class="shade"></div><h1 style="left:0;right:0;top:22px;text-align:center;font-size:104px">ШАШКИ</h1>`);
    writeFileSync(join(OUT, 'icon@2x.png'), await page.screenshot({ type: 'png' }));
    execFileSync('sips', ['-z', '512', '512', join(OUT, 'icon@2x.png'), '--out', join(OUT, 'icon.png')], { stdio: 'ignore' });
    await page.close();
    console.log('  ✓ cover.png, icon.png');
    break;
  }
}

await browser.close();
