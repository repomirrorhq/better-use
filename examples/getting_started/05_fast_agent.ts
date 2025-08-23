/**
 * Getting Started Example 5: Fast Agent
 * 
 * This example demonstrates performance optimization techniques:
 * - Using fast LLMs for quick inference
 * - Optimizing browser settings for speed
 * - Enabling flash mode for rapid execution
 * - Structuring tasks for maximum efficiency
 */

import { Agent, BrowserProfile } from '../../src/index.js';
import { ChatGroq } from '../../src/llm/providers/groq.js';

// Speed optimization instructions for the model
const SPEED_OPTIMIZATION_PROMPT = `
SPEED OPTIMIZATION INSTRUCTIONS:
- Be extremely concise and direct in your responses
- Get to the goal as quickly as possible
- Use multi-action sequences whenever possible to reduce steps
`;

async function main() {
  // 1. Use fast LLM - Llama 4 on Groq for ultra-fast inference
  const llm = new ChatGroq({
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    temperature: 0.0,
    apiKey: process.env.GROQ_API_KEY
  });

  // Alternative fast option with Google Gemini Flash
  // const llm = new ChatGoogle({ 
  //   model: 'gemini-2.5-flash',
  //   apiKey: process.env.GOOGLE_API_KEY 
  // });

  // 2. Create speed-optimized browser profile
  const browserProfile = new BrowserProfile({
    minimumWaitPageLoadTime: 0.1,
    waitBetweenActions: 0.1,
    headless: false,
  });

  // 3. Define a speed-focused task
  const task = `
    1. Go to reddit https://www.reddit.com/search/?q=browser+agent&type=communities 
    2. Click directly on the first 5 communities to open each in new tabs
    3. Find out what the latest post is about, and switch directly to the next tab
    4. Return the latest post summary for each page
  `;

  // 4. Create agent with all speed optimizations
  const agent = new Agent({
    task,
    llm,
    flashMode: true,  // Disables thinking in the LLM output for maximum speed
    browserProfile,
    extendSystemMessage: SPEED_OPTIMIZATION_PROMPT,
  });

  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}