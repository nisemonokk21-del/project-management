import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { parseLineMessage } from '../services/lineParser';
import {
  listCalendars,
  getEventsFromCalendar,
  createEventInCalendar,
  buildProvisionalShootingEvent,
} from '../services/calendar';

// 被りチェックから除外するカレンダー（誕生日・祝日など予定ではないもの）
const EXCLUDE_FROM_CONFLICT = new Set(['誕生日', '祝日', 'Contacts', 'Birthdays']);
const PROVISIONAL_CALENDAR_NAME = '仮撮影';

// 被りチェック対象か（表示中で、除外リストに無いカレンダー）
function isConflictCalendar(cal) {
  if (cal.selected === false) return false;
  const s = cal.summary || '';
  if (EXCLUDE_FROM_CONFLICT.has(s)) return false;
  // 日本の祝日などのGoogle提供カレンダーを除外
  if (/holiday|祝日|contacts|birthday/i.test(cal.id || '')) return false;
  return true;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${day})`;
}

function generateReply(dateResults) {
  const lines = [];
  let i = 0;

  while (i < dateResults.length) {
    const curr = dateResults[i];
    const isOk = curr.status === 'ok';
    const conflictName = isOk ? null : (curr.conflicts[0]?.summary ?? '他の案件');

    // Find consecutive dates with same status (and same conflict name for NG)
    let j = i + 1;
    while (j < dateResults.length) {
      const next = dateResults[j];
      if (next.status !== curr.status) break;
      if (!isOk && (next.conflicts[0]?.summary ?? '他の案件') !== conflictName) break;
      const prev = new Date(dateResults[j - 1].date + 'T00:00:00');
      const cur = new Date(next.date + 'T00:00:00');
      if ((cur - prev) / 86400000 !== 1) break;
      j++;
    }

    const group = dateResults.slice(i, j);
    // Format: "7/16,17" or "7/31,8/1"
    const dateLabel = group
      .map((r, idx) => {
        const [, m, d] = r.date.split('-').map(Number);
        if (idx === 0) return `${m}/${d}`;
        const [, prevM] = group[idx - 1].date.split('-').map(Number);
        return m === prevM ? `${d}` : `${m}/${d}`;
      })
      .join(',');

    lines.push(isOk ? `${dateLabel} OK` : `${dateLabel} ${conflictName}`);
    i = j;
  }

  return [
    'お疲れ様です！',
    'ご連絡ありがとうございます',
    '',
    ...lines,
    '',
    'となっています。',
    'よろしくお願いします！',
  ].join('\n');
}

export default function LineScheduler() {
  const { googleToken, reauth } = useAuth();
  const [lineText, setLineText] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [parsed, setParsed] = useState(null);
  const [dateResults, setDateResults] = useState([]);
  const [provisionalCal, setProvisionalCal] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const getToken = async () => {
    if (googleToken) return googleToken;
    return reauth();
  };

  const handleProcess = async () => {
    if (!lineText.trim()) return;

    setLoading(true);
    setError('');
    setParsed(null);
    setDateResults([]);
    setReplyText('');
    setCopied(false);
    setDone(false);
    setProvisionalCal(null);
    setRegistering(false);
    setRegistered(false);
    setRegisterError('');

    try {
      // Step 1: Parse LINE text via Cloud Function → Claude API
      setStatusMsg('LINE文を解析中...');
      const parsedData = await parseLineMessage(lineText.trim());
      setParsed(parsedData);

      if (!parsedData.dates?.length) {
        throw new Error('候補日が見つかりませんでした。LINE文に日付が含まれているか確認してください。');
      }

      // Step 2: Load user's calendar list
      setStatusMsg('カレンダーを読み込み中...');
      const token = await getToken();
      if (!token) throw new Error('Googleログインが必要です。一度ログアウトして再ログインしてください。');

      const calListData = await listCalendars(token);
      const allCals = calListData.items || [];

      const conflictCals = allCals.filter(isConflictCalendar);
      const provisionalCal = allCals.find((cal) => cal.summary === PROVISIONAL_CALENDAR_NAME);
      setProvisionalCal(provisionalCal ?? null);

      // Step 3: Check each candidate date for conflicts (parallel)
      setStatusMsg(`${parsedData.dates.length}件の候補日を確認中...`);
      const results = await Promise.all(
        parsedData.dates.map(async (dateInfo) => {
          const checks = await Promise.all(
            conflictCals.map((cal) =>
              getEventsFromCalendar(token, cal.id, dateInfo.date)
                .then((data) => data.items || [])
                .catch(() => [])
            )
          );
          const conflicts = checks.flat().filter((e) => e.summary);
          return {
            ...dateInfo,
            status: conflicts.length > 0 ? 'ng' : 'ok',
            conflicts,
          };
        })
      );

      // Step 4: Generate reply text (calendar registration now happens on manual confirmation)
      setDateResults(results);
      setReplyText(generateReply(results));
      setDone(true);
    } catch (err) {
      setError(err.message ?? '処理に失敗しました');
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  const handleRegister = async () => {
    if (!provisionalCal) return;
    setRegistering(true);
    setRegisterError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Googleログインが必要です。一度ログアウトして再ログインしてください。');

      const okDates = dateResults.filter((r) => r.status === 'ok');
      await Promise.all(
        okDates.map((r) =>
          createEventInCalendar(
            token,
            provisionalCal.id,
            buildProvisionalShootingEvent(parsed?.clientName || '案件', r.date)
          )
        )
      );
      setRegistered(true);
    } catch (err) {
      setRegisterError(err.message ?? '登録に失敗しました');
    } finally {
      setRegistering(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(replyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — user can manually select
    }
  };

  const handleReset = () => {
    setLineText('');
    setLoading(false);
    setStatusMsg('');
    setError('');
    setParsed(null);
    setDateResults([]);
    setProvisionalCal(null);
    setReplyText('');
    setCopied(false);
    setDone(false);
    setRegistering(false);
    setRegistered(false);
    setRegisterError('');
  };

  const okCount = dateResults.filter((r) => r.status === 'ok').length;

  return (
    <div className="line-scheduler">
      {/* Input card */}
      <div className="card">
        <h2>📩 LINE返信自動生成</h2>
        <div className="form-group">
          <label htmlFor="lineText">LINEで届いた案件相談文を貼り付け</label>
          <textarea
            id="lineText"
            className="line-textarea"
            value={lineText}
            onChange={(e) => setLineText(e.target.value)}
            placeholder={
              'お疲れ様です。\n〇〇映画の件でご連絡です。\n\n第一候補：7/16(火)、7/17(水)\n第二候補：7/23(火)\n\n場所：渋谷スタジオ\nよろしくお願いします！'
            }
            rows={8}
            disabled={loading}
          />
        </div>
        <div className="ls-btn-row">
          <button
            className="btn-primary"
            onClick={handleProcess}
            disabled={loading || !lineText.trim()}
          >
            {loading ? (
              <>
                <span className="spinner" /> {statusMsg || '処理中...'}
              </>
            ) : (
              '✨ 解析・被りチェック・返信生成'
            )}
          </button>
          {done && (
            <button className="btn-secondary" onClick={handleReset}>
              やり直す
            </button>
          )}
        </div>
        {error && <div className="error" style={{ marginTop: '12px' }}>⚠️ {error}</div>}
      </div>

      {/* Results */}
      {done && (
        <>
          {/* Parsed info */}
          {parsed && (parsed.clientName || parsed.role || parsed.location) && (
            <div className="card">
              <h3>📋 解析結果</h3>
              <div className="ls-meta">
                {parsed.clientName && (
                  <div>
                    <span className="ls-label">案件名</span>
                    {parsed.clientName}
                  </div>
                )}
                {parsed.role && (
                  <div>
                    <span className="ls-label">役柄</span>
                    {parsed.role}
                  </div>
                )}
                {parsed.location && (
                  <div>
                    <span className="ls-label">場所</span>
                    {parsed.location}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Date check results */}
          <div className="card">
            <h3>📅 候補日チェック結果</h3>
            {!provisionalCal && (
              <div className="warn-text" style={{ marginBottom: '14px' }}>
                ⚠️ 「仮撮影」カレンダーが見つからなかったためカレンダー登録できません
              </div>
            )}
            <div className="ls-date-list">
              {dateResults.map((r, i) => (
                <div
                  key={i}
                  className={`ls-date-item ${r.status === 'ok' ? 'ls-ok' : 'ls-ng'}`}
                >
                  <div className="ls-date-label">
                    <span className="ls-date-text">{formatDateJP(r.date)}</span>
                    {r.label && (
                      <span className="ls-candidate-label">{r.label}</span>
                    )}
                  </div>
                  <div className="ls-date-status">
                    {r.status === 'ok' ? (
                      <span className="ls-status-ok">
                        ✅ OK{registered ? '  → 仮撮影登録済み' : ''}
                      </span>
                    ) : (
                      <span className="ls-status-ng">
                        ❌{' '}
                        {r.conflicts
                          .map((c) => c.summary)
                          .filter(Boolean)
                          .join(' / ') || '他の予定あり'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {okCount > 0 && provisionalCal && (
              <div className="ls-register-row" style={{ marginTop: '14px' }}>
                {registerError && <div className="error" style={{ marginBottom: '10px' }}>⚠️ {registerError}</div>}
                {registered ? (
                  <div className="ok-text">✅ 仮撮影カレンダーに{okCount}件登録しました</div>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={handleRegister}
                    disabled={registering}
                  >
                    {registering ? (
                      <><span className="spinner" /> 登録中...</>
                    ) : (
                      `📅 仮撮影カレンダーに登録する（${okCount}件）`
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Reply text */}
          <div className="card">
            <div className="ls-reply-header">
              <h3 style={{ margin: 0 }}>💬 返信文</h3>
              <button
                className={`ls-copy-btn${copied ? ' ls-copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? '✓ コピー済み' : '📋 コピー'}
              </button>
            </div>
            <pre className="ls-reply-text">{replyText}</pre>
          </div>
        </>
      )}
    </div>
  );
}
