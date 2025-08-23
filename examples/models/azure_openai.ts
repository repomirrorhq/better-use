/**
 * Azure OpenAI Example
 *
 * This file demonstrates how to use Azure OpenAI models with browser-use.
 *
 * Requirements:
 * - Azure OpenAI service configured with model deployment
 * - AZURE_OPENAI_KEY and AZURE_OPENAI_ENDPOINT in environment variables
 * - OpenAI SDK: npm install openai
 */

import { Agent } from '../../src/agent';
import { ChatAzureOpenAI } from '../../src/llm/providers/azure';
import { BrowserSession } from '../../src/browser/session';
import * as dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  console.log('🚀 Azure OpenAI Example');
  console.log('='.repeat(40));

  // Check for required environment variables
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!apiKey || !azureEndpoint) {
    console.error('❌ Error: Missing required environment variables');
    console.log('Please set:');
    console.log('- AZURE_OPENAI_KEY=your_azure_openai_key');
    console.log('- AZURE_OPENAI_ENDPOINT=your_azure_endpoint');
    return;
  }

  // Make sure your deployment exists, double check the region and model name
  const llm = new ChatAzureOpenAI({
    model: 'gpt-4.1-mini',
    apiKey,
    azureEndpoint,
    temperature: 0.7,
  });

  console.log(`Model: ${llm.model}`);
  console.log(`Provider: Azure OpenAI`);
  console.log(`Endpoint: ${azureEndpoint}`);

  const TASK = `
    Go to google.com/travel/flights and find the cheapest flight from New York to Paris on 2025-10-15
  `;

  console.log(`Task: ${TASK.trim()}`);

  // Create browser session
  const browserSession = new BrowserSession();
  await browserSession.start();

  try {
    // Create agent
    const agent = new Agent({
      task: TASK,
      llm,
      browserSession,
    });

    // Run the agent
    const result = await agent.run(10);
    
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

  } catch (error) {
    console.error(`❌ Error: ${error}`);
    console.log('Make sure you have:');
    console.log('- Valid Azure OpenAI credentials configured');
    console.log('- Correct deployment name and endpoint');
    console.log('- Model deployment is active in your Azure region');
  } finally {
    await browserSession.stop();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as azureOpenAIExample };