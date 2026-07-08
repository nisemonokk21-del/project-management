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

  // 各タブは常にマウントしたまま display で切り替える。
  // これでタブを移動しても入力内容や結果が保持され、戻れば元のまま。
  const show = (tab) => ({ display: activeTab === tab ? undefined : 'none' });

  return (
    <div className="app">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main">
        <div style={show('project')}>
          {result ? (
            <ProjectResult result={result} onReset={() => setResult(null)} />
          ) : (
            <ProjectForm onResult={setResult} />
          )}
        </div>
        <div style={show('expenses')}>
          <ExpenseManager />
        </div>
        <div style={show('calendar')}>
          <CalendarView />
        </div>
        <div style={show('line')}>
          <LineScheduler />
        </div>
      </main>
      <footer className="version-footer">v3.0 — LINE返信自動生成</footer>
    </div>
  );
}
