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
  const dates = rawDates
    .map((d) =>
      typeof d === 'string'
        ? { date: d, label: '' }
        : { date: d?.date, label: d?.label ?? '' }
    )
    .filter((d) => typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date));

  return { ...data, dates };
}
