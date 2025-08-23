/**
 * DeepSeek Chat Example
 *
 * This file demonstrates how to use DeepSeek Chat models with browser-use.
 *
 * Requirements:
 * - DEEPSEEK_API_KEY in environment variables
 * - DeepSeek API access
 */

import { Agent } from '../../src/agent';
import { ChatDeepSeek } from '../../src/llm/providers/deepseek';
import { BrowserSession } from '../../src/browser/session';
import * as dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  console.log('🚀 DeepSeek Chat Example');
  console.log('='.repeat(40));

  // Check for API key
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!deepseekApiKey) {
    console.error('❌ Error: DEEPSEEK_API_KEY not found');
    console.log('Make sure you have DEEPSEEK_API_KEY:');
    console.log('export DEEPSEEK_API_KEY=your_key');
    return;
  }

  // Add custom instructions
  const extendSystemMessage = `
Remember the most important rules: 
1. When performing a search task, open https://www.google.com/ first for search. 
2. Provide clear final output.
  `;

  // Initialize DeepSeek model
  const llm = new ChatDeepSeek({
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: deepseekApiKey,
    temperature: 0.7,
  });

  console.log(`Model: ${llm.model}`);
  console.log(`Provider: DeepSeek`);
  console.log(`Base URL: https://api.deepseek.com/v1`);

  // Create browser session
  const browserSession = new BrowserSession();
  await browserSession.start();

  try {
    // Create agent with custom system message
    const agent = new Agent({
      task: 'What should we pay attention to in the recent new rules on tariffs in China-US trade?',
      llm,
      browserSession,
      settings: {
        use_vision: false,
        extend_system_message: extendSystemMessage,
      },
    });

    console.log('Task: Research recent tariff rules in China-US trade');

    // Run the agent
    const result = await agent.run();
    
    console.log(`✅ Completed ${result.history.length} steps`);
    
    if (result.usage) {
      console.log(`Token Usage: ${result.usage.input_tokens} input, ${result.usage.output_tokens} output`);
      if (result.usage.total_cost) {
        console.log(`Total Cost: $${result.usage.total_cost.toFixed(4)}`);
      }
    }

    // Show final results
    const lastStep = result.history[result.history.length - 1];
    if (lastStep?.model_output?.next_goal) {
      console.log(`Final Goal: ${lastStep.model_output.next_goal}`);
    }
    
    if (lastStep?.model_output?.memory) {
      console.log(`Research Summary: ${lastStep.model_output.memory}`);
    }

  } catch (error) {
    console.error(`❌ Error: ${error}`);
    console.log('Make sure you have:');
    console.log('- Valid DeepSeek API key configured');
    console.log('- Internet connection to DeepSeek API');
    console.log('- Sufficient API quota');
  } finally {
    await browserSession.stop();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as deepseekChatExample };