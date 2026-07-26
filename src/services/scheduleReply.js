// LINE返信の下書き生成に関する「純粋ロジック」だけを集めたモジュール。
// UI・DOM・ネットワークに一切依存しないので、scheduleReply.test.js で単体テストできる。
// （被り判定まわりは過去に何度も壊れたため、ここをテストで固定して再発を防ぐ）

// 撮影の被りは「確定」と「仮押さえ」で扱いが違う。
// - 決定撮影: その日は本当に他案件で埋まっている → 返信に案件名を出す
// - 仮撮影  : まだ仮押さえで確定ではない → 返信は「OK」とだけ書き、案件名は出さない
export const CONFIRMED_SHOOT_CALENDAR_NAMES = new Set(['決定撮影']);
export const PROVISIONAL_SHOOT_CALENDAR_NAMES = new Set(['仮撮影']);

// LINE解析が返した候補日の「年ずれ」対策。
// 候補日は常に「これから」の日付のはずなので、過去の日付が返ってきたら
// 年の推測ミスとみなし、今日以降になるまで年を進める（最大2年）。
// 例: 今日が 2026-07-15 のとき「2025-07-16」→「2026-07-16」に補正。
// ※ 年がずれると存在しない過去日をカレンダー照会して「全部OK」になり、
//   被りを見落とす原因になっていたためのガード。
export function fixParsedYear(dateStr, todayStr) {
  let s = dateStr;
  for (let i = 0; i < 2 && s < todayStr; i++) {
    const [y, m, d] = s.split('-').map(Number);
    s = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return s;
}

// 決定撮影（確定した他案件）の被りか
export function isConfirmedShoot(conflict) {
  return CONFIRMED_SHOOT_CALENDAR_NAMES.has(conflict?.calName);
}

// 仮撮影（仮案件）の被りか
export function isProvisionalShoot(conflict) {
  return PROVISIONAL_SHOOT_CALENDAR_NAMES.has(conflict?.calName);
}

// OK/NGの判断が要る被りか（撮影系＝決定撮影・仮撮影は判断不要）
export function needsJudgement(conflict) {
  return !isConfirmedShoot(conflict) && !isProvisionalShoot(conflict);
}

// その日に仮案件（仮撮影）があるか
export function hasProvisionalShoot(conflicts) {
  return (conflicts || []).some(isProvisionalShoot);
}

// 被った予定のうち「決定撮影」だけの名前一覧（重複除去）を返す。
// 仮撮影は確定ではないので、ここには含めない（返信には出さない）。
function confirmedShootNames(dateResult) {
  return [
    ...new Set(
      (dateResult.conflicts || [])
        .filter(isConfirmedShoot)
        .map((c) => c.summary)
        .filter(Boolean)
    ),
  ];
}

// 候補日ごとの初期の「各被りのOK/NG」状態を作る。
// conflicts と同じ並びの boolean 配列（true=OK、false=NG）。
// - 撮影系（決定撮影・仮撮影）→ true（判断不要）
// - それ以外（個人の予定など）→ 既定はNG。
//   ただし、その日に既に仮案件（仮撮影）が入っている場合は、
//   その日は元々押さえている日なので他の予定も既定OKにする。
export function initItemOk(conflicts) {
  const provisional = hasProvisionalShoot(conflicts);
  return (conflicts || []).map((c) => (needsJudgement(c) ? provisional : true));
}

// 候補日1日ぶんの判定。個別のOK/NG（itemOk）と日単位のNG（dayNg）から
// 'ok' | 'ng' | 'other' を返す。
// ルール:
// - 日単位でNGにしていれば 'ng'
// - 判断が要る被り（撮影系以外）が1件でもNGなら 'ng'
// - 上記でNGにならず、決定撮影の被りがあれば 'other'（案件名を載せる）
// - どれにも当たらなければ 'ok'（仮案件だけの日もここ＝「OK」と返信）
export function dayStatus(dateResult) {
  if (dateResult.dayNg) return 'ng';

  const conflicts = dateResult.conflicts || [];
  const itemOk = dateResult.itemOk || [];

  const anyNg = conflicts.some((c, i) => needsJudgement(c) && itemOk[i] !== true);
  if (anyNg) return 'ng';

  return confirmedShootNames(dateResult).length > 0 ? 'other' : 'ok';
}

// 1日ぶんの返信ラベルを決める。
// - 'ng'    → 'NG'（何と被ったかは返信文に出さない）
// - 'other' → 被っている決定撮影の案件名を並べる
// - 'ok'    → 'OK'（仮案件だけが入っている日もこちら。案件名は出さない）
export function replyLabelFor(dateResult) {
  const st = dayStatus(dateResult);
  if (st === 'ng') return 'NG';
  if (st === 'other') {
    const names = confirmedShootNames(dateResult);
    return names.length > 0 ? names.join('、') : '他案件';
  }
  return 'OK';
}

// 「7/16」「31」「8/1」のように、連続日をまとめる時の各日の表記
function dayLabel(dateStr, prevDateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  if (!prevDateStr) return `${m}/${d}`;
  const [, prevM] = prevDateStr.split('-').map(Number);
  return m === prevM ? `${d}` : `${m}/${d}`;
}

// 候補日チェック結果（dateResults）から返信文の下書きを組み立てる。
// 同じラベル かつ 連続した日付 はまとめて「7/16,17 OK」のように1行にする。
export function generateReply(dateResults) {
  const items = (dateResults || []).map((r) => ({ ...r, label: replyLabelFor(r) }));
  const lines = [];
  let i = 0;

  while (i < items.length) {
    const { label } = items[i];

    // 同じラベルで日付が連続している範囲をまとめる
    let j = i + 1;
    while (j < items.length) {
      if (items[j].label !== label) break;
      const prev = new Date(items[j - 1].date + 'T00:00:00');
      const cur = new Date(items[j].date + 'T00:00:00');
      if ((cur - prev) / 86400000 !== 1) break;
      j++;
    }

    const group = items.slice(i, j);
    const dateLabel = group
      .map((r, idx) => dayLabel(r.date, idx === 0 ? null : group[idx - 1].date))
      .join(',');

    lines.push(`${dateLabel} ${label}`);
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
