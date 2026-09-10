/* =============================================================
 * 一番街なう － 横スワイプのカルーセル（共通）
 *
 * トップページの昼バナーと、「昼の一番街」ページの月イチ番街で
 * 同じものを使っています。
 *
 * ★横スワイプ自体は CSS（scroll-snap）だけで動いています。
 *   このファイルがやっているのは
 *     ① いま何枚目かを示すドットの点灯
 *     ② ゆっくりした自動送り
 *   の2つだけです。
 *
 * ★ユーザーが指で触った時点で、自動送りは止まります。
 *   案内が操作の邪魔をしないようにするためです。
 * ============================================================= */

/* 動いている自動送りを覚えておく場所。
   バナーを作り直したときに、前の自動送りが残って
   二重に動いてしまうのを防ぎます。 */
const carouselTimers = {};

function initCarousel(trackId, dotsId, opts) {
  const options = opts || {};
  const delay    = options.delay    || 7000;   // 動き始めるまでの待ち時間
  const interval = options.interval || 6000;   // 次のバナーに移るまでの間隔

  // 前に動いていたものがあれば、まず止めます
  if (carouselTimers[trackId]) {
    clearTimeout(carouselTimers[trackId].start);
    clearInterval(carouselTimers[trackId].tick);
    delete carouselTimers[trackId];
  }

  const track = document.getElementById(trackId);
  if (!track) return;

  const slides = track.querySelectorAll('.nslide');
  const dotBox = document.getElementById(dotsId);
  const dots   = dotBox ? dotBox.querySelectorAll('.ndot') : [];
  if (slides.length < 2) return;               // 1枚だけなら動かしません

  // スライド1枚ぶんの横幅（すき間も含む）
  const step = () => slides[1].offsetLeft - slides[0].offsetLeft;

  const updateDots = () => {
    if (!dots.length) return;
    const i = Math.min(Math.round(track.scrollLeft / step()), slides.length - 1);
    dots.forEach((d, n) => d.classList.toggle('is-on', n === i));
  };
  track.addEventListener('scroll', updateDots, { passive: true });
  updateDots();

  let timer   = null;
  let stopped = false;
  const stop = () => { stopped = true; if (timer) clearInterval(timer); };

  // ユーザーが自分で操作したら、自動送りはやめます
  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(e => {
    track.addEventListener(e, stop, { passive: true });
  });

  const startId = setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => {
      if (stopped) return;
      const next = Math.round(track.scrollLeft / step()) + 1;
      const to   = next >= slides.length ? 0 : next * step();
      track.scrollTo({ left: to, behavior: 'smooth' });
    }, interval);
    carouselTimers[trackId].tick = timer;
  }, delay);

  carouselTimers[trackId] = { start: startId, tick: null };
}
