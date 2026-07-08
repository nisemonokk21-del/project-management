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
  const thisYear = new Date().getFullYear();
  // 年が今年でない場合は年も表示する（年の解釈ミスに気付けるように）
  return y === thisYear ? `${m}/${d}(${day})` : `${y}/${m}/${d}(${day})`;
}

// 被りイベントの表示用（時刻付きなら時刻を添える）
function formatConflict(e) {
  const title = e.summary || '(無題)';
  if (e.start?.dateTime) {
    const t = new Date(e.start.dateTime).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
    return `${t} ${title}`;
  }
  return title;
}

// include（ユーザーの最終判断）を反映して返信文を組み立てる
function generateReply(dateResults) {
  const items = dateResults.map((r) => ({ ...r, status: r.include ? 'ok' : 'ng' }));
  const lines = [];
  let i = 0;

  while (i < items.length) {
    const curr = items[i];
    const isOk = curr.status === 'ok';
    const conflictName = isOk ? null : (curr.conflicts[0]?.summary ?? 'NG');

    // 同じ状態（NGなら同じ被り先）が連続する日をまとめる
    let j = i + 1;
    while (j < items.length) {
      const next = items[j];
      if (next.status !== curr.status) break;
      if (!isOk && (next.conflicts[0]?.summary ?? 'NG') !== conflictName) break;
      const prev = new Date(items[j - 1].date + 'T00:00:00');
      const cur = new Date(next.date + 'T00:00:00');
      if ((cur - prev) / 86400000 !== 1) break;
      j++;
    }

    const group = items.slice(i, j);
    // 表記: "7/16,17" や "7/31,8/1"
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
  const [calDiag, setCalDiag] = useState({ checked: 0, failed: 0 });
  const [replyText, setReplyText] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredCount, setRegisteredCount] = useState(0);
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
    setCalDiag({ checked: 0, failed: 0 });
    setRegistering(false);
    setRegistered(false);
    setRegisteredCount(0);
    setRegisterError('');

    try {
      // Step 1: LINE文を解析（Cloudflare Worker → Claude API）
      setStatusMsg('LINE文を解析中...');
      const parsedData = await parseLineMessage(lineText.trim());
      setParsed(parsedData);

      if (!parsedData.dates?.length) {
        throw new Error('候補日が見つかりませんでした。LINE文に日付が含まれているか確認してください。');
      }

      // Step 2: カレンダー一覧を読み込み
      setStatusMsg('カレンダーを読み込み中...');
      const token = await getToken();
      if (!token) throw new Error('Googleログインが必要です。一度ログアウトして再ログインしてください。');

      const calListData = await listCalendars(token);
      const allCals = calListData.items || [];

      const conflictCals = allCals.filter(isConflictCalendar);

      // 仮撮影カレンダーは「書き込み権限のあるもの」を優先して選ぶ
      const provisionals = allCals.filter((c) => c.summary === PROVISIONAL_CALENDAR_NAME);
      const writable = provisionals.find((c) => c.accessRole === 'owner' || c.accessRole === 'writer');
      setProvisionalCal(writable ?? provisionals[0] ?? null);

      // Step 3: 各候補日の被りを確認（並列）— 読み込み失敗は数えて表示する
      setStatusMsg(`${parsedData.dates.length}件の候補日を確認中...`);
      const failedCalIds = new Set();
      const results = await Promise.all(
        parsedData.dates.map(async (dateInfo) => {
          const checks = await Promise.all(
            conflictCals.map((cal) =>
              getEventsFromCalendar(token, cal.id, dateInfo.date)
                .then((data) => data.items || [])
                .catch(() => {
                  failedCalIds.add(cal.id);
                  return [];
                })
            )
          );
          const conflicts = checks.flat().filter((e) => e.summary);
          return {
            ...dateInfo,
            conflicts,
            // include = ユーザーの最終判断（初期値は自動判定、ボタンで切替可能）
            include: conflicts.length === 0,
          };
        })
      );
      setCalDiag({ checked: conflictCals.length, failed: failedCalIds.size });

      // Step 4: 返信文の下書きを生成（カレンダー登録はユーザー確認後）
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

  // OK/NGの手動切替。返信文の下書きも作り直す
  const toggleDate = (idx) => {
    const next = dateResults.map((r, i) => (i === idx ? { ...r, include: !r.include } : r));
    setDateResults(next);
    setReplyText(generateReply(next));
    setRegistered(false);
    setRegisterError('');
  };

  const includedDates = dateResults.filter((r) => r.include);
  const provisionalWritable =
    provisionalCal && (provisionalCal.accessRole === 'owner' || provisionalCal.accessRole === 'writer');

  const handleRegister = async () => {
    if (!provisionalCal || includedDates.length === 0) return;
    setRegistering(true);
    setRegisterError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Googleログインが必要です。一度ログアウトして再ログインしてください。');

      const settled = await Promise.allSettled(
        includedDates.map((r) =>
          createEventInCalendar(
            token,
            provisionalCal.id,
            buildProvisionalShootingEvent(parsed?.clientName || '案件', r.date)
          )
        )
      );
      const fails = settled.filter((s) => s.status === 'rejected');
      const okCount = settled.length - fails.length;

      if (fails.length > 0) {
        let msg = fails[0].reason?.message ?? '不明なエラー';
        if (/writer access/i.test(msg)) {
          msg =
            '「仮撮影」カレンダーへの書き込み権限がありません。Googleカレンダーの共有設定で「予定の変更」権限を付けてもらってください。';
        }
        setRegisterError(
          okCount > 0 ? `${okCount}件登録しましたが${fails.length}件失敗: ${msg}` : `登録に失敗しました: ${msg}`
        );
        if (okCount > 0) {
          setRegistered(true);
          setRegisteredCount(okCount);
        }
      } else {
        setRegistered(true);
        setRegisteredCount(okCount);
      }
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
    setCalDiag({ checked: 0, failed: 0 });
    setReplyText('');
    setCopied(false);
    setDone(false);
    setRegistering(false);
    setRegistered(false);
    setRegisteredCount(0);
    setRegisterError('');
  };

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
              '✨ 解析・被りチェック・下書き生成'
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
            <p className="ls-diag">
              ✔ {calDiag.checked}個のカレンダーで被りを確認
              {calDiag.failed > 0 && (
                <span className="ls-diag-warn">（⚠ {calDiag.failed}個は読み込めませんでした）</span>
              )}
            </p>
            {calDiag.checked === 0 && (
              <div className="warn-text" style={{ marginBottom: '14px' }}>
                ⚠️ 被りを確認できるカレンダーが見つかりませんでした。全てOK判定になっている可能性があります。
              </div>
            )}
            <p className="ls-hint">ボタンでOK/NGを切り替えられます（返信文の下書きも自動で更新されます）</p>
            <div className="ls-date-list">
              {dateResults.map((r, i) => (
                <div
                  key={i}
                  className={`ls-date-item ${r.include ? 'ls-ok' : 'ls-ng'}`}
                >
                  <div className="ls-date-main">
                    <div className="ls-date-label">
                      <span className="ls-date-text">{formatDateJP(r.date)}</span>
                      {r.label && (
                        <span className="ls-candidate-label">{r.label}</span>
                      )}
                    </div>
                    {r.conflicts.length > 0 && (
                      <div className="ls-conflict-list">
                        ⚠️ {r.conflicts.map(formatConflict).join(' / ')}
                      </div>
                    )}
                  </div>
                  <button
                    className={`ls-toggle-btn ${r.include ? 'ls-t-ok' : 'ls-t-ng'}`}
                    onClick={() => toggleDate(i)}
                  >
                    {r.include ? '✅ OK' : '❌ NG'}
                  </button>
                </div>
              ))}
            </div>

            <div className="ls-register-row" style={{ marginTop: '14px' }}>
              {!provisionalCal && (
                <div className="warn-text" style={{ marginBottom: '10px' }}>
                  ⚠️ 「仮撮影」カレンダーが見つからないため登録できません
                </div>
              )}
              {provisionalCal && !provisionalWritable && (
                <div className="warn-text" style={{ marginBottom: '10px' }}>
                  ⚠️ 「仮撮影」カレンダーへの書き込み権限がありません。
                  Googleカレンダーの共有設定で「予定の変更」権限を付けてもらうか、
                  自分で「仮撮影」という名前のカレンダーを新しく作ってください。
                </div>
              )}
              {registerError && <div className="error" style={{ marginBottom: '10px' }}>⚠️ {registerError}</div>}
              {registered ? (
                <div className="ok-text">✅ 仮撮影カレンダーに{registeredCount}件登録しました</div>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleRegister}
                  disabled={registering || !provisionalWritable || includedDates.length === 0}
                >
                  {registering ? (
                    <><span className="spinner" /> 登録中...</>
                  ) : (
                    `📅 OKの日を仮撮影カレンダーに登録（${includedDates.length}件）`
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Reply text */}
          <div className="card">
            <div className="ls-reply-header">
              <h3 style={{ margin: 0 }}>💬 返信文（下書き）</h3>
              <button
                className={`ls-copy-btn${copied ? ' ls-copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? '✓ コピー済み' : '📋 コピー'}
              </button>
            </div>
            <p className="ls-hint">自由に編集できます。OK/NGを切り替えると下書きは作り直されます。</p>
            <textarea
              className="ls-reply-textarea"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={10}
            />
          </div>
        </>
      )}
    </div>
  );
}
