// Управление: клавиатура и экран. steer > 0 — влево. На экране три способа рулить на выбор:
// стрелки, руль (тянешь по кругу) и наклон телефона. Газ и тормоз — педали, моргание — подрулевой «лепесток».
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, flash: false, launch: false };
    this.flashQueued = false; // нажатие «моргнуть» ждёт, пока игра его заберёт
    this.override = null;     // для автотестов
    this.mode = 'arrows';     // arrows | wheel | tilt
    this.wheel = 0;           // руль на экране: −1…1, плюс — влево
    this.tilt = 0;            // наклон телефона: −1…1
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if ((e.code === 'Space' || e.code === 'KeyF') && !e.repeat) this.flashQueued = true; // моргнуть — пробел
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); for (const k in this.touch) this.touch[k] = false; });
    for (const el of document.querySelectorAll('[data-ctl]')) {
      const name = el.dataset.ctl;
      const set = (v) => (e) => { e.preventDefault(); if (v && name === 'flash') this.flashQueued = true; this.touch[name] = v; el.classList.toggle('on', v); if (v) el.setPointerCapture?.(e.pointerId); };
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('lostpointercapture', set(false));
    }
    // руль: ведём пальцем вокруг центра, поворот на 110° в сторону — упор; отпустил — сам вернётся
    const pad = document.getElementById('wheelPad'), art = document.getElementById('wheelArt');
    if (pad) {
      let grab = null; // угол пальца в момент захвата и положение руля тогда
      const angle = (e) => { const r = pad.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); };
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture?.(e.pointerId); grab = { a: angle(e), w: this.wheel }; });
      pad.addEventListener('pointermove', (e) => {
        if (!grab) return;
        let d = angle(e) - grab.a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.wheel = Math.max(-1, Math.min(1, grab.w - d / 1.92)); // 1,92 рад = 110°
        grab = { a: angle(e), w: this.wheel };
      });
      const drop = () => { grab = null; };
      pad.addEventListener('pointerup', drop); pad.addEventListener('pointercancel', drop); pad.addEventListener('lostpointercapture', drop);
      const spin = () => { if (!grab && this.wheel) this.wheel *= 0.8, Math.abs(this.wheel) < 0.01 && (this.wheel = 0); art.style.transform = `rotate(${(-this.wheel * 110).toFixed(1)}deg)`; requestAnimationFrame(spin); };
      requestAnimationFrame(spin);
    }
    // наклон: телефон держат горизонтально, как руль; ±22° — полный поворот
    addEventListener('deviceorientation', (e) => {
      if (e.beta == null) return;
      const o = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      const lean = o === 90 ? e.beta : o === 270 || o === -90 ? -e.beta : e.gamma; // крен вокруг оси «на игрока»
      const k = Math.max(-1, Math.min(1, -lean / 22));
      this.tilt = Math.abs(k) < 0.06 ? 0 : k;
    });
  }

  // сменить способ рулить; для наклона на айфоне нужно разрешение — его можно спросить только по нажатию
  setMode(mode) {
    this.mode = mode; this.wheel = 0; this.tilt = 0;
    const t = document.getElementById('touch');
    if (t) t.dataset.mode = mode;
    if (mode === 'tilt' && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => { /* отказали — руль не будет работать, игрок выберет другой способ */ });
  }

  takeFlash() { const f = this.flashQueued; this.flashQueued = false; return f; }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  read(out) {
    if (this.override) return Object.assign(out, this.override);
    const t = this.touch;
    const l = this.down('ArrowLeft', 'KeyA') || t.left, r = this.down('ArrowRight', 'KeyD') || t.right;
    out.steer = (l ? 1 : 0) - (r ? 1 : 0);
    if (!out.steer && this.mode === 'wheel') out.steer = this.wheel;
    if (!out.steer && this.mode === 'tilt') out.steer = this.tilt;
    out.throttle = this.down('ArrowUp', 'KeyW') || t.gas ? 1 : 0;
    out.brake = this.down('ArrowDown', 'KeyS') || t.brake ? 1 : 0;
    out.handbrake = false; // ручника в игре нет: занос — только на разворотах
    out.launch = this.down('ShiftLeft', 'ShiftRight', 'KeyL') || t.launch; // старт со светофора
    return out;
  }
}
