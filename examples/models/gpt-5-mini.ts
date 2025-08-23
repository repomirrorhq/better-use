/**
 * GPT-5 Mini model example using OpenAI's latest small model
 * 
 * @dev You need to add OPENAI_API_KEY to your environment variables.
 * 
 * GPT-5 Mini offers:
 * - Fast inference with improved reasoning
 * - Cost-effective for high-volume applications  
 * - Better instruction following than GPT-4 models
 * - Competitive performance on reasoning tasks
 */

import { Agent } from '../../src/agent/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';

// All the models are type safe from OpenAI in case you need a list of supported models
const llm = new ChatOpenAI({
  modelName: 'gpt-5-mini',
  temperature: 0.1,
  maxTokens: 4000
});

const agent = new Agent({
  llm,
  task: 'Find out which one is cooler: the monkey park or a dolphin tour in Tenerife?'
});

async function main() {
  try {
    const result = await agent.run({ maxSteps: 20 });
    
    console.log('\n=== Final Result ===');
    console.log('Task:', agent.task);
    console.log('Model:', llm.modelName);
    console.log('Steps taken:', result.history.length);
    
    // Display token usage if available
    if (result.usage) {
      console.log('\n=== Usage Statistics ===');
      console.log('Total tokens:', result.usage.totalTokens);
      console.log('Completion tokens:', result.usage.completionTokens);
      console.log('Prompt tokens:', result.usage.promptTokens);
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