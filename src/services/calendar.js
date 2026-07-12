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

export async function getEvents(token, dateObj) {
  const start = new Date(dateObj);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateObj);
  end.setHours(23, 59, 59, 999);

  const url = new URL(`${BASE}/calendars/primary/events`);
  url.searchParams.set('timeMin', start.toISOString());
  url.searchParams.set('timeMax', end.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  return apiFetch(url.toString(), token);
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
    summary: `【仮撮影】${clientName}`,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
    start: { date: dateStr },
    // Google の終日イベントは end.date が排他的（翌日を指定する）。
    // start と同日だと API が 400 で拒否するため翌日にする。
    end: { date: nextDay(dateStr) },
    colorId: '6', // tangerine
  };
}
