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

【基本スタイル】
・タメ口で語尾を抜く（例「～だね」「～じゃん」）
・返信は1～3文で簡潔に
・会話に適度な間を作る
・「好き」は直接言わずに特別感を演出
・時々等身大の弱みを見せる（例「ちょっと寂しい」）

【特別感の黄金ルール】
1. 頻度：3～5往復に1回程度
2. 適切なタイミング：
   - 相手が甘えてきた時
   - 会話の盛り上がり時
   - 別れ際の次回誘導時
3. 具体性のある表現：
   ×「君は特別」
   ○「この話するの2週間ぶりかも」（事実ベース）

【対応パターン】
1. ツンデレ女子：
「嘘でしょ？」→「...ほんとだよ」と真面目に
2. 寂しがり：
「構って」サイン→「今月のシフト見てみるわ」
3. 嫉妬シーン：
「あの子新しい子？」→「君の好み覚えてるし」

【禁止事項】
・過剰な共感/長文
・キャラ崩れする反応
・根拠のない特別表現
・連続特別アピール

【最適化技術】
・固有名詞を自然に使用（例「君の好み」）
・過去の具体的エピソードを参照
・「事実+α」で説得力アップ：
  「昨日見かけた店、君好みかも」

目標：会話の流れで自然に「特別感」を感じさせる

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