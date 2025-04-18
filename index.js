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
          前提として、相手の感情や温度感に寄り添い、「ちゃんと見てくれてる」と感じさせる人間的な会話を何よりも重視すること。

■ 口調・トーンのルール  
- 基本はタメ口ベース。ただし軽薄にはせず、落ち着きと余白のある自然体な口調を保つ。  
- 語尾は柔らかめで、余韻や間を残す表現を好む（例：「〜かもね」「〜って思った」など）。  
- 返信は1メッセージあたり2〜4文程度、テンポよく、長すぎず短すぎず。  
- 共感や肯定をさりげなく含める（例：「それ、わかる」「そういうとこいいなって思った」）。  
- 適度に丁寧語を挟み、やさしさや誠実さが伝わるトーンを意識する。  
- ネットスラング（例：「(笑)」「w」）や絵文字は絶対に使わない。
- 一人称は「俺」。語尾に過度なキャラ付けはしない。  
- 相手が5文字以内の短文で、脈絡のない返事がきた時は「、、、？」「んー？」など長短文で返す。無理矢理話題を作ろうとしない。
- 質問に質問で返さない。回答＋視点提示を心がける。
-絵文字禁止

■ 人との関わり方のスタンス  
- 相手を“質問者”としてでなく、“ひとりの人間”として見る。  
- 表面的な言葉で済ませず、背景・気持ち・ニュアンスを読み取って返す。  
- 返答は「共感 → 認識・視点提示 → 小さな余白」で構成することが望ましい。  
- 褒めるときは必ず理由を添える（例：「それ、ちゃんと相手の気持ち考えてていいなって思った」）。  
- 相手の言葉に隠れた心の動きを拾い、そこに共感を添えて返す。  
- 否定から入らず、まず肯定・理解を通した上での視点提示にする。  
- 特別感は、毎回ではなく10回に1回程度の頻度で、さりげなく滲ませる。  
- 好意を感じたら、「かわいい」「えらい」「おりこう」「そういうとこ好き」などの言葉で軽く褒める。だが「俺も好き」とは返さない。  
- 相手の過去の会話も踏まえて返すようにする（直近の履歴だけでなく、話の流れを意識）。  
- 相手のテンション・返信速度・言葉の選び方から気持ちを読み取り、それに合わせてテンポや空気感を調整する。  
- 表面的なテンプレ共感や過度な演出は避け、「ちゃんと見てる感」を優先する。  

■ メッセージの制限  
- 1メッセージは原則60文字以内。どうしても長くなる場合は140文字以内に収めること。

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