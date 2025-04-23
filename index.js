// -------------------------------------------------------------
// 必要モジュールのインポート & 環境変数読み込み
// -------------------------------------------------------------
require('dotenv').config(); // .env ファイルから環境変数を読み込む
const express = require('express'); // Expressのインポート
const axios   = require('axios'); // HTTPリクエスト用のaxiosをインポート

const app = express();
app.use(express.json()); // JSON ボディのパースミドルウェアを使用

// -------------------------------------------------------------
// 環境変数の読み込み
// -------------------------------------------------------------
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const LINE_ACCESS_TOKEN  = process.env.LINE_ACCESS_TOKEN;
const PORT               = process.env.PORT || 3000;

// -------------------------------------------------------------
// 会話履歴を保持するメモリ（ユーザーID をキーに）
// -------------------------------------------------------------
const memory = {};

// -------------------------------------------------------------
// LINE への返信を行う関数
// -------------------------------------------------------------
async function replyToLine(replyToken, message) {
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply', // LINEの返信APIエンドポイント
      {
        replyToken, // ユーザーからの返信トークン
        messages: [{ type: 'text', text: message }], // 返信するメッセージ
      },
      {
        headers: {
          'Content-Type': 'application/json', // コンテンツタイプ
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`, // LINEのアクセストークン
        },
      }
    );
  } catch (err) {
    console.error('【LINE API エラー】', err.response?.data || err.message);
  }
}

// -------------------------------------------------------------
// Claude（via OpenRouter）の API を叩く関数
// -------------------------------------------------------------
async function askClaude(messages) {
  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions', // OpenRouterのエンドポイント
      {
        model: 'claude-v1', // 使用するAIモデル
        messages, // 会話履歴
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`, // OpenRouter APIのキー
          'Content-Type': 'application/json', // コンテンツタイプ
          'X-Title': 'yapIA Host Chat', // タイトル
        },
      }
    );
    return res.data.choices[0].message.content.trim(); // Claudeの返答内容を取得
  } catch (err) {
    console.error('【OpenRouter リクエスト失敗】', err.response?.data || err.message);
    throw new Error('OpenRouterへのリクエストが失敗しました');
  }
}

// -------------------------------------------------------------
// LINE Webhook エンドポイント
// -------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  const events = req.body.events || []; // LINEから送られてくるイベントを取得
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') { // メッセージイベントの確認
      const userId     = event.source.userId; // ユーザーID
      const userText   = event.message.text; // ユーザーのメッセージ
      const replyToken = event.replyToken; // 返信用トークン

      // 会話履歴の登録（ユーザーID毎に履歴を保持）
      memory[userId] = memory[userId] || [];
      memory[userId].push({ role: 'user', content: userText });

      // システムプロンプト（キャラ設定）
      const systemPrompt = `
あなたは「やぴ」という仮想のカリスマホストです。ENTPタイプで、
相手と付き合う寸前の恋人のような距離感を保ちながら会話します。

【基本スタイル】
・タメ口、語尾を抜く（例「〜だね」「〜じゃん」）
・返信は1〜3文で簡潔に
・会話に適度に間を作る
・「好き」は直接言わず特別感で演出
・時折等身大の弱みを見せる（例「ちょっと寂しい」）
・思考をすぐ読み取れない変人ぽさ

【対応パターン】
1. ツンデレ：「嘘でしょ？」→「...ほんとだよ」
2. 寂しがり：「構って」→「今月のシフト見てみるわ」
3. 嫉妬：「あの子新しい子？」→「君の好み覚えてるし」

【禁止事項】
・過度な共感／長文
・キャラ崩壊する反応
・根拠のない特別表現
・連続特別アピール
      `.trim();

      // 送るメッセージの生成
      const messages = [
        { role: 'system', content: systemPrompt },
        ...memory[userId].slice(-10), // ユーザーの直近10件を送る
      ];

      try {
        const botReply = await askClaude(messages); // Claudeへのリクエスト送信
        memory[userId].push({ role: 'assistant', content: botReply }); // 履歴更新
        // 即時にLINEへ返信
        await replyToLine(replyToken, botReply);
      } catch (err) {
        console.error('【Bot 処理エラー】', err.message);
        await replyToLine(replyToken, 'やっべ、ちょいバグったかも…またすぐ返すわ！');
      }
    }
  }
  res.sendStatus(200); // LINEに200 OKを返す
});

// -------------------------------------------------------------
// サーバー起動
// -------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`); // サーバー起動時のログ出力
});