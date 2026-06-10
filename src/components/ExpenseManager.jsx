import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { jstDateString } from '../utils/timeUtils';

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const makeEmptyForm = () => ({
  date: jstDateString(0),
  projectName: '',
  from: '',
  to: '',
  amount: '',
});

export default function ExpenseManager() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(makeEmptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const collRef = user ? collection(db, 'users', user.uid, 'expenses') : null;

  const loadExpenses = async () => {
    if (!collRef) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collRef, orderBy('date', 'asc')));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const month = String(selectedMonth + 1).padStart(2, '0');
      const prefix = `${selectedYear}-${month}`;
      setExpenses(all.filter((e) => e.date && e.date.startsWith(prefix)));
    } catch (err) {
      console.error('経費読み込みエラー:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedMonth, selectedYear]);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!collRef) return;
    setSaving(true);
    const data = {
      date: form.date,
      projectName: form.projectName,
      from: form.from,
      to: form.to,
      amount: Number(form.amount),
      updatedAt: serverTimestamp(),
    };
    try {
      if (editId) {
        await updateDoc(doc(collRef, editId), data);
        setEditId(null);
      } else {
        await addDoc(collRef, { ...data, createdAt: serverTimestamp() });
      }
      setForm(makeEmptyForm());
      loadExpenses();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (exp) => {
    setEditId(exp.id);
    setForm({
      date: exp.date,
      projectName: exp.projectName,
      from: exp.from,
      to: exp.to,
      amount: String(exp.amount),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('この経費を削除しますか？')) return;
    await deleteDoc(doc(collRef, id));
    loadExpenses();
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(makeEmptyForm());
  };

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="expense-wrap">
      {/* Add / Edit form */}
      <div className="card">
        <h2>{editId ? '✏️ 経費を編集' : '💴 経費を追加'}</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="exp-date">日付</label>
              <input
                id="exp-date"
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group flex-2">
              <label htmlFor="exp-project">案件名</label>
              <input
                id="exp-project"
                type="text"
                name="projectName"
                value={form.projectName}
                onChange={handleChange}
                placeholder="案件名"
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="exp-from">出発地</label>
              <input
                id="exp-from"
                type="text"
                name="from"
                value={form.from}
                onChange={handleChange}
                placeholder="江古田"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="exp-to">目的地</label>
              <input
                id="exp-to"
                type="text"
                name="to"
                value={form.to}
                onChange={handleChange}
                placeholder="渋谷"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="exp-amount">金額（円）</label>
              <input
                id="exp-amount"
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                placeholder="500"
                min="0"
                required
              />
            </div>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? '保存中...' : editId ? '更新' : '➕ 追加'}
            </button>
            {editId && (
              <button type="button" className="btn-secondary" onClick={cancelEdit}>
                キャンセル
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="month-bar">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="month-select"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="month-select"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}月</option>
            ))}
          </select>
          <div className="total-badge">
            合計 <strong>¥{total.toLocaleString()}</strong>
          </div>
        </div>

        {loading ? (
          <p className="loading-text"><span className="spinner" /> 読み込み中...</p>
        ) : expenses.length === 0 ? (
          <p className="empty-text">この月の経費はありません</p>
        ) : (
          <div className="expense-table-wrap">
            <table className="expense-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>案件名</th>
                  <th>区間</th>
                  <th className="amount-col">金額</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className={editId === e.id ? 'editing' : ''}>
                    <td>{e.date}</td>
                    <td>{e.projectName}</td>
                    <td className="route-cell">{e.from} → {e.to}</td>
                    <td className="amount-col">¥{e.amount?.toLocaleString()}</td>
                    <td className="action-col">
                      <button
                        onClick={() => handleEdit(e)}
                        className="icon-btn"
                        title="編集"
                        aria-label="編集"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="icon-btn"
                        title="削除"
                        aria-label="削除"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="3" className="total-label">合計</td>
                  <td className="amount-col total-amount">¥{total.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
