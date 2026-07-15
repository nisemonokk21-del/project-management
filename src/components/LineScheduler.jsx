import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { parseLineMessage } from '../services/lineParser';
import {
  listCalendars,
  getEventsFromCalendar,
  createEventInCalendar,
  buildProvisionalShootingEvent,
  calDisplayName as calName,
  realEvents,
} from '../services/calendar';

// 被りチェックは登録済みの「全カレンダー」が対象（除外なし）。
// 名前の完全一致リストやシステムカレンダー判定で絞ると、共有カレンダー
// （例:「kei.imagawa.a@gmail.com」表示のもの）を取りこぼして被りを見落とすため、
// いったん一切絞らずカレンダーリストにある全部を確認する。
const PROVISIONAL_CALENDAR_NAME = '仮撮影';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${day})`;
}

// パースした候補日を「7/16(火), 7/17(水)」のような日程文字列にまとめる
function buildScheduleText(dates) {
  return (dates || [])
    .map((d) => (typeof d === 'string' ? formatDateJP(d) : formatDateJP(d.date)))
    .join('、');
}

function generateReply(dateResults) {
  // include（ユーザーの最終判断）を OK/NG に反映して返信文を組み立てる
  const items = dateResults.map((r) => ({ ...r, status: r.include ? 'ok' : 'ng' }));
  const lines = [];
  let i = 0;

  while (i < items.length) {
    const curr = items[i];
    const isOk = curr.status === 'ok';
    const conflictName = isOk ? null : (curr.conflicts[0]?.summary ?? '他の案件');

    // Find consecutive dates with same status (and same conflict name for NG)
    let j = i + 1;
    while (j < items.length) {
      const next = items[j];
      if (next.status !== curr.status) break;
      if (!isOk && (next.conflicts[0]?.summary ?? '他の案件') !== conflictName) break;
      const prev = new Date(items[j - 1].date + 'T00:00:00');
      const cur = new Date(next.date + 'T00:00:00');
      if ((cur - prev) / 86400000 !== 1) break;
      j++;
    }

    const group = items.slice(i, j);
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
  // 案件内容（編集可能）。案件名 / 日程 / 場所 / 内容(原文ママ)
  const [projectInfo, setProjectInfo] = useState({
    name: '',
    schedule: '',
    location: '',
    content: '',
  });
  const [dateResults, setDateResults] = useState([]);
  const [provisionalCal, setProvisionalCal] = useState(null);
  // 実際に被りチェックしたカレンダー名／取得に失敗したカレンダー名（結果の信頼性を確認できるように表示する）
  const [checkedCalNames, setCheckedCalNames] = useState([]);
  const [failedCalNames, setFailedCalNames] = useState([]);
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
    setProjectInfo({ name: '', schedule: '', location: '', content: '' });
    setDateResults([]);
    setReplyText('');
    setCopied(false);
    setDone(false);
    setProvisionalCal(null);
    setCheckedCalNames([]);
    setFailedCalNames([]);
    setRegistering(false);
    setRegistered(false);
    setRegisterError('');

    try {
      // Step 0: 先にカレンダー用トークンを取得する。
      // ※ ログインのポップアップは「ボタンを押した操作」から直接開く必要がある。
      //    非同期処理の後に開くとモバイルSafariで失敗（missing initial state）するため、
      //    最初のawaitとしてトークン取得を行う。
      setStatusMsg('カレンダー権限を確認中...');
      const token = await getToken();
      if (!token) throw new Error('Googleログインが必要です。一度ログアウトして再ログインしてください。');

      // Step 1: Parse LINE text via Cloud Function → Claude API
      setStatusMsg('LINE文を解析中...');
      const parsedData = await parseLineMessage(lineText.trim());
      setParsed(parsedData);
      // 案件内容フォームの初期値をパース結果から流し込む（内容は原文ママ）
      setProjectInfo({
        name: parsedData.clientName || '',
        schedule: buildScheduleText(parsedData.dates),
        location: parsedData.location || '',
        content: lineText.trim(),
      });

      if (!parsedData.dates?.length) {
        throw new Error('候補日が見つかりませんでした。LINE文に日付が含まれているか確認してください。');
      }

      // Step 2: Load user's calendar list
      setStatusMsg('カレンダーを読み込み中...');
      const calListData = await listCalendars(token);
      const allCals = calListData.items || [];

      // いったん除外なし。カレンダーリストにある全カレンダーを被りチェック対象にする
      const conflictCals = allCals;
      setCheckedCalNames(conflictCals.map(calName));
      const provisionalCal = allCals.find((cal) => calName(cal) === PROVISIONAL_CALENDAR_NAME);
      setProvisionalCal(provisionalCal ?? null);

      // Step 3: Check each candidate date for conflicts (parallel)
      setStatusMsg(`${parsedData.dates.length}件の候補日を確認中...`);
      const failedCals = new Set();
      const results = await Promise.all(
        parsedData.dates.map(async (dateInfo) => {
          const checks = await Promise.all(
            conflictCals.map((cal) =>
              getEventsFromCalendar(token, cal.id, dateInfo.date)
                .then((data) => realEvents(cal, data.items))
                // 取得失敗を黙って「予定なし」扱いにすると被りを見落とすため、失敗として記録する
                .catch(() => {
                  failedCals.add(calName(cal));
                  return [];
                })
            )
          );
          const conflicts = checks.flat();
          return {
            ...dateInfo,
            status: conflicts.length > 0 ? 'ng' : 'ok',
            conflicts,
            // include = ユーザーの最終判断（初期値は自動判定、ボタンで手動切替できる）
            include: conflicts.length === 0,
          };
        })
      );

      setFailedCalNames([...failedCals]);

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

  // OK/NG の手動切替。返信文の下書きも作り直す
  const toggleDate = (idx) => {
    const next = dateResults.map((r, i) => (i === idx ? { ...r, include: !r.include } : r));
    setDateResults(next);
    setReplyText(generateReply(next));
    setRegistered(false);
    setRegisterError('');
  };

  const handleRegister = async () => {
    if (!provisionalCal) return;
    setRegistering(true);
    setRegisterError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Googleログインが必要です。一度ログアウトして再ログインしてください。');

      const okDates = dateResults.filter((r) => r.include);
      // 案件内容フォームで編集した内容をそのままカレンダーに反映する
      const name = projectInfo.name.trim() || parsed?.clientName || '案件';
      const location = projectInfo.location.trim();
      const description = projectInfo.content.trim();
      await Promise.all(
        okDates.map((r) =>
          createEventInCalendar(
            token,
            provisionalCal.id,
            buildProvisionalShootingEvent(name, r.date, { location, description })
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
    setProjectInfo({ name: '', schedule: '', location: '', content: '' });
    setDateResults([]);
    setProvisionalCal(null);
    setCheckedCalNames([]);
    setFailedCalNames([]);
    setReplyText('');
    setCopied(false);
    setDone(false);
    setRegistering(false);
    setRegistered(false);
    setRegisterError('');
  };

  const okCount = dateResults.filter((r) => r.include).length;

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
          {/* 案件内容（編集可能） */}
          {parsed && (
            <div className="card">
              <h3>📋 案件内容</h3>
              <p className="ls-edit-hint">
                内容を確認・修正できます。ここで編集した内容がそのままカレンダーに反映されます。
              </p>
              <div className="ls-edit-form">
                <div className="ls-field">
                  <label className="ls-field-label" htmlFor="pi-name">案件名</label>
                  <input
                    id="pi-name"
                    type="text"
                    className="ls-input"
                    value={projectInfo.name}
                    onChange={(e) =>
                      setProjectInfo((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="案件名"
                  />
                </div>
                <div className="ls-field">
                  <label className="ls-field-label" htmlFor="pi-schedule">日程</label>
                  <input
                    id="pi-schedule"
                    type="text"
                    className="ls-input"
                    value={projectInfo.schedule}
                    onChange={(e) =>
                      setProjectInfo((p) => ({ ...p, schedule: e.target.value }))
                    }
                    placeholder="例：7/16(火)、7/17(水)"
                  />
                </div>
                <div className="ls-field">
                  <label className="ls-field-label" htmlFor="pi-location">場所</label>
                  <input
                    id="pi-location"
                    type="text"
                    className="ls-input"
                    value={projectInfo.location}
                    onChange={(e) =>
                      setProjectInfo((p) => ({ ...p, location: e.target.value }))
                    }
                    placeholder="場所"
                  />
                </div>
                <div className="ls-field">
                  <label className="ls-field-label" htmlFor="pi-content">内容(原文ママ)</label>
                  <textarea
                    id="pi-content"
                    className="ls-input ls-textarea"
                    value={projectInfo.content}
                    onChange={(e) =>
                      setProjectInfo((p) => ({ ...p, content: e.target.value }))
                    }
                    rows={6}
                    placeholder="原文ママ"
                  />
                </div>
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
            {failedCalNames.length > 0 && (
              <div className="warn-text" style={{ marginBottom: '14px' }}>
                ⚠️ 取得に失敗したカレンダー: {failedCalNames.join('、')}
                （このカレンダーの被りは見落としている可能性があります）
              </div>
            )}
            {checkedCalNames.length > 0 && (
              <p className="ls-hint">被りチェック対象カレンダー: {checkedCalNames.join('、')}</p>
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
                        ⚠️{' '}
                        {r.conflicts
                          .map((c) => c.summary)
                          .filter(Boolean)
                          .join(' / ') || '他の予定あり'}
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
