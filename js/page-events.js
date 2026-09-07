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
      renderEventsPage();                    // 選択の色を付け直します
      renderEventDetail(key);
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
function renderEventDetail(key) {
  const box = document.getElementById('eventDetail');

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

  box.innerHTML = `
    <h3 class="ev__date">${escapeHtml(formatDateLabel(d))} のイベント</h3>
    ${evs.map(ev => {
      const isMultiDay = ev.endDate && ev.endDate !== ev.date;
      return `
      <article class="card ev">
        <div class="ev__head">
          <h4 class="ev__title">${escapeHtml(ev.title)}</h4>
          ${ev.isDummy ? '<span class="tag tag--dummy">ダミー</span>' : ''}
        </div>
        ${isMultiDay ? `
          <div class="factrow">
            <span class="factrow__key">開催期間</span>
            <span class="factrow__val">${escapeHtml(ev.date)} 〜 ${escapeHtml(ev.endDate)}</span>
          </div>` : ''}
        ${ev.time ? `
          <div class="factrow">
            <span class="factrow__key">時間</span>
            <span class="factrow__val">${escapeHtml(ev.time)}</span>
          </div>` : ''}
        ${ev.place ? `
          <div class="factrow">
            <span class="factrow__key">場所</span>
            <span class="factrow__val">${escapeHtml(ev.place)}</span>
          </div>` : ''}
        ${ev.description ? `<p class="ev__desc">${escapeHtml(ev.description)}</p>` : ''}
      </article>`;
    }).join('')}`;
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
