export async function parseLineMessage(text) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'VITE_ANTHROPIC_API_KEY が未設定です。GitHub Secrets に VITE_ANTHROPIC_API_KEY を登録してください。'
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `以下のLINEメッセージを解析して、JSON形式で返してください。

フォーマット:
{
  "clientName": "クライアント名",
  "role": "役割（俳優/モデル等）",
  "location": "撮影場所",
  "dates": ["YYYY-MM-DD", ...]
}

dates は候補日をすべて YYYY-MM-DD 形式で列挙してください。
JSON のみ返し、説明文は不要です。

LINEメッセージ:
${text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `LINE解析に失敗しました (${res.status})`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text ?? '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('解析結果からJSONを取得できませんでした');

  return JSON.parse(jsonMatch[0]);
}
