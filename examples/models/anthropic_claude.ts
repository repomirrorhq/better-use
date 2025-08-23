#!/usr/bin/env ts-node

/**
 * Anthropic Claude Example
 * 
 * This example shows how to use browser-use with Claude models.
 * Make sure to set ANTHROPIC_API_KEY in your environment variables.
 */

import { BrowserUse } from '../../src/index';
import { ChatAnthropic } from '../../src/llm/providers/anthropic';

async function main() {
  console.log('Starting Anthropic Claude example...');
  
  try {
    // Create Claude provider
    const llmProvider = new ChatAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-5-sonnet-20241022', // Use the latest Claude model
      maxTokens: 4096,
      temperature: 0.1
    });
    
    // Create browser-use instance with Claude
    const browserUse = new BrowserUse({
      llm: llmProvider
    });
    
    // Run a complex research task that benefits from Claude's capabilities
    const result = await browserUse.run(
      'Please research the latest developments in AI safety. ' +
      'Go to https://www.anthropic.com/research and find 3 recent research papers. ' +
      'For each paper, provide the title, a brief summary, and why it\'s important for AI safety.',
      {
        headless: false,
        viewportSize: { width: 1400, height: 900 }
      }
    );
    
    console.log('Research Results:');
    console.log(result.messages);
    
    // Generate a GIF if the feature is available
    if (result.gifPath) {
      console.log(`📹 Task GIF saved at: ${result.gifPath}`);
    }
    
  } catch (error) {
    console.error('Error running Claude example:', error);
    if (error.message?.includes('API key')) {
      console.log('💡 Make sure to set your ANTHROPIC_API_KEY environment variable');
    }
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}