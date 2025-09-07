const { OpenAI } = require('openai');
const { exec } = require('child_process');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getCommandForStep(description) {
  const systemPrompt = {
    role: 'system',
    content: `You are an expert in shell commands. Your task is to translate a natural language description of a task into a single, executable shell command. Respond with only the command, and nothing else.`
  };

  const messages = [systemPrompt, { role: 'user', content: description }];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: messages,
      temperature: 0, // We want deterministic commands
    });
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error getting command from Execution Agent:', error);
    return null;
  }
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return reject(error);
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);
      resolve(stdout);
    });
  });
}

async function executePlan(plan) {
  console.log(`Starting execution for plan: ${plan.planTitle}`);
  for (const step of plan.steps) {
    console.log(`Executing step ${step.stepNumber}: ${step.description}`);
    const command = await getCommandForStep(step.description);
    if (command) {
      console.log(`> ${command}`);
      try {
        await runCommand(command);
        console.log(`Step ${step.stepNumber} executed successfully.`);
      } catch (error) {
        console.log(`Step ${step.stepNumber} failed to execute.`);
        // We could add logic here to stop the plan or try to recover.
        // For now, we'll just log the failure and continue.
      }
    } else {
      console.log(`Could not generate command for step ${step.stepNumber}.`);
    }
  }
  console.log('Plan execution finished.');
}

module.exports = { executePlan };
