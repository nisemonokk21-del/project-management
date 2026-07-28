import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import Header from './components/Header';
import Login from './components/Login';
import ProjectForm from './components/ProjectForm';
import ExpenseManager from './components/ExpenseManager';
import LineScheduler from './components/LineScheduler';
import CalendarView from './components/CalendarView';
import './App.css';

export default function App() {
  const { user } = useAuth();
  // 起動時は先頭タブ（カレンダー＋LINE返信）を開く
  const [activeTab, setActiveTab] = useState('calendar');

  if (!user) return <Login />;

  // タブは表示を切り替えるだけでアンマウントしない。
  // これで別タブに移動しても各タブ（LINE返信など）の入力・結果が保持される。
  return (
    <div className="app">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main">
        <div hidden={activeTab !== 'project'}>
          <ProjectForm />
        </div>
        <div hidden={activeTab !== 'expenses'}>
          <ExpenseManager />
        </div>
        {/* カレンダーとLINE返信は同じタブに統合。
            カレンダーで空き状況を見ながら、そのまま下で返信を作れるようにする。 */}
        <div hidden={activeTab !== 'calendar'}>
          <CalendarView />
          <LineScheduler />
        </div>
      </main>
      <footer className="version-footer">v6.0 — 案件登録タブを電車スケジュールに作り直し（カレンダーから案件を選択→予定の説明欄に電車時刻を上書き。手入力・被りチェック・案件の重複登録を廃止）</footer>
    </div>
  );
}
