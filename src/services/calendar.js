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
