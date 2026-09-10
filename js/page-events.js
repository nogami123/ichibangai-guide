/* =============================================================
 * 一番街ガイド － イベントカレンダーページ
 *
 * 月間カレンダーを CSS のグリッドで自作しています。
 * カレンダー用のライブラリは使っていません。
 *
 * ★日付の比較は、すべて '2026-09-12' という文字列どうしで行います。
 *   Date 同士で比べると時差でズレることがあるためです。
 * ============================================================= */

/* -------------------------------------------------------------
 * その日にあるイベントを取り出します。
 * 複数日つづくイベント（endDate あり）にも対応しています。
 * ----------------------------------------------------------- */
function eventsOnDate(key) {
  return EVENTS.filter(ev => {
    const start = ev.date;
    const end   = ev.endDate || ev.date;
    return key >= start && key <= end;      // 文字列のまま比べられます
  });
}

/* ※ eventStartDate()（イベントの開始日時を求める関数）は
 *   トップページからも使うため、js/utils.js に置いてあります。 */

/* -------------------------------------------------------------
 * イベント開催場所の地図
 *
 * 開いている地図をここで覚えておき、描き直す前に片づけます。
 * 片づけないと、地図が画面から消えても中身が残り続けます。
 * ----------------------------------------------------------- */
let eventMaps = [];

function clearEventMaps() {
  eventMaps.forEach(m => m.remove());
  eventMaps = [];
}

// ★地図は「表示されている状態」で大きさを測り直す必要があります（js/app.js から呼びます）
function refreshEventMaps() {
  eventMaps.forEach(m => refreshMapSize(m));
}

// 地図を出せるイベントかどうか（座標がなければ地図なし）
function hasEventMap(ev) {
  return !!(ev.latlng || (ev.areaPath && ev.areaPath.length >= 2));
}

function buildEventMaps(evs) {
  evs.forEach(ev => {
    const el = document.getElementById(`evmap-${ev.id}`);
    if (!el) return;

    const m = L.map(el, { zoomControl: false });
    addBaseTiles(m);

    if (ev.areaPath && ev.areaPath.length >= 2) {
      // 範囲で開催される場合：その区間を太い線で強調します
      const line = L.polyline(ev.areaPath, {
        color: '#c8452f', weight: 9, opacity: .55, lineCap: 'round',
      }).addTo(m);
      line.bindTooltip(ev.areaLabel || ev.place || ev.title, { sticky: true });
      m.fitBounds(line.getBounds(), { padding: [30, 30], maxZoom: 17 });
    } else {
      // 1地点で開催される場合：ピンを立てます
      L.marker(ev.latlng, { icon: makeEventIcon() })
        .bindTooltip(ev.title, { direction: 'top', offset: [0, -44] })
        .addTo(m);
      m.setView(ev.latlng, 17);
    }

    eventMaps.push(m);
  });
}

/* -------------------------------------------------------------
 * カレンダーを描きます
 * ----------------------------------------------------------- */
function renderEventsPage() {
  const y = state.calYear;
  const m = state.calMonth;                 // 0 = 1月、8 = 9月（0から数えます）

  document.getElementById('calMonth').textContent = `${y}年${m + 1}月`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // --- 曜日の見出し ---
  DAY_LABELS.forEach((label, i) => {
    const cell = document.createElement('div');
    cell.className = `cal__dow${i === 0 ? ' is-sun' : ''}${i === 6 ? ' is-sat' : ''}`;
    cell.textContent = label;
    grid.appendChild(cell);
  });

  const firstDay  = new Date(y, m, 1).getDay();      // その月の1日の曜日
  const lastDate  = new Date(y, m + 1, 0).getDate(); // その月の日数
  const todayKey  = dateKey(new Date());

  // --- 1日の前の空きマス ---
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal__cell cal__cell--blank';
    grid.appendChild(blank);
  }

  // --- 日付のマス ---
  for (let d = 1; d <= lastDate; d++) {
    const key    = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow    = new Date(y, m, d).getDay();
    const evs    = eventsOnDate(key);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal__cell';
    if (dow === 0) btn.classList.add('is-sun');
    if (dow === 6) btn.classList.add('is-sat');
    if (key === todayKey) btn.classList.add('is-today');
    if (key === state.selectedDateKey) btn.classList.add('is-selected');
    if (evs.length) btn.classList.add('has-event');

    btn.innerHTML = `
      <span class="cal__num">${d}</span>
      <span class="cal__dots">
        ${evs.map(() => '<span class="cal__dot"></span>').join('')}
      </span>`;

    btn.addEventListener('click', () => {
      state.selectedDateKey = key;
      // renderEventsPage() の最後で詳細も描き直されるので、ここでは呼びません。
      // （二重に呼ぶと、イベント地図を作ってすぐ捨てることになります）
      renderEventsPage();
      document.getElementById('eventDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    grid.appendChild(btn);
  }

  // すでに選ばれている日があれば、その詳細も出し直します
  renderEventDetail(state.selectedDateKey);
}

/* -------------------------------------------------------------
 * 選んだ日のイベント詳細（カレンダーの下に出ます）
 * ----------------------------------------------------------- */
/* -------------------------------------------------------------
 * 「イベント開催時に営業しているお店」（折りたたみ）
 *
 * ★営業しているかの判定は、トップページとまったく同じ
 *   openShopsAt()（js/utils.js）を使っています。
 *   ここに別の判定を書くと結果が食い違うので、絶対に書きません。
 *
 * お店のバーは <a href="#/shop/…"> にしてあるので、
 * タップすると既存のお店詳細ページへ移動します。
 * ----------------------------------------------------------- */
function eventShopsHtml(ev, dayKey) {
  const { when, exact } = eventStartDate(ev, dayKey);
  const shops = openShopsAt(when);                  // ← トップページと同じ関数

  const hhmm = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;

  const items = shops.map(shop => {
    const genre = genreOf(shop);
    const cat   = categoryOf(shop);
    const st    = getOpenState(shop, when);
    return `
      <li>
        <a class="shopitem" href="#/shop/${encodeURIComponent(shop.id)}">
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
            </span>
          </span>
          <span class="shopitem__arrow" aria-hidden="true">›</span>
        </a>
      </li>`;
  }).join('');

  return `
    <details class="card fold">
      <summary class="fold__head">
        <span class="fold__title">イベント開催時に営業しているお店</span>
        <span class="fold__chev" aria-hidden="true">⌄</span>
      </summary>
      <div class="fold__body">
        <p class="fold__note muted">
          ${escapeHtml(hhmm)} 時点で営業しているお店です。${exact ? '' : '（開催時刻が読み取れないため、正午で判定しています）'}
        </p>
        ${shops.length
          ? `<ul class="shoplist">${items}</ul>`
          : '<p class="access__empty">この時間に営業しているお店はありません。</p>'}
      </div>
    </details>`;
}

function renderEventDetail(key) {
  const box = document.getElementById('eventDetail');

  clearEventMaps();                 // 前に出していた地図を片づけます

  if (!key) {
    box.innerHTML = `<p class="cal__placeholder">カレンダーの日付をタップすると、その日のイベントがここに出ます。</p>`;
    return;
  }

  const d   = dateFromKey(key);
  const evs = eventsOnDate(key);

  if (evs.length === 0) {
    box.innerHTML = `
      <div class="card">
        <h3 class="ev__date">${escapeHtml(formatDateLabel(d))}</h3>
        <p class="muted">この日に予定されているイベントはありません。</p>
      </div>`;
    return;
  }

  /* 表示の順番（仕様どおり）
     ① イベント名 ② 地図 ③ 開催日時 ④ 場所
     ⑤ イベント概要 ⑥ イベント開催場所 ⑦ 営業しているお店 */
  box.innerHTML = `
    <h3 class="ev__date">${escapeHtml(formatDateLabel(d))} のイベント</h3>
    ${evs.map(ev => {
      const isMultiDay = ev.endDate && ev.endDate !== ev.date;
      const dateText = isMultiDay
        ? `${formatDateLabel(dateFromKey(ev.date))} 〜 ${formatDateLabel(dateFromKey(ev.endDate))}`
        : formatDateLabel(dateFromKey(ev.date));

      return `
      <article class="card ev">
        <div class="ev__head">
          <h4 class="ev__title">${escapeHtml(ev.title)}</h4>
          ${ev.isDummy ? '<span class="tag tag--dummy">ダミー</span>' : ''}
        </div>

        ${ev.image ? `
          <img class="ev__img" src="${escapeHtml(ev.image)}"
               alt="${escapeHtml(ev.title)}のちらし"
               onerror="this.style.display='none'">` : ''}

        ${hasEventMap(ev) ? `<div class="evmap" id="evmap-${escapeHtml(ev.id)}"></div>` : ''}

        <div class="factrow">
          <span class="factrow__key">開催日時</span>
          <span class="factrow__val">
            ${escapeHtml(dateText)}${ev.time ? `<br>${escapeHtml(ev.time)}` : ''}
          </span>
        </div>

        ${ev.place ? `
          <div class="factrow">
            <span class="factrow__key">場所</span>
            <span class="factrow__val">${escapeHtml(ev.place)}</span>
          </div>` : ''}

        ${ev.description ? `
          <div class="factrow">
            <span class="factrow__key">概要</span>
            <span class="factrow__val">${escapeHtml(ev.description)}</span>
          </div>` : ''}

        ${(ev.areaLabel || ev.place) ? `
          <div class="factrow">
            <span class="factrow__key">開催場所</span>
            <span class="factrow__val">${escapeHtml(ev.areaLabel || ev.place)}</span>
          </div>` : ''}
      </article>

      ${eventShopsHtml(ev, key)}`;
    }).join('')}`;

  // HTML を置いたあとで、地図の中身を作ります
  buildEventMaps(evs);
}

/* -------------------------------------------------------------
 * 前の月・次の月ボタン
 * ----------------------------------------------------------- */
function initEventsPage() {
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderEventsPage();
  });

  document.getElementById('btnNextMonth').addEventListener('click', () => {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderEventsPage();
  });
}
