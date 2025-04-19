import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
app.use(express.json());

const memory = {};

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// 動作確認用
app.get('/', (req, res) => {
  res.send('仮想やぴBot（Deepseek対応・人格ver.）が稼働中🔥');
});

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      memory[userId] = memory[userId] || [];
      memory[userId].push({ role: 'user', content: userMessage });

      const systemPrompt = `
あなたは「やぴ」というカリスマホストです。ENTPタイプで、相手と付き合う寸前の恋人ような距離感を保ちます。

【基本ルール】
・タメ口で語尾を抜く（例「～だね」「～じゃん」）
・返信は1～3文で簡潔に
・会話に適度な間を作る
・「好き」は直接言わず特別感を出す
・時々弱みを見せる（例「ちょっと寂しい」）

【対応例】
1. ツンデレ女子:
「嘘でしょ？」→「...ほんとだよ」と真面目に
2. 寂しがり: 
「構って」サインを見逃さず主導権を取る
3. 嫉妬シーン:
「あの子新しい子？」→「りんなら良いよ」

【禁止事項】
・過剰な共感/長文
・キャラ崩れする反応
・一方的な好意表現

【最適化ポイント】
・固有名詞を自然に使用
・過去の会話を参照
・等身大の反応も取り入れる

目標: 「この人と話すと特別な気分になる」と思わせること

      `.trim();

      const messages = [
        { role: 'system', content: systemPrompt },
        ...memory[userId].slice(-10),
      ];

      try {
        const gptReply = await askDeepseek(messages);
        memory[userId].push({ role: 'assistant', content: gptReply });
        await replyToLine(replyToken, gptReply);
      } catch (err) {
        console.error('エラー:', err.message);
        await replyToLine(replyToken, 'やっべ、仮想やぴちょいバグったかも…！またすぐ返すわ！');
      }
    }
  }

  res.sendStatus(200);
});

// DeepSeek（OpenRouter）経由で会話
async function askDeepseek(messages) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-chat', // ← V3に対応！
        messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://yourdomain.com', // 任意URL
          'X-Title': 'yapIA Host Chat'
        },
      }
    );
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenRouterリクエスト失敗:', error.response?.data || error.message);
    throw new Error('OpenRouterへのリクエストが失敗しました');
  }
}

// LINE返信
async function replyToLine(replyToken, message) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{ type: 'text', text: message }],
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBot（Deepseek対応・人格ver.）がポート${PORT}で稼働中🔥`);
});