import { useState } from 'react';
import { combineDateAndTime, buildSchedule, jstDateString } from '../utils/timeUtils';
import { yahooTransitUrl, googleMapsTransitUrl, STATIONS, DEFAULT_STATION } from '../services/transitLinks';

export default function ProjectForm({ onResult }) {
  const [form, setForm] = useState({
    name: '',
    type: 'オーディション',
    date: jstDateString(1),
    time: '10:00',
    location: '',
    station: DEFAULT_STATION,
    boardingTime: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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

    const stationInfo = STATIONS.find((s) => s.name === form.station) || STATIONS[0];
    const schedule = buildSchedule(boardingTime, stationInfo.walkMin);
    onResult({ form: { ...form }, collectionTime, schedule, stationInfo });
  };

  const canSearchRoute = form.location.trim() !== '';

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
        </div>

        <div className="form-group">
          <label>出発駅</label>
          <div className="station-group">
            {STATIONS.map((s) => (
              <label key={s.name} className={`station-label${form.station === s.name ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="station"
                  value={s.name}
                  checked={form.station === s.name}
                  onChange={handleChange}
                />
                <span className="station-name">{s.name}駅</span>
                <span className="station-meta">徒歩{s.walkMin}分・{s.line}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-group transit-section">
          <label htmlFor="boardingTime">乗車時刻（{form.station}駅 発）</label>
          <div className="transit-links">
            <a
              href={canSearchRoute ? yahooTransitUrl(form.station, form.location, form.date, form.time) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`transit-link${canSearchRoute ? '' : ' disabled'}`}
              aria-disabled={!canSearchRoute}
              onClick={(e) => { if (!canSearchRoute) e.preventDefault(); }}
            >
              🔍 Yahoo!乗換案内で調べる
            </a>
            <a
              href={canSearchRoute ? googleMapsTransitUrl(form.station, form.location) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`transit-link${canSearchRoute ? '' : ' disabled'}`}
              aria-disabled={!canSearchRoute}
              onClick={(e) => { if (!canSearchRoute) e.preventDefault(); }}
            >
              🗺️ Googleマップで調べる
            </a>
          </div>
          <input
            id="boardingTime"
            type="time"
            name="boardingTime"
            value={form.boardingTime}
            onChange={handleChange}
            required
          />
          <span className="hint">
            上のリンクで集合時刻に間に合う電車を確認し、2本前の電車の出発時刻を入力してください
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
