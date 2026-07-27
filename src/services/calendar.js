const BASE = 'https://www.googleapis.com/calendar/v3';

async function apiFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error?.message || 'Calendar API error');
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// カレンダーの実際の表示名。共有カレンダーを自分でリネームしている場合は
// summaryOverride が入るため、そちらを優先する。
export const calDisplayName = (cal) => cal.summaryOverride || cal.summary;

// 祝日・誕生日などGoogle提供のシステムカレンダー。
// idが @group.v.calendar.google.com で終わる（ユーザー作成の共有カレンダーは
// @group.calendar.google.com で「.v」が入らない）ため区別できる。
export const isSystemCalendar = (cal) => (cal.id || '').endsWith('@group.v.calendar.google.com');

// 「バラシ」カレンダー（kei.imagawa.a アカウント内の、名前に「バラシ」を含む
// カレンダー）はバラシ用で本番の予定ではないため、カレンダーごと丸ごと被り
// チェックから除外する（＝月表示の「バラシ」トグル対象でもある）。
// 判定は表示名（自分でリネームしている場合は summaryOverride を優先）に
// 「バラシ」を含むか。※アカウント全体ではなく、この名前のカレンダーだけが対象。
export const TEARDOWN_CALENDAR_NAME = 'バラシ';
export const isTeardownCalendar = (cal) =>
  (calDisplayName(cal) || '').includes(TEARDOWN_CALENDAR_NAME);

// 祝日カレンダー判定（月表示の表示ON/OFF用）。
// 日本の祝日カレンダーは id が「...#holiday@group.v.calendar.google.com」の形。
// 名前を自分で変えている場合に備えて「祝日」を含む名前も拾う。
export const isHolidayCalendar = (cal) =>
  /holiday/i.test(cal.id || '') || /祝日/.test(calDisplayName(cal) || '');

// 被りチェック対象のカレンダーだけに絞り込む。
// 除外するのは次の2つだけ:
// - バラシ: 撮影後の記録用で、実際に予定が埋まっているわけではない
// - 祝日  : 「祝日だから撮影できない」わけではないので被り扱いしない
// それ以外は（共有カレンダーを取りこぼして被りを見落とさないよう）全部対象にする。
// ※ 過去にallowlist方式で共有カレンダーを見落として被りが出なかった経緯があるため、
//   名前の完全一致リストなどで絞り込まないこと。
export function conflictCalendars(cals) {
  return (cals || []).filter((c) => !isTeardownCalendar(c) && !isHolidayCalendar(c));
}

// 被り判定にかける実予定だけを残す（キャンセル済みを除外）
export function realEvents(cal, items) {
  return (items || []).filter((e) => e.status !== 'cancelled');
}

export async function createEvent(token, event) {
  return apiFetch(`${BASE}/calendars/primary/events`, token, {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export function buildProjectEvent(name, type, startTime, endTime, location) {
  return {
    summary: `【${type}】${name}`,
    location,
    start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Tokyo' },
    end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Tokyo' },
    colorId: type === 'オーディション' ? '9' : '11',
  };
}

export function buildWakeEvent(name, wakeUpTime) {
  const end = new Date(wakeUpTime.getTime() + 30 * 60 * 1000);
  return {
    summary: `起床【${name}】`,
    start: { dateTime: wakeUpTime.toISOString(), timeZone: 'Asia/Tokyo' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Tokyo' },
    colorId: '5',
  };
}

export function buildBedEvent(name, bedTime, wakeUpTime) {
  return {
    summary: `就寝【${name}】`,
    start: { dateTime: bedTime.toISOString(), timeZone: 'Asia/Tokyo' },
    end: { dateTime: wakeUpTime.toISOString(), timeZone: 'Asia/Tokyo' },
    colorId: '3',
  };
}

export async function listCalendars(token) {
  return apiFetch(`${BASE}/users/me/calendarList`, token);
}

// dateStr: "YYYY-MM-DD" in JST
export async function getEventsFromCalendar(token, calendarId, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // JST midnight = UTC−9h; 23:59:59 JST = UTC+14:59:59
  const start = new Date(Date.UTC(y, m - 1, d, -9, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 14, 59, 59, 999));

  const url = new URL(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', start.toISOString());
  url.searchParams.set('timeMax', end.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeZone', 'Asia/Tokyo');

  return apiFetch(url.toString(), token);
}

// 任意の期間のイベントを取得する（月表示カレンダー用）
export async function getEventsInRange(token, calendarId, timeMin, timeMax) {
  const url = new URL(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeZone', 'Asia/Tokyo');
  url.searchParams.set('maxResults', '2500');
  return apiFetch(url.toString(), token);
}

export async function createEventInCalendar(token, calendarId, event) {
  return apiFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    token,
    { method: 'POST', body: JSON.stringify(event) }
  );
}

// "YYYY-MM-DD" → 翌日の "YYYY-MM-DD"（終日イベントの end.date は排他的なため）
function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// dateStr: "YYYY-MM-DD"
// options: { location, description } — 案件内容の編集結果をカレンダーに反映する
export function buildProvisionalShootingEvent(clientName, dateStr, options = {}) {
  const { location, description } = options;
  return {
    // 「仮撮影」カレンダーに入っている時点で仮撮影と分かるので、
    // 【仮撮影】のような接頭辞は付けず案件名だけにする。
    summary: clientName,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
    start: { date: dateStr },
    // Google の終日イベントは end.date が排他的（翌日を指定する）。
    // start と同日だと API が 400 で拒否するため翌日にする。
    end: { date: nextDay(dateStr) },
    // colorId は指定しない。指定するとカレンダーの色を上書きしてしまうため、
    // 未指定にして「仮撮影」カレンダー自体の色をそのまま使う。
  };
}
