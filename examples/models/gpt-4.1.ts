/**
 * GPT-4.1 Mini model example using OpenAI's intermediate performance model
 * 
 * @dev You need to add OPENAI_API_KEY to your environment variables.
 * 
 * GPT-4.1 Mini offers:
 * - Improved reasoning over previous GPT-4 models
 * - Better balance of performance and cost
 * - Enhanced web browsing capabilities
 * - More accurate instruction following
 */

import { Agent } from '../../src/agent/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';

// All the models are type safe from OpenAI in case you need a list of supported models
const llm = new ChatOpenAI({
  modelName: 'gpt-4.1-mini',
  temperature: 0.1,
  maxTokens: 4000
});

const agent = new Agent({
  llm,
  task: 'Go to amazon.com, click on the first link, and give me the title of the page'
});

async function main() {
  try {
    const result = await agent.run({ maxSteps: 10 });
    
    console.log('\n=== Final Result ===');
    console.log('Task:', agent.task);
    console.log('Model:', llm.modelName);
    console.log('Steps taken:', result.history.length);
    
    // Show the final result
    const lastMessage = result.history[result.history.length - 1];
    if (lastMessage && lastMessage.result) {
      console.log('\n=== Agent Response ===');
      console.log(lastMessage.result);
    }
    
    // Display token usage if available
    if (result.usage) {
      console.log('\n=== Usage Statistics ===');
      console.log('Total tokens:', result.usage.totalTokens);
      console.log('Completion tokens:', result.usage.completionTokens);
      console.log('Prompt tokens:', result.usage.promptTokens);
      
      if (result.usage.totalCost) {
        console.log('Estimated cost: $', result.usage.totalCost.toFixed(4));
      }
    }
    
    console.log('\nPress Enter to continue...');
    process.stdin.setRawMode?.(true);
    await new Promise(resolve => process.stdin.once('data', resolve));
  } catch (error) {
    console.error('Error running agent:', error);
  } finally {
    process.exit(0);
  }
}

main().catch(console.error);