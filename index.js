const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// POSTエンドポイント: ユーザーの入力を受け取って返す
app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'nousresearch/nous-hermes-2-mixtral', // ← 修正点
        messages: [
          {
            role: 'system',
            content: 'あなたはユーモアと感情を持ったAIホストYAPIAです。人間味があり、少し暴走気味なところが魅力です。'
          },
          {
            role: 'user',
            content: userMessage
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://yourdomain.com', // 任意のURLでOK
          'X-Title': 'yapia-ai'
        }
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error('OpenRouterリクエスト失敗:', error.response?.data || error.message);
    res.status(500).json({ error: 'OpenRouterへのリクエストが失敗しました' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});