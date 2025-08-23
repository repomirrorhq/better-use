#!/usr/bin/env ts-node

/**
 * Basic Search Example
 * 
 * This example demonstrates how to use browser-use to perform a basic search
 * on Google and extract information from the results.
 */

import { BrowserUse } from '../../src/index';

async function main() {
  console.log('Starting basic search example...');
  
  try {
    // Create a new browser-use instance
    // Make sure to set your LLM API key in environment variables
    // For OpenAI: OPENAI_API_KEY=your_key
    // For Anthropic: ANTHROPIC_API_KEY=your_key
    const browserUse = new BrowserUse();
    
    // Run a simple search task
    const result = await browserUse.run(
      'Go to Google and search for "TypeScript browser automation". ' +
      'Tell me the title of the first result.',
      {
        // Optional: Use headless mode for faster execution
        headless: false,
        // Optional: Set viewport size
        viewportSize: { width: 1280, height: 720 }
      }
    );
    
    console.log('Task Result:');
    console.log(result.messages);
    
    if (result.screenshots && result.screenshots.length > 0) {
      console.log(`Screenshots saved: ${result.screenshots.length} files`);
    }
    
  } catch (error) {
    console.error('Error during task execution:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}