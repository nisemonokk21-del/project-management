import { useState } from 'react';
import { combineDateAndTime, buildSchedule, jstDateString } from '../utils/timeUtils';
import { yahooTransitUrl, googleMapsTransitUrl, ORIGIN_STATION } from '../services/transitLinks';
import { fetchDepartureTime } from '../services/googleDirections';

export default function ProjectForm({ onResult }) {
  const [form, setForm] = useState({
    name: '',
    type: 'オーディション',
    date: jstDateString(1),
    time: '10:00',
    location: '',
    boardingTime: '',
  });
  const [error, setError] = useState('');
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoError, setAutoError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAutoFill = async () => {
    setAutoFilling(true);
    setAutoError('');
    try {
      const depTime = await fetchDepartureTime(form.location, form.date, form.time);
      setForm((prev) => ({ ...prev, boardingTime: depTime }));
    } catch (e) {
      setAutoError(e.message);
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const collectionTime = combineDateAndTime(form.date, form.time);
    const boardingTime = combineDateAndTime(form.date, form.boardingTime);

    if (boardingTime >= collectionTime) {
      setError('乗車時刻は集合時刻より前にしてください');
      return;
    }

    const schedule = buildSchedule(boardingTime);
    onResult({ form: { ...form }, collectionTime, schedule });
  };

  const canSearchRoute = form.location.trim() !== '';
  const canAutoFill = canSearchRoute && form.date && form.time;

  return (
    <div className="card">
      <h2>案件登録</h2>
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label htmlFor="name">案件名</label>
          <input
            id="name"
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="例：〇〇CM オーディション"
            required
          />
        </div>

        <div className="form-group">
          <label>種別</label>
          <div className="radio-group">
            {['オーディション', '撮影・収録'].map((t) => (
              <label key={t} className="radio-label">
                <input
                  type="radio"
                  name="type"
                  value={t}
                  checked={form.type === t}
                  onChange={handleChange}
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="date">日付</label>
            <input
              id="date"
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="time">集合時間</label>
            <input
              id="time"
              type="time"
              name="time"
              value={form.time}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="location">場所（住所・施設名・駅名）</label>
          <input
            id="location"
            type="text"
            name="location"
            value={form.location}
            onChange={handleChange}
            placeholder="例：渋谷区渋谷1-1-1 / 渋谷駅"
            required
          />
          <span className="hint">出発駅：{ORIGIN_STATION}駅（自宅から徒歩5分）固定</span>
        </div>

        <div className="form-group transit-section">
          <label htmlFor="boardingTime">乗車時刻（{ORIGIN_STATION}駅 発）</label>
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
              href={canSearchRoute ? yahooTransitUrl(form.location, form.date, form.time) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`transit-link${canSearchRoute ? '' : ' disabled'}`}
              aria-disabled={!canSearchRoute}
              onClick={(e) => { if (!canSearchRoute) e.preventDefault(); }}
            >
              🔍 Yahoo!乗換
            </a>
            <a
              href={canSearchRoute ? googleMapsTransitUrl(form.location) : undefined}
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
            id="boardingTime"
            type="time"
            name="boardingTime"
            value={form.boardingTime}
            onChange={handleChange}
            required
          />
          <span className="hint">
            自動取得した時刻を確認して、必要なら手動で調整してください
          </span>
        </div>

        {error && <div className="error">⚠️ {error}</div>}

        <button type="submit" className="btn-primary">
          🚃 スケジュール計算
        </button>
      </form>
    </div>
  );
}
