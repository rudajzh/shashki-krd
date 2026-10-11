// Звук: мотор, визг шин, свист при обгоне впритирку, удар, гудки, сигналы старта.
// Почти всё синтезируется на лету; две вещи — настоящие записи (assets/sound, лицензия CC0):
// рокот V8 на холостых и малых оборотах и визг шин. Запись мотора есть только на холостом ходу, поэтому
// она звучит внизу и в середине (высота меняется вместе с оборотами), а к верхам уступает место синтезу.
//
// Мотор собран по образцу записи настоящего V10: главная гармоника идёт на 2,5 оборота коленвала
// (по пять цилиндров на каждый выпускной тракт), над ней — ряд кратных, между ними слабые «половинные»,
// к верхним оборотам голос переходит на 5-ю гармонику, и всё это лежит на широком шуме впуска и выхлопа.
// Для седана — V8: главная 4-я гармоника и сильные неровные «полуторные», которые дают бурление.
const ENGINES = {
  v10: { order: 2.5, rev: 1.15, main: [1, 0.7, 0.36, 0.2, 0.16, 0.1, 0.08, 0.06, 0.05, 0.04], half: [0.3, 0.35, 0.12, 0.12, 0, 0.16, 0.2, 0.18, 0.12, 0, 0.1, 0.08], top: [1, 0.5, 0.28, 0.15], topGain: 1.0, lp: [900, 0.55, 2600], noise: [1900, 0.6], drive: 2.4 },
  // У каждого мотора свой строй. rev — насколько высоко он «поёт» на тех же оборотах, lp — как открывается звук,
  // lump — неровность («ру-ру-ру»): какая доля громкости качается и на какой гармонике, smp — громкость записи
  // настоящего V8 и до каких оборотов она слышна.
  // 16-клапанная «четвёрка»: главная — 2-я гармоника, звук сухой, ровный, без визга
  i4: { order: 2, rev: 0.78, main: [1, 0.55, 0.3, 0.2, 0.1, 0.06], half: [0.1, 0.34, 0.12, 0, 0.1, 0.2, 0.06], top: [1, 0.35, 0.15], topGain: 0.16, lp: [330, 0.26, 1100], noise: [900, 0.3], drive: 2.8, smp: 0.2, lump: [1, 0.1] },
  // старая карбюраторная «четвёрка»: ниже, с дребезгом и тракторной неровностью
  i4old: { order: 2, rev: 0.64, main: [1, 0.7, 0.5, 0.28, 0.2, 0.12, 0.08], half: [0.3, 0.5, 0.3, 0, 0.28, 0.34, 0.2, 0, 0.12], top: [1, 0.3], topGain: 0.06, lp: [260, 0.2, 800], noise: [650, 0.5], drive: 4.2, smp: 0.35, lump: [0.5, 0.3] },
  // большой V8 внедорожника: низко, жирно, с рокотом — запись настоящего V8 слышна почти до отсечки
  v8low: { order: 4, rev: 0.5, main: [1, 0.5, 0.26, 0.12, 0.06, 0.04], half: [0.5, 0.7, 0.75, 0.9, 0.5, 0.7, 0.4, 0, 0.2, 0.14], top: [1, 0.3], topGain: 0.04, lp: [240, 0.17, 800], noise: [520, 0.5], drive: 3.6, smp: 1.9, smpTo: 7600, lump: [0.5, 0.34] },
  v8: { order: 4, rev: 0.92, main: [1, 0.5, 0.3, 0.18, 0.1, 0.07, 0.05, 0.04], half: [0.1, 0.22, 0.35, 0.5, 0.3, 0.42, 0.25, 0, 0.15, 0.12], top: [1, 0.4, 0.2], topGain: 0.35, lp: [500, 0.4, 1800], noise: [1300, 0.4], drive: 3.0 },
};

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.kind = 'v8'; this.lastGear = 1; this.lastThr = 0; }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // шум для шин, ветра, ударов и «дыхания» мотора
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, freq, q, out = this.master) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(out); src.start();
      return { f, g };
    };

    // мотор: три голоса (главный ряд, «половинные» гармоники, верхний ряд) → насыщение → фильтры
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engGain.connect(this.master);
    this.engLp = ctx.createBiquadFilter(); this.engLp.type = 'lowpass'; this.engLp.frequency.value = 800; this.engLp.Q.value = 0.7;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 480; body.Q.value = 1; body.gain.value = 5; // «бочка» выхлопа
    this.shaper = ctx.createWaveShaper();
    this.shaper.connect(this.engLp); this.engLp.connect(body); body.connect(this.engGain);
    const voice = () => { const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.shaper); o.start(); return { o, g }; };
    this.vMain = voice(); this.vHalf = voice(); this.vTop = voice();
    this.engNoise = loop('bandpass', 1900, 0.55, this.engGain);
    // неровность: громкость мотора слегка качается в такт оборотам — отсюда «ру-ру-ру» у больших и старых моторов
    this.lump = ctx.createOscillator(); this.lump.type = 'sine'; this.lump.frequency.value = 8;
    this.lumpG = ctx.createGain(); this.lumpG.gain.value = 0;
    this.lump.connect(this.lumpG); this.lumpG.connect(this.engGain.gain); this.lump.start(); // широкий шум впуска и выхлопа — без него мотор звучит как орган
    this.setEngine(this.kind);

    this.squeal = loop('bandpass', 1900, 9);
    // настоящие записи: подгружаются в фоне, до тех пор (и если не загрузятся) работает синтез
    this.smp = {};
    const sample = (name, url) => fetch(url).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))).then((buf) => {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = true; g.gain.value = 0;
      src.connect(g); g.connect(this.master); src.start();
      this.smp[name] = { src, g };
    }).catch(() => { /* нет файла или формат не поддержан — остаёмся на синтезе */ });
    sample('idle', 'assets/sound/v8-idle.wav?v=23');
    sample('squeal', 'assets/sound/tire-squeal.wav?v=23');
    this.rainN = loop('highpass', 2600, 0.4);
    // сирена патруля: тон, который «качается» между двумя нотами
    this.sirenO = ctx.createOscillator(); this.sirenO.type = 'square'; this.sirenO.frequency.value = 700;
    this.sirenG = ctx.createGain(); this.sirenG.gain.value = 0;
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
    this.sirenO.connect(sf); sf.connect(this.sirenG); this.sirenG.connect(this.master); this.sirenO.start();
    this.wind = loop('lowpass', 500, 0.5);
  }

  // какой мотор звучит: 'v8' или 'v10'
  setEngine(kind) {
    this.kind = ENGINES[kind] ? kind : 'v8';
    if (!this.ctx) return;
    const E = ENGINES[this.kind], ctx = this.ctx;
    const wave = (amps) => {
      const n = amps.length + 1, re = new Float32Array(n), im = new Float32Array(n);
      amps.forEach((a, i) => { const ph = (i * 2.399) % 6.283; re[i + 1] = a * Math.cos(ph); im[i + 1] = a * Math.sin(ph); }); // фазы вразнобой — волна не «пищит»
      return ctx.createPeriodicWave(re, im);
    };
    this.vMain.o.setPeriodicWave(wave(E.main)); this.vHalf.o.setPeriodicWave(wave(E.half)); this.vTop.o.setPeriodicWave(wave(E.top));
    const curve = new Float32Array(257);
    for (let i = 0; i < 257; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * E.drive) / Math.tanh(E.drive); }
    this.shaper.curve = curve;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }

  update(rpm, throttle, slip, speed, active, gear = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, E = ENGINES[this.kind];
    const rot = rpm / 60 * E.rev, k = Math.max(0, Math.min(1, (rpm - 1000) / 6400)); // обороты в герцах и их доля от максимума
    const jit = 1 + (Math.random() - 0.5) * 0.012; // живой мотор чуть «плавает»
    this.vMain.o.frequency.setTargetAtTime(rot * E.order * jit, t, 0.025);
    this.vHalf.o.frequency.setTargetAtTime(rot * 0.5 * jit, t, 0.025);
    this.vTop.o.frequency.setTargetAtTime(rot * E.order * 2 * jit, t, 0.025);
    this.vMain.g.gain.setTargetAtTime(0.3 + 0.14 * throttle, t, 0.05);
    this.vHalf.g.gain.setTargetAtTime(0.26 - 0.12 * k, t, 0.05);
    this.vTop.g.gain.setTargetAtTime(E.topGain * 0.42 * k * k * (0.3 + 0.7 * throttle), t, 0.05);
    this.engLp.frequency.setTargetAtTime(E.lp[0] + rpm * E.lp[1] + throttle * E.lp[2], t, 0.05);
    this.engNoise.f.frequency.setTargetAtTime(E.noise[0] + rpm * 0.25, t, 0.1);
    this.engNoise.g.gain.setTargetAtTime(E.noise[1] * (0.15 + throttle) * (0.3 + k), t, 0.06);
    const vol = active ? 0.05 + 0.05 * k + throttle * (0.1 + 0.07 * k) : 0;
    this.engGain.gain.setTargetAtTime(vol, t, 0.07);
    const lump = E.lump || [0.5, 0];
    this.lump.frequency.setTargetAtTime(Math.max(3, rot * lump[0]), t, 0.05);
    this.lumpG.gain.setTargetAtTime(vol * lump[1] * (1 - 0.5 * k), t, 0.07);
    if (active) {
      // переключение вверх: тяга на миг пропадает и глухо «бухает» выхлоп
      if (gear > this.lastGear && throttle > 0.3) {
        this.engGain.gain.cancelScheduledValues(t);
        this.engGain.gain.setTargetAtTime(0.04, t, 0.012);
        this.engGain.gain.setTargetAtTime(0.05 + 0.05 * k + throttle * (0.1 + 0.07 * k), t + 0.07, 0.04);
        this.burst(150, 0.8, 0.5, 0.14, 0.6);
      }
      // сброс газа на высоких оборотах: «стреляет» в выхлопе
      if (this.lastThr > 0.5 && throttle < 0.1 && rpm > 4300) for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) setTimeout(() => this.burst(500 + Math.random() * 1100, 2.5, 0.2 + Math.random() * 0.15, 0.04), 60 + i * 90 + Math.random() * 70);
    }
    this.lastGear = gear; this.lastThr = throttle;
    // запись V8: на холостых звучит как есть, с оборотами ускоряется и выше 2200 об/мин постепенно уходит под синтез
    if (this.smp.idle) {
      const fade = Math.max(0.2, Math.min(1, 1 - (rpm - 2200) / ((E.smpTo || 6000) - 2200)));
      this.smp.idle.src.playbackRate.setTargetAtTime(Math.max(0.6, Math.min(5, rpm * E.rev / 1020)), t, 0.03);
      this.smp.idle.g.gain.setTargetAtTime(active ? fade * (0.1 + 0.1 * throttle) * (E.smp ?? (this.kind === 'v8' ? 1 : 0.6)) : 0, t, 0.07);
    }
    if (this.smp.squeal) {
      this.smp.squeal.src.playbackRate.setTargetAtTime(0.5 + speed * 0.0045, t, 0.1);
      this.smp.squeal.g.gain.setTargetAtTime(active ? Math.min(1, slip) * 0.5 : 0, t, 0.05);
      slip *= 0.3; // шумовой визг остаётся лёгким призвуком
    }
    this.squeal.g.gain.setTargetAtTime(active ? slip * 0.16 : 0, t, 0.05);
    this.squeal.f.frequency.setTargetAtTime(1500 + speed * 12, t, 0.1);
    this.wind.g.gain.setTargetAtTime(active ? Math.min(0.22, speed * speed / 14000) : 0, t, 0.2);
    this.wind.f.frequency.setTargetAtTime(300 + speed * 14, t, 0.2);
  }

  // шум дождя и сирена: wet и near — от 0 до 1
  weather(wet, near) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainN.g.gain.setTargetAtTime(wet * 0.13, t, 0.4);
    this.sirenG.gain.setTargetAtTime(near * 0.07, t, 0.15);
    this.sirenO.frequency.setTargetAtTime(Math.floor(t * 2.2) % 2 ? 930 : 690, t, 0.04);
  }

  // Гудок недовольного водителя. У автомобильного сигнала два рожка — низкий и высокий тон примерно в большую терцию,
  // звук резкий, с «носовым» призвуком около 2–3 кГц. Каждый раз гудят по-разному: коротко, длинно или два раза.
  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime, r = Math.random();
    const blasts = r < 0.45 ? [0.3] : r < 0.75 ? [0.62] : [0.13, 0.24];
    const tune = 0.95 + Math.random() * 0.1, vol = 0.07 + Math.random() * 0.05; // у каждой машины свой тон и своя дальность
    const out = ctx.createGain(); out.gain.value = 1;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 330;
    const nose = ctx.createBiquadFilter(); nose.type = 'peaking'; nose.frequency.value = 2400; nose.Q.value = 1.1; nose.gain.value = 9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4600;
    out.connect(hp); hp.connect(nose); nose.connect(lp); lp.connect(this.master);
    let t = t0;
    for (const dur of blasts) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.setValueAtTime(vol, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.07);
      g.connect(out);
      for (const f of [408, 512]) for (const [type, k] of [['sawtooth', 1], ['square', 0.45]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = type; og.gain.value = k;
        o.frequency.setValueAtTime(f * tune, t); o.frequency.linearRampToValueAtTime(f * tune * 0.975, t + dur + 0.07); // машина остаётся позади — тон чуть падает
        o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1);
      }
      t += dur + 0.1;
    }
  }
  // короткая «крякалка»
  siren() { if (!this.ctx) return; const t = this.ctx.currentTime; this.sirenG.gain.cancelScheduledValues(t); this.sirenG.gain.setValueAtTime(0.16, t); this.sirenG.gain.setTargetAtTime(0, t + 0.5, 0.12); }

  burst(freq, q, vol, dur, sweep = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // чистый тон: сигналы стартовых огней
  tone(freq, dur, vol = 0.16, type = 'triangle') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  lightOn() { this.tone(740, 0.13); }                                       // загорелся очередной красный огонь
  lightsGo() { this.tone(1480, 0.5, 0.2); this.tone(1110, 0.5, 0.1); }      // зелёный
  falseStart() { this.tone(160, 0.45, 0.2, 'sawtooth'); this.tone(151, 0.45, 0.2, 'sawtooth'); }
  // шины взвизгнули, машина сорвалась
  launch(k = 1) {
    this.burst(260, 0.7, 0.7 * k, 0.3, 0.5);
    if (!this.smp.squeal) { this.burst(1700, 5, 0.5 * k, 0.5, 0.75); return; }
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = this.smp.squeal.src.buffer; src.playbackRate.value = 0.62;
    g.gain.setValueAtTime(0.55 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(g); g.connect(this.master); src.start(t); src.stop(t + 1);
  }

  splash() { this.burst(1400, 0.6, 0.45, 0.28, 0.5); } // проехали лужу
  flash() { this.burst(2600, 5, 0.35, 0.05); setTimeout(() => this.burst(2600, 5, 0.35, 0.05), 140); }
  whoosh() { this.burst(900, 1.2, 0.5, 0.35, 0.35); }
  crash() { this.burst(180, 0.6, 1.4, 0.7, 0.4); this.burst(2400, 0.8, 0.5, 0.25, 0.5); }
  finish() { this.burst(1200, 6, 0.4, 0.5, 2); }
}
