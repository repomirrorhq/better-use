/**
 * Novita AI model provider example using DeepSeek models
 * 
 * @dev You need to add NOVITA_API_KEY to your environment variables.
 * 
 * Novita AI offers:
 * - Cost-effective access to popular LLM models
 * - DeepSeek V3 with competitive reasoning performance
 * - OpenAI-compatible API endpoints
 * - No vision model support in this example
 */

import { Agent } from '../../src/agent/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';

const apiKey = process.env.NOVITA_API_KEY;
if (!apiKey) {
  throw new Error('NOVITA_API_KEY is not set in environment variables');
}

async function runSearch() {
  console.log('Starting Novita AI DeepSeek V3 example...');
  
  const agent = new Agent({
    task: [
      '1. Go to https://www.reddit.com/r/LocalLLaMA',
      '2. Search for "browser use" in the search bar',
      '3. Click on first result',
      '4. Return the first comment'
    ].join(' '),
    
    llm: new ChatOpenAI({
      openAIApiKey: apiKey,
      configuration: {
        baseURL: 'https://api.novita.ai/v3/openai'
      },
      modelName: 'deepseek/deepseek-v3-0324',
      temperature: 0.1,
      maxTokens: 4000
    }),
    
    // Disable vision for this provider
    useVision: false
  });

  try {
    const result = await agent.run({ maxSteps: 15 });
    
    console.log('\n=== Final Result ===');
    console.log('Provider: Novita AI');
    console.log('Model: DeepSeek V3-0324');
    console.log('Steps taken:', result.history.length);
    
    // Show the final result
    const lastMessage = result.history[result.history.length - 1];
    if (lastMessage && lastMessage.result) {
      console.log('\n=== Reddit Comment Found ===');
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
  } catch (error) {
    console.error('Error running Novita AI agent:', error);
    if (error instanceof Error && error.message.includes('API key')) {
      console.error('Please ensure NOVITA_API_KEY is set correctly');
    }
  }
}

async function main() {
  await runSearch();
  console.log('\nNovita AI example completed.');
}

if (require.main === module) {
  main().catch(console.error);
}