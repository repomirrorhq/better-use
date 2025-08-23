/**
 * Getting Started Example 4: Multi-Step Task
 * 
 * This example demonstrates how to:
 * - Perform a complex workflow with multiple steps
 * - Navigate between different pages  
 * - Combine search, form filling, and data extraction
 * - Handle a realistic end-to-end scenario
 * 
 * This is the most advanced getting started example, combining all previous concepts.
 */

import { Agent } from '../../src/index.js';
import { ChatOpenAI } from '../../src/llm/providers/openai.js';

async function main() {
  // Initialize the model
  const llm = new ChatOpenAI({ 
    model: 'gpt-4.1-mini',
    apiKey: process.env.OPENAI_API_KEY
  });

  // Define a multi-step task
  const task = `
    I want you to research Python web scraping libraries. Here's what I need:
    
    1. First, search Google for "best Python web scraping libraries 2024"
    2. Find a reputable article or blog post about this topic
    3. From that article, extract the top 3 recommended libraries
    4. For each library, visit its official website or GitHub page
    5. Extract key information about each library:
       - Name
       - Brief description
       - Main features or advantages
       - GitHub stars (if available)
    
    Present your findings in a summary format comparing the three libraries.
  `;

  // Create and run the agent
  const agent = new Agent({ task, llm });
  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}