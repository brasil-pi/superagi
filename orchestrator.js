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
    let command = await getCommandForStep(step.description);

    if (!command) {
      console.log(`Could not generate initial command for step ${step.stepNumber}. Skipping.`);
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
        break; // Exit retry loop on success
      } else {
        console.log(`Attempt ${attempt} failed.`);
        if (result.stderr) console.log(`stderr:\n${result.stderr}`);

        if (attempt < maxRetries) {
          console.log('Requesting corrected command from Debugger Agent...');
          const correctedCommand = await getCorrectedCommand(step.description, command, result.stderr);
          if (correctedCommand) {
            console.log('Debugger Agent provided a new command.');
            command = correctedCommand; // Update command for the next iteration
          } else {
            console.log('Debugger Agent could not provide a new command. Aborting retries for this step.');
            break;
          }
        }
      }
    }

    if (!success) {
      console.log(`--- Step ${step.stepNumber} failed after ${maxRetries} attempts. Moving to next step. ---`);
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

module.exports = { executePlan };
