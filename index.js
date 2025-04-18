// line_chatgpt_bot/index.js

import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(bodyParser.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      try {
        const gptReply = await generateGPTReply(userMessage);
        await replyToLINE(replyToken, gptReply);
      } catch (error) {
        console.error('エラー:', error);
      }
    }
  }
  res.sendStatus(200);
});

async function generateGPTReply(message) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'あなたはホスト「やぴ」として、甘く軽妙なトークで相手に返信してください。',
        },
        {
          role: 'user',
          content: message,
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    }
  );
  return response.data.choices[0].message.content.trim();
}

async function replyToLINE(replyToken, message) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken: replyToken,
      messages: [{ type: 'text', text: message }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
      },
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});
