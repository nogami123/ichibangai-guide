/* =============================================================
 * 一番街ガイド － アプリ本体
 * アプリ全体の「いまの状態」と、ページの切り替えを担当します。
 * ============================================================= */

/* -------------------------------------------------------------
 * アプリ全体で共有する「いまの状態」
 * ----------------------------------------------------------- */
const state = {
  // アプリを開いたときは、現在時刻ではなく「今日の 12:00」から始めます。
  // シークバーのつまみが、いつでも中央（12:00）にある状態です。
  now: noonOf(new Date()),         // いま表示している日時（ユーザーが選んだ日時）

  // true = 実際の時刻に追従する。
  // 開いた直後は 12:00 で止めておきたいので false から始めます。
  // 「現在時刻」ボタンを押したときだけ true になります。
  followRealTime: false,
  genre: 'all',                    // 絞り込み中のジャンル
  userPos: null,                   // 現在地 [緯度, 経度]。取れなければ null のまま

  calYear:  new Date().getFullYear(),   // カレンダーで表示中の年
  calMonth: new Date().getMonth(),      // カレンダーで表示中の月（0から数えます）
  selectedDateKey: dateKey(new Date()), // カレンダーで選んでいる日
};

let navCount = 0;                  // アプリ内で何回ページを移動したか

/* -------------------------------------------------------------
 * ページの切り替え（ハッシュルーティング）
 *
 *   #/            → トップページ
 *   #/shop/xxxx   → お店詳細ページ
 *   #/events      → イベントカレンダーページ
 *
 * URL の # の部分を見て、表示するページを決めます。
 * この方式にすると、ブラウザの「戻る」ボタンが正しく動きます。
 * ----------------------------------------------------------- */
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(el => {
    el.hidden = (el.id !== pageId);
  });
  window.scrollTo(0, 0);

  // ★重要★ 隠れている間に作られた地図は大きさを 0 と覚えてしまうため、
  //         表示した直後にサイズを測り直します。
  if (pageId === 'page-home') {
    refreshMapSize(homeMap);
    showSwipeHint();               // 初回だけ、シークバーの操作案内を出します
  }
  if (pageId === 'page-shop')   refreshMapSize(shopMap);
  if (pageId === 'page-events') refreshEventMaps();   // イベント開催場所の地図
}

function router() {
  navCount++;
  const hash = location.hash || '#/';

  if (hash.startsWith('#/shop/')) {
    const id = decodeURIComponent(hash.slice('#/shop/'.length));
    renderShopPage(id);
    showPage('page-shop');
    return;
  }

  if (hash.startsWith('#/events')) {
    /* #/events            … ふつうにカレンダーを開く
       #/events/2026-09-18 … その日を選んだ状態でカレンダーを開く
                             （お店詳細のイベントバナーから来たとき） */
    const datePart = hash.slice('#/events'.length).replace(/^\//, '');
    const jumped   = /^\d{4}-\d{2}-\d{2}$/.test(datePart);

    if (jumped) {
      state.selectedDateKey = datePart;
      const d = dateFromKey(datePart);
      state.calYear  = d.getFullYear();      // カレンダーの月も合わせます
      state.calMonth = d.getMonth();
    }

    renderEventsPage();
    showPage('page-events');

    // 日付を指定して来たときは、イベント詳細のところまで送ります。
    // showPage が画面を一番上に戻すので、そのあとで動かします。
    if (jumped) {
      setTimeout(() => {
        const box = document.getElementById('eventDetail');
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
    return;
  }

  if (hash.startsWith('#/daytime')) {
    renderDaytimePage();
    showPage('page-daytime');
    return;
  }

  // それ以外はトップページ
  renderHome();
  showPage('page-home');
}

// 「← 戻る」ボタン用。
// アプリ内で移動してきたなら、ブラウザの戻ると同じ動きにします。
// いきなりこのページを開いた場合は、トップページへ移動します。
function goBack() {
  if (navCount > 1) history.back();
  else location.hash = '#/';
}

/* -------------------------------------------------------------
 * 起動処理
 * ----------------------------------------------------------- */
function init() {
  // タブに出る名前は index.html の <title> で決めています。
  // ここで上書きしてしまうと、<title> を直しても変わらなくなるので、
  // アプリ名は index.html の1箇所だけで管理します。

  initHomePage();
  initEventsPage();

  document.getElementById('btnBackFromShop').addEventListener('click', goBack);
  document.getElementById('btnBackFromEvents').addEventListener('click', goBack);
  document.getElementById('btnBackFromDaytime').addEventListener('click', goBack);

  window.addEventListener('hashchange', router);
  router();                                   // 最初の1回

  /* 1分ごとに時刻を進めます。
     動くのは「現在時刻」ボタンを押したあとだけです。
     開いた直後や、ユーザーが日時を選んだあとは何もしません。
     （見ている日時が勝手に動いてしまうのを防ぐため）              */
  setInterval(() => {
    if (!state.followRealTime) return;
    state.now = new Date();
    if (!document.getElementById('page-home').hidden) renderHome();
  }, 60000);
}

document.addEventListener('DOMContentLoaded', init);
