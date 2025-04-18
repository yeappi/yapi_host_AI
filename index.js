// 必要なライブラリを読み込む
import express from 'express'; // サーバー作成用
import dotenv from 'dotenv'; // .envファイルから環境変数を読み込む
import axios from 'axios'; // API通信（ChatGPT/LINE）用
import fs from 'fs/promises'; // ファイル（人格テキスト）読み込み用

dotenv.config(); // 環境変数を有効にする
const app = express();
app.use(express.json()); // JSON形式でメッセージを受け取れるようにする

// 会話記憶（ユーザーごとの会話を一時的に保存）
const memory = {};

// .envファイルで設定されたAPIキー類を読み込む
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// 動作確認用エンドポイント（ブラウザでアクセスしたときに表示される）
app.get('/', (req, res) => {
  res.send('仮想やぴBot：スマホ人格編集モード🧠 稼働中');
});

// LINEからメッセージが来たときに呼ばれるメイン処理
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      // ユーザーの履歴がなければ初期化
      memory[userId] = memory[userId] || [];

      // 会話履歴にユーザーの発言を追加
      memory[userId].push({ role: 'user', content: userMessage });

      // 🔥 スマホで編集するファイル（人格設定）を読み込む！
      const systemPrompt = await fs.readFile('./systemPrompt.txt', 'utf-8');

      // ChatGPTに送るメッセージ一覧を作成（人格 + 会話履歴）
      const messages = [
        { role: 'system', content: systemPrompt }, // ← この1行だけスマホで自由に変えられる！
        ...memory[userId].slice(-10), // 直近10件の履歴を送る（必要なら増減OK）
      ];

      try {
        // ChatGPTに返答を依頼
        const gptReply = await askChatGPT(messages);

        // 仮想やぴの返答を履歴に追加
        memory[userId].push({ role: 'assistant', content: gptReply });

        // LINEへ返答を返す
        await replyToLine(replyToken, gptReply);
      } catch (err) {
        console.error('エラー:', err.message);
        // エラー時の仮想やぴっぽいセリフ（ここもスマホで直せるように外出しも可）
        await replyToLine(replyToken, 'やっべ、仮想やぴちょっと黙ってくる😅またすぐ戻るわ');
      }
    }
  }

  res.sendStatus(200); // LINEへのレスポンス（OK返すだけ）
});

// ChatGPTへ問い合わせる関数
async function askChatGPT(messages) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo', // ここでgpt-4にも切り替え可能（コスト注意）
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content.trim(); // GPTの返答テキストを取り出す
}

// LINEに返信する関数
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

// サーバーを起動（ポート番号はRailwayなどで自動設定）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBot（人格スマホ管理版）ポート${PORT}で起動中🔥`);
});
