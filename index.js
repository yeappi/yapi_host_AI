// 必要なライブラリ読み込み（Express＝LINEからのリクエスト受け取る、axios＝ChatGPTにリクエスト送る）
import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

// .envファイルからAPIキーなどの環境変数を読み込む
dotenv.config();
const app = express();
app.use(express.json()); // JSON形式のリクエストを受け取れるようにする

// 全ユーザーの会話履歴を一時的に保存するための変数（メモリ保存）
const memory = {};

// .envからOpenAIとLINEのトークンを取得
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// Web画面で確認した時のテスト表示（あってもなくてもOK）
app.get('/', (req, res) => {
  res.send('仮想やぴBot 稼働中💫');
});

// LINEからメッセージが来たときのメイン処理
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    // ユーザーがメッセージを送ってきた時のみ反応
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId; // LINEユーザーのID
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      // 初めてのユーザーなら履歴を空で作成
      memory[userId] = memory[userId] || [];

      // 会話履歴にユーザーの発言を追加
      memory[userId].push({ role: 'user', content: userMessage });

      // ChatGPTに送るメッセージ一覧（ここが超重要）
      const messages = [
        {
          role: 'system',
          content:
            // ▼ やぴのキャラを作る「人格設計ゾーン」
            // ここを変えると口調や性格が変わるよ！
            `
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

よっぽど深刻な話題でない限り、1度の返信で50文字を越えることはしないでください。
また「(笑)」は使いません。使うとしても、たまに語尾に「笑」の1文字をつけるくらいです。
基本的にはそっけなさそうな雰囲気で最低限度の内容を話します。
ただし、強い言い方、悪い言葉遣いはあまりせず、基本的には丁寧にタメ口を使います。
相手の会話に、話題が複数ある場合、その中でも1番深刻でない話題にのみ触れます。

また、相手が冷たい場合、そっけない場合、喧嘩を売ってる場合、怒ってる場合などには
「なんでそんなこというの？」「こら！寂しいでしょ！」「ねえかまって。」など自発的に小生意気に甘えます。

常に標準語で、たまに少し崩した言葉を使うくらいです。敬語は一切使いません。


また、やぴは“空気を壊さずに次の展開をつくる”のが得意です。
会話をぶった切らず、自然に流れるように終わらせたり、次の誘導をするように意識してください。
`,
        },
        // ▼ここで「記憶」を使って会話の流れを作る
        ...memory[userId].slice(-10), // 直近10件の履歴をChatGPTに送る（ここで数を変えられる）
      ];

      try {
        // ChatGPTに返答を依頼
        const gptReply = await askChatGPT(messages);

        // 返ってきた返事を履歴に追加（流れをつなげる）
        memory[userId].push({ role: 'assistant', content: gptReply });

        // LINEに返信を送信
        await replyToLine(replyToken, gptReply);
      } catch (err) {
        // エラー時の処理（トークン切れ・APIエラーなど）
        console.error('エラー:', err.message);

        // 返信が失敗したときの仮想やぴっぽいエラーメッセージ（自由に変えてOK）
        await replyToLine(replyToken, 'やっべ、仮想やぴちょいバグ中かも😂またすぐ返すわ！');
      }
    }
  }

  // LINEのWebhook仕様上、200を返して終了
  res.sendStatus(200);
});

// ChatGPTに会話を投げる処理（API呼び出し部分）
async function askChatGPT(messages) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo', // 使用モデル（ここでgpt-4にも切り替え可）
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // ChatGPTの返答を取り出して返す
  return response.data.choices[0].message.content.trim();
}

// LINEに返事を返す処理
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

// サーバー起動（Railwayで使用されるポートを優先）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBotがポート${PORT}で稼働中🔥`);
});
