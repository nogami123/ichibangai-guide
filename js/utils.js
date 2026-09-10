/* =============================================================
 * 一番街ガイド － 共通の道具箱
 * 営業時間の判定・距離の計算・日付の文字列づくり などを置きます。
 * ============================================================= */

const DAY_KEYS   = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/* -------------------------------------------------------------
 * 文字まわり
 * ----------------------------------------------------------- */

// HTML に文字を埋め込むとき、記号が悪さをしないように変換します。
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* -------------------------------------------------------------
 * 時刻まわり
 * ----------------------------------------------------------- */

// "17:30" -> 1050（0時からの分数）。"25:00" は 1500 として扱います。
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// 1050 -> "17:30"
function fromMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// "25:00" のような24時超えの表記を、人が読みやすい「翌1:00」に直します。
function prettyTime(hhmm) {
  const min = toMinutes(hhmm);
  if (min >= 1440) return `翌${fromMinutes(min - 1440)}`;
  return hhmm;
}

// [['11:00','14:30'],['17:00','21:00']] -> "11:00〜14:30 / 17:00〜21:00"
function formatRanges(ranges) {
  if (!ranges || ranges.length === 0) return '定休日';
  return ranges.map(([s, e]) => `${s}〜${prettyTime(e)}`).join(' / ');
}

/* -------------------------------------------------------------
 * 日付まわり
 *
 * ★注意★ new Date('2026-09-12') は世界標準時として読まれるため、
 *   日本時間では9月12日の午前9時になり、1日ズレる事故が起きます。
 *   そのため、日付を文字にするときは下の関数を必ず使い、
 *   toISOString() は使いません。
 * ----------------------------------------------------------- */

// Date -> "2026-09-12"（その場所の時刻をそのまま使います）
function dateKey(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// "2026-09-12" -> Date（時刻は0時0分）
function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// その日の 12:00（正午）の Date をつくります。
// シークバーは「いつ開いても 12:00 から」という決まりなので、
// アプリを開いたときに使います。
// （日付を選び直したときは、そのとき選ばれている時刻をそのまま保つので使いません）
function noonOf(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

// Date -> "2026年9月12日(土)"
function formatDateLabel(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${DAY_LABELS[d.getDay()]})`;
}

/* -------------------------------------------------------------
 * 営業時間の判定（このアプリの心臓部）
 *
 * 指定した日時 now に、そのお店が開いているかどうかを判定します。
 *
 * 対応していること
 *   ・曜日ごとにちがう営業時間
 *   ・1日に2つ以上の時間帯（中休み）
 *   ・定休日（hours の値が null）
 *   ・日をまたぐ営業（"25:00" のような書き方 ＝ 翌1:00）
 *
 * 戻り値
 *   { open: true,  until: "21:00", todayRanges: [...] }
 *   { open: false, nextLabel: "本日 17:00 から", todayRanges: [...] }
 * ----------------------------------------------------------- */
function getOpenState(shop, now) {
  const dayIndex = now.getDay();
  const nowMin   = now.getHours() * 60 + now.getMinutes();

  const todayRanges = shop.hours[DAY_KEYS[dayIndex]] || [];

  // ① 今日の営業時間の中に入っているか
  for (const [s, e] of todayRanges) {
    if (nowMin >= toMinutes(s) && nowMin < toMinutes(e)) {
      return { open: true, until: e, todayRanges };
    }
  }

  // ② 前日から続いている深夜営業の中か
  //    （例：昨日の 20:00〜27:00 ＝ 今日の朝3時まで）
  //    昨日の時間軸で考えるため、いまの時刻に24時間を足して比べます。
  const prevRanges = shop.hours[DAY_KEYS[(dayIndex + 6) % 7]] || [];
  const nowMinFromYesterday = nowMin + 1440;
  for (const [s, e] of prevRanges) {
    if (nowMinFromYesterday >= toMinutes(s) && nowMinFromYesterday < toMinutes(e)) {
      return { open: true, until: e, todayRanges };
    }
  }

  // ③ 閉まっている → 次に開く時刻をさがす
  const nextToday = todayRanges.find(([s]) => toMinutes(s) > nowMin);
  if (nextToday) {
    return { open: false, nextLabel: `本日 ${nextToday[0]} から`, todayRanges };
  }
  for (let i = 1; i <= 7; i++) {
    const d = (dayIndex + i) % 7;
    const ranges = shop.hours[DAY_KEYS[d]];
    if (ranges && ranges.length) {
      const prefix = i === 1 ? '明日' : `${DAY_LABELS[d]}曜`;
      return { open: false, nextLabel: `${prefix} ${ranges[0][0]} から`, todayRanges };
    }
  }
  return { open: false, nextLabel: null, todayRanges };
}

/* -------------------------------------------------------------
 * 指定した日時に営業しているお店を返します。
 *
 * ★★ このアプリで「営業しているお店」を求めるときは、
 *    かならずこの関数を使ってください。 ★★
 *
 *    トップページの一覧も、イベント詳細の「営業しているお店」も、
 *    どちらもこの1つの関数を呼んでいます。
 *    判定を2か所に書くと、片方だけ直したときに結果が食い違うためです。
 * ----------------------------------------------------------- */
function openShopsAt(when) {
  return SHOPS.filter(shop => getOpenState(shop, when).open);
}

/* -------------------------------------------------------------
 * そのお店で開催されるイベントを取り出します。
 *
 * お店データの eventIds（例: ['ev-007']）に書かれた id を
 * data/events.js から探して返します。
 *
 * ・eventIds が無いお店 → 空っぽ（＝バナーは出ません）
 * ・存在しない id が書かれていても、その分だけ無視して落ちません
 * ----------------------------------------------------------- */
function eventsOfShop(shop) {
  if (!shop || !shop.eventIds || shop.eventIds.length === 0) return [];
  return shop.eventIds
    .map(id => EVENTS.find(ev => ev.id === id))
    .filter(Boolean);
}

/* -------------------------------------------------------------
 * イベントの「開始日時」を求めます。
 *
 * time は '18:30〜21:00' のように書く決まりなので、
 * その先頭にある「時:分」を開始時刻として読み取ります。
 * 読み取れなかったときは、その日の12:00とみなします
 * （exact: false を返すので、画面にお断りを出せます）。
 *
 * イベント詳細ページと、トップページの昼アピールの
 * 両方から使っています。
 * ----------------------------------------------------------- */
function eventStartDate(ev, dayKey) {
  const when = dateFromKey(dayKey || ev.date);     // その日の 0:00
  const m = (ev.time || '').match(/(\d{1,2}):(\d{2})/);
  if (m) {
    when.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return { when, exact: true };
  }
  when.setHours(12, 0, 0, 0);
  return { when, exact: false };
}

/* -------------------------------------------------------------
 * イベントの「開催時間帯」を分で返します。
 *
 * time は '11:00〜15:00' のように書く決まりなので、
 * そこにある2つの「時:分」を、開始と終了として読み取ります。
 *   → { start: 660, end: 900 }
 *
 * 時刻が2つそろっていない書き方のときは null を返します。
 * （「開催中かどうか」を勝手に決めつけないためです）
 * ----------------------------------------------------------- */
function eventTimeRange(ev) {
  const m = (ev.time || '').match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return {
    start: Number(m[1]) * 60 + Number(m[2]),
    end:   Number(m[3]) * 60 + Number(m[4]),
  };
}

// 一覧やバッジに出す短い文言をつくります。
function openStateLabel(st) {
  if (st.open) return `営業中 ・ ${prettyTime(st.until)} まで`;
  if (st.todayRanges.length === 0) return '本日は定休日';
  return '営業時間外';
}

/* -------------------------------------------------------------
 * ジャンル（大分類）を取り出す
 * お店には業種（category）だけ持たせて、ジャンルはここで求めます。
 * こうしておくと、CATEGORIES の genre を書き換えるだけで
 * すべてのお店の分類が変わります。
 * ----------------------------------------------------------- */
function categoryOf(shop) {
  return CATEGORIES[shop.category] || { label: 'その他', genre: 'other', icon: '🏪' };
}

function genreKeyOf(shop) {
  const key = categoryOf(shop).genre;
  return GENRES[key] ? key : 'other';
}

function genreOf(shop) {
  return GENRES[genreKeyOf(shop)];
}

/* -------------------------------------------------------------
 * 距離の計算（2点間の直線距離。道なりではありません）
 * ヒュベニの式ではなく、地球を球とみなす簡単な式を使います。
 * 商店街くらいの距離なら誤差はほとんどありません。
 * ----------------------------------------------------------- */
function distanceMeters(a, b) {
  const R = 6371000;                       // 地球の半径（メートル）
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 350 -> "約350m" ／ 1420 -> "約1.4km"
function formatDistance(m) {
  if (m < 1000) return `約${Math.round(m / 10) * 10}m`;
  return `約${(m / 1000).toFixed(1)}km`;
}

// 徒歩のおおよその時間（不動産表示と同じ 分速80m で計算）
function formatWalkTime(m) {
  const min = Math.max(1, Math.round(m / 80));
  return `徒歩 約${min}分`;
}

/* -------------------------------------------------------------
 * 近い場所を選ぶ
 *
 * from（お店の座標）から近い順に並べて、上から count 件を返します。
 * 返ってくる各件には distance（メートル）が足してあるので、
 * 呼び出し側でもう一度距離を計算する必要はありません。
 *
 * uniqueByName を true にすると、同じ名前のものは
 * いちばん近い1件だけにします。
 * バス停は上り側・下り側で同じ名前が2つ登録されているため、
 * これがないと「胡屋・胡屋・中の町」のように枠を無駄づかいします。
 * ----------------------------------------------------------- */
function nearestPlaces(from, places, count, uniqueByName = false) {
  const sorted = places
    .map(p => Object.assign({}, p, { distance: distanceMeters(from, p.latlng) }))
    .sort((a, b) => a.distance - b.distance);

  if (!uniqueByName) return sorted.slice(0, count);

  const seen = new Set();
  const result = [];
  for (const p of sorted) {
    if (seen.has(p.name)) continue;      // 同じ名前は最初の（＝いちばん近い）1件だけ
    seen.add(p.name);
    result.push(p);
    if (result.length >= count) break;
  }
  return result;
}
