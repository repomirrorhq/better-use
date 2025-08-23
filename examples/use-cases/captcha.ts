/**
 * Goal: Automates CAPTCHA solving on a demo website.
 *
 * Simple try of the agent for CAPTCHA solving.
 * @dev You need to add OPENAI_API_KEY to your environment variables.
 * 
 * NOTE: CAPTCHAs are hard. For this example it works, but e.g. for iframes it does not.
 * For this example it helps to zoom in and use vision models.
 * 
 * SECURITY NOTE: This is for educational/testing purposes only. 
 * Always respect website terms of service and use responsibly.
 */

import { Agent } from '../../src/agent/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';

async function main() {
  console.log('Starting CAPTCHA solving example...');
  console.log('NOTE: This is for educational purposes only');
  
  const llm = new ChatOpenAI({
    modelName: 'gpt-4.1-mini',
    temperature: 0.1,
    maxTokens: 4000
  });
  
  const agent = new Agent({
    task: 'Go to https://captcha.com/demos/features/captcha-demo.aspx and solve the captcha',
    llm,
    // Enable vision for better CAPTCHA recognition
    useVision: true
  });

  try {
    console.log('Target: https://captcha.com/demos/features/captcha-demo.aspx');
    console.log('Task: Solve the CAPTCHA on the demo page');
    
    const result = await agent.run({ maxSteps: 15 });
    
    console.log('\n=== CAPTCHA Solving Result ===');
    console.log('Steps taken:', result.history.length);
    
    // Show the final result
    const lastMessage = result.history[result.history.length - 1];
    if (lastMessage && lastMessage.result) {
      console.log('Final result:', lastMessage.result);
    }
    
    // Display token usage if available
    if (result.usage) {
      console.log('\n=== Usage Statistics ===');
      console.log('Total tokens:', result.usage.totalTokens);
      console.log('Vision tokens (if used):', result.usage.completionTokens);
      console.log('Text tokens:', result.usage.promptTokens);
      
      if (result.usage.totalCost) {
        console.log('Estimated cost: $', result.usage.totalCost.toFixed(4));
      }
    }
    
    // Show action breakdown
    console.log('\n=== Actions Taken ===');
    result.history.forEach((step, index) => {
      if (step.action) {
        console.log(`Step ${index + 1}: ${step.action.action}`);
      }
    });
    
    console.log('\nCAPTCHA solving completed. Press Enter to exit...');
    process.stdin.setRawMode?.(true);
    await new Promise(resolve => process.stdin.once('data', resolve));
    
  } catch (error) {
    console.error('Error solving CAPTCHA:', error);
    console.log('Tips:');
    console.log('- Make sure OPENAI_API_KEY is set');
    console.log('- CAPTCHAs can be challenging even for AI');
    console.log('- Try with different models if this fails');
    console.log('- Ensure the website allows automated access');
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(console.error);
}