/**
 * Goal: Checks for available visa appointment slots on the Greece MFA website.
 * 
 * This example demonstrates:
 * - Custom controller actions for providing website URLs
 * - Multi-step appointment checking logic
 * - Vision-enabled browsing for better page understanding
 * - Structured data modeling with validation
 */

import { Agent } from '../../src/agent/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';
import { Controller } from '../../src/controller/index.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set. Please add it to your environment variables.');
}

// Create controller for custom actions
const controller = new Controller();

// Define webpage information structure
interface WebpageInfo {
  link: string;
}

// Register custom action to provide the MFA webpage link
controller.registerAction({
  name: 'go_to_webpage',
  description: 'Go to the webpage',
  parameters: {
    type: 'object',
    properties: {
      link: {
        type: 'string',
        default: 'https://appointment.mfa.gr/en/reservations/aero/ireland-grcon-dub/',
        description: 'The MFA appointment webpage URL'
      }
    },
    required: ['link']
  },
  handler: async (params: WebpageInfo) => {
    console.log(`Navigating to: ${params.link}`);
    return params.link;
  }
});

async function main(): Promise<void> {
  console.log('Starting Greece MFA appointment checker...');
  
  const task = [
    'Go to the Greece MFA webpage via the link I provided you.',
    'Check the visa appointment dates. If there is no available date in this month, check the next month.',
    'If there is no available date in both months, tell me there is no available date.'
  ].join(' ');

  const model = new ChatOpenAI({
    modelName: 'gpt-4.1-mini',
    temperature: 0.1,
    maxTokens: 4000
  });

  const agent = new Agent({
    task,
    llm: model,
    controller,
    useVision: true
  });

  try {
    console.log('Task: Check Greece MFA visa appointment availability');
    console.log('Target: Ireland-Greece consulate appointments');
    
    const result = await agent.run({ maxSteps: 20 });
    
    console.log('\n=== Appointment Check Results ===');
    console.log('Steps taken:', result.history.length);
    
    // Show the final result
    const lastMessage = result.history[result.history.length - 1];
    if (lastMessage && lastMessage.result) {
      console.log('\n=== Availability Status ===');
      console.log(lastMessage.result);
    }
    
    // Display token usage if available
    if (result.usage) {
      console.log('\n=== Usage Statistics ===');
      console.log('Total tokens:', result.usage.totalTokens);
      console.log('Vision tokens:', result.usage.completionTokens);
      console.log('Text tokens:', result.usage.promptTokens);
      
      if (result.usage.totalCost) {
        console.log('Estimated cost: $', result.usage.totalCost.toFixed(4));
      }
    }
    
    // Show custom actions used
    console.log('\n=== Custom Actions Available ===');
    console.log('- go_to_webpage: Navigate to MFA appointment page');
    
    // Show step breakdown
    console.log('\n=== Actions Taken ===');
    result.history.forEach((step, index) => {
      if (step.action) {
        console.log(`Step ${index + 1}: ${step.action.action}`);
      }
    });
    
  } catch (error) {
    console.error('Error checking appointments:', error);
    console.log('Tips:');
    console.log('- Make sure OPENAI_API_KEY is set');
    console.log('- The MFA website may have anti-bot measures');
    console.log('- Appointment availability changes frequently');
    console.log('- Use this responsibly and respect website terms');
  }
}

if (require.main === module) {
  main().catch(console.error);
}