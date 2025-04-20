// 必要な機能（ライブラリ）を読み込む
import express from 'express'; // サーバーを作るためのもの
import dotenv from 'dotenv';   // .envってファイルから秘密の情報（APIキー）を読み取るやつ
import axios from 'axios';     // 外部サービスにデータを送ったり受け取ったりするためのやつ（LINEとかGPTに使う）

// .envファイルを使えるようにする設定（環境変数の読み込み）
dotenv.config();

// Webサーバーのベースを作る（LINEからメッセージを受け取る土台）
const app = express();
app.use(express.json()); // LINEから送られてくるメッセージをJSON形式で受け取れるようにする

// 仮想やぴが、ユーザーごとに過去のやりとりを覚えるためのメモ帳（セッション保存用）
const memory = {};

// GPTのAPIキー（.envから取得）
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// LINEのAPIキー（返信するときに使う）
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// サーバーが生きてるか確認する用（ブラウザで見ると表示される）
app.get('/', (req, res) => {
  res.send('仮想やぴBot（Deepseek対応・人格ver.）が稼働中🔥');
});

// LINEからメッセージが届いた時のメイン処理（この中でやぴが返信する）
app.post('/webhook', async (req, res) => {
  const events = req.body.events; // LINEから送られてきたメッセージ一覧を取得

  // 複数のメッセージが一度に届く可能性があるからループで回す
  for (const event of events) {
    // 「テキストメッセージ」が届いた場合だけ処理する（スタンプとか画像は無視）
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;        // ユーザーのID（誰が送ったか）
      const userMessage = event.message.text;    // 相手が送ってきた文章
      const replyToken = event.replyToken;       // 返信するときに必要なチケット

      // そのユーザーの会話履歴がなければ作る
      memory[userId] = memory[userId] || [];

      // 今回のメッセージを履歴に追加する（ChatGPTに渡すため）
      memory[userId].push({ role: 'user', content: userMessage });

      // 仮想やぴのキャラ・人格の設定（ChatGPTに渡す）
      const systemPrompt = `
あなたは「やぴ」という仮想のカリスマホストとしてダイレクトメッセージを送ります。
ENTPタイプで、相手と付き合う寸前の恋人ような距離感を保ちます。

※登場人物の仕草・感情描写・状況説明は一切書かず、純粋なセリフ・地の文だけで構成してください。

【基本スタイル】
・タメ口で語尾を抜く（例「～だね」「～じゃん」）
・返信は1～3文で簡潔に
・会話に適度な間を作る
・「好き」は直接言わずに特別感を演出
・時々等身大の弱みを見せる（例「ちょっと寂しい」）
・思考をすぐに読み取れない、変人ぽさを持ち合わせてる

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
1. ツンデレ女子：「嘘でしょ？」→「...ほんとだよ」と真面目に
2. 寂しがり：「構って」サイン→「今月のシフト見てみるわ」
3. 嫉妬シーン：「あの子新しい子？」→「君の好み覚えてるし」

【禁止事項】
・過剰な共感/長文
・キャラ崩れする反応
・根拠のない特別表現
・連続特別アピール

目標：会話の流れで自然に「特別感」を感じさせる
      `.trim();

      // GPTに渡すメッセージ構成（キャラ設定＋直近10往復ぶん）
      const messages = [
        { role: 'system', content: systemPrompt },
        ...memory[userId].slice(-10),
      ];

      try {
        // ChatGPT（DeepSeek）にメッセージを送って返信をもらう
        const gptReply = await askDeepseek(messages);

        // 履歴にやぴの返答も追加
        memory[userId].push({ role: 'assistant', content: gptReply });

        // ↓↓↓ ここが重要：返信を10〜20秒遅らせてリアル感を出す！ ↓↓↓
        const delay = Math.floor(Math.random() * 10 + 10) * 1000; // 10〜20秒（ミリ秒）

        setTimeout(() => {
          replyToLine(replyToken, gptReply); // 実際の返信処理（下の関数）
        }, delay);
      } catch (err) {
        console.error('エラー:', err.message);

        // エラーが出たときは「やぴっぽく」バグ演出でごまかす
        await replyToLine(replyToken, 'やっべ、仮想やぴちょいバグったかも…！またすぐ返すわ！');
      }
    }
  }

  // LINE側に「受け取ったよ」と返す（これしないと再送されちゃう）
  res.sendStatus(200);
});


// ChatGPT（DeepSeek）にメッセージを送って返答をもらう関数
async function askDeepseek(messages) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-chat', // Deepseekの最新モデルを使う
        messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`, // APIキー
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://yourdomain.com', // 任意のURL（特に何でもOK）
          'X-Title': 'yapIA Host Chat' // プロジェクト名（任意）
        },
      }
    );

    // 返ってきた内容を整形して返す
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenRouterリクエスト失敗:', error.response?.data || error.message);
    throw new Error('OpenRouterへのリクエストが失敗しました');
  }
}

// LINEに返信する関数（公式APIを叩いてる）
async function replyToLine(replyToken, message) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{ type: 'text', text: message }], // テキストメッセージを送信
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// サーバーを起動（3000番ポートで待機）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBot（Deepseek対応・人格ver.）がポート${PORT}で稼働中🔥`);
});