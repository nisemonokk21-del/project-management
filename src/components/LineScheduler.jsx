import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { parseLineMessage } from '../services/lineParser';
import { jstDateString } from '../utils/timeUtils';
import { fixParsedYear, generateReply, autoStatus } from '../services/scheduleReply';
import {
  listCalendars,
  getEventsFromCalendar,
  createEventInCalendar,
  buildProvisionalShootingEvent,
  calDisplayName as calName,
  conflictCalendars,
  realEvents,
} from '../services/calendar';

// 被りチェックは「バラシ撮影を除く全カレンダー」が対象。
// 名前の完全一致リストやシステムカレンダー判定で絞ると、共有カレンダー
// （例:「kei.imagawa.a@gmail.com」表示のもの）を取りこぼして被りを見落とすため、
// バラシ撮影以外はカレンダーリストにある全部を確認する。
const PROVISIONAL_CALENDAR_NAME = '仮撮影';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${day})`;
}

// チェック結果用：年も含めて表示する（解析が年を誤った場合に画面で気付けるように）
function formatDateJPWithYear(dateStr) {
  const [y] = dateStr.split('-').map(Number);
  return `${y}/${formatDateJP(dateStr)}`;
}

// パースした候補日を「7/16(火), 7/17(水)」のような日程文字列にまとめる
function buildScheduleText(dates) {
  return (dates || [])
    .map((d) => (typeof d === 'string' ? formatDateJP(d) : formatDateJP(d.date)))
    .join('、');
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
  // 候補日のOK/NG/他案件を変えると true。返信文が古いことを示し、まとめて更新する。
  const [replyStale, setReplyStale] = useState(false);
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
    setReplyStale(false);
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

      // Step 1: Parse LINE text via Cloud Function → Gemini API
      setStatusMsg('LINE文を解析中...');
      const rawParsed = await parseLineMessage(lineText.trim());
      // 解析が年を誤ると存在しない過去日をカレンダー照会して「全日OK」になってしまうため、
      // 過去日付は年を補正してから使う
      const todayStr = jstDateString();
      const parsedData = {
        ...rawParsed,
        dates: (rawParsed.dates || []).map((d) => ({
          ...d,
          date: fixParsedYear(d.date, todayStr),
        })),
      };
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

      // バラシ撮影を除く全カレンダーを被りチェック対象にする
      const conflictCals = conflictCalendars(allCals);
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
                // どのカレンダーの予定か（calName）を各予定に付けておく。
                // 返信文で「撮影案件だけ名前を出す」判定に使う。
                .then((data) =>
                  realEvents(cal, data.items).map((e) => ({ ...e, calName: calName(cal) }))
                )
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
            conflicts,
            // status = ユーザーの最終判断（3択: 'ok'=被りOK / 'ng' / 'other'=他案件）。
            // 初期値は被り状況から自動判定し、ボタンで手動切替できる。
            status: autoStatus(conflicts),
          };
        })
      );

      setFailedCalNames([...failedCals]);

      // Step 4: Generate reply text (calendar registration now happens on manual confirmation)
      setDateResults(results);
      setReplyText(generateReply(results));
      setReplyStale(false);
      setDone(true);
    } catch (err) {
      setError(err.message ?? '処理に失敗しました');
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  // 候補日の3択（被りOK / NG / 他案件）を手動で設定する。
  // 返信文はここでは作り直さない（切替のたびに再生成すると重いため）。
  // 代わりに「古い」フラグを立て、「返信文を更新」ボタンでまとめて反映する。
  const setDateStatus = (idx, status) => {
    setDateResults((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, status } : r))
    );
    setReplyStale(true);
    setRegistered(false);
    setRegisterError('');
  };

  // 現在の候補日の状態から返信文をまとめて作り直す
  const regenerateReply = () => {
    setReplyText(generateReply(dateResults));
    setReplyStale(false);
  };

  const handleRegister = async () => {
    if (!provisionalCal) return;
    setRegistering(true);
    setRegisterError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Googleログインが必要です。一度ログアウトして再ログインしてください。');

      // 登録対象は「被りOK」と「他案件」。NGだけ登録しない。
      const okDates = dateResults.filter((r) => r.status !== 'ng');
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
    setReplyStale(false);
    setCopied(false);
    setDone(false);
    setRegistering(false);
    setRegistered(false);
    setRegisterError('');
  };

  // 登録件数（被りOK＋他案件、NG以外）
  const okCount = dateResults.filter((r) => r.status !== 'ng').length;

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
            <p className="ls-hint">
              各日を「被りOK / NG / 他案件」から選べます。切り替えたあと、下の
              返信文カードの「返信文を更新」でまとめて反映してください。
            </p>
            <ul className="ls-status-legend">
              <li><b>被りOK</b>：個人予定があっても被りなしとして返信（OK）</li>
              <li><b>NG</b>：個人的な用事などでNG（返信は「NG」だけ）</li>
              <li><b>他案件</b>：他の案件と被り。案件名を返信に入れる</li>
            </ul>
            <div className="ls-date-list">
              {dateResults.map((r, i) => (
                <div
                  key={i}
                  className={`ls-date-item ls-st-${r.status}`}
                >
                  <div className="ls-date-main">
                    <div className="ls-date-label">
                      <span className="ls-date-text">{formatDateJPWithYear(r.date)}</span>
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
                  <div className="ls-seg" role="group" aria-label="この日の扱い">
                    <button
                      className={`ls-seg-btn ls-seg-ok${r.status === 'ok' ? ' active' : ''}`}
                      onClick={() => setDateStatus(i, 'ok')}
                    >
                      被りOK
                    </button>
                    <button
                      className={`ls-seg-btn ls-seg-ng${r.status === 'ng' ? ' active' : ''}`}
                      onClick={() => setDateStatus(i, 'ng')}
                    >
                      NG
                    </button>
                    <button
                      className={`ls-seg-btn ls-seg-other${r.status === 'other' ? ' active' : ''}`}
                      onClick={() => setDateStatus(i, 'other')}
                    >
                      他案件
                    </button>
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
              <h3 style={{ margin: 0 }}>💬 返信文（下書き）</h3>
              <div className="ls-reply-actions">
                <button
                  className={`ls-update-btn${replyStale ? ' ls-update-stale' : ''}`}
                  onClick={regenerateReply}
                >
                  🔄 返信文を更新
                </button>
                <button
                  className={`ls-copy-btn${copied ? ' ls-copied' : ''}`}
                  onClick={handleCopy}
                >
                  {copied ? '✓ コピー済み' : '📋 コピー'}
                </button>
              </div>
            </div>
            {replyStale ? (
              <p className="ls-hint ls-stale-hint">
                ⚠️ 候補日の設定を変えました。「返信文を更新」で最新の内容に反映してください。
              </p>
            ) : (
              <p className="ls-hint">
                自由に編集できます。候補日を変えたら「返信文を更新」でまとめて反映されます。
              </p>
            )}
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
