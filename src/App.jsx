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

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setResult(null);
  };

  return (
    <div className="app">
      <Header activeTab={activeTab} setActiveTab={handleTabChange} />
      <main className="main">
        {activeTab === 'project' && (
          result ? (
            <ProjectResult result={result} onReset={() => setResult(null)} />
          ) : (
            <ProjectForm onResult={setResult} />
          )
        )}
        {activeTab === 'expenses' && <ExpenseManager />}
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'line' && <LineScheduler />}
      </main>
      <footer className="version-footer">v3.2 — バラシ撮影を被りチェック対象外に</footer>
    </div>
  );
}
