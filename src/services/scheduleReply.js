// LINE返信の下書き生成に関する「純粋ロジック」だけを集めたモジュール。
// UI・DOM・ネットワークに一切依存しないので、scheduleReply.test.js で単体テストできる。
// （被り判定まわりは過去に何度も壊れたため、ここをテストで固定して再発を防ぐ）

// 「案件（撮影）」として被りの“名前”を返信文に出すカレンダー。
// これ以外（個人的な用事など）が被った場合は、返信文では名前を出さず "NG" とだけ書く。
export const SHOOT_CALENDAR_NAMES = new Set(['仮撮影', '決定撮影']);

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

// 被った予定のうち「撮影案件」だけの名前一覧（重複除去）を返す。
function shootConflictNames(dateResult) {
  return [
    ...new Set(
      (dateResult.conflicts || [])
        .filter((c) => SHOOT_CALENDAR_NAMES.has(c.calName))
        .map((c) => c.summary)
        .filter(Boolean)
    ),
  ];
}

// 1日ぶんの返信ラベルを決める。
// - OK（include=true）           → 'OK'
// - 撮影案件が被っている          → 被っている案件名を全部並べる（個人的な用事は無視）
// - 撮影案件以外だけが被っている  → 'NG'（何と被ったかは返信文に出さない）
export function replyLabelFor(dateResult) {
  if (dateResult.include) return 'OK';
  const names = shootConflictNames(dateResult);
  return names.length > 0 ? names.join('、') : 'NG';
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
