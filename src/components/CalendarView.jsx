import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  listCalendars,
  getEventsInRange,
  isTeardownCalendar,
  isHolidayCalendar,
} from '../services/calendar';
import {
  prevDay,
  expandDays,
  weekSegments,
  laneCount,
} from '../services/calendarLayout';

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

export default function CalendarView() {
  const { googleToken, reauth } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  // 予定は「日ごと」ではなく startDay〜endDay を持つ形で保持する。
  // 連日の予定を1本のバーとして繋げて描くために必要。
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(jstDay(now));
  // バラシ・祝日カレンダーの表示ON/OFF（初期は両方表示）
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

      const list = [];
      results.flat().forEach(({ e, color, teardown, holiday }) => {
        const base = { title: e.summary || '(無題)', color, teardown, holiday };

        if (e.start?.date) {
          // 終日イベント。end.date は排他的なので前日を終了日にする。
          const startDay = e.start.date;
          let endDay = e.end?.date ? prevDay(e.end.date) : startDay;
          if (endDay < startDay) endDay = startDay;
          list.push({ ...base, allDay: true, time: '', sortKey: '', startDay, endDay });
        } else if (e.start?.dateTime) {
          const dt = new Date(e.start.dateTime);
          const startDay = jstDay(dt);
          let endDay = startDay;
          if (e.end?.dateTime) {
            // 終了が翌0:00ちょうどの予定を翌日扱いにしないよう1ms引いてから日付にする
            const d2 = jstDay(new Date(new Date(e.end.dateTime).getTime() - 1));
            if (d2 > startDay) endDay = d2;
          }
          const time = dt.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tokyo',
          });
          list.push({ ...base, allDay: false, time, sortKey: time, startDay, endDay });
        }
      });

      setEvents(list);
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

  // トグルに応じてバラシ・祝日を出し分ける（再取得せず表示だけ切り替え）
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (ev) => (showTeardown || !ev.teardown) && (showHolidays || !ev.holiday)
      ),
    [events, showTeardown, showHolidays]
  );

  // 日付をタップした時の一覧用。連日の予定は各日に出す。
  const eventsByDay = useMemo(() => {
    const map = {};
    visibleEvents.forEach((ev) => {
      expandDays(ev.startDay, ev.endDay).forEach((day) => {
        (map[day] ||= []).push(ev);
      });
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    );
    return map;
  }, [visibleEvents]);

  // グリッド生成（日曜始まり）→ 7日ずつの週に分ける
  const weeks = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [year, month]);

  const todayStr = jstDay(new Date());
  const selectedEvents = eventsByDay[selectedDay] || [];

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

        {weeks.map((week, wi) => {
          const days = week.map((d) => (d === null ? null : fmtLocal(year, month, d)));
          const segs = weekSegments(days, visibleEvents);
          const lanes = laneCount(segs);
          return (
            <div
              className="cal-week"
              key={wi}
              style={{
                gridTemplateRows: lanes > 0 ? `auto repeat(${lanes}, 17px)` : 'auto',
              }}
            >
              {/* 背景セル（日付タップ用）。段の数だけ縦に伸ばす */}
              {week.map((d, i) =>
                d === null ? (
                  <div
                    key={`bg${i}`}
                    className="cal-cellbg cal-empty"
                    style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
                  />
                ) : (
                  <button
                    key={`bg${i}`}
                    className={
                      'cal-cellbg' +
                      (days[i] === todayStr ? ' cal-today' : '') +
                      (days[i] === selectedDay ? ' cal-selected' : '')
                    }
                    style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
                    onClick={() => setSelectedDay(days[i])}
                    aria-label={`${month + 1}月${d}日`}
                  />
                )
              )}

              {/* 日付の数字 */}
              {week.map((d, i) =>
                d === null ? null : (
                  <span
                    key={`n${i}`}
                    className={`cal-day-num${i === 0 ? ' cal-sun' : ''}${i === 6 ? ' cal-sat' : ''}${
                      days[i] === todayStr ? ' cal-today-num' : ''
                    }`}
                    style={{ gridColumn: i + 1, gridRow: 1 }}
                  >
                    {d}
                  </span>
                )
              )}

              {/* 予定バー。連日はここで複数列にまたがる1本になる */}
              {segs.map((s, si) => (
                <span
                  key={si}
                  className={
                    'cal-bar' +
                    (s.continuesLeft ? ' cal-bar-cl' : '') +
                    (s.continuesRight ? ' cal-bar-cr' : '')
                  }
                  style={{
                    gridColumn: `${s.col + 1} / span ${s.span}`,
                    gridRow: s.lane + 2,
                    background: s.ev.color,
                    color: textOn(s.ev.color),
                  }}
                  title={s.ev.title}
                >
                  {s.ev.title}
                </span>
              ))}
            </div>
          );
        })}

        {loading && (
          <p className="loading-text cal-loading">
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
