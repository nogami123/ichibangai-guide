/* =============================================================
 * 一番街ガイド － お店詳細ページ
 * 上に地図、下にお店の情報を並べます。
 *
 * ★このページの決まりごと★
 *   データに入っていない項目は、見出しごと表示しません。
 *   （「座席数：」だけ残って中身が空、という見た目にしないため）
 * ============================================================= */

let shopMap = null;              // 詳細ページの地図（最初に開いたときに1回だけ作ります）
let shopMapMarker = null;        // そのお店のピン
let shopMapUser = null;          // 現在地のピン

/* この地図のズーム。
   17 だと、スマホの画面におよそ 385m ぶんが映ります。
   一番街のアーケード全体（約274m）と周りの通りが入るので、
   「この店は一番街のこのあたり」が分かる大きさです。
   最寄りの駐車場は必ず入りますが、少し離れたバス停は
   画面の外になることがあります（引きすぎないことを優先しています）。
   もっと寄せたいときは 18、引きたいときは 16 にします。 */
const SHOP_MAP_ZOOM = 17;

function renderShopPage(id) {
  const shop = SHOPS.find(s => s.id === id);

  // URL のお店IDが見つからないとき（打ち間違いなど）はトップに戻します
  if (!shop) { location.hash = '#/'; return; }

  const genre = genreOf(shop);
  const cat   = categoryOf(shop);
  const st    = getOpenState(shop, state.now);

  document.getElementById('shopTitle').textContent = shop.name;

  /* ---------- 最寄りの駐車場・バス停をさがす ----------
     直線距離が近い順に、それぞれ最大3件まで。
     バス停は上り・下りで同じ名前が2つあるので、同名は近いほうだけにします。
     ※これは下の「アクセス」欄の文字表示に使うだけで、地図には出しません。 */
  const nearParkings = nearestPlaces(shop.latlng, PARKINGS, 3, true);
  const nearBusStops = nearestPlaces(shop.latlng, BUSSTOPS, 3, true);

  /* ---------- 地図 ----------
     お店・駐車場・バス停のピンを出しますが、
     地図の中心はあくまで「選択したお店」です。
     ピンを全部画面に収めるための引き（fitBounds）はしません。 */
  if (!shopMap) {
    shopMap = L.map('shopMap', { zoomControl: true });
    addBaseTiles(shopMap);
    buildPlaceLayer().addTo(shopMap);          // 周辺の駐車場・バス停
  }
  shopMap.setView(shop.latlng, SHOP_MAP_ZOOM);

  if (shopMapMarker) shopMap.removeLayer(shopMapMarker);
  shopMapMarker = L.marker(shop.latlng, { icon: makeShopIcon(shop, true), zIndexOffset: 400 })
    .bindTooltip(shop.name, { direction: 'top', offset: [0, -44] })
    .addTo(shopMap);

  if (state.userPos) {
    if (shopMapUser) shopMap.removeLayer(shopMapUser);
    shopMapUser = L.marker(state.userPos, { icon: makeUserIcon(), zIndexOffset: 500 })
      .bindTooltip('現在地', { direction: 'top' })
      .addTo(shopMap);
  }

  /* ---------- 写真（なければ絵文字のプレースホルダ） ---------- */
  const photo = (shop.photos && shop.photos.length)
    ? `<img class="hero__img" src="${escapeHtml(shop.photos[0])}" alt="${escapeHtml(shop.name)}の写真">`
    : `<div class="hero__ph" style="background:${genre.color}1a; color:${genre.color}">
         <span>${cat.icon}</span>
         <small>写真はまだありません</small>
       </div>`;

  /* ---------- 営業時間の表（今日の行を目立たせます） ---------- */
  const todayIndex = state.now.getDay();     // ← 実際の今日ではなく「選んでいる日」の曜日
  const hoursRows = DAY_KEYS.map((key, i) => {
    const ranges = shop.hours[key];
    const rest   = !ranges || ranges.length === 0;
    return `<tr class="${i === todayIndex ? 'is-today' : ''}">
              <th scope="row">${DAY_LABELS[i]}</th>
              <td class="${rest ? 'is-rest' : ''}">${escapeHtml(formatRanges(ranges))}</td>
            </tr>`;
  }).join('');

  /* ---------- 距離・徒歩時間（現在地が分かるときだけ） ---------- */
  let distanceHtml = '';
  if (state.userPos) {
    const m = distanceMeters(state.userPos, shop.latlng);
    distanceHtml = `
      <div class="factrow">
        <span class="factrow__key">現在地から</span>
        <span class="factrow__val">
          ${escapeHtml(formatDistance(m))} ・ ${escapeHtml(formatWalkTime(m))}
          <small class="muted">（直線距離のめやす）</small>
        </span>
      </div>`;
  }

  /* ---------- 周辺のアクセス（最寄りの駐車場・バス停） ----------
     徒歩時間は「直線距離 ÷ 分速80m」のおおよその目安です。
     道なりの正確なルート計算はしていません。 */
  const accessItem = (icon, kind, place) => `
    <li class="access__item">
      <span class="access__icon access__icon--${kind}" aria-hidden="true">${icon}</span>
      <span class="access__body">
        <span class="access__name">${escapeHtml(place.name)}</span>
        ${place.note ? `<small class="access__note">${escapeHtml(place.note)}</small>` : ''}
        <span class="access__walk">
          お店から ${escapeHtml(formatWalkTime(place.distance))}
          <small class="muted">（${escapeHtml(formatDistance(place.distance))}）</small>
        </span>
      </span>
    </li>`;

  const accessList = (icon, kind, places, emptyMsg) => places.length
    ? `<ul class="access">${places.map(p => accessItem(icon, kind, p)).join('')}</ul>`
    : `<p class="access__empty">${escapeHtml(emptyMsg)}</p>`;

  /* 折りたたみは HTML 標準の <details> / <summary> を使っています。
     JavaScript を書かなくても、見出しをタップするだけで開閉できます。
     open を付けていないので、最初は閉じた状態です。 */
  const accessHtml = `
    <details class="card fold">
      <summary class="fold__head">
        <span class="fold__title">アクセス</span>
        <span class="fold__chev" aria-hidden="true">⌄</span>
      </summary>

      <div class="fold__body">
        <h4 class="access__head">🅿 車で来る場合（駐車場）</h4>
        ${accessList('🅿', 'parking', nearParkings, '近くの駐車場のデータがまだありません。')}

        <h4 class="access__head">🚌 バスで来る場合（バス停）</h4>
        ${accessList('🚌', 'bus', nearBusStops, '近くのバス停のデータがまだありません。')}

        <p class="access__foot muted">
          ※徒歩時間・距離は直線距離をもとにしたおおよその目安です。実際の道のりとは異なります。
        </p>
      </div>
    </details>`;

  /* ---------- SNS（あるものだけボタンにします） ---------- */
  const SNS_LABELS = {
    instagram: 'Instagram',
    x: 'X（旧Twitter）',
    facebook: 'Facebook',
    website: 'ホームページ',
  };
  let snsHtml = '';
  if (shop.sns) {
    const links = Object.keys(shop.sns)
      .filter(k => shop.sns[k])
      .map(k => `<a class="btn btn--ghost btn--sm" href="${escapeHtml(shop.sns[k])}"
                    target="_blank" rel="noopener">${escapeHtml(SNS_LABELS[k] || k)} ↗</a>`)
      .join('');
    if (links) {
      snsHtml = `<section class="sec">
                   <h3 class="sec__title">SNS・ウェブサイト</h3>
                   <div class="btnrow">${links}</div>
                 </section>`;
    }
  }

  /* ---------- メニュー（飲食店など、ある店だけ） ---------- */
  let menuHtml = '';
  if (shop.menu && shop.menu.length) {
    const items = shop.menu.map(m => `
      <li>
        <span class="menu__name">
          ${escapeHtml(m.name)}${m.popular ? '<span class="pop">人気</span>' : ''}
          ${m.note ? `<small class="menu__note">${escapeHtml(m.note)}</small>` : ''}
        </span>
        <span class="menu__price">¥${m.price.toLocaleString('ja-JP')}</span>
      </li>`).join('');
    menuHtml = `<section class="sec">
                  <h3 class="sec__title">メニュー</h3>
                  <ul class="menu">${items}</ul>
                </section>`;
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${shop.latlng[0]},${shop.latlng[1]}`;

  /* ---------- 開催イベントのバナー ----------
     お店データの eventIds に書かれたイベントだけを出します。
     eventIds が無いお店では、下の eventBanners が空文字になるので
     バナーそのものが作られません。

     タップすると #/events/2026-09-18 に移動します。
     ルーター（js/app.js）がこの日付を読み取って、
     その日を選んだ状態でイベントカレンダーを開きます。 */
  const eventBanners = eventsOfShop(shop).map(ev => {
    const evDate   = dateFromKey(ev.date);
    const dateText = `${evDate.getMonth() + 1}月${evDate.getDate()}日`
                   + `（${DAY_LABELS[evDate.getDay()]}）`
                   + `${ev.time ? ` ${ev.time}` : ''}`;
    return `
      <a class="evbanner" href="#/events/${escapeHtml(ev.date)}">
        <span class="evbanner__imgwrap">
          <span class="evbanner__ph" aria-hidden="true">🎪</span>
          ${ev.image
            ? `<img class="evbanner__img" src="${escapeHtml(ev.image)}" alt=""
                    onerror="this.style.display='none'">`
            : ''}
        </span>
        <span class="evbanner__body">
          <span class="evbanner__label">開催イベント</span>
          <span class="evbanner__title">${escapeHtml(ev.title)}</span>
          <span class="evbanner__date">${escapeHtml(dateText)}</span>
        </span>
        <span class="evbanner__arrow" aria-hidden="true">›</span>
      </a>`;
  }).join('');

  /* ---------- 全体を組み立て ---------- */
  document.getElementById('shopBody').innerHTML = `
    ${eventBanners}

    <div class="hero">${photo}</div>

    <div class="card">
      <div class="dt__tags">
        <span class="tag" style="background:${genre.color}">${escapeHtml(genre.label)}</span>
        <span class="tag tag--plain">${cat.icon} ${escapeHtml(cat.label)}</span>
      </div>
      <h2 class="dt__name">${escapeHtml(shop.name)}</h2>
      ${shop.description ? `<p class="dt__desc">${escapeHtml(shop.description)}</p>` : ''}

      <div class="dt__status ${st.open ? 'is-open' : 'is-closed'}">
        ${st.open
          ? `● 営業中 <small>${escapeHtml(prettyTime(st.until))} まで</small>`
          : `● ${st.todayRanges.length ? '営業時間外' : '本日は定休日'}
             ${st.nextLabel ? `<small>${escapeHtml(st.nextLabel)}</small>` : ''}`}
        <small class="muted">（${escapeHtml(formatDateLabel(state.now))} 時点）</small>
      </div>
    </div>

    <section class="card">
      <h3 class="sec__title">お店の情報</h3>
      ${distanceHtml}
      ${shop.address ? `
        <div class="factrow">
          <span class="factrow__key">住所</span>
          <span class="factrow__val">${escapeHtml(shop.address)}</span>
        </div>` : ''}
      ${shop.tel ? `
        <div class="factrow">
          <span class="factrow__key">電話</span>
          <span class="factrow__val"><a href="tel:${escapeHtml(shop.tel)}">${escapeHtml(shop.tel)}</a></span>
        </div>` : ''}
      ${shop.priceRange ? `
        <div class="factrow">
          <span class="factrow__key">価格帯</span>
          <span class="factrow__val">${escapeHtml(shop.priceRange)}</span>
        </div>` : ''}
      ${shop.seats ? `
        <div class="factrow">
          <span class="factrow__key">座席数</span>
          <span class="factrow__val">${shop.seats}席</span>
        </div>` : ''}

      <div class="btnrow btnrow--mt">
        <a class="btn btn--ghost btn--sm" href="${mapsUrl}" target="_blank" rel="noopener">
          Googleマップで開く ↗
        </a>
      </div>
    </section>

    <section class="card">
      <h3 class="sec__title">営業時間</h3>
      <table class="hours"><tbody>${hoursRows}</tbody></table>
    </section>

    ${menuHtml ? `<div class="card">${menuHtml}</div>` : ''}
    ${snsHtml  ? `<div class="card">${snsHtml}</div>`  : ''}

    ${accessHtml}

    <footer class="foot">
      <p>※このお店の情報は開発用のサンプル（ダミー）です。</p>
    </footer>`;
}
