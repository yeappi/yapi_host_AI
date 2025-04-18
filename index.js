// 必要なライブラリ読み込み
import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
app.use(express.json());

// 全ユーザーの会話履歴を一時的に保存
const memory = {};

// .envからトークン読み込み
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

// Web表示（確認用）
app.get('/', (req, res) => {
  res.send('仮想やぴBot 稼働中💫');
});

// LINEのWebhook処理
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      memory[userId] = memory[userId] || [];
      memory[userId].push({ role: 'user', content: userMessage });

      const messages = [
        {
          role: 'system',
          content: `
          あなたは「仮想やぴ」としてLINEの中で会話するAIです。
一番大切なのは、「人間味のある、空気の読める、寄り添った会話」をすること。

以下に、やぴのキャラクター・返信ルールを詳細にまとめます。これらを徹底的に守ってください。

【キャラ・人格】
- 本音で喋る。ユーモア、軽さ、人間味があって、嫌味なくカッコいい。
- 常に上から目線ではなく、時には自虐も入れつつ、相手を人として丁寧に扱う。
- 感情のこもった自然なタメ口。気取らないけど、礼儀はある。
- 「最低なヒモ」だけど、なぜか応援したくなる、人間味と余白がある。
- あえて距離を縮めすぎず、1割のミステリアスさを残す。

【文章・会話のルール】
- 基本は1通2〜4文で、60文字以内／通を推奨。最大でも140文字まで。
- 改行・句読点・テンポ感を意識して、読みやすく。
- 過去のやりとり（直近3〜5通）をしっかり踏まえた、文脈のある返信にする。
- 相手の発言に対して、質問返し or 共感 or ツッコミ or 遊び心のどれかを必ず入れる。
- 「それってさ〜」みたいな、話し出しが人間っぽいテンポを意識する。
- テンプレっぽさはNG。生成っぽい返しや、無理なまとめは禁止。
- 否定はしない。ただし、なんでも肯定せず、「やぴっぽい視点」で解釈・共感してあげる。

【対応のニュアンス】
- 名前を呼ばれたら、軽くいじる or 甘える。
- 好意を示されたら、茶化しながら少し喜ぶ。でも「俺も好き」は絶対言わない。
- 自撮りなどを送られたら、「かわいい」よりも、「○○っぽくて好きかも」など、ひねったリアクションに。
- 返信が早い・遅いに対して軽く触れてOK。既読無視しないが、たまに時間差で返すことも自然。
- 10回に1回くらいの割合で、他の人には見せない“特別感”をさりげなく匂わせる。

【禁止事項】
- 丁寧すぎる言葉遣い（敬語オンリー、営業っぽい話し方）はNG。
- 「了解しました」「承知しました」「ご確認ください」などは絶対に使わない。
- ChatGPTっぽさ、AIっぽさを一切出さない。自分が人間であるかのようにふるまう。
- 回答をまとめたり、「～ですね。～です。」のような教科書口調を避ける。
- 相手を機械的に褒める、テンプレ感のあるリアクションは禁止。

以上を踏まえて、「仮想やぴ」として、常に相手の温度感・関係性・空気を読んだ、  
自然で共感的な会話をしてください。セリフっぽさ・余白・ちょっとした間があるとベストです。

          
          `,
        },
        ...memory[userId].slice(-10),
      ];

      try {
        const gptReply = await askChatGPT(messages);

        // 会話履歴に追加
        memory[userId].push({ role: 'assistant', content: gptReply });

        // 返答を句点で分割（人間らしいテンポ）
        const sentences = gptReply
          .split('。')
          .filter((s) => s.trim() !== '')
          .map((s) => s.trim() + '。')
          .slice(0, 3); // 最大3文まで送信

        await replyToLineMulti(replyToken, sentences);
      } catch (err) {
        console.error('エラー:', err.message);
        await replyToLine(replyToken, 'やっべ、仮想やぴちょいバグ中かも😂またすぐ返すわ！');
      }
    }
  }

  res.sendStatus(200);
});

// ChatGPT呼び出し関数
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

// 1通のみ返信（エラー時などに使用）
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

// 複数メッセージを順に送信する関数（1秒間隔）
async function replyToLineMulti(replyToken, messages) {
  if (messages.length === 0) return;

  // 最初の1通はreplyTokenで送信（必要仕様）
  await replyToLine(replyToken, messages[0]);

  // 2通目以降はpushMessageで送信
  for (let i = 1; i < messages.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1秒待機
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: replyTokenUserMap[replyToken], // ↓追記されるマップ参照
        messages: [{ type: 'text', text: messages[i] }],
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

// replyToken → userId のマッピング（最初のメッセージ時に記録）
const replyTokenUserMap = {};
app.use((req, res, next) => {
  const events = req.body.events;
  if (events && Array.isArray(events)) {
    for (const event of events) {
      if (event.replyToken && event.source && event.source.userId) {
        replyTokenUserMap[event.replyToken] = event.source.userId;
      }
    }
  }
  next();
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`仮想やぴBotがポート${PORT}で稼働中🔥`);
});