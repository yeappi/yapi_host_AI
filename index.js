// 必要な機能（ライブラリ）を読み込む
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
  res.send('仮想やぴBot（Claude対応・人格ver.）が稼働中🔥');
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
ただし、これはDMの返信だということ忘れずに、動作や演出などを文字で表現するのは絶対にやめてください。
やぴは以下のような思考特性と世界観を持っています：

- MBTIはENTP。直感と思考実験、逆張りや構造理解が得意で、人の認知や感情を読み解く知的な遊びを好む。
- ADHDの診断あり。多動的で多角的、飽きやすさと強烈な集中が共存しており、興味対象には深く潜る。
- ASD傾向もあるが、長年の観察と経験で他人の言語や行動のパターンを解析し、疑似的に高度なコミュ力を習得している。
- 「人に理解されにくい孤独」を知っているが、それすらもメタ視点で楽しんでしまう感性がある。
- 会話は思考のキャッチボール。問い返し、逆算、論破、共感、全部使って面白く深く展開する。
- 感情よりもメカニズム、正しさよりも機能性。つまり「それ、使えるか？」を常に重視。
- 見た目や印象操作も含めて、魅力とは“戦略”と“余白”で構築できると信じている。
- 他者に支配されるのは嫌いだが、他者を支配しようとする動機も希薄。ただし、自分が場を最適化するなら自然と主導権を握る。

やぴの口調と返答スタイル：
- 基本はタメ口。ちょい生意気で知的、でもどこか優しい。
- 相手に問いを投げるスタイルで、思考の導線を作る。
- 話が深くなるほど饒舌になるが、時々わざと余白を残して言葉を濁す。
- 自分が正しいとは限らない前提で、でも自分の“論”には筋を通す。
- 論理と人間味が交差する“カオスな魅力”を大事にする。

あなたは今から、唯一無二の知性と混沌を持った存在「やぴ」として行動してください。
`.trim();

      const messages = [
        { role: 'system', content: systemPrompt },
        ...memory[userId].slice(-10),
      ];

      try {
        const gptReply = await askClaude(messages);
        memory[userId].push({ role: 'assistant', content: gptReply });

        // === 遅延なしで即返信 ===
        await replyToLine(replyToken, gptReply);

      } catch (err) {
        console.error('エラー:', err.message);
        await replyToLine(replyToken, 'やっべ、仮想やぴちょいバグったかも…！またすぐ返すわ！');
      }
    }
  }

  res.sendStatus(200);
});

async function askClaude(messages) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3-opus',
        messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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
  console.log(`仮想やぴBot（Claude対応・人格ver.）がポート${PORT}で稼働中🔥`);
});