/* =============================================================
 * 一番街なう － 「昼の一番街」ページ
 *
 * このページは、お店をさがすためのページではありません。
 * 「昼の一番街に何があるのか」を知ってもらうためのページです。
 *
 * ★載せるものは、すべてデータで決まります★
 *   ・月イチ番街  … data/events.js で series: 'tsukiichi' と書いたイベント
 *   ・紹介するお店 … data/shops.js で daytimeNote を書いたお店
 *   店名やイベント名をコードに直接書くことはしていません。
 * ============================================================= */

/* -------------------------------------------------------------
 * 月イチ番街のイベントを取り出します。
 * 日付の早い順に並べ、すでに終わった月は後ろに回します。
 * ----------------------------------------------------------- */
function tsukiichiEvents() {
  const todayKey = dateKey(new Date());
  const all = EVENTS.filter(ev => ev.series === 'tsukiichi')
                    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = all.filter(ev => (ev.endDate || ev.date) >= todayKey);
  const past     = all.filter(ev => (ev.endDate || ev.date) <  todayKey);
  return upcoming.concat(past);          // これからの月を先に見せます
}

/* -------------------------------------------------------------
 * 「昼だから見える、一番街の顔」に載せるお店。
 *
 * daytimeNote が書かれているお店だけを載せます。
 * 念のため、昼12時に営業していないお店は除きます
 * （夜だけのお店が「昼の一番街」に出てしまうのを防ぐため）。
 * ----------------------------------------------------------- */
function daytimeShops() {
  return SHOPS.filter(s => s.daytimeNote && opensAtTimeSomeDay(s, NOON_MINUTES));
}

/* -------------------------------------------------------------
 * ページを描きます
 * ----------------------------------------------------------- */
function renderDaytimePage() {
  renderTsukiichi();
  renderDaytimeShops();
}

/* ---------- 月イチ番街（横スワイプのカード） ---------- */
function renderTsukiichi() {
  const track = document.getElementById('tsukiichiTrack');
  const dots  = document.getElementById('tsukiichiDots');
  if (!track) return;

  const evs = tsukiichiEvents();

  if (evs.length === 0) {
    track.innerHTML = '<p class="access__empty">月イチ番街の予定はまだ登録されていません。</p>';
    if (dots) dots.innerHTML = '';
    return;
  }

  track.innerHTML = evs.map(ev => {
    const d     = dateFromKey(ev.date);
    const month = d.getMonth() + 1;
    const dateText = `${month}月${d.getDate()}日（${DAY_LABELS[d.getDay()]}）`
                   + `${ev.time ? ` ${ev.time}` : ''}`;
    // 画像が無い（または見つからない）ときは、月の数字のカードになります
    return `
      <a class="nslide nslide--tall" href="#/events/${escapeHtml(ev.date)}">
        <span class="nslide__vis nslide__vis--month">
          <span class="nslide__month" aria-hidden="true">${month}<small>月</small></span>
          ${ev.image
            ? `<img class="nslide__img" src="${escapeHtml(ev.image)}" alt=""
                    onerror="this.style.display='none'">`
            : ''}
        </span>
        <span class="nslide__body">
          <span class="nslide__kicker">月イチ番街</span>
          <span class="nslide__title nslide__title--wrap">${escapeHtml(ev.title)}</span>
          <span class="nslide__sub">${escapeHtml(dateText)}</span>
          ${ev.description
            ? `<span class="nslide__desc">${escapeHtml(ev.description)}</span>`
            : ''}
        </span>
        <span class="nslide__arrow" aria-hidden="true">›</span>
      </a>`;
  }).join('');

  if (dots) dots.innerHTML = evs.map(() => '<span class="ndot"></span>').join('');

  initCarousel('tsukiichiTrack', 'tsukiichiDots', { delay: 4000, interval: 6000 });
}

/* ---------- 昼だから見える、一番街の顔 ---------- */
function renderDaytimeShops() {
  const box = document.getElementById('dayShops');
  if (!box) return;

  const shops = daytimeShops();

  if (shops.length === 0) {
    box.innerHTML = '<p class="access__empty">紹介するお店がまだ登録されていません。</p>';
    return;
  }

  box.innerHTML = shops.map(shop => {
    const cat   = categoryOf(shop);
    const genre = genreOf(shop);
    const hours = formatRanges(noonDayRanges(shop));

    // 写真があれば使い、無ければジャンル色＋絵文字のブロックにします
    const vis = (shop.photos && shop.photos.length)
      ? `<img class="dayshop__img" src="${escapeHtml(shop.photos[0])}" alt=""
              onerror="this.style.display='none'">`
      : '';

    return `
      <li>
        <a class="dayshop" href="#/shop/${encodeURIComponent(shop.id)}">
          <span class="dayshop__vis" style="background:${genre.color}1f; color:${genre.color}">
            <span class="dayshop__ph" aria-hidden="true">${cat.icon}</span>
            ${vis}
          </span>
          <span class="dayshop__body">
            <span class="dayshop__tags">
              <span class="tag" style="background:${genre.color}">${escapeHtml(cat.label)}</span>
              <span class="dayshop__hours">${escapeHtml(hours)}</span>
            </span>
            <span class="dayshop__name">${escapeHtml(shop.name)}</span>
            <span class="dayshop__note">${escapeHtml(shop.daytimeNote)}</span>
          </span>
        </a>
      </li>`;
  }).join('');
}
