/* =============================================================
 * 一番街ガイド － トップページ
 *
 * 画面の上から順に
 *   ① 日付・時刻の選択
 *   ② ジャンルの絞り込み
 *   ③ 地図（営業中のお店・駐車場・バス停・現在地）
 *   ④ 営業中のお店の一覧
 * ============================================================= */

let homeMap = null;                    // トップページの地図
const shopMarkers = new Map();         // shop.id -> ピン
let placeLayer = null;                 // 駐車場・バス停をまとめたもの
let userMarker = null;                 // 現在地のピン

/* -------------------------------------------------------------
 * 最初の1回だけ行う準備
 * ----------------------------------------------------------- */
function initHomePage() {
  // --- 地図をつくる ---
  homeMap = L.map('homeMap', { zoomControl: true }).setView(AREA.center, AREA.zoom);
  addBaseTiles(homeMap);

  // お店のピンを全部つくっておきます（表示するかどうかは後で決めます）
  SHOPS.forEach(shop => {
    const marker = L.marker(shop.latlng, { icon: makeShopIcon(shop), riseOnHover: true });
    marker.bindTooltip(shop.name, { direction: 'top', offset: [0, -44] });
    // ピンをタップしたら、そのお店の詳細ページへ移動します
    marker.on('click', () => { location.hash = `#/shop/${shop.id}`; });
    shopMarkers.set(shop.id, marker);
  });

  // 駐車場・バス停
  placeLayer = buildPlaceLayer();
  placeLayer.addTo(homeMap);

  // ※ 昼の一番街バナーは renderHome() の中で作ります
  //   （選んでいる日時によって中身が変わるためです）

  // --- ジャンルの絞り込みボタンをつくる ---
  renderFilters();

  // --- 日付・時刻の操作 ---
  const dateInput  = document.getElementById('dateInput');
  const timeSlider = document.getElementById('timeSlider');

  dateInput.addEventListener('change', () => {
    const [y, m, d] = dateInput.value.split('-').map(Number);
    if (!y) return;                                   // 入力が空のときは何もしない
    // 日付だけを差し替えて、選ばれている時刻はそのまま保ちます。
    // （まだシークバーを触っていなければ、初期値の 12:00 のままになります）
    state.now = new Date(y, m - 1, d, state.now.getHours(), state.now.getMinutes(), 0, 0);
    state.followRealTime = false;                     // 手動で選んだので自動更新を止めます
    renderHome();
  });

  // input は「ドラッグ中も」発生するので、動かしながら一覧が変わります
  timeSlider.addEventListener('input', () => {
    hideSwipeHint();                                  // 実際に操作されたら案内は消します
    const min  = Number(timeSlider.value);
    const next = new Date(state.now);
    next.setHours(Math.floor(min / 60), min % 60, 0, 0);
    state.now = next;
    state.followRealTime = false;
    renderHome();
  });

  // 触った時点（動かす前）でも案内を消します。キーボード操作にも対応します。
  ['pointerdown', 'keydown'].forEach(ev => timeSlider.addEventListener(ev, hideSwipeHint));

  document.getElementById('btnNow').addEventListener('click', () => {
    state.now = new Date();
    state.followRealTime = true;                      // 実際の時刻に追従する状態に戻します
    renderHome();
  });

  // --- 駐車場・バス停の表示切り替え ---
  document.getElementById('togglePlaces').addEventListener('change', e => {
    if (e.target.checked) placeLayer.addTo(homeMap);
    else homeMap.removeLayer(placeLayer);
  });

  // --- 現在地ボタン ---
  document.getElementById('btnLocate').addEventListener('click', locateUser);

  renderHome();

  // PCではウィンドウ幅を変えたときにLeafletの地図サイズがずれることがあるため、
  // リサイズ後に地図の表示領域を再計算します。操作中の連続発火はまとめます。
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => refreshMapSize(homeMap), 120);
  });
}

/* =============================================================
 * 昼の一番街アピール（トップページの一番上）
 *
 * 夜のイメージが強い一番街に「昼も楽しめる場所がある」ことを
 * 伝えるための入口です。
 *
 * ★シークバーとは無関係です★
 *   ここはシークバーより上にありますが、時刻を動かしても
 *   内容は変わりません。「シークバーを触る前に昼の魅力を知る」
 *   ための案内という位置づけのためです。
 * ============================================================= */

const NOON_MINUTES = 12 * 60;      // 「昼」の基準時刻（12:00）

/* 「昼」として扱う時間帯。
   シークバー上の目印と、昼の一番街バナーの両方がこれを使います。
   ★このファイルの前のほうで使うので、ここでまとめて決めています。 */
const DAYTIME_FROM = 9 * 60;       //  9:00
const DAYTIME_TO   = 16 * 60;      // 16:00

/* 週のうち1日でも、その時刻に営業していれば true。
   判定そのものは既存の getOpenState() をそのまま使っています。

   ※「今日の12:00」で判定しないのは、たまたま今日が定休日だと
     昼営業のお店が消えてしまい、案内として成り立たないためです。 */
function opensAtTimeSomeDay(shop, minutes) {
  const base = new Date();
  for (let i = 0; i < 7; i++) {                 // 今日から7日分＝全曜日
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (getOpenState(shop, d).open) return true;
  }
  return false;
}

/* 画面に出す「昼の営業時間」。
   昼に開いている最初の日の営業時間を代表として使います。 */
function noonDayRanges(shop) {
  const base = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    d.setHours(12, 0, 0, 0);
    const st = getOpenState(shop, d);
    if (st.open) return st.todayRanges;
  }
  return [];
}

/* -------------------------------------------------------------
 * 選択中の日時にもとづいて、バナーに出す内容を決めます。
 *
 * 優先順位（仕様どおり）
 *   A … その日時に開催中の「昼イベント」がある
 *   B … イベントは無いが、昼に紹介したいお店が営業している
 *   C … どちらも無い → いつもの「昼の一番街」への案内
 *
 * ★お店が営業しているかどうかの判定は、これまでどおり
 *   getOpenState() をそのまま使っています。判定は変えていません。
 * ----------------------------------------------------------- */

function noonPhraseFor(minute) {
  if (minute < 11 * 60 + 30) return '昼のはじまりの一番街';
  if (minute < 14 * 60 + 30) return 'お昼どきの一番街';
  return '昼下がりの一番街';
}

function noonPromoModel() {
  const when   = state.now;
  const key    = dateKey(when);
  const minute = when.getHours() * 60 + when.getMinutes();

  const asInvitation = { mode: 'C', label: '☀ 昼の一番街', events: [], shops: [] };

  // 昼の時間帯を選んでいないときは、いつもの案内に戻します
  if (minute < DAYTIME_FROM || minute > DAYTIME_TO) return asInvitation;

  // ① その日時に開催中の「昼イベント」
  const events = EVENTS
    .filter(ev => key >= ev.date && key <= (ev.endDate || ev.date))
    .filter(ev => {
      const r = eventTimeRange(ev);
      if (!r) return false;                                  // 時間が読み取れないものは対象外
      // 昼の時間帯にかかっているイベントだけを「昼イベント」とみなします
      if (Math.max(r.start, DAYTIME_FROM) >= Math.min(r.end, DAYTIME_TO)) return false;
      return minute >= r.start && minute < r.end;            // いま開催中か
    });

  // ② その日時に営業している「昼の一番街」の紹介店
  const shops = SHOPS
    .filter(s => s.daytimeNote && getOpenState(s, when).open)
    .slice(0, events.length ? 2 : 3);   // イベントがあるときは、お店は控えめに

  if (events.length === 0 && shops.length === 0) return asInvitation;

  return {
    mode:  events.length ? 'A' : 'B',
    label: '☀ ' + noonPhraseFor(minute),
    events,
    shops,
  };
}

/* 横スワイプで切り替わるバナー（カルーセル）を作ります。
   中身は、シークバーで選ばれている日時によって変わります。 */
let noonPromoSig = null;           // いま出している内容の「指紋」

function renderNoonPromo() {
  const box = document.getElementById('noonPromo');
  if (!box) return;

  const m = noonPromoModel();

  /* ★作り直しは、内容が実際に変わったときだけ★
     スライダーを動かすたびに作り直すと、横スクロールの位置が戻ったり
     ちらついたりして、カルーセルが使えなくなってしまいます。 */
  const sig = [m.mode, m.label,
               m.events.map(e => e.id).join(','),
               m.shops.map(s => s.id).join(',')].join('|');
  if (sig === noonPromoSig) return;
  noonPromoSig = sig;

  const slides = [];

  /* --- A：いま開催中の昼イベント（タップでイベント詳細へ） --- */
  m.events.forEach(ev => {
    slides.push(`
      <a class="nslide" href="#/events/${escapeHtml(ev.date)}">
        <span class="nslide__vis">
          <span class="nslide__ph" aria-hidden="true">🎪</span>
          ${ev.image
            ? `<img class="nslide__img" src="${escapeHtml(ev.image)}" alt=""
                    onerror="this.style.display='none'">`
            : ''}
        </span>
        <span class="nslide__body">
          <span class="nslide__kicker">いま開催中</span>
          <span class="nslide__title">${escapeHtml(ev.title)}</span>
          <span class="nslide__sub">${escapeHtml(ev.time || '')}</span>
        </span>
        <span class="nslide__arrow" aria-hidden="true">›</span>
      </a>`);
  });

  /* --- B：その時間に営業している、昼の紹介店（タップでお店詳細へ） --- */
  m.shops.forEach(shop => {
    const cat   = categoryOf(shop);
    const genre = genreOf(shop);
    const st    = getOpenState(shop, state.now);
    slides.push(`
      <a class="nslide" href="#/shop/${encodeURIComponent(shop.id)}">
        <span class="nslide__vis" style="background:${genre.color}1f">
          <span class="nslide__ph" aria-hidden="true">${cat.icon}</span>
        </span>
        <span class="nslide__body">
          <span class="nslide__kicker">この時間、営業中</span>
          <span class="nslide__title">${escapeHtml(shop.name)}</span>
          <span class="nslide__sub">
            ${escapeHtml(formatRanges(st.todayRanges))} ・ ${escapeHtml(cat.label)}
          </span>
        </span>
        <span class="nslide__arrow" aria-hidden="true">›</span>
      </a>`);
  });

  /* --- 最後の1枚：「昼の一番街」ページへの入口 ---
     どの状態でも、必ずここへ行ける道を残します。 */
  if (m.mode === 'C') {
    // C：紹介するものが無いときは、この1枚だけを出します
    slides.push(`
      <a class="nslide nslide--more" href="#/daytime">
        <span class="nslide__vis nslide__vis--more">
          <span class="nslide__ph" aria-hidden="true">☀</span>
        </span>
        <span class="nslide__body">
          <span class="nslide__title">夜だけじゃない、一番街。</span>
          <span class="nslide__sub nslide__sub--wrap">
            夜には見えていない一番街が、昼にはあります。
          </span>
        </span>
        <span class="nslide__arrow" aria-hidden="true">›</span>
      </a>`);
  } else {
    slides.push(`
      <a class="nslide nslide--more" href="#/daytime">
        <span class="nslide__vis nslide__vis--more">
          <span class="nslide__ph" aria-hidden="true">☀</span>
        </span>
        <span class="nslide__body">
          <span class="nslide__kicker">昼の一番街</span>
          <span class="nslide__title">もっとのぞいてみる</span>
          <span class="nslide__sub">昼のイベントとお店をまとめて見る</span>
        </span>
        <span class="nslide__arrow" aria-hidden="true">›</span>
      </a>`);
  }

  box.hidden = false;
  box.innerHTML = `
    <p class="noon__label">${escapeHtml(m.label)}</p>
    <div class="ncarousel" id="noonTrack">${slides.join('')}</div>
    <div class="ndots" id="noonDots" aria-hidden="true">
      ${slides.map(() => '<span class="ndot"></span>').join('')}
    </div>`;

  startNoonCarousel();
}

/* カルーセルの動きは js/carousel.js の initCarousel() にまとめてあります
   （「昼の一番街」ページの月イチ番街でも同じものを使っています）。

   ★自動送りは7秒後から★
     シークバーの操作案内は約5.9秒で終わります。
     そのあとに動き出すようにして、視覚的にぶつからないようにしています。 */
function startNoonCarousel() {
  initCarousel('noonTrack', 'noonDots', { delay: 7000, interval: 6000 });
}

/* =============================================================
 * 時間シークバー上の「昼の魅力」アクセント
 *
 * 「この時間、何かあるかも」と気づいてもらうための小さな目印です。
 *
 * ★決まりごと★
 *   ・1日あたり最大3つ。ふさわしい時間が無ければ、ひとつも出しません。
 *     （数をそろえるために無理に増やすことはしません）
 *   ・目印をタップしても時刻は変わりません。あくまで「きっかけ」です。
 *   ・pointer-events:none をかけてあるので、シークバーの操作を邪魔しません。
 *   ・指のスワイプ案内より控えめな見た目にしています。
 * ============================================================= */

const ACCENT_MAX     = 3;        // 1日に出す目印の数の上限
const ACCENT_MIN_GAP = 90;       // 目印どうしを離す最小の間隔（分）
// 目印を出す時間帯は、上のほうで決めた DAYTIME_FROM / DAYTIME_TO（9:00〜16:00）を使います

/* 「昼の一番街」で紹介しているお店（daytimeNote つき）が、
   その日のその時刻に営業しているかどうか。 */
function featuredOpenAt(date, minutes) {
  const t = new Date(date);
  t.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return SHOPS.some(s => s.daytimeNote && getOpenState(s, t).open);
}

/* その日の目印にする時刻を選びます。
   候補を「優先度の高い順」に集めてから、近すぎるものを間引きます。

   ※お店の開店時刻をそのまま目印にすると、9時〜12時に固まってしまい
     「昼」の目印になりません。そこで、昼を代表する3つの時間帯を用意し、
     そこに実際に何かある日だけ目印を出す、という作り方にしています。 */
function daytimeAccentTimes(date) {
  const key  = dateKey(date);
  const cand = [];                 // 先に入れたものほど優先されます

  /* recommend … 「オススメ」と小さく出すかどうか。
     昼の魅力を見てもらうための目印にだけ付けます。
     もし将来、夜の時間帯の目印を足すことになっても、
     そちらには付かないように、ここで明示的に決めています。 */

  // 優先① その日の昼イベントが始まる時刻
  EVENTS.filter(ev => key >= ev.date && key <= (ev.endDate || ev.date))
        .forEach(ev => {
          const w   = eventStartDate(ev, key).when;
          const min = w.getHours() * 60 + w.getMinutes();
          cand.push({ min, why: 'イベント' });
        });

  // 優先②〜④ 昼を代表する時間帯。
  //   紹介しているお店がその時刻に営業しているときだけ候補にします。
  [[720, 'お昼どき'],        // 12:00 ランチ
   [900, '昼下がり'],        // 15:00 ゆっくり過ごす時間
   [600, '昼のはじまり']]    // 10:00
    .forEach(([min, why]) => {
      if (featuredOpenAt(date, min)) cand.push({ min, why });
    });

  // 昼の時間帯だけに絞り、近すぎるものを間引いて、最大3つまで
  const chosen = [];
  for (const c of cand) {
    if (c.min < DAYTIME_FROM || c.min > DAYTIME_TO) continue;
    if (chosen.some(x => Math.abs(x.min - c.min) < ACCENT_MIN_GAP)) continue;
    chosen.push(c);
    if (chosen.length >= ACCENT_MAX) break;
  }
  // 「オススメ」は最大1つだけ。
  // 候補を集めたときの優先順位（昼イベント → 12:00 → 15:00 → 10:00）で
  // 最初に採用された時間だけに表示します。
  if (chosen.length > 0) chosen[0].recommend = true;
  for (let i = 1; i < chosen.length; i++) chosen[i].recommend = false;

  return chosen.sort((a, b) => a.min - b.min);
}

function renderTimeAccents() {
  const box = document.getElementById('timeAccents');
  if (!box) return;

  const marks = daytimeAccentTimes(state.now);

  // ふさわしい時間が無ければ、帯ごと消します（すき間も残りません）
  if (marks.length === 0) { box.innerHTML = ''; box.hidden = true; return; }

  box.hidden = false;
  box.innerHTML = marks.map(m => {
    /* シークバーのつまみ（28px）の中心に合わせます。
       つまみは端で半分ぶん内側に寄るので、その分を計算に入れています。 */
    const ratio = (m.min / 1425).toFixed(4);
    return `
      <span class="accent" style="left:calc(14px + (100% - 28px) * ${ratio})">
        ${m.recommend ? '<span class="accent__rec">オススメ</span>' : ''}
        <span class="accent__time">${escapeHtml(fromMinutes(m.min))}</span>
        <span class="accent__mark">▾</span>
      </span>`;
  }).join('');
}

/* -------------------------------------------------------------
 * ジャンルの絞り込みボタン
 * GENRES（data/shops.js）から自動で作ります。
 * → ジャンルを増やしたければ GENRES に1行足すだけで、
 *   ここのコードを直す必要はありません。
 * ----------------------------------------------------------- */
function renderFilters() {
  const box = document.getElementById('filters');
  box.innerHTML = '';

  const items = [{ key: 'all', label: 'すべて', color: '#4a4a4a', icon: '📍' }];
  Object.keys(GENRES).forEach(key => {
    items.push({ key, label: GENRES[key].label, color: GENRES[key].color, icon: GENRES[key].icon });
  });

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.genre = item.key;
    btn.style.setProperty('--chip-color', item.color);
    btn.setAttribute('aria-pressed', String(state.genre === item.key));
    btn.innerHTML = `<span aria-hidden="true">${item.icon}</span> ${escapeHtml(item.label)}`;
    btn.addEventListener('click', () => {
      state.genre = item.key;
      box.querySelectorAll('.chip').forEach(c => {
        c.setAttribute('aria-pressed', String(c.dataset.genre === item.key));
      });
      renderHome();
    });
    box.appendChild(btn);
  });
}

/* -------------------------------------------------------------
 * 「いま選ばれている日時」で、営業中のお店を求めます
 * ----------------------------------------------------------- */
function openShopsNow() {
  // 営業しているかの判定は共通関数にまとめてあります（js/utils.js の openShopsAt）。
  // イベント詳細の「営業しているお店」も同じ関数を使っているので、結果が食い違いません。
  return openShopsAt(state.now)
    .filter(shop => {
      // そのうえで、画面で選ばれているジャンルに絞ります
      return state.genre === 'all' || genreKeyOf(shop) === state.genre;
    })
    .sort((a, b) => {
      // 発表で使用する「コザ灯り酒場」は、営業中なら常に一覧の先頭に表示します。
      // ジャンル絞り込みをしている場合でも、対象ジャンルで営業中なら先頭です。
      const aRecommended = a.id === 'shop-12';
      const bRecommended = b.id === 'shop-12';
      if (aRecommended !== bRecommended) return aRecommended ? -1 : 1;

      // 現在地が分かっていれば、残りのお店は近い順に並べます
      if (state.userPos) {
        return distanceMeters(state.userPos, a.latlng) - distanceMeters(state.userPos, b.latlng);
      }
      return 0;
    });
}

/* -------------------------------------------------------------
 * 画面を描き直す（日時やジャンルが変わるたびに呼ばれます）
 * ページの再読み込みはしません。
 * ----------------------------------------------------------- */
let accentDateKey = null;          // 目印を作ったときの日付

function renderHome() {
  syncDateTimeInputs();

  /* 目印は日付が変わったときだけ作り直します。
     スライダーを動かすたびに作り直すと、ちらついてしまうためです。 */
  const key = dateKey(state.now);
  if (key !== accentDateKey) {
    accentDateKey = key;
    renderTimeAccents();
  }

  /* 昼の一番街バナーも、選んでいる日時に合わせて変えます。
     中身が変わっていないときは、この中で何もせずに戻ります。 */
  renderNoonPromo();

  const shops = openShopsNow();

  // --- 地図のピンを付け外し ---
  const openIds = new Set(shops.map(s => s.id));
  shopMarkers.forEach((marker, id) => {
    const shouldShow = openIds.has(id);
    const onMap = homeMap.hasLayer(marker);
    if (shouldShow && !onMap)  marker.addTo(homeMap);
    if (!shouldShow && onMap)  homeMap.removeLayer(marker);
  });

  // --- 一覧 ---
  renderShopList(shops);
  document.getElementById('shopCount').textContent = shops.length;
  document.getElementById('emptyMsg').hidden = shops.length > 0;
}

/* 日付入力・スライダー・見出しの表示を state.now に合わせます */
function syncDateTimeInputs() {
  const d = state.now;
  document.getElementById('dateInput').value = dateKey(d);

  const minutes = d.getHours() * 60 + d.getMinutes();
  // スライダーは15分刻みなので、近い目盛りに合わせます
  document.getElementById('timeSlider').value = Math.round(minutes / 15) * 15;
  document.getElementById('timeOutput').textContent =
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  document.getElementById('pickerSummary').innerHTML =
    `<strong>${escapeHtml(formatDateLabel(d))}</strong> の
     <strong>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</strong>
     に利用できるお店を表示しています。`;
}

/* -------------------------------------------------------------
 * 営業中のお店の一覧
 * ----------------------------------------------------------- */
function renderShopList(shops) {
  const ul = document.getElementById('shopList');
  ul.innerHTML = '';

  shops.forEach(shop => {
    const genre = genreOf(shop);
    const cat   = categoryOf(shop);
    const st    = getOpenState(shop, state.now);

    // 現在地が分かっているときだけ、距離を出します
    let distHtml = '';
    if (state.userPos) {
      const m = distanceMeters(state.userPos, shop.latlng);
      distHtml = `<span class="shopitem__dist">${escapeHtml(formatDistance(m))}</span>`;
    }

    const li  = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shopitem';
    btn.innerHTML = `
      <span class="shopitem__icon" style="background:${genre.color}22; border-color:${genre.color}55">
        ${cat.icon}
      </span>
      <span class="shopitem__main">
        <span class="shopitem__name">${escapeHtml(shop.name)}</span>

        <!-- その日の営業時間。「いま開いている」だけでなく
             「何時から何時まで開いているお店なのか」が分かるようにします。 -->
        <span class="shopitem__hours">${escapeHtml(formatRanges(st.todayRanges))}</span>

        <span class="shopitem__tags">
          <span class="tag" style="background:${genre.color}">${escapeHtml(genre.label)}</span>
          <span class="tag tag--plain">${escapeHtml(cat.label)}</span>
          ${shop.priceRange ? `<span class="tag tag--plain">${escapeHtml(shop.priceRange)}</span>` : ''}
        </span>
        <span class="shopitem__status">
          <span class="badge badge--open">営業中</span>
          ${/* 中休みがある日だけ「〜まで」を出します。
                通し営業の日は、上の営業時間と同じ内容になってしまうためです。 */
            st.todayRanges.length > 1
              ? `<span class="shopitem__until">${escapeHtml(prettyTime(st.until))} まで</span>`
              : ''}
          ${distHtml}
        </span>
      </span>
      <span class="shopitem__arrow" aria-hidden="true">›</span>`;
    btn.addEventListener('click', () => { location.hash = `#/shop/${shop.id}`; });

    li.appendChild(btn);
    ul.appendChild(li);
  });
}

/* -------------------------------------------------------------
 * 初回の操作案内（指のアニメーション）
 *
 * 「シークバーを左右に動かして、調べたい時間を探す」という使い方を、
 * 説明文を読まなくても分かるように、指の絵で見せます。
 *
 * ★大事なところ★
 *   ・これは「動きを見せているだけ」です。
 *     シークバーの値も、選ばれている時刻も、一切変えません。
 *   ・指の絵には CSS で pointer-events:none をかけてあるので、
 *     案内が出ている間もシークバーは普通に触れます。
 *   ・数秒たつか、ユーザーが実際に触った時点で消えます。
 * ----------------------------------------------------------- */
let swipeHintShown = false;        // 一度出したら、二度目は出しません

function showSwipeHint() {
  if (swipeHintShown) return;
  swipeHintShown = true;

  const hint = document.getElementById('swipeHint');
  const veil = document.getElementById('swipeVeil');
  const wrap = document.querySelector('.sliderwrap');
  if (!hint || !veil || !wrap) return;

  veil.hidden = false;
  veil.classList.add('is-playing');                   // 画面を暗くする
  wrap.classList.add('is-hinting');                   // シークバーだけ暗幕より前に出す
  hint.hidden = false;
  hint.classList.add('is-playing');                   // 指を動かす

  // 自動で消えるまでの時間。
  // アニメーション 2.6秒 × 2回 ＝ 約5.2秒 なので、少し余裕をみています。
  setTimeout(hideSwipeHint, 5600);
}

function hideSwipeHint() {
  const hint = document.getElementById('swipeHint');
  const veil = document.getElementById('swipeVeil');
  const wrap = document.querySelector('.sliderwrap');
  if (!hint || hint.hidden) return;                   // すでに消えていれば何もしない

  hint.classList.remove('is-playing');
  hint.classList.add('is-hiding');                    // ふわっと消します
  if (veil) { veil.classList.remove('is-playing'); veil.classList.add('is-hiding'); }

  setTimeout(() => {
    hint.hidden = true;
    if (veil) veil.hidden = true;
    if (wrap) wrap.classList.remove('is-hinting');    // シークバーを元の重なり順に戻す
  }, 300);
}

/* -------------------------------------------------------------
 * 現在地の取得
 *
 * ★注意★ この機能は https:// か http://localhost でしか動きません。
 *   ファイルをダブルクリックして開いた（file:// の）ときは
 *   ブラウザの決まりで必ず失敗します。故障ではありません。
 *   失敗しても、ほかの機能はすべてそのまま使えます。
 * ----------------------------------------------------------- */
function locateUser() {
  const note = document.getElementById('locateNote');

  const show = (msg, isError) => {
    note.hidden = false;
    note.textContent = msg;
    note.classList.toggle('is-error', !!isError);
  };

  if (!navigator.geolocation) {
    show('このブラウザは現在地の取得に対応していません。', true);
    return;
  }

  if (location.protocol === 'file:') {
    show('ファイルを直接開いた状態では現在地を取得できません（ブラウザの決まりです）。'
       + 'PowerShell で「npx serve」を実行し、http://localhost… から開くと使えます。', true);
    return;
  }

  show('現在地を取得しています…', false);

  navigator.geolocation.getCurrentPosition(
    pos => {
      state.userPos = [pos.coords.latitude, pos.coords.longitude];

      if (userMarker) homeMap.removeLayer(userMarker);
      userMarker = L.marker(state.userPos, { icon: makeUserIcon(), zIndexOffset: 500 })
        .bindTooltip('現在地', { direction: 'top' })
        .addTo(homeMap);

      homeMap.setView(state.userPos, Math.max(homeMap.getZoom(), 16));
      note.hidden = true;
      renderHome();                      // 距離つきで一覧を作り直します
    },
    err => {
      const msg = err.code === err.PERMISSION_DENIED
        ? '現在地の利用が許可されませんでした。距離は表示されませんが、ほかの機能はそのまま使えます。'
        : '現在地を取得できませんでした。ほかの機能はそのまま使えます。';
      show(msg, true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
