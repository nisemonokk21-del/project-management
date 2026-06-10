import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import Header from './components/Header';
import Login from './components/Login';
import ProjectForm from './components/ProjectForm';
import ProjectResult from './components/ProjectResult';
import ExpenseManager from './components/ExpenseManager';
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
      </main>
      <footer className="version-footer">v2.0 — 乗車時刻入力方式</footer>
    </div>
  );
}
