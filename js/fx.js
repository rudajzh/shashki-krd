// Награды на экране. За что начисляются очки и монеты, игроку не объясняют словами, а показывают:
// число вылетает оттуда, где он только что прошёл впритирку, и улетает в счёт; следом летят монеты — в кошелёк;
// кольцо серии догорает на глазах; большие события (старт, занос, уход от погони) — крупной плашкой.
const $ = (id) => document.getElementById(id);
const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const RING = 2 * Math.PI * 20;

export class Fx {
  constructor(sound) {
    this.sound = sound;
    this.layer = $('fx');
    this.score = 0; this.coins = 0; this.combo = 1; this.flying = 0;
    $('comboRing').style.strokeDasharray = RING;
  }

  reset(score = 0, coins = 0) {
    this.score = score; this.coins = coins; this.flying = 0;
    this.layer.textContent = '';
    $('banner').className = ''; $('place').hidden = true;
  }

  // «+240» в точке экрана (x, y): подпрыгивает и улетает в счёт очков. tone — near | tight | head | big
  points(x, y, pts, tone = 'near', word = '') {
    const el = document.createElement('div');
    el.className = 'fly ' + tone;
    el.innerHTML = (word ? `<small>${word}</small>` : '') + '+' + Math.round(pts).toLocaleString('ru-RU');
    this.layer.append(el);
    const [tx, ty] = center($('score'));
    x = Math.max(70, Math.min(innerWidth - 70, x)); y = Math.max(70, Math.min(innerHeight - 90, y));
    el.animate([
      { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.5)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 26}px) translate(-50%, -50%) scale(1.25)`, opacity: 1, offset: 0.16 },
      { transform: `translate(${x}px, ${y - 34}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.45)`, opacity: 0.2 },
    ], { duration: 820, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' }).onfinish = () => { el.remove(); this.bump('scoreBox'); };
  }

  // монеты из точки экрана летят в кошелёк; n — сколько штук показать
  fly(x, y, n) {
    const [tx, ty] = center($('wallet'));
    n = Math.max(1, Math.min(10, Math.round(n)));
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'coin flycoin';
      this.layer.append(el);
      const a = Math.random() * 6.28, r = 26 + Math.random() * 34, mx = x + Math.cos(a) * r, my = y + Math.sin(a) * r - 18;
      this.flying++;
      el.animate([
        { transform: `translate(${x}px, ${y}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 1 },
      ], { duration: 620 + i * 45, delay: i * 38, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'backwards' }).onfinish = () => {
        el.remove(); this.flying--; this.bump('wallet');
        if (this.sound && i % 2 === 0) this.sound.coin(i);
      };
    }
  }

  // вспышка по краю экрана с той стороны, где прошли машину
  edge(left, tone = 'near') {
    const el = $(left ? 'edgeL' : 'edgeR');
    el.className = 'edge ' + (left ? 'l ' : 'r ') + tone;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
  }

  // большая плашка: событие и его цена. tone — gold | silver | red | blue | hot
  banner(title, sub = '', tone = 'gold') {
    const el = $('banner');
    $('bannerT').textContent = title; $('bannerS').innerHTML = sub;
    el.className = '';
    void el.offsetWidth;
    el.className = 'show ' + tone;
  }

  bump(id) {
    const el = $(id);
    el.getAnimations().forEach((a) => a.id === 'bump' && a.cancel());
    el.animate([{ transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' }).id = 'bump';
  }

  // место в заезде со светофора (0 — спрятать)
  place(n, of) {
    const el = $('place');
    if (el.hidden !== !n) el.hidden = !n;
    if (!n) return;
    if ($('placeN').textContent !== String(n)) { $('placeN').textContent = n; this.bump('place'); }
    $('placeOf').textContent = 'из ' + of;
    el.classList.toggle('first', n === 1);
  }

  // раз в кадр: счётчики докручиваются до настоящих значений, кольцо серии догорает
  update(dt, score, coins, combo, comboK, heat) {
    this.score += (score - this.score) * Math.min(1, dt * 9);
    if (score - this.score < 1) this.score = score;
    // пока монеты летят, счётчик докручивается медленнее — прибавка совпадает с их прилётом
    this.coins += (coins - this.coins) * Math.min(1, dt * (this.flying > 0 ? 2.5 : 10));
    if (Math.abs(coins - this.coins) < 0.5) this.coins = coins;
    $('score').textContent = Math.round(this.score).toLocaleString('ru-RU');
    $('runCoins').textContent = Math.round(this.coins).toLocaleString('ru-RU');
    const box = $('comboBox');
    if (combo !== this.combo) {
      if (combo > this.combo) { this.bump('comboBox'); if (this.sound) this.sound.combo(combo); }
      this.combo = combo;
      $('combo').textContent = '×' + combo;
      box.className = 'combo' + (combo > 1 ? ' live' : '') + (combo >= 7 ? ' max' : combo >= 4 ? ' hot' : '');
    }
    $('comboRing').style.strokeDashoffset = (RING * (1 - Math.max(0, Math.min(1, comboK)))).toFixed(1);
    // спидометр «греется», когда скорость приносит очки
    $('heat').style.width = Math.round(Math.max(0, Math.min(1, heat)) * 100) + '%';
    $('speedBox').classList.toggle('paying', heat > 0);
  }
}
