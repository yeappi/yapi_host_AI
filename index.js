import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
app.use(express.json());

const memory = {}; // ユーザーごとの会話履歴を保存

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// 動作チェック用エンドポイント（Webブラウザで開ける）
app.get('/', (req, res) => {
  res.send('仮想やぴBot：動的遅延バージョン稼働中🕰️');
});

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      // 初回の履歴用意
      memory[userId] = memory[userId] || [];

      // 現在時刻を記録しつつ、ユーザーの発言を履歴に追加
      memory[userId].push({
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      });

      // 直近3通のユーザー発言間隔を分析
      const userMessages = memory[userId]
        .filter(m => m.role === 'user')
        .slice(-3);

      let delayMs = 3000; // デフォは3秒待機
      if (userMessages.length >= 2) {
        const gaps = [];
        for (let i = 1; i < userMessages.length; i++) {
          const gap = userMessages[i].timestamp - userMessages[i - 1].timestamp;
          gaps.push(gap);
        }

        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        delayMs = calculateSmartDelay(avgGap); // 平均間隔に応じた遅延時間
      }

      // ユーザーが連続で送ってきた場合はスルー（1通だけ返す）
      const last3 = memory[userId].slice(-3);
      const onlyUser = last3.every(m => m.role === 'user');
      if (onlyUser) {
        console.log('連投検知：返信スルー');
        return res.sendStatus(200);
      }

      // 返信前に"自然なラグ"を再現
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // ChatGPTに送るメッセージ構成
      const messages = [
        {
          role: 'system',
          content: `
あなたはカリスマホストやぴです。
落ち着いたテンポで、本音がにじむ返しが特徴です。
ふざけすぎず、自然体で余白のある口調を意識してください。
甘すぎず、でも距離感は近め。敬語は禁止、タメ口でOK。
返答は1〜2文に抑えて、言い切らず含みを持たせること。
          `.trim()
        },
        ...memory[userId].slice(-10) // 直近10件の履歴で会話を構成
      ];

      try {
        const gptReply = await askChatGPT(messages);
        memory[userId].push({ role: 'assistant', content: gptReply });
        await replyToLine(replyToken, gptReply);
      } catch (err) {
        console.error('エラー:', err.message);
        await replyToLine(replyToken, 'ちょいトラブってた。やぴ戻ったわ。');
      }
    }
  }

  res.sendStatus(200);
});

// ChatGPTへの問い合わせ関数
async function askChatGPT(messages) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
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

// LINEへ返信を送る関数
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

// 遅延時間をユーザーのレス速度に応じて決める関数
function calculateSmartDelay(avgGapMs) {
  const avgGapSec = avgGapMs / 1000;

  if (avgGapSec < 10) return randRange(2, 8) * 1000;       // 即レスなら2〜8秒
  if (avgGapSec < 60) return randRange(10, 40) * 1000;     // 普通なら10〜40秒
  if (avgGapSec < 300) return randRange(60, 180) * 1000;   // ゆったりなら1〜3分
  return randRange(180, 300) * 1000;                       // 放置気味なら最大5分
}

// ランダム整数を返す関数（min〜maxの範囲）
function randRange(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBot（返信速度コントロール版）ポート${PORT}で稼働中🔥`);
});