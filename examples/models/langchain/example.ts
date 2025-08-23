/**
 * Example of using LangChain models with browser-use.
 * 
 * This example demonstrates how to:
 * 1. Wrap a LangChain model with ChatLangChain
 * 2. Use it with a browser-use Agent
 * 3. Run a simple web automation task
 * 
 * @file purpose: Example usage of LangChain integration with browser-use
 */

import { ChatOpenAI } from '@langchain/openai';
import { Agent } from '../../../src/agent/index.js';
import { ChatLangChain } from './chat.js';

async function main(): Promise<void> {
  console.log('🌐 Browser-use LangChain Integration Example');
  console.log('='.repeat(45));

  try {
    // Create a LangChain model (OpenAI)
    const langchainModel = new ChatOpenAI({
      model: 'gpt-4.1-mini',
      temperature: 0.1,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Wrap it with ChatLangChain to make it compatible with browser-use
    const llm = new ChatLangChain({ chat: langchainModel });

    // Create a simple task
    const task = "Go to google.com and search for 'browser automation with TypeScript'";

    console.log(`🚀 Starting task: ${task}`);
    console.log(`🤖 Using model: ${llm.name} (provider: ${llm.provider})`);

    // Create and run the agent
    const agent = new Agent({
      task,
      llm,
    });

    // Run the agent
    const result = await agent.run();

    console.log(`✅ Task completed! Steps taken: ${result.history.length}`);

    // Print the final result if available
    if (result.extractedContent) {
      console.log(`📋 Final result: ${result.extractedContent}`);
    }

    // Print usage statistics
    if (result.history.usage) {
      console.log('\n📊 Usage Statistics:');
      console.log(`Total tokens: ${result.history.usage.total_tokens}`);
      console.log(`Prompt tokens: ${result.history.usage.prompt_tokens}`);
      console.log(`Completion tokens: ${result.history.usage.completion_tokens}`);
      if (result.history.usage.total_cost) {
        console.log(`Total cost: $${result.history.usage.total_cost.toFixed(4)}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error running LangChain integration:', error);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure you have installed the required dependencies:');
    console.log('   npm install @langchain/openai @langchain/core');
    console.log('2. Set your OpenAI API key:');
    console.log('   export OPENAI_API_KEY="your-api-key"');
    console.log('3. Make sure the browser-use project is built:');
    console.log('   npm run build');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to run LangChain integration example:', error);
    process.exit(1);
  });
}