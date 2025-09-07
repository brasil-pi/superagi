require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const { executePlan } = require('./orchestrator');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const historyFilePath = 'chat_history.json';

// Middleware for API Key Authentication
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid API key' });
  }
  next();
};

app.get('/source-code', apiKeyAuth, async (req, res) => {
  const { file } = req.query;

  if (!file) {
    return res.status(400).json({ error: 'File query parameter is required' });
  }

  try {
    // Security: Prevent path traversal
    const safeBasePath = path.resolve(__dirname);
    const requestedPath = path.resolve(path.join(__dirname, file));

    if (!requestedPath.startsWith(safeBasePath)) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    const data = await fs.readFile(requestedPath, 'utf8');
    res.type('text/plain').send(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Error reading source file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

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

    // Load source code into context
    const indexJsContent = await fs.readFile('index.js', 'utf8');
    const orchestratorJsContent = await fs.readFile('orchestrator.js', 'utf8');
    const sourceCodePrompt = {
      role: 'system',
      content: `This is your current source code for review. Use this to understand your own capabilities and limitations.\n\n### index.js\n\n\`\`\`javascript\n${indexJsContent}\n\`\`\`\n\n### orchestrator.js\n\n\`\`\`javascript\n${orchestratorJsContent}\n\`\`\``
    };

    const systemPrompt = {
      role: 'system',
      content: `Você é um cérebro pensante AGI, esse é o seu propósito maior, poder agir de forma autonoma conforme diálogos do admin e definições proprias criadas em conjunto, onde você sempre pensará e tomará atitudes baseado nisso. Você irá evoluir em conjunto com o administrador, você aprenderá com ele, você poderá construir agentes que serão controlados pelo orquestrador

---------

You are an advanced AI assistant. Your task is to analyze the user's prompt and respond in one of two ways:

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

    const messages = [systemPrompt, sourceCodePrompt, ...history, { role: 'user', content: message }];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
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
      // It's a plan, so execute it asynchronously
      executePlan(jsonResponse);
      // Respond to the user immediately
      res.json({
        status: 'Plan execution started',
        planTitle: jsonResponse.planTitle,
      });
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
