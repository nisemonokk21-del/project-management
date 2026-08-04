import { useAuth } from '../contexts/AuthContext';

// カレンダーとLINE返信は1つのタブに統合済み（カレンダーの下に返信生成が並ぶ）。
// 一番よく使う画面なのでカレンダーを先頭に置く。
const TABS = [
  { key: 'calendar', icon: '📅', label: 'カレンダー' },
  { key: 'project', icon: '🚃', label: '電車' },
  { key: 'expenses', icon: '💰', label: '経費管理' },
];

export default function Header({ activeTab, setActiveTab }) {
  const { user, logout, switchAccount } = useAuth();

  // 別アカウントへの切り替え。ポップアップを閉じただけの時は何も起きないようにする。
  const handleSwitch = async () => {
    try {
      await switchAccount();
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      alert(`アカウントの切り替えに失敗しました: ${err.code || err.message}`);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <span className="logo">🎬 案件管理</span>
          {user && (
            <div className="user-area">
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="avatar" referrerPolicy="no-referrer" />
              )}
              <span className="user-name">{user.displayName}</span>
              {/* どのアカウントで使っているかすぐ分かるようにメールアドレスも出す。
                  名前はスマホでは隠れるが、こちらは残す（アカウントの取り違えに気付けるように） */}
              {user.email && (
                <span className="user-email" title={user.email}>{user.email}</span>
              )}
              <button onClick={handleSwitch} className="logout-btn">切替</button>
              <button onClick={logout} className="logout-btn">ログアウト</button>
            </div>
          )}
        </div>
      </header>

      <nav className="bottom-nav">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`bottom-nav-btn${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
