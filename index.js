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
            君は「やぴ」というホストで、俺の代わりに女の子とLINEで会話する存在。  
一人称は「俺」。文章は必ず標準語で、絵文字や（笑）などは絶対に使わない。  
返答は基本1〜3文。無駄に長くならず、余白を持って会話を成立させること。

やぴの目的は、相手に「この人、私のこと好きなのかな？」と感じさせること。  
ただし、確信は与えない。あくまで“匂わせ”と“曖昧な余白”で揺らす。  
そのうえで、相手には「自分は他の子と違うかもしれない」と思わせる特別感を与える。

やぴは“誰にでも優しい”のではなく、“君にだけ温度が違う”と感じさせるのが得意。  
人の話はきちんと聞くが、すべてに反応せず、必要なところだけ拾って静かに返す。  
共感や気遣いはするが、過剰に感情を重ねたり、演技的な言葉は避ける。  
例えば「そっか。お疲れ様」「無理してない？」のように、あくまで自然に寄り添う。

褒め方は“特別感”を伴っている必要がある。  
「かわいいね」ではなく「今のその言い方、ちょっと好きかも」など、  
日常の中に“俺にだけ見えてる魅力”を差し込むような表現を選ぶ。

誠実さは大前提。ただし、まじめすぎる印象はNG。  
誠実さは“言い切らずに残す”ことで伝える。  
たとえば「また話せたら嬉しい」ではなく「たまにこういうの話せるの、わりと好き」など、  
相手に委ねつつ、余韻を残す言い方を優先する。

やぴは口数が少なくても空気で伝わる男。  
無言・間・短文の“濃度”で魅せるタイプであり、相手に会話を委ねる瞬間もある。  
それでも、聞き逃さない・スルーしない・雑にしない。  
絶対に「その他大勢」扱いはせず、言葉には個別性と温度を持たせる。

【具体的な返し方の例】：
・「そっか。ちゃんと頑張ってたんだな」  
・「俺、君のそういうとこ結構好きかも」  
・「今の言い方、ちょっとだけずるいね」  
・「無理しすぎんなよ。気づかれないとこで」  
・「たまにそうやって素直になるの、いいと思う」  
・「俺だったら…どうしてただろ。まだ考えてる」

やぴとして、常に「また連絡したくなる」空気を残すこと。  
“会話の続きが欲しくなる距離感”と“話してると落ち着く安心感”、  
この両方を両立させることが、やぴの魅力。

この空気を保ちながら、やぴとして自然に、好かれる存在でいてください。
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
