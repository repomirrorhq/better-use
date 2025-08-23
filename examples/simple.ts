/**
 * Simple Better-Use example - the most basic way to run an agent
 * 
 * This is the shortest possible way to use Better-Use TypeScript.
 * The agent will use default settings and search for information about Better-Use features.
 */

import { Agent } from '../src/agent/index.js';

// Create and run an agent with a simple task
// Uses default LLM provider (usually OpenAI GPT-4) if OPENAI_API_KEY is available
const agent = new Agent({
  task: 'Find information about Better-Use TypeScript browser automation'
});

// Run the agent synchronously (blocking)
agent.run({ maxSteps: 10 }).then(result => {
  console.log('Task completed successfully!');
  console.log(`Steps taken: ${result.history.length}`);
  
  // Show final result
  const lastMessage = result.history[result.history.length - 1];
  if (lastMessage && lastMessage.result) {
    console.log('\nResult:', lastMessage.result);
  }
}).catch(error => {
  console.error('Error:', error);
});