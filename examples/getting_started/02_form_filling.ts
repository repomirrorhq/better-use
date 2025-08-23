#!/usr/bin/env ts-node

/**
 * Form Filling Example
 * 
 * This example demonstrates how to use browser-use to fill out forms
 * on web pages automatically.
 */

import { BrowserUse } from '../../src/index';

async function main() {
  console.log('Starting form filling example...');
  
  try {
    const browserUse = new BrowserUse();
    
    // Example: Fill out a contact form
    const result = await browserUse.run(
      'Go to https://httpbin.org/forms/post and fill out the contact form with the following information:\n' +
      '- Customer Name: John Doe\n' +
      '- Telephone: +1-555-123-4567\n' +
      '- Email: john.doe@example.com\n' +
      '- Subject: Technical Support\n' +
      '- Message: I need help setting up browser automation with TypeScript.\n' +
      'After filling the form, click Submit and tell me what response you get.',
      {
        headless: false,
        viewportSize: { width: 1280, height: 720 }
      }
    );
    
    console.log('Form filling result:');
    console.log(result.messages);
    
    // Show screenshots if any were taken
    if (result.screenshots && result.screenshots.length > 0) {
      console.log(`Screenshots saved: ${result.screenshots.length} files`);
    }
    
  } catch (error) {
    console.error('Error during form filling:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}