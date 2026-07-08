import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listCalendars, getEventsInRange } from '../services/calendar';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// Date → "YYYY-MM-DD"（JST基準）
function jstDay(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function fmtLocal(y, m0, d) {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "YYYY-MM-DD" に n 日足す
function addDays(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return fmtLocal(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

// JST の 0:00 を表す UTC Date
function jstMidnightUtc(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
}

// 月グリッドの開始日（日曜）と終了日（土曜）
function gridRange(year, month) {
  const first = fmtLocal(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const last = fmtLocal(year, month, daysInMonth);
  const start = addDays(first, -new Date(year, month, 1).getDay());
  const end = addDays(last, 6 - new Date(year, month, daysInMonth).getDay());
  return { start, end };
}

// バーの背景色から読みやすい文字色を選ぶ
function textColorFor(bg) {
  const c = (bg || '#4285f4').replace('#', '');
  if (c.length < 6) return '#fff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1f2937' : '#fff';
}

// 1週間ぶんのイベントバー配置（レーン割り当て）
function layoutWeek(weekDays, events) {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const segs = [];
  events.forEach((ev) => {
    if (ev.startDay > weekEnd || ev.endDay < weekStart) return;
    const col = weekDays.indexOf(ev.startDay >= weekStart ? ev.startDay : weekStart);
    const endCol = weekDays.indexOf(ev.endDay <= weekEnd ? ev.endDay : weekEnd);
    if (col === -1 || endCol === -1) return;
    segs.push({
      ...ev,
      col,
      span: endCol - col + 1,
      contL: ev.startDay < weekStart,
      contR: ev.endDay > weekEnd,
    });
  });
  segs.sort(
    (a, b) =>
      a.col - b.col ||
      b.span - a.span ||
      (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : (a.time || '').localeCompare(b.time || ''))
  );
  const laneEnds = [];
  segs.forEach((s) => {
    let lane = laneEnds.findIndex((end) => end < s.col);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.col + s.span - 1);
    } else {
      laneEnds[lane] = s.col + s.span - 1;
    }
    s.lane = lane;
  });
  return { segs, laneCount: laneEnds.length };
}

export default function CalendarView() {
  const { googleToken, reauth } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(jstDay(now));

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

      // グリッド全域（前後月の見えている日も含む）を取得
      const { start, end } = gridRange(year, month);
      const timeMin = jstMidnightUtc(start);
      const timeMax = jstMidnightUtc(addDays(end, 1));

      const calListData = await listCalendars(token);
      const cals = (calListData.items || []).filter((c) => c.selected !== false);

      const results = await Promise.all(
        cals.map((cal) =>
          getEventsInRange(token, cal.id, timeMin, timeMax)
            .then((d) =>
              (d.items || []).map((e) => ({ e, color: cal.backgroundColor || '#4285f4' }))
            )
            .catch(() => [])
        )
      );

      const list = [];
      results.flat().forEach(({ e, color }) => {
        const title = e.summary || '(無題)';
        if (e.start?.date) {
          // 終日イベント（end.date は排他的）
          const startDay = e.start.date;
          const endDay = e.end?.date ? addDays(e.end.date, -1) : startDay;
          list.push({
            title,
            color,
            startDay,
            endDay: endDay >= startDay ? endDay : startDay,
            allDay: true,
          });
        } else if (e.start?.dateTime) {
          const dt = new Date(e.start.dateTime);
          const day = jstDay(dt);
          const time = dt.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tokyo',
          });
          list.push({ title, color, startDay: day, endDay: day, allDay: false, time });
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

  // グリッド生成
  const { start: gridStart, end: gridEnd } = gridRange(year, month);
  const allDays = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) allDays.push(d);
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const todayStr = jstDay(new Date());

  const selectedEvents = events
    .filter((ev) => ev.startDay <= selectedDay && selectedDay <= ev.endDay)
    .sort((a, b) =>
      a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : (a.time || '').localeCompare(b.time || '')
    );

  return (
    <div className="cal-wrap">
      <div className="card calw-card">
        <div className="cal-header">
          <button className="cal-nav-btn" onClick={goPrev} aria-label="前の月">‹</button>
          <div className="cal-title">
            {year}年{month + 1}月
          </div>
          <button className="cal-nav-btn" onClick={goNext} aria-label="次の月">›</button>
          <button
            className="cal-reload-btn"
            onClick={load}
            disabled={loading}
            aria-label="再読み込み"
            title="スケジュールを再読み込み"
          >
            <span className={loading ? 'cal-reload-spin' : ''}>🔄</span>
          </button>
          <button className="cal-today-btn" onClick={goToday}>今日</button>
        </div>

        {error && <div className="error" style={{ margin: '0 8px 12px' }}>⚠️ {error}</div>}

        <div className="calw-weekdays">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`calw-weekday${i === 0 ? ' calw-sun' : ''}${i === 6 ? ' calw-sat' : ''}`}
            >
              {w}
            </div>
          ))}
        </div>

        {weeks.map((weekDays, wi) => {
          const { segs, laneCount } = layoutWeek(weekDays, events);
          return (
            <div
              key={wi}
              className="calw-week"
              style={{ minHeight: `${Math.max(74, 28 + laneCount * 21)}px` }}
            >
              {/* クリック判定用の透明レイヤー（背景色もここで表現） */}
              <div className="calw-hitrow">
                {weekDays.map((day) => {
                  const inMonth = day.startsWith(monthPrefix);
                  return (
                    <button
                      key={day}
                      className={
                        'calw-hit' +
                        (inMonth ? '' : ' calw-other') +
                        (day === selectedDay ? ' calw-selected' : '')
                      }
                      onClick={() => setSelectedDay(day)}
                      aria-label={day}
                    />
                  );
                })}
              </div>

              {/* 日付の数字（バーと重ならないよう通常フローで最上段） */}
              <div className="calw-numrow">
                {weekDays.map((day, i) => {
                  const dayNum = Number(day.slice(8));
                  const inMonth = day.startsWith(monthPrefix);
                  return (
                    <div key={day} className="calw-numcell">
                      <span
                        className={
                          'calw-num' +
                          (day === todayStr ? ' calw-today' : '') +
                          (!inMonth ? ' calw-other-num' : '') +
                          (i === 0 ? ' calw-sun' : '') +
                          (i === 6 ? ' calw-sat' : '')
                        }
                      >
                        {dayNum}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* イベントバー */}
              <div className="calw-bars">
                {segs.map((s, k) => (
                  <div
                    key={k}
                    className={
                      'calw-bar' + (s.contL ? ' calw-cont-l' : '') + (s.contR ? ' calw-cont-r' : '')
                    }
                    style={{
                      gridColumn: `${s.col + 1} / span ${s.span}`,
                      gridRow: s.lane + 1,
                      background: s.color,
                      color: textColorFor(s.color),
                    }}
                  >
                    {s.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {loading && (
          <p className="loading-text" style={{ margin: '12px 8px 0' }}>
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
