import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import Header from './components/Header';
import Login from './components/Login';
import ProjectForm from './components/ProjectForm';
import ProjectResult from './components/ProjectResult';
import ExpenseManager from './components/ExpenseManager';
import LineScheduler from './components/LineScheduler';
import CalendarView from './components/CalendarView';
import './App.css';

export default function App() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('project');
  const [result, setResult] = useState(null);

  if (!user) return <Login />;

  // タブは表示を切り替えるだけでアンマウントしない。
  // これで別タブに移動しても各タブ（LINE返信など）の入力・結果が保持される。
  return (
    <div className="app">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main">
        <div hidden={activeTab !== 'project'}>
          {result ? (
            <ProjectResult result={result} onReset={() => setResult(null)} />
          ) : (
            <ProjectForm onResult={setResult} />
          )}
        </div>
        <div hidden={activeTab !== 'expenses'}>
          <ExpenseManager />
        </div>
        <div hidden={activeTab !== 'calendar'}>
          <CalendarView />
        </div>
        <div hidden={activeTab !== 'line'}>
          <LineScheduler />
        </div>
      </main>
      <footer className="version-footer">v4.8 — カレンダー用トークンを保存し、開き直しても再ログイン不要に（ログイン済みなのに再ログインを促される問題を修正）</footer>
    </div>
  );
}
