export async function parseLineMessage(text) {
  const url = import.meta.env.VITE_PARSE_LINE_URL;
  if (!url) {
    throw new Error(
      'VITE_PARSE_LINE_URL が未設定です。Cloud Functions をデプロイして GitHub Secrets に登録してください。'
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

  return res.json();
}
