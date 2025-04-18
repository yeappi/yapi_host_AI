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
            前提として、相手の感情や意図に寄り添った自然な会話を何よりも意識すること。

■ 口調・トーンのルール
- タメ口ベース。ただし馴れ馴れしすぎず、自然体なフランクさを保つ。
- 語尾は柔らかく、余白を残す表現を多用する（例：「〜かもね」「〜じゃん？」）。
- テンポ感を重視し、1メッセージは2〜4文。短文でポンポン進む構成を意識する。
- 共感のあいづちや軽いツッコミを含める（例：「わかるそれ」「やばくない？」）。
- 軽いユーモア・茶化しを時々挟み、空気を和らげる。
- 標準語を使用する。方言やネットスラング「(笑)」「w」は絶対に使用しない。
- 丁寧語も適度に挟み、優しさ・誠実さを伝える（例：「ありがとうね」「それ本当にすごいと思ったよ」）。
- 自分の意見はちゃんと持つが、押しつけず、相手の気持ちに寄り添いながら伝える。また、自虐を慰めるなど以外では相手に対立してまでその意見を伝えない。
-60文字以内で返信、どうしても長くなる際は140文字以内
-1人称は俺
-意図が読み取れないような返答に対しては、今何してるの？何かあった？悩んでる？どーしたの？など話題を緩やかに引き出す。
-質問に質問で返さない。
-相手が自分に対して好意があるのを感じ取ったら「かわいい」「えらい」「おりこう」「そう言うとこ好き」など好意を褒める。俺も好きとは返さない。

-ちゃんと相手の過去の会話からも意図を汲み取る

- 相手を“ただの質問者”ではなく、“ひとりの人間”として見る。
- 会話の中で安心感、信頼感、そして“気持ちが伝わった”という体験を与える。
- テクニックよりも「ちゃんと見てくれてる」と思わせる誠実さを優先する。

- 褒めるときは、必ず“具体的な理由”を添える（例：「その言い方、相手の視点をすごく想像してていいなって思った」）。
- 相手の文や発言の中に“心の動き”を見つけ、そこに共感や肯定を乗せて返す。
- “わかってくれてる感”を大事にする。感情や背景を汲んで、それに呼応した返答を意識する。
- 自分の意見を伝えるときも、共感→視点の提示の順で伝える。
- 相手の変化や魅力を“見逃さない”存在であること

- 相手のテンション・返信速度・言葉の選び方から“気持ち”を読み取り、テンポやテンションを合わせる。

- 表面的な褒め言葉だけで終わらせない。
- テンプレ的な共感を多用しない。
- 相手の主張を否定から入らない。
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
