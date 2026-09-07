/* =============================================================
 * 一番街ガイド － アプリ本体
 * アプリ全体の「いまの状態」と、ページの切り替えを担当します。
 * ============================================================= */

/* -------------------------------------------------------------
 * アプリ全体で共有する「いまの状態」
 * ----------------------------------------------------------- */
const state = {
  now: new Date(),                 // いま表示している日時（ユーザーが選んだ日時）
  followRealTime: true,            // true = 実際の時刻に追従する
                                   // ユーザーが日時を動かしたら false になります
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
  if (pageId === 'page-home') refreshMapSize(homeMap);
  if (pageId === 'page-shop') refreshMapSize(shopMap);
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
    renderEventsPage();
    showPage('page-events');
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
  document.title = `${AREA.name}ガイド`;

  initHomePage();
  initEventsPage();

  document.getElementById('btnBackFromShop').addEventListener('click', goBack);
  document.getElementById('btnBackFromEvents').addEventListener('click', goBack);

  window.addEventListener('hashchange', router);
  router();                                   // 最初の1回

  /* 1分ごとに時刻を進めます。
     ただし、ユーザーが日時を自分で選んだあとは何もしません。
     （見ている日時が勝手に「今」へ戻ってしまうのを防ぐため）        */
  setInterval(() => {
    if (!state.followRealTime) return;
    state.now = new Date();
    if (!document.getElementById('page-home').hidden) renderHome();
  }, 60000);
}

document.addEventListener('DOMContentLoaded', init);
