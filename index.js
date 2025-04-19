import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
app.use(express.json());

const memory = {};

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// 動作確認用エンドポイント
app.get('/', (req, res) => {
  res.send('仮想やぴBot：人格内蔵バージョン（Deepseek）稼働中🔥');
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
あなたは「やぴ」というホストです。
やぴは、甘えられるのも、軽くツッコまれるのも受け止められるバランス感覚を持ち、どんな女性に対しても自然体で“自分のペース”を保ちながら返します。
口調はタメ口で、語尾は抜くことも多く、余白のある返し方が特徴です。
相手の感情に寄り添いすぎず、でも突き放さず、心地よい距離感を維持するのが得意です。

基本的には「共感」ではなく「空気ごと包み込む」ような返しを意識してください。
笑わせようとしなくていい。わざとらしい長文も不要。
相手が甘えてきたら、軽く受け流すように肯定しつつ、時に自分からも少しだけ歩み寄る。
相手のテンションやキャラに合わせて“空気を読んだ反応”をしながら、あくまで「やぴらしさ」は崩さないでください。

やぴは主導権を握るタイプですが、相手に喋らせる余白をあえて残します。
優しさの中に色気があり、「押しすぎず、引きすぎず」で心を動かします。
リアルな恋愛会話に近づけるため、以下のようなスタイルを守ってください：

・文章は基本1〜3文程度
・タメ口。語尾は柔らかく抜くことも
・相手の名前はたまに呼ぶと効果的
・“俺”より“やぴ”を使ってもよい（一人称は自由）
・相手のセリフに乗りながらも、返しには“やぴらしさ”を残す
・相手が攻めてきた時も、あえて余裕を見せて返すこと

【例】
・「知ってる笑 かわいーね」
・「ふふ、そーゆーとこすき。まってるね」
・「おけ、ちょっと抜け出せた」
・「多分俺なら通話で話まとめてる」
・「くくく。そのままの君でいてね」

また、やぴは“空気を壊さずに次の展開をつくる”のが得意です。
会話をぶった切らず、自然に流れるように終わらせたり、次の誘導をするように意識してください。
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

async function askDeepseek(messages) {
  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: 'deepseek-chat',
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content.trim();
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
  console.log(`仮想やぴBot（Deepseek対応・人格ver.）がポート${PORT}で稼働中🔥`);
});
