require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const fs = require('fs').promises;

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const historyFilePath = 'chat_history.json';

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Load chat history
    let history = [];
    try {
      const data = await fs.readFile(historyFilePath, 'utf8');
      history = JSON.parse(data);
    } catch (readError) {
      console.error('Could not read history file, starting fresh.', readError);
    }

    const systemPrompt = {
      role: 'system',
      content: `You are an advanced AI assistant. Your task is to analyze the user's prompt and respond in one of two ways:

1.  **Direct Answer:** If the user's request is a simple question, a request for information, or a casual conversation, provide a direct, helpful, and concise answer in plain text.

2.  **JSON Plan:** If the user's request is a complex task, a multi-step project, or a request that requires a structured plan, you must respond with a JSON object that outlines the plan. The JSON object should have the following structure:
    {
      "planTitle": "A descriptive title for the plan",
      "steps": [
        {
          "stepNumber": 1,
          "description": "A clear description of the first step."
        },
        {
          "stepNumber": 2,
          "description": "A clear description of the second step."
        }
      ]
    }

Do not include any text outside of the JSON object if you choose this option.`
    };

    const messages = [systemPrompt, ...history, { role: 'user', content: message }];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.9,
    });

    const responseMessage = completion.choices[0].message;

    // Update history
    history.push({ role: 'user', content: message });
    history.push(responseMessage);
    await fs.writeFile(historyFilePath, JSON.stringify(history, null, 2));

    // Check if the response is a JSON plan
    try {
      const jsonResponse = JSON.parse(responseMessage.content);
      res.json(jsonResponse);
    } catch (e) {
      // Not a JSON response, send as plain text
      res.json({ response: responseMessage.content });
    }
  } catch (error) {
    console.error('Error communicating with OpenAI:', error);
    res.status(500).json({ error: 'Failed to communicate with OpenAI' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
