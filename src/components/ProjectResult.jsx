import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  listCalendars,
  getEventsFromCalendar,
  createEvent,
  buildProjectEvent,
  buildWakeEvent,
  buildBedEvent,
  calDisplayName,
  conflictCalendars,
  realEvents,
} from '../services/calendar';
import { formatTime, formatDate, formatDateTime } from '../utils/timeUtils';
import { yahooTransitUrl, ORIGIN_STATION } from '../services/transitLinks';

export default function ProjectResult({ result, onReset }) {
  const { googleToken, reauth } = useAuth();
  const [conflicts, setConflicts] = useState([]);
  const [checkedCalNames, setCheckedCalNames] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarChecked, setCalendarChecked] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [calError, setCalError] = useState('');

  const { form, collectionTime, schedule } = result;

  const getToken = async () => {
    if (googleToken) return googleToken;
    return reauth();
  };

  const checkCalendar = async () => {
    setCalendarLoading(true);
    setCalError('');
    try {
      const token = await getToken();
      if (!token) { setCalError('再ログインが必要です'); return; }
      // primaryだけでなく、バラシ撮影を除く全カレンダーを確認する
      const calListData = await listCalendars(token);
      const cals = conflictCalendars(calListData.items || []);
      setCheckedCalNames(cals.map(calDisplayName));
      const dateStr = collectionTime.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
      const failed = [];
      const perCal = await Promise.all(
        cals.map((cal) =>
          getEventsFromCalendar(token, cal.id, dateStr)
            .then((data) => realEvents(cal, data.items))
            .catch(() => {
              failed.push(calDisplayName(cal));
              return [];
            })
        )
      );
      // 「当日の予定」は時間帯を絞らず、その日にあるすべての予定を被りとして扱う。
      // （以前は乗車→集合の時間帯しか見ておらず、集合より後＝当日の午後の予定が
      //  カレンダータブには表示されるのに「被りなし」と判定されていた）
      // 終日イベント（date形式）はJSTの0時起点として扱う
      const toDate = (v) => (v.dateTime ? new Date(v.dateTime) : new Date(v.date + 'T00:00:00+09:00'));
      const found = perCal
        .flat()
        .sort((a, b) => toDate(a.start) - toDate(b.start));
      setConflicts(found);
      if (failed.length > 0) {
        setCalError(`一部カレンダーの取得に失敗しました（${failed.join('、')}）。被りを見落としている可能性があります。`);
      }
      setCalendarChecked(true);
    } catch (err) {
      if (err.status === 401) {
        setCalError('カレンダートークンが期限切れです。再ログインしてください。');
      } else {
        setCalError('カレンダーの確認に失敗しました: ' + err.message);
      }
    } finally {
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    // 初回マウント時のみ実行
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (googleToken) checkCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddToCalendar = async () => {
    setAddLoading(true);
    setCalError('');
    try {
      const token = await getToken();
      if (!token) { setCalError('再ログインが必要です'); return; }

      // Project event: collection time → +2h (approximate duration)
      const projectEnd = new Date(collectionTime.getTime() + 2 * 60 * 60 * 1000);
      await Promise.all([
        createEvent(token, buildProjectEvent(form.name, form.type, collectionTime, projectEnd, form.location)),
        createEvent(token, buildWakeEvent(form.name, schedule.wakeUpTime)),
        createEvent(token, buildBedEvent(form.name, schedule.bedTime, schedule.wakeUpTime)),
      ]);
      setAdded(true);
    } catch (err) {
      if (err.status === 401) {
        setCalError('カレンダートークンが期限切れです。再ログインしてください。');
      } else {
        setCalError('カレンダーへの追加に失敗しました: ' + err.message);
      }
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="result-wrap">
      {/* Project summary */}
      <div className="card">
        <div className="result-header">
          <h2>{form.name}</h2>
          <span className={`badge ${form.type === 'オーディション' ? 'badge-blue' : 'badge-green'}`}>
            {form.type}
          </span>
        </div>
        <div className="meta-row">
          <span>📅 {formatDate(collectionTime)}</span>
          <span>⏰ 集合 {formatTime(collectionTime)}</span>
          <span>📍 {form.location}</span>
        </div>
      </div>

      {/* Schedule timeline */}
      <div className="card">
        <h3>🚃 電車スケジュール</h3>
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
            <div className="tl-time">{formatTime(collectionTime)}</div>
            <div className="tl-dot" />
            <div className="tl-label">⭐ 集合</div>
          </div>
        </div>

        <div className="route-note">
          出発駅: {ORIGIN_STATION}駅（自宅から徒歩5分）／{' '}
          <a
            href={yahooTransitUrl(form.location, form.date, form.time)}
            target="_blank"
            rel="noopener noreferrer"
          >
            経路をもう一度確認する
          </a>
        </div>
      </div>

      {/* Calendar section */}
      <div className="card">
        <h3>📅 Googleカレンダー連携</h3>

        {!googleToken ? (
          <p className="warn-text">
            ⚠️ カレンダー連携にはGoogleカレンダー権限付きでログインが必要です。
            一度ログアウトして再ログインしてください。
          </p>
        ) : calendarLoading ? (
          <p className="loading-text"><span className="spinner" /> カレンダーを確認中...</p>
        ) : (
          <>
            {!calendarChecked && (
              <button onClick={checkCalendar} className="btn-secondary" style={{ marginBottom: '12px' }}>
                📅 カレンダーの被りを確認する
              </button>
            )}
            {calendarChecked && (
              conflicts.length > 0 ? (
                <div className="conflict-box">
                  <h4>⚠️ 当日の予定と重なっています</h4>
                  {conflicts.map((e, i) => (
                    <div key={i} className="conflict-item">
                      <span className="conflict-title">{e.summary || '(無題の予定)'}</span>
                      <span className="conflict-time">
                        {e.start.dateTime
                          ? formatDateTime(new Date(e.start.dateTime))
                          : '終日'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ok-text">✅ 当日のカレンダーに被りはありません</p>
              )
            )}
            {calendarChecked && checkedCalNames.length > 0 && (
              <p className="ls-hint" style={{ marginTop: '8px' }}>
                被りチェック対象カレンダー（{checkedCalNames.length}件）: {checkedCalNames.join('、')}
              </p>
            )}

            <div className="events-preview">
              <h4>追加するイベント（3件）</h4>
              <div className="preview-item">
                <span className={`ev-dot ${form.type === 'オーディション' ? 'ev-blue' : 'ev-green'}`} />
                【{form.type}】{form.name}{'　'}{formatTime(collectionTime)}〜
              </div>
              <div className="preview-item">
                <span className="ev-dot ev-yellow" />
                起床【{form.name}】{'　'}{formatTime(schedule.wakeUpTime)}
              </div>
              <div className="preview-item">
                <span className="ev-dot ev-teal" />
                就寝【{form.name}】{'　'}{formatTime(schedule.bedTime)}
              </div>
            </div>

            {calError && <div className="error">⚠️ {calError}</div>}

            {added ? (
              <div className="ok-text large">✅ カレンダーに3件追加しました！</div>
            ) : (
              <button
                onClick={handleAddToCalendar}
                className="btn-primary"
                disabled={addLoading}
              >
                {addLoading ? <><span className="spinner" /> 追加中...</> : '📅 カレンダーに追加'}
              </button>
            )}
          </>
        )}
      </div>

      <button onClick={onReset} className="btn-secondary">← 新しい案件を登録</button>
    </div>
  );
}
