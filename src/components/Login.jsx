import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await login();
      // リダイレクト方式のためここには戻ってこない
    } catch (err) {
      setError('ログインに失敗しました。もう一度お試しください。');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon">🎬</div>
        <h1>アクター案件管理</h1>
        <p className="login-subtitle">俳優の案件・スケジュール・経費を一元管理</p>

        <ul className="feature-list">
          <li><span className="feature-icon">📋</span> 案件入力（オーディション・撮影・収録）</li>
          <li><span className="feature-icon">🚃</span> 電車スケジュール自動計算</li>
          <li><span className="feature-icon">📅</span> Googleカレンダー連携・被り確認</li>
          <li><span className="feature-icon">💴</span> 交通費記録・月別集計</li>
        </ul>

        {error && <div className="error">{error}</div>}

        <button onClick={handleLogin} className="google-btn" disabled={loading}>
          <svg viewBox="0 0 24 24" className="google-icon" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'ログイン中...' : 'Googleでログイン（カレンダー連携あり）'}
        </button>

        <p className="login-note">
          ※ カレンダーへの読み書き権限を使用します
        </p>
      </div>
    </div>
  );
}
