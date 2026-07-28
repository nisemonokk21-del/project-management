import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { combineDateAndTime, buildSchedule, jstDateString, formatTime } from '../utils/timeUtils';
import { yahooTransitUrl, googleMapsTransitUrl, ORIGIN_STATION } from '../services/transitLinks';
import { fetchDepartureTime } from '../services/googleDirections';
import {
  listCalendars,
  getEventsFromCalendar,
  patchEvent,
  calDisplayName,
  conflictCalendars,
  realEvents,
} from '../services/calendar';

// 電車スケジュールを予定の説明欄に書き込むときの目印。
// この行より後ろが電車スケジュールブロック。再登録時はここから下を作り直す。
const TRAIN_MARKER = '🚃 電車スケジュール';

function buildTrainBlock(collectionTime, schedule) {
  return [
    TRAIN_MARKER,
    `集合 ${formatTime(collectionTime)}`,
    `乗車 ${formatTime(schedule.boardingTime)}（${ORIGIN_STATION}駅 発）`,
    `起床 ${formatTime(schedule.wakeUpTime)}`,
    `就寝 ${formatTime(schedule.bedTime)}`,
  ].join('\n');
}

// 既存の説明欄に電車ブロックを上書きする。
// LINE返信で入れた「内容(原文ママ)」などは残し、電車ブロックだけ差し替える。
function mergeDescription(existing, block) {
  const base = existing || '';
  const idx = base.indexOf(TRAIN_MARKER);
  const kept = (idx >= 0 ? base.slice(0, idx) : base).replace(/\s+$/, '');
  return kept ? `${kept}\n\n${block}` : block;
}

// 予定の開始時刻表示（終日 or HH:MM）
function eventTimeLabel(ev) {
  if (ev.start?.dateTime) {
    return new Date(ev.start.dateTime).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
  }
  return '終日';
}

export default function ProjectForm() {
  const { googleToken, reauth } = useAuth();

  const [date, setDate] = useState(jstDateString(1));
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState('');
  // 選択中の案件のキー（calId + eventId）
  const [selectedKey, setSelectedKey] = useState('');

  const [collectionTime, setCollectionTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [boardingTime, setBoardingTime] = useState('');
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoError, setAutoError] = useState('');
  const [error, setError] = useState('');

  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState(false);
  const [writeError, setWriteError] = useState('');

  const getToken = async () => {
    if (googleToken) return googleToken;
    return reauth();
  };

  const keyOf = (item) => `${item.calId}::${item.event.id}`;
  const selected = events.find((item) => keyOf(item) === selectedKey) || null;

  const loadEvents = async () => {
    setLoadingEvents(true);
    setEventsError('');
    setEvents([]);
    setSelectedKey('');
    setBoardingTime('');
    setWritten(false);
    setWriteError('');
    try {
      const token = await getToken();
      if (!token) {
        setEventsError('Googleログインが必要です。一度ログアウトして再ログインしてください。');
        return;
      }
      const calListData = await listCalendars(token);
      const cals = conflictCalendars(calListData.items || []);
      const perCal = await Promise.all(
        cals.map((cal) =>
          getEventsFromCalendar(token, cal.id, date)
            .then((data) =>
              realEvents(cal, data.items).map((event) => ({
                calId: cal.id,
                calName: calDisplayName(cal),
                event,
              }))
            )
            .catch(() => [])
        )
      );
      const list = perCal.flat().sort((a, b) => {
        const ta = a.event.start?.dateTime || '';
        const tb = b.event.start?.dateTime || '';
        return ta.localeCompare(tb);
      });
      setEvents(list);
    } catch (err) {
      setEventsError('案件の読み込みに失敗しました: ' + (err.message || ''));
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    // 日付・ログイン状態が変わったら案件を読み込み直す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (googleToken) loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, googleToken]);

  const handleSelect = (item) => {
    setSelectedKey(keyOf(item));
    // 場所は選んだ予定に入っていればそれを初期値にする（電車検索用に編集可）
    setLocation(item.event.location || '');
    setBoardingTime('');
    setError('');
    setAutoError('');
    setWritten(false);
    setWriteError('');
  };

  const canSearchRoute = location.trim() !== '';
  const canAutoFill = canSearchRoute && date && collectionTime;

  const handleAutoFill = async () => {
    setAutoFilling(true);
    setAutoError('');
    try {
      const depTime = await fetchDepartureTime(location, date, collectionTime);
      setBoardingTime(depTime);
    } catch (e) {
      setAutoError(e.message);
    } finally {
      setAutoFilling(false);
    }
  };

  // 乗車時刻が入っていれば就寝・起床を逆算して表示
  let schedule = null;
  let timeError = '';
  if (boardingTime) {
    const collection = combineDateAndTime(date, collectionTime);
    const boarding = combineDateAndTime(date, boardingTime);
    if (boarding >= collection) {
      timeError = '乗車時刻は集合時刻より前にしてください';
    } else {
      schedule = buildSchedule(boarding);
    }
  }

  const handleWrite = async () => {
    if (!selected || !schedule) return;
    setWriting(true);
    setWriteError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('再ログインが必要です');
      const collection = combineDateAndTime(date, collectionTime);
      const block = buildTrainBlock(collection, schedule);
      const description = mergeDescription(selected.event.description, block);
      const updated = await patchEvent(token, selected.calId, selected.event.id, { description });
      // ローカルの説明欄も更新して、再登録時に電車ブロックが二重にならないようにする
      setEvents((prev) =>
        prev.map((item) =>
          keyOf(item) === selectedKey
            ? { ...item, event: { ...item.event, description: updated.description } }
            : item
        )
      );
      setWritten(true);
    } catch (err) {
      if (err.status === 401) {
        setWriteError('カレンダートークンが期限切れです。再ログインしてください。');
      } else {
        setWriteError('書き込みに失敗しました: ' + (err.message || ''));
      }
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="card">
      <h2>🚃 電車スケジュール</h2>
      <p className="ls-hint">
        カレンダーに登録済みの案件を選び、集合時刻から電車（乗車・起床・就寝）を割り出して、
        その案件の予定の説明欄に書き込みます。
      </p>

      {/* Step 1: 日付を選んで案件を読み込む */}
      <div className="form-group">
        <label htmlFor="sched-date">日付</label>
        <input
          id="sched-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {!googleToken ? (
        <p className="warn-text">
          ⚠️ カレンダー連携にはGoogleカレンダー権限付きでログインが必要です。
          一度ログアウトして再ログインしてください。
        </p>
      ) : (
        <div className="form-group">
          <label>案件を選択</label>
          {loadingEvents ? (
            <p className="loading-text"><span className="spinner" /> 案件を読み込み中...</p>
          ) : eventsError ? (
            <div className="error">⚠️ {eventsError}</div>
          ) : events.length === 0 ? (
            <p className="empty-text">この日に登録された案件はありません</p>
          ) : (
            <div className="sched-event-list">
              {events.map((item) => {
                const key = keyOf(item);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`sched-event-item${selectedKey === key ? ' selected' : ''}`}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="sched-event-time">{eventTimeLabel(item.event)}</span>
                    <span className="sched-event-title">{item.event.summary || '(無題)'}</span>
                    <span className="sched-event-cal">{item.calName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: 選んだ案件の電車を調べる */}
      {selected && (
        <>
          <div className="form-group">
            <label htmlFor="sched-collect">集合時間</label>
            <input
              id="sched-collect"
              type="time"
              value={collectionTime}
              onChange={(e) => { setCollectionTime(e.target.value); setBoardingTime(''); setWritten(false); }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="sched-location">場所（住所・施設名・駅名）</label>
            <input
              id="sched-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例：渋谷区渋谷1-1-1 / 渋谷駅"
            />
            <span className="hint">出発駅：{ORIGIN_STATION}駅（自宅から徒歩5分）固定</span>
          </div>

          <div className="form-group transit-section">
            <label htmlFor="sched-boarding">乗車時刻（{ORIGIN_STATION}駅 発）</label>
            <div className="transit-links">
              <button
                type="button"
                className="transit-link transit-link-auto"
                disabled={!canAutoFill || autoFilling}
                onClick={handleAutoFill}
              >
                {autoFilling ? <><span className="spinner" /> 検索中…</> : '✨ 自動で取得'}
              </button>
              <a
                href={canSearchRoute ? yahooTransitUrl(location, date, collectionTime) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={`transit-link${canSearchRoute ? '' : ' disabled'}`}
                aria-disabled={!canSearchRoute}
                onClick={(e) => { if (!canSearchRoute) e.preventDefault(); }}
              >
                🔍 Yahoo!乗換
              </a>
              <a
                href={canSearchRoute ? googleMapsTransitUrl(location) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={`transit-link${canSearchRoute ? '' : ' disabled'}`}
                aria-disabled={!canSearchRoute}
                onClick={(e) => { if (!canSearchRoute) e.preventDefault(); }}
              >
                🗺️ Googleマップ
              </a>
            </div>
            {autoError && <div className="error">⚠️ {autoError}</div>}
            <input
              id="sched-boarding"
              type="time"
              value={boardingTime}
              onChange={(e) => { setBoardingTime(e.target.value); setWritten(false); }}
            />
            <span className="hint">
              自動取得した時刻を確認して、必要なら手動で調整してください
            </span>
          </div>

          {timeError && <div className="error">⚠️ {timeError}</div>}
          {error && <div className="error">⚠️ {error}</div>}

          {/* Step 3: 電車スケジュールのプレビュー */}
          {schedule && (
            <>
              <div className="timeline">
                <div className="tl-item tl-bed">
                  <div className="tl-time">{formatTime(schedule.bedTime)}</div>
                  <div className="tl-dot" />
                  <div className="tl-label">🌙 就寝</div>
                </div>
                <div className="tl-line" />
                <div className="tl-item tl-wake">
                  <div className="tl-time">{formatTime(schedule.wakeUpTime)}</div>
                  <div className="tl-dot" />
                  <div className="tl-label">🌅 起床</div>
                </div>
                <div className="tl-line" />
                <div className="tl-item tl-board">
                  <div className="tl-time">{formatTime(schedule.boardingTime)}</div>
                  <div className="tl-dot" />
                  <div className="tl-label">🚃 {ORIGIN_STATION}駅 乗車</div>
                </div>
                <div className="tl-line tl-line-dashed" />
                <div className="tl-item tl-collect">
                  <div className="tl-time">{formatTime(combineDateAndTime(date, collectionTime))}</div>
                  <div className="tl-dot" />
                  <div className="tl-label">⭐ 集合</div>
                </div>
              </div>

              {writeError && <div className="error">⚠️ {writeError}</div>}
              {written ? (
                <div className="ok-text large">
                  ✅「{selected.event.summary || '案件'}」の予定に電車スケジュールを書き込みました
                </div>
              ) : (
                <button className="btn-primary" onClick={handleWrite} disabled={writing}>
                  {writing ? (
                    <><span className="spinner" /> 書き込み中...</>
                  ) : (
                    '📝 この案件の予定に電車スケジュールを上書き'
                  )}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
