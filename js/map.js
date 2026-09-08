/* =============================================================
 * 一番街ガイド － 地図まわりの共通処理
 * トップページと店舗詳細ページの両方から使います。
 * ============================================================= */

// 地図の下地（OpenStreetMap）。※インターネット接続が必要です。
function addBaseTiles(map) {
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

/* -------------------------------------------------------------
 * ピンの見た目
 * 画像ファイルは使わず、HTML と CSS だけで作っています。
 * ----------------------------------------------------------- */

// お店のピン（ジャンルの色 ＋ 業種の絵文字）
function makeShopIcon(shop, active = false) {
  const genre = genreOf(shop);
  const cat   = categoryOf(shop);
  return L.divIcon({
    className: '',
    html: `<div class="pin${active ? ' is-active' : ''}">
             <div class="pin__head" style="background:${genre.color}">
               <span class="pin__emoji">${cat.icon}</span>
             </div>
           </div>`,
    iconSize:   [34, 44],
    iconAnchor: [17, 44],
  });
}

// 駐車場・バス停のピン（お店と見分けがつくよう、小さい丸にしています）
function makePlaceIcon(kind) {
  const emoji = kind === 'parking' ? '🅿' : '🚌';
  return L.divIcon({
    className: '',
    html: `<div class="dot dot--${kind}"><span>${emoji}</span></div>`,
    iconSize:   [26, 26],
    iconAnchor: [13, 13],
  });
}

// イベント開催場所のピン
function makeEventIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="pin">
             <div class="pin__head" style="background:#c8452f">
               <span class="pin__emoji">🎪</span>
             </div>
           </div>`,
    iconSize:   [34, 44],
    iconAnchor: [17, 44],
  });
}

// 現在地のピン
function makeUserIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="userdot"></div>',
    iconSize:   [18, 18],
    iconAnchor: [9, 9],
  });
}

/* -------------------------------------------------------------
 * 駐車場・バス停をまとめたレイヤーを作ります。
 * レイヤーにしておくと、まとめて表示／非表示を切り替えられます。
 * ----------------------------------------------------------- */
function buildPlaceLayer() {
  const layer = L.layerGroup();

  PARKINGS.forEach(p => {
    L.marker(p.latlng, { icon: makePlaceIcon('parking'), zIndexOffset: -100 })
      .bindTooltip(`🅿 ${p.name}${p.note ? `（${p.note}）` : ''}`, { direction: 'top' })
      .addTo(layer);
  });

  BUSSTOPS.forEach(b => {
    L.marker(b.latlng, { icon: makePlaceIcon('bus'), zIndexOffset: -100 })
      .bindTooltip(`🚌 ${b.name}`, { direction: 'top' })
      .addTo(layer);
  });

  return layer;
}

/* -------------------------------------------------------------
 * ★重要★ 地図のサイズ直し
 *
 * Leaflet は、地図を作ったときの入れ物の大きさを覚えています。
 * 非表示（hidden）の状態で作られた地図は「大きさ0」と覚えてしまい、
 * ページを表示しても灰色の帯しか出ません。
 * そのため、ページを切り替えた直後にこの関数を呼びます。
 * ----------------------------------------------------------- */
function refreshMapSize(map) {
  if (!map) return;
  // 表示の切り替えが画面に反映されてから呼ぶ必要があるため、少し待ちます。
  setTimeout(() => map.invalidateSize(), 0);
}
