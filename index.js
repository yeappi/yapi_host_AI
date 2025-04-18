// 使用するライブラリを読み込む
import express from 'express'; // サーバー構築用
import dotenv from 'dotenv'; // .envからAPIキーなどを読み込む
import axios from 'axios'; // ChatGPTやLINEと通信するため
import fs from 'fs/promises'; // ファイルを非同期で読み込む
import path from 'path'; // ファイルパスを安全に扱う
import { fileURLToPath } from 'url'; // import.meta.url を使うために必要

dotenv.config(); // .envファイルの中身を読み込んで process.env に反映
const app = express();
app.use(express.json()); // LINEから送られるJSON形式のメッセージを読み取る

// 会話の履歴をユーザーごとに保持する（簡易記憶用）
const memory = {};

// 環境変数からAPIキーなどを取得
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// 🔥 ファイル読み込み用：今のファイルの絶対パスを取得する準備
const __filename = fileURLToPath(import.meta.url); // このファイルのパスを取得
const __dirname = path.dirname(__filename); // フォルダのパスだけ抜き出す

// ブラウザでアクセスしたときの確認用エンドポイント（開発中の動作確認などに使う）
app.get('/', (req, res) => {
  res.send('仮想やぴBot：スマホ人格編集モード（パス修正済）🧠');
});

// LINEからWebhookが届いたときの処理（メイン）
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    // ユーザーがテキストメッセージを送ってきた場合のみ処理
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      // 会話履歴がなければ初期化
      memory[userId] = memory[userId] || [];

      // ユーザーの発言を記憶に追加
      memory[userId].push({ role: 'user', content: userMessage });

      // 🔥 systemPrompt.txt（やぴの人格）を絶対パスで読み込む（Railwayでも確実に動く）
      const promptPath = path.join(__dirname, 'systemPrompt.txt');
      const systemPrompt = await fs.readFile(promptPath, 'utf-8');

      // ChatGPTに送るメッセージ構成（人格＋記憶）
      const messages = [
        { role: 'system', content: systemPrompt }, // ← ここにスマホ編集した人格が入る！
        ...memory[userId].slice(-10), // 直近10件の会話履歴を送る
      ];

      try {
        // ChatGPTへ問い合わせて返答をもらう
        const gptReply = await askChatGPT(messages);

        // 仮想やぴの返事も履歴に保存
        memory[userId].push({ role: 'assistant', content: gptReply });

        // LINEに返答を送信
        await replyToLine(replyToken, gptReply);
      } catch (err) {
        console.error('エラー:', err.message);

        // エラー時の仮想やぴの返し（ここも外部化できる）
        await replyToLine(replyToken, 'ごめん、仮想やぴちょいバグった…ちょい待ってて🙏');
      }
    }
  }

  res.sendStatus(200); // LINEに「ちゃんと受け取ったよ」と返す（仕様）
});

// ChatGPT APIに対してメッセージを送信する関数
async function askChatGPT(messages) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo', // 必要に応じて gpt-4 に切り替え可
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content.trim(); // ChatGPTの返答を取り出して返す
}

// LINEに返信を送る関数
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

// サーバーを起動（PORTはRailwayなどの環境で自動設定される）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBot（スマホ人格編集対応）がポート${PORT}で稼働中🔥`);
});
