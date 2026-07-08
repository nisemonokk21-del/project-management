// LINE案件相談文を Claude で解析して JSON を返す Cloudflare Worker。
// Anthropic の API キーはブラウザに出さず、この Worker の環境変数
// (env.ANTHROPIC_API_KEY) に保管する。ブラウザからは lineText を POST するだけ。
export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders };

    let lineText;
    try {
      ({ lineText } = await request.json());
    } catch {
      return new Response(
        JSON.stringify({ error: 'リクエストの形式が不正です' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    if (!lineText || typeof lineText !== 'string') {
      return new Response(
        JSON.stringify({ error: 'lineText is required' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // 年の推測に使う「今日（JST）」
    const todayJST = new Date()
      .toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Tokyo',
      })
      .replace(/\//g, '-');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `以下のLINEメッセージから撮影案件情報を抽出してJSON形式で返してください。今日は${todayJST}（JST）です。

メッセージ:
${lineText}

JSON形式（コードブロックなし、マークダウンなし）で返答してください:
{
  "clientName": "クライアント名または案件名（不明なら空文字）",
  "role": "役柄（不明なら空文字）",
  "location": "撮影場所（不明なら空文字）",
  "dates": [
    {"date": "YYYY-MM-DD", "label": "候補日の説明（例：第一候補、予備日など）"}
  ]
}

注意:
- 年が不明な場合は今日から推測してください（今月以降なら今年、過去なら来年）
- 複数の候補日をすべて含めてください
- datesは日付昇順で並べてください
- JSONのみ返してください。説明文は不要です`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: err.error?.message ?? 'API error' }),
        { status: res.status, headers: jsonHeaders }
      );
    }

    const data = await res.json();
    let text = (data.content?.[0]?.text ?? '').trim();
    // マークダウンのコードフェンスが付いていたら除去
    text = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ error: '解析結果からJSONを取得できませんでした' }),
        { status: 500, headers: jsonHeaders }
      );
    }

    // 構造を検証・整形
    if (!Array.isArray(parsed.dates)) parsed.dates = [];
    parsed.dates = parsed.dates.filter(
      (d) => d?.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
    );

    // 年の誤解釈対策: 候補日は必ず未来のはずなので、
    // 過去の日付は今日以降になるまで年を進める
    parsed.dates = parsed.dates
      .map((d) => {
        let s = d.date;
        let guard = 0;
        while (s < todayJST && guard < 3) {
          const [y, m, day] = s.split('-').map(Number);
          s = `${y + 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          guard++;
        }
        return { ...d, date: s };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return new Response(JSON.stringify(parsed), { headers: jsonHeaders });
  },
};
