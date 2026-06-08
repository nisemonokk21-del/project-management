import { useAuth } from '../contexts/AuthContext';

export default function Header({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-inner">
        <span className="logo">🎬 案件管理</span>
        <nav className="nav">
          <button
            className={`nav-btn${activeTab === 'project' ? ' active' : ''}`}
            onClick={() => setActiveTab('project')}
          >
            案件登録
          </button>
          <button
            className={`nav-btn${activeTab === 'expenses' ? ' active' : ''}`}
            onClick={() => setActiveTab('expenses')}
          >
            経費管理
          </button>
        </nav>
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
  );
}
