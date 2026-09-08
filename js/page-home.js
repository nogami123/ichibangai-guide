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
      // 現在地が分かっていれば、近い順に並べます
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
function renderHome() {
  syncDateTimeInputs();

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
        <span class="shopitem__tags">
          <span class="tag" style="background:${genre.color}">${escapeHtml(genre.label)}</span>
          <span class="tag tag--plain">${escapeHtml(cat.label)}</span>
          ${shop.priceRange ? `<span class="tag tag--plain">${escapeHtml(shop.priceRange)}</span>` : ''}
        </span>
        <span class="shopitem__status">
          <span class="badge badge--open">営業中</span>
          <span class="shopitem__until">${escapeHtml(prettyTime(st.until))} まで</span>
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
