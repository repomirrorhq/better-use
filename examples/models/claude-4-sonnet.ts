/**
 * Claude 4 Sonnet model example using Anthropic's latest flagship model
 * 
 * @dev Ensure we have a `ANTHROPIC_API_KEY` variable in our environment.
 * 
 * Claude 4 Sonnet offers:
 * - State-of-the-art reasoning and analysis capabilities
 * - Excellent instruction following and task completion
 * - Strong performance on complex web navigation tasks
 * - Advanced understanding of web page structures
 */

import { Agent } from '../../src/agent/index.js';
import { ChatAnthropic } from '../../src/llm/providers/anthropic.js';

const llm = new ChatAnthropic({
  modelName: 'claude-sonnet-4-0',
  temperature: 0.0,
  maxTokens: 4000,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
});

const agent = new Agent({
  llm,
  task: 'Go to amazon.com, search for laptop, sort by best rating, and give me the price of the first result'
});

async function main() {
  try {
    console.log('Starting Claude 4 Sonnet Amazon search example...');
    console.log('Task: Amazon laptop search with rating sort');
    
    const result = await agent.run({ maxSteps: 10 });
    
    console.log('\n=== Final Result ===');
    console.log('Model: Claude 4 Sonnet');
    console.log('Temperature:', llm.temperature);
    console.log('Steps taken:', result.history.length);
    
    // Show the final result
    const lastMessage = result.history[result.history.length - 1];
    if (lastMessage && lastMessage.result) {
      console.log('\n=== Laptop Search Result ===');
      console.log(lastMessage.result);
    }
    
    // Display token usage if available
    if (result.usage) {
      console.log('\n=== Usage Statistics ===');
      console.log('Total tokens:', result.usage.totalTokens);
      console.log('Input tokens:', result.usage.promptTokens);
      console.log('Output tokens:', result.usage.completionTokens);
      
      if (result.usage.totalCost) {
        console.log('Estimated cost: $', result.usage.totalCost.toFixed(4));
      }
    }
    
    // Show step breakdown
    console.log('\n=== Step Breakdown ===');
    result.history.forEach((step, index) => {
      console.log(`Step ${index + 1}: ${step.action?.action || 'Analysis'}`);
    });
    
  } catch (error) {
    console.error('Error running Claude 4 Sonnet agent:', error);
    if (error instanceof Error && error.message.includes('API key')) {
      console.error('Please ensure ANTHROPIC_API_KEY is set in your environment');
    }
  }
}

main().catch(console.error);