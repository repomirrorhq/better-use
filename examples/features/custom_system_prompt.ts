/**
 * Custom system prompt example.
 * 
 * This demonstrates how to extend or override the default system prompt
 * to customize agent behavior.
 */

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';

const extendSystemMessage = 
  'REMEMBER the most important RULE: ALWAYS open first a new tab and go first to url wikipedia.com no matter the task!!!';

// or use overrideSystemMessage to completely override the system prompt

async function main() {
  const task = 'do google search to find images of Elon Musk';
  const model = new ChatOpenAI({
    model: 'gpt-4-turbo',
    apiKey: process.env.OPENAI_API_KEY!
  });
  
  const agent = new Agent({ 
    task, 
    llm: model, 
    extendSystemMessage 
  });

  // Print the system prompt configuration
  console.log(
    JSON.stringify(
      agent.messageManager.systemPrompt, // Assuming similar structure exists
      null,
      4
    )
  );

  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}