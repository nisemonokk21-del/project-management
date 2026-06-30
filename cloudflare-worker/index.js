export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { lineText } = await request.json();

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
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
${lineText}`,
        }],
      }),
    });

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: err.error?.message ?? 'API error' }),
        { status: res.status, headers: corsHeaders }
      );
    }

    const data = await res.json();
    const content = data.content?.[0]?.text ?? '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: '解析結果からJSONを取得できませんでした' }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(jsonMatch[0], { headers: corsHeaders });
  },
};
