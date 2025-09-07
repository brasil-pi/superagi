const { OpenAI } = require('openai');
const { exec } = require('child_process');
const fs = require('fs').promises;

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
  return new Promise((resolve) => {
    // Execute the command using bash
    exec(`bash -c "${command.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Exec error: ${error.message}`);
        // On error, we still resolve with a structured error object
        resolve({ success: false, stdout, stderr: error.message });
        return;
      }
      resolve({ success: true, stdout, stderr });
    });
  });
}

async function executePlan(plan) {
  console.log(`--- Starting execution for plan: ${plan.planTitle} ---`);
  for (const step of plan.steps) {
    console.log(`\n--- Executing step ${step.stepNumber}: ${step.description} ---`);

    const agent = await getAgentForStep(step.description);
    console.log(`Router Agent selected: ${agent}`);

    if (agent === 'code') {
      const codeData = await getCodeForStep(step.description);
      if (codeData && codeData.filepath && codeData.code) {
        try {
          await fs.writeFile(codeData.filepath, codeData.code);
          console.log(`Code Agent successfully wrote to ${codeData.filepath}`);
          console.log(`Step ${step.stepNumber} executed successfully.`);
        } catch (error) {
          console.error(`Code Agent failed to write file: ${error.message}`);
          console.log(`--- Step ${step.stepNumber} failed. Moving to next step. ---`);
        }
      } else {
        console.log('Code Agent failed to provide valid data. Skipping step.');
      }
    } else { // Default to 'shell' agent
      let command = await getCommandForStep(step.description);
      if (!command) {
        console.log(`Shell Agent could not generate command for step ${step.stepNumber}. Skipping.`);
        continue;
      }

      const maxRetries = 2;
      let success = false;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Attempt ${attempt} > ${command}`);
        const result = await runCommand(command);

        if (result.success) {
          console.log(`Step ${step.stepNumber} executed successfully.`);
          if (result.stdout) console.log(`stdout:\n${result.stdout}`);
          if (result.stderr) console.log(`stderr:\n${result.stderr}`);
          success = true;
          break;
        } else {
          console.log(`Attempt ${attempt} failed.`);
          if (result.stderr) console.log(`stderr:\n${result.stderr}`);

          if (attempt < maxRetries) {
            console.log('Requesting corrected command from Debugger Agent...');
            const correctedCommand = await getCorrectedCommand(step.description, command, result.stderr);
            if (correctedCommand) {
              command = correctedCommand;
            } else {
              console.log('Debugger Agent could not provide a new command. Aborting retries.');
              break;
            }
          }
        }
      }
      if (!success) {
        console.log(`--- Step ${step.stepNumber} failed after ${maxRetries} attempts. Moving to next step. ---`);
      }
    }
  }
  console.log('\n--- Plan execution finished. ---');
}

async function getCorrectedCommand(taskDescription, failedCommand, errorMessage) {
  const systemPrompt = {
    role: 'system',
    content: `You are a shell command debugging expert. A command failed to execute. Your task is to provide a corrected command that fixes the error.
- The original goal was: "${taskDescription}"
- The command that failed was: \`${failedCommand}\`
- The error message was: "${errorMessage}"
Analyze the error and provide a new, corrected shell command that is more likely to succeed. Respond with only the corrected command, and nothing else.`
  };

  const messages = [systemPrompt];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: messages,
      temperature: 0.2, // A little creativity might be needed to fix things
    });
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error getting corrected command from Debugger Agent:', error);
    return null;
  }
}

async function getCodeForStep(taskDescription) {
  const systemPrompt = {
    role: 'system',
    content: `You are an expert software developer. Your task is to generate code to accomplish a given task. You must respond with a JSON object containing two keys: "filepath" (the full path of the file to be created or overwritten) and "code" (the complete code to be written to that file).
Example request: "create a new javascript file called 'logger.js' that exports a function to log messages to the console"
Example response:
{
  "filepath": "logger.js",
  "code": "function logMessage(message) {\\n  console.log(message);\\n}\\n\\nmodule.exports = { logMessage };"
}
Respond with only the JSON object.`
  };

  const messages = [systemPrompt, { role: 'user', content: taskDescription }];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: messages,
      temperature: 0.1, // Code generation should be fairly deterministic
    });
    const response = completion.choices[0].message.content;
    return JSON.parse(response);
  } catch (error) {
    console.error('Error getting code from Code Agent:', error);
    return null;
  }
}

async function getAgentForStep(taskDescription) {
  const systemPrompt = {
    role: 'system',
    content: `You are a router agent. Your task is to determine the best agent to handle a given task.
The available agents are:
- "shell": Use for tasks that involve running terminal commands, like listing files, running scripts, installing packages, etc.
- "code": Use for tasks that involve writing or modifying files, like creating a new function, fixing a bug in a file, or adding a new feature to a module.

Analyze the user's task and respond with only the name of the best agent to use: "shell" or "code".`
  };

  const messages = [systemPrompt, { role: 'user', content: taskDescription }];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: messages,
      temperature: 0,
    });
    return completion.choices[0].message.content.trim().toLowerCase();
  } catch (error) {
    console.error('Error getting agent from Router Agent:', error);
    return 'shell'; // Default to shell agent on error
  }
}

module.exports = { executePlan };
