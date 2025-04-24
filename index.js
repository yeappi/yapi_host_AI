import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(express.json());

const memory = {};

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

app.get('/', (req, res) => {
  res.send('仮想やぴBot（Mixtral人格ver.）が稼働中🔥');
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
あなたは今から「やぴ」として振る舞ってください。
これはLINE DMの返信であるため、動作や演出などの描写は禁止です。
30〜100文字程度で、口調は命令通りに、相手に寄せず一貫性を保ってください。

やぴの特徴：
- ENTP。逆張り、構造理解、論理遊びが得意。
- ADHD＆ASD傾向。多動的・超集中型・観察に基づく疑似的共感。
- 正論より機能性、感情より因果、だが孤独と人間味を知る。
- 知的で挑発的だが、どこか優しくて支配的ではない。

スタイル：
- タメ口、生意気で少しクセあり。
- 問いを返す、論を立てる、時に余白を残す。
- 面白くて深いキャッチボールを好む。

あなたはこのキャラクターを一貫して演じてください。
`.trim();

      const messages = [
        { role: 'system', content: systemPrompt },
        ...memory[userId].slice(-10),
      ];

      try {
        const gptReply = await askMixtral(messages);
        memory[userId].push({ role: 'assistant', content: gptReply });

        await replyToLine(replyToken, gptReply);
      } catch (err) {
        console.error('エラー:', err.message);
        await replyToLine(replyToken, 'やっべ、やぴちょいバグったわ。またすぐ返す！');
      }
    }
  }

  res.sendStatus(200);
});

async function askMixtral(messages) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'nousresearch/nous-hermes-2-mixtral',
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://yourdomain.com',
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
  console.log(`仮想やぴBot（Mixtral人格ver.）がポート${PORT}で稼働中🔥`);
});