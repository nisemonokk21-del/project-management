import { useAuth } from '../contexts/AuthContext';

const TABS = [
  { key: 'project', icon: '📋', label: '案件登録' },
  { key: 'expenses', icon: '💰', label: '経費管理' },
  { key: 'line', icon: '📩', label: 'LINE返信' },
];

export default function Header({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

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
