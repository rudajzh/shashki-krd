// Реклама и площадка. На Яндекс Играх работает их SDK: полноэкранная реклама между заездами и ролики
// за вознаграждение. Вне Яндекса (на своём сайте, при разработке) SDK нет — там полноэкранной рекламы не бывает,
// а «ролик» заменяет короткая заглушка, чтобы всё, что выдаётся за просмотр, можно было проверить.
export class Ads {
  constructor({ onPause, onResume } = {}) {
    this.sdk = null;
    this.lastFull = performance.now(); // первую полноэкранную показываем не сразу
    this.onPause = onPause || (() => {});
    this.onResume = onResume || (() => {});
    this.busy = false;
    if (/yandex|playhop/.test(location.hostname) || new URLSearchParams(location.search).has('ysdk')) {
      const s = document.createElement('script');
      s.src = '/sdk.js';
      s.onload = () => window.YaGames && window.YaGames.init().then((sdk) => { this.sdk = sdk; this.ready(); }).catch(() => {});
      document.head.append(s);
    }
  }

  // игра загрузилась и готова — площадка убирает свою заставку
  ready() { this.loaded = true; try { this.sdk?.features?.LoadingAPI?.ready(); } catch { /* старая версия SDK */ } }
  // площадке нужно знать, когда идёт сам заезд, а когда меню
  gameplay(on) { try { const g = this.sdk?.features?.GameplayAPI; if (g) on ? g.start() : g.stop(); } catch { /* нет такого API */ } }

  // Полноэкранная реклама: только в паузе между заездами и не чаще раза в три минуты. Возвращает обещание,
  // которое выполняется, когда реклама закрыта (или сразу, если показывать нечего).
  interstitial() {
    if (!this.sdk || this.busy || performance.now() - this.lastFull < 180000) return Promise.resolve(false);
    this.busy = true; this.onPause();
    return new Promise((done) => {
      const end = (shown) => { this.busy = false; this.lastFull = performance.now(); this.onResume(); done(shown); };
      try { this.sdk.adv.showFullscreenAdv({ callbacks: { onClose: (wasShown) => end(!!wasShown), onError: () => end(false) } }); } catch { end(false); }
    });
  }

  // Ролик за вознаграждение. Обещание выполняется с true, только если игрок досмотрел до конца.
  rewarded() {
    if (this.busy) return Promise.resolve(false);
    this.busy = true; this.onPause();
    return new Promise((done) => {
      let got = false;
      const end = () => { this.busy = false; this.lastFull = performance.now(); this.onResume(); done(got); };
      if (this.sdk) {
        try { this.sdk.adv.showRewardedVideo({ callbacks: { onRewarded: () => { got = true; }, onClose: end, onError: end } }); } catch { end(); }
        return;
      }
      // заглушка вне Яндекса
      const el = document.createElement('div');
      el.className = 'fakead';
      el.innerHTML = '<div><b>Здесь будет ролик</b><span>на Яндекс Играх — настоящая реклама</span><i></i></div>';
      document.body.append(el);
      setTimeout(() => { got = true; el.remove(); end(); }, 1600);
    });
  }
}
