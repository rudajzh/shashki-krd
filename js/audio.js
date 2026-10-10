// Звук синтезируется на лету: мотор, визг шин, свист при обгоне впритирку, удар.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // мотор: две пилы через фильтр
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.osc1.connect(this.engFilter); this.osc2.connect(g2); g2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.osc1.start(); this.osc2.start();

    // шум для шин, ветра и ударов
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { f, g };
    };
    this.squeal = loop('bandpass', 1900, 9);
    this.wind = loop('lowpass', 500, 0.5);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }

  update(rpm, throttle, slip, speed, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = rpm / 60 * 2;
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(350 + rpm * 0.22 + throttle * 900, t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.09 + throttle * 0.11 : 0, t, 0.08);
    this.squeal.g.gain.setTargetAtTime(active ? slip * 0.16 : 0, t, 0.05);
    this.squeal.f.frequency.setTargetAtTime(1500 + speed * 12, t, 0.1);
    this.wind.g.gain.setTargetAtTime(active ? Math.min(0.22, speed * speed / 14000) : 0, t, 0.2);
    this.wind.f.frequency.setTargetAtTime(300 + speed * 14, t, 0.2);
  }

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

  whoosh() { this.burst(900, 1.2, 0.5, 0.35, 0.35); }
  crash() { this.burst(180, 0.6, 1.4, 0.7, 0.4); this.burst(2400, 0.8, 0.5, 0.25, 0.5); }
  finish() { this.burst(1200, 6, 0.4, 0.5, 2); }
}
