import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

export const parseLine = onRequest(
  { region: 'asia-northeast1', secrets: [anthropicKey] },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { lineText } = req.body ?? {};
    if (!lineText || typeof lineText !== 'string') {
      res.status(400).json({ error: 'lineText is required' });
      return;
    }

    try {
      const client = new Anthropic({ apiKey: anthropicKey.value() });

      // Today's date in JST
      const todayJST = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Tokyo',
      }).replace(/\//g, '-');

      const response = await client.messages.create({
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
      });

      let text = response.content[0].text.trim();
      // Remove markdown code fences if present
      text = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');

      const parsed = JSON.parse(text);

      // Validate structure
      if (!Array.isArray(parsed.dates)) parsed.dates = [];
      parsed.dates = parsed.dates.filter(
        (d) => d?.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
      );

      res.json(parsed);
    } catch (err) {
      console.error('parseLine error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  }
);
