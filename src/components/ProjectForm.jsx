import { useState } from 'react';
import { findTrainSchedule } from '../services/maps';
import { combineDateAndTime } from '../utils/timeUtils';

// デフォルトは明日（過去の日時だと電車が見つからないため）
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW = tomorrow.toISOString().split('T')[0];

export default function ProjectForm({ onResult }) {
  const [form, setForm] = useState({
    name: '',
    type: 'オーディション',
    date: TOMORROW,
    time: '10:00',
    location: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const collectionTime = combineDateAndTime(form.date, form.time);
      const debugInfo = ` [${collectionTime.toISOString()}]`;
      const schedule = await findTrainSchedule(form.location, collectionTime);
      onResult({ form: { ...form }, collectionTime, schedule });
    } catch (err) {
      const collectionTime = combineDateAndTime(form.date, form.time);
      setError(`${err.message} [${collectionTime.toISOString()}]`);
    } finally {
      setLoading(false);
    }
  };

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
          <span className="hint">出発地：練馬区栄町16-3（江古田）固定</span>
        </div>

        {error && <div className="error">⚠️ {error}</div>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? (
            <><span className="spinner" /> 電車を検索中...</>
          ) : (
            '🚃 スケジュール計算'
          )}
        </button>
      </form>
    </div>
  );
}
