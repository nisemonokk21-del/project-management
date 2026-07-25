// 月表示カレンダーの「連日予定を1本のバーで繋げて表示する」ためのレイアウト計算。
// UI・DOMに依存しない純粋ロジックなので calendarLayout.test.js で単体テストできる。
//
// 用語:
// - event: { title, color, startDay, endDay, ... }（startDay/endDay は "YYYY-MM-DD"、endDay は「含む」）
// - segment: 1週間の中に描く1本のバー。何列目から何列ぶんか（col/span）と、
//   週内の何段目か（lane）を持つ。週をまたぐ予定は週ごとに分割される。

// "YYYY-MM-DD" → 前日の "YYYY-MM-DD"
export function prevDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 予定が覆う日付を列挙する（startDay〜endDay、両端含む）。暴走防止に上限あり。
export function expandDays(startDay, endDay, limit = 400) {
  const days = [];
  let cur = startDay;
  while (cur <= endDay && days.length < limit) {
    days.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    cur = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
      dt.getUTCDate()
    ).padStart(2, '0')}`;
  }
  return days;
}

// 表示順（＝どの予定を上の段に置くか）。
// 連日の予定ほど上、同じ長さなら開始が早い順、最後はタイトルで安定させる。
function compareForLane(a, b) {
  const lenA = expandDays(a.startDay, a.endDay).length;
  const lenB = expandDays(b.startDay, b.endDay).length;
  if (lenA !== lenB) return lenB - lenA; // 長い方が上
  if (a.startDay !== b.startDay) return a.startDay < b.startDay ? -1 : 1;
  return String(a.title).localeCompare(String(b.title));
}

// 1週間ぶん（weekDays: 長さ7の "YYYY-MM-DD" or null 配列）のバー配置を計算する。
// 同じ段（lane）で重ならないように、空いている一番上の段へ順に詰める。
export function weekSegments(weekDays, events) {
  const sorted = [...(events || [])].sort(compareForLane);
  const lanes = []; // lanes[i] = その段で埋まっている列のSet
  const segments = [];

  for (const ev of sorted) {
    // この週の中で、その予定が覆う列を求める
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const day = weekDays[i];
      if (day && day >= ev.startDay && day <= ev.endDay) cols.push(i);
    }
    if (cols.length === 0) continue;

    const col = cols[0];
    const span = cols[cols.length - 1] - cols[0] + 1;

    // 空いている一番上の段を探す
    let lane = 0;
    for (;;) {
      if (!lanes[lane]) lanes[lane] = new Set();
      let free = true;
      for (let c = col; c < col + span; c++) {
        if (lanes[lane].has(c)) {
          free = false;
          break;
        }
      }
      if (free) break;
      lane++;
    }
    for (let c = col; c < col + span; c++) lanes[lane].add(c);

    segments.push({
      ev,
      col,
      span,
      lane,
      // 前後の週へ続いているか（続く側は角を丸めず、繋がって見えるようにする）
      continuesLeft: ev.startDay < weekDays[col],
      continuesRight: ev.endDay > weekDays[cols[cols.length - 1]],
    });
  }

  return segments;
}

// その週に必要な段数
export function laneCount(segments) {
  return segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
}
