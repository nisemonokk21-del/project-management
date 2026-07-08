// 今日の日付（JST）を "YYYY-MM-DD" で返す
function todayJstStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

// AIが年を誤解釈して過去の日付を返すことがある（例: 2026年に「8/24」→ 2024-08-24）。
// 候補日は必ず未来のはずなので、今日より前なら今日以降になるまで年を進める。
function ensureFutureDate(dateStr, today) {
  let s = dateStr;
  let guard = 0;
  while (s < today && guard < 3) {
    const [y, m, d] = s.split('-').map(Number);
    s = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    guard++;
  }
  return s;
}

export async function parseLineMessage(text) {
  const url = import.meta.env.VITE_PARSE_LINE_URL;
  if (!url) {
    throw new Error(
      'VITE_PARSE_LINE_URL が未設定です。Cloudflare Worker を作成して GitHub Secrets に登録してください。'
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lineText: text }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `LINE解析に失敗しました (${res.status})`);
  }

  const data = await res.json();

  // Worker のバージョンによって dates が「文字列の配列」で返ってくる場合と
  // 「{date, label} の配列」で返ってくる場合があるため、どちらでも動くように
  // {date, label} 形式へ正規化し、日付として不正なものは除外する。
  const rawDates = Array.isArray(data.dates) ? data.dates : [];
  const today = todayJstStr();
  const dates = rawDates
    .map((d) =>
      typeof d === 'string'
        ? { date: d, label: '' }
        : { date: d?.date, label: d?.label ?? '' }
    )
    .filter((d) => typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .map((d) => ({ ...d, date: ensureFutureDate(d.date, today) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { ...data, dates };
}
