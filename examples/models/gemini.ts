import { Agent, ChatGoogle } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

// Get API key from environment
const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY is not set');
}

// Initialize Google/Gemini LLM
const llm = new ChatGoogle({ 
  model: 'gemini-2.0-flash-exp', 
  api_key: apiKey,
  temperature: 0.1,
  max_output_tokens: 4096
});

async function runSearch() {
  const agent = new Agent({
    task: 'Go to google.com/travel/flights and find the cheapest flight from New York to Paris on 2025-07-15',
    llm,
    maxStepsPerRun: 25
  });

  const history = await agent.run();
  
  console.log('\nAgent completed the flight search task!');
  console.log(`Total steps: ${history.length}`);
  
  if (history.usage) {
    console.log(`Token usage: ${history.usage.total_tokens} total tokens`);
  }
}

// Example usage with different Gemini models
async function demonstrateModels() {
  const models = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro', 
    'gemini-1.5-flash'
  ];

  for (const model of models) {
    console.log(`\n--- Testing with ${model} ---`);
    
    const testLLM = new ChatGoogle({ 
      model, 
      api_key: apiKey,
      temperature: 0.1
    });

    const agent = new Agent({
      task: 'Go to google.com and search for "TypeScript browser automation"',
      llm: testLLM,
      maxStepsPerRun: 5
    });

    try {
      const history = await agent.run();
      console.log(`✅ ${model}: ${history.length} steps completed`);
      if (history.usage) {
        console.log(`   Token usage: ${history.usage.total_tokens} total`);
      }
    } catch (error) {
      console.log(`❌ ${model}: Error - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (require.main === module) {
  // Run the main search example
  runSearch()
    .then(() => {
      console.log('\nMain example completed successfully!');
      // Uncomment to test different models
      // return demonstrateModels();
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { llm };