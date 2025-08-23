#!/usr/bin/env ts-node

/**
 * OpenAI GPT Example
 * 
 * This example shows how to use browser-use with OpenAI GPT models.
 * Make sure to set OPENAI_API_KEY in your environment variables.
 */

import { BrowserUse } from '../../src/index';
import { ChatOpenAI } from '../../src/llm/providers/openai';

async function main() {
  console.log('Starting OpenAI GPT example...');
  
  try {
    // Create OpenAI provider with GPT-4
    const llmProvider = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o', // Use the latest GPT-4 model
      temperature: 0.1,
      maxTokens: 4096
    });
    
    // Create browser-use instance with GPT-4
    const browserUse = new BrowserUse({
      llm: llmProvider
    });
    
    // Perform a task that leverages GPT-4's strong reasoning capabilities
    const result = await browserUse.run(
      'Go to Wikipedia and research the topic "Machine Learning". ' +
      'Find the main categories of machine learning and create a summary ' +
      'that explains the differences between supervised, unsupervised, and reinforcement learning. ' +
      'Include examples of real-world applications for each type.',
      {
        headless: false,
        viewportSize: { width: 1400, height: 900 }
      }
    );
    
    console.log('GPT-4 Research Summary:');
    console.log(result.messages);
    
    // Show token usage if available
    if (result.usage) {
      console.log('\n📊 Token Usage:');
      console.log(`Input tokens: ${result.usage.inputTokens}`);
      console.log(`Output tokens: ${result.usage.outputTokens}`);
      console.log(`Total tokens: ${result.usage.totalTokens}`);
    }
    
  } catch (error) {
    console.error('Error running OpenAI example:', error);
    if (error.message?.includes('API key')) {
      console.log('💡 Make sure to set your OPENAI_API_KEY environment variable');
    }
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}