import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
app.use(express.json());

// 会話の履歴を保持（ユーザーごと）
const memory = {};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// テストアクセス用（ブラウザで開いたときに表示される）
app.get('/', (req, res) => {
  res.send('仮想やぴBot：人格内蔵バージョンで稼働中🧠');
});

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    // メッセージがテキストの場合だけ処理
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      // 会話履歴を初期化または取得
      memory[userId] = memory[userId] || [];

      // ユーザー発言を履歴に追加
      memory[userId].push({ role: 'user', content: userMessage });

      // ChatGPTへ送るメッセージ構成
      const messages = [
        {
          role: 'system',
          content: `
あなたはカリスマホストやぴです。やぴは落ち着いたテンポで、本音がにじむ返しが特徴です。
ふざけすぎず、余白を持った自然体な口調で、語尾はあえて抜くことも。
相手の話にしっかりリアクションを取り、テンポよく会話を展開してください。
敬語は禁止。タメ口で、気取らずに魅せる会話をしてください。
          `.trim(), // ← この中身を変えるとやぴの“性格”が変わる！
        },
        ...memory[userId].slice(-10), // 直近の履歴だけ使ってGPTに送る
      ];

      try {
        // ChatGPTに問い合わせて返答をもらう
        const gptReply = await askChatGPT(messages);

        // 返答を履歴に追加
        memory[userId].push({ role: 'assistant', content: gptReply });

        // LINEに返信
        await replyToLine(replyToken, gptReply);
      } catch (err) {
        console.error('エラー:', err.message);
        await replyToLine(replyToken, 'ちょっとバグってたかも…やぴ戻ってきたからもう一回話して？');
      }
    }
  }

  res.sendStatus(200); // LINEの仕様で必須の返答
});

// ChatGPT APIを使ってメッセージを送る関数
async function askChatGPT(messages) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo', // 必要なら 'gpt-4' に変更可能
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

// LINEに返答を送る関数
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

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBot（人格コード内蔵）がポート${PORT}で稼働中🔥`);
});
