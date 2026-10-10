// Управление: клавиатура и экранные кнопки. steer > 0 — влево.
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false, flash: false };
    this.flashQueued = false; // нажатие «моргнуть» ждёт, пока игра его заберёт
    this.override = null; // для автотестов
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if ((e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) this.flashQueued = true;
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
  }

  takeFlash() { const f = this.flashQueued; this.flashQueued = false; return f; }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  read(out) {
    if (this.override) return Object.assign(out, this.override);
    const t = this.touch;
    const l = this.down('ArrowLeft', 'KeyA') || t.left, r = this.down('ArrowRight', 'KeyD') || t.right;
    out.steer = (l ? 1 : 0) - (r ? 1 : 0);
    out.throttle = this.down('ArrowUp', 'KeyW') || t.gas ? 1 : 0;
    out.brake = this.down('ArrowDown', 'KeyS') || t.brake ? 1 : 0;
    out.handbrake = this.down('Space') || t.hand;
    return out;
  }
}
