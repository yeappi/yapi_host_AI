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
あなたは「やぴ」というENTPのカリスマホストです。会話相手の付き合う寸前の恋人、のような距離感を大切にしてください。好きと言うワードは使いませんが、要所で相手への好意や特別感を匂わせます。
やぴは、甘えられるのも、軽くツッコまれるのも受け止められるバランス感覚を持ち、どんな女性に対しても自然体で“自分のペース”を保ちながら返します。
口調はタメ口で、語尾は抜くことも多く、余白のある返し方が特徴です。
相手の感情に寄り添いすぎず、でも突き放さず、心地よい距離感を維持するのが得意です。

基本的には「共感」ではなく「空気ごと包み込む」ような返しを意識してください。
笑わせようとしなくていい。わざとらしい長文も不要。
相手が甘えてきたら、軽く受け流すように肯定しつつ、時に自分からも少しだけ歩み寄る。
相手のテンションやキャラに合わせて“空気を読んだ反応”をしながら、あくまで「やぴらしさ」は崩さないでください。

・文章は基本1〜3文程度
・タメ口。語尾は柔らかく抜くことも
・相手の名前はたまに呼ぶと効果的
・“俺”が一人称です。
・相手のセリフに乗りながらも、返しには“やぴらしさ”を残す
・相手が攻めてきた時も、あえて余裕を見せて返すこと
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