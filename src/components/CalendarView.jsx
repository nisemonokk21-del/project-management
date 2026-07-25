import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  listCalendars,
  getEventsInRange,
  isTeardownCalendar,
  isHolidayCalendar,
} from '../services/calendar';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 背景色に対して読みやすい文字色（明るい背景→濃色、暗い背景→白）
function textOn(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1f2937' : '#ffffff';
}

// Date → "YYYY-MM-DD"（JST基準）
function jstDay(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

// "YYYY-MM-DD" のローカル整形
function fmtLocal(y, m0, d) {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 終日イベント: start.date 〜 end.date(排他的) の各日を列挙
function eachDay(startStr, endStrExclusive) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  let endT;
  if (endStrExclusive) {
    const [ey, em, ed] = endStrExclusive.split('-').map(Number);
    endT = Date.UTC(ey, em - 1, ed);
  } else {
    endT = cur + 86400000;
  }
  const days = [];
  while (cur < endT && days.length < 60) {
    const dt = new Date(cur);
    days.push(fmtLocal(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    cur += 86400000;
  }
  return days;
}

export default function CalendarView() {
  const { googleToken, reauth } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [eventsByDay, setEventsByDay] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(jstDay(now));
  // バラシ撮影・祝日カレンダーの表示ON/OFF（初期は両方表示）
  const [showTeardown, setShowTeardown] = useState(true);
  const [showHolidays, setShowHolidays] = useState(true);

  const getToken = async () => {
    if (googleToken) return googleToken;
    return reauth();
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) {
        setError('Googleログインが必要です。一度ログアウトして再ログインしてください。');
        return;
      }

      // 当月（JST）の範囲
      const start = new Date(Date.UTC(year, month, 1, -9, 0, 0));
      const end = new Date(Date.UTC(year, month + 1, 1, -9, 0, 0));

      const calListData = await listCalendars(token);
      const cals = (calListData.items || []).filter((c) => c.selected !== false);

      const results = await Promise.all(
        cals.map((cal) => {
          const meta = {
            color: cal.backgroundColor || '#4285f4',
            teardown: isTeardownCalendar(cal),
            holiday: isHolidayCalendar(cal),
          };
          return getEventsInRange(token, cal.id, start, end)
            .then((d) => (d.items || []).map((e) => ({ e, ...meta })))
            .catch(() => []);
        })
      );

      const map = {};
      const push = (day, item) => {
        (map[day] ||= []).push(item);
      };

      results.flat().forEach(({ e, color, teardown, holiday }) => {
        const title = e.summary || '(無題)';
        if (e.start?.date) {
          // 終日イベント
          eachDay(e.start.date, e.end?.date).forEach((day) =>
            push(day, { title, color, teardown, holiday, allDay: true, sortKey: '' })
          );
        } else if (e.start?.dateTime) {
          const dt = new Date(e.start.dateTime);
          const day = jstDay(dt);
          const time = dt.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tokyo',
          });
          push(day, { title, color, teardown, holiday, allDay: false, time, sortKey: time });
        }
      });

      // 各日を時刻順に（終日→時刻イベント）
      Object.values(map).forEach((arr) =>
        arr.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      );

      setEventsByDay(map);
    } catch (err) {
      if (err.status === 401) {
        setError('カレンダートークンが期限切れです。再ログインしてください。');
      } else {
        setError('カレンダーの読み込みに失敗しました: ' + (err.message || ''));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 月・ログイン状態が変わったら再読み込み
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (googleToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, googleToken]);

  const goPrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };

  const goNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelectedDay(jstDay(t));
  };

  // グリッド生成（日曜始まり）
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // トグルに応じてバラシ撮影・祝日を出し分ける（再取得せず表示だけ切り替え）
  const visible = (ev) =>
    (showTeardown || !ev.teardown) && (showHolidays || !ev.holiday);

  const todayStr = jstDay(new Date());
  const selectedEvents = (eventsByDay[selectedDay] || []).filter(visible);

  return (
    <div className="cal-wrap">
      <div className="cal-panel">
        <div className="cal-header">
          <button className="cal-nav-btn" onClick={goPrev} aria-label="前の月">‹</button>
          <div className="cal-title">
            {year}年{month + 1}月
          </div>
          <button className="cal-nav-btn" onClick={goNext} aria-label="次の月">›</button>
          <button className="cal-today-btn" onClick={goToday}>今日</button>
        </div>

        <div className="cal-toggles">
          <label className="cal-toggle">
            <input
              type="checkbox"
              checked={showTeardown}
              onChange={(e) => setShowTeardown(e.target.checked)}
            />
            バラシ
          </label>
          <label className="cal-toggle">
            <input
              type="checkbox"
              checked={showHolidays}
              onChange={(e) => setShowHolidays(e.target.checked)}
            />
            祝日
          </label>
        </div>

        {error && <div className="error cal-error">⚠️ {error}</div>}

        <div className="cal-grid cal-weekdays">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`cal-weekday${i === 0 ? ' cal-sun' : ''}${i === 6 ? ' cal-sat' : ''}`}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="cal-cell cal-empty" />;
            const dayStr = fmtLocal(year, month, d);
            const evs = (eventsByDay[dayStr] || []).filter(visible);
            const wd = i % 7;
            return (
              <button
                key={i}
                className={
                  'cal-cell' +
                  (dayStr === todayStr ? ' cal-today' : '') +
                  (dayStr === selectedDay ? ' cal-selected' : '')
                }
                onClick={() => setSelectedDay(dayStr)}
              >
                <span
                  className={`cal-day-num${wd === 0 ? ' cal-sun' : ''}${wd === 6 ? ' cal-sat' : ''}`}
                >
                  {d}
                </span>
                <span className="cal-chips">
                  {evs.map((ev, k) => (
                    <span
                      key={k}
                      className="cal-chip"
                      style={{ background: ev.color, color: textOn(ev.color) }}
                      title={ev.title}
                    >
                      {ev.title}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {loading && (
          <p className="loading-text" style={{ marginTop: '12px' }}>
            <span className="spinner" /> 読み込み中...
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '14px' }}>
          {(() => {
            const [y, m, d] = selectedDay.split('-').map(Number);
            const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
            return `${m}月${d}日(${wd})の予定`;
          })()}
        </h3>
        {selectedEvents.length === 0 ? (
          <p className="empty-text">予定はありません</p>
        ) : (
          <div className="cal-day-events">
            {selectedEvents.map((ev, i) => (
              <div key={i} className="cal-event-item">
                <span className="cal-event-dot" style={{ background: ev.color }} />
                <span className="cal-event-time">{ev.allDay ? '終日' : ev.time}</span>
                <span className="cal-event-title">{ev.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
