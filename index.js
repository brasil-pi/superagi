require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
    });

    res.json({ response: completion.choices[0].message.content });
  } catch (error) {
    console.error('Error communicating with OpenAI:', error);
    res.status(500).json({ error: 'Failed to communicate with OpenAI' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
