import { Agent, ChatOpenRouter } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

// Get API key from environment
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is not set');
}

// Initialize OpenRouter LLM with different models
const models = {
  grok: 'x-ai/grok-2-1212',
  claude: 'anthropic/claude-3.5-sonnet:beta',
  gpt4: 'openai/gpt-4o-2024-08-06',
  gemini: 'google/gemini-2.0-flash-exp:free',
  llama: 'meta-llama/llama-3.3-70b-instruct:free',
};

// Create LLM instance with Grok model
const llm = new ChatOpenRouter({
  model: models.grok,
  api_key: apiKey,
  temperature: 0.1,
  http_referer: 'https://github.com/Yonom/browser-use-ts', // Optional: helps with OpenRouter attribution
});

async function runSearch() {
  const agent = new Agent({
    task: 'Go to example.com, click on the first link, and give me the title of the page',
    llm,
    maxStepsPerRun: 10
  });

  const history = await agent.run();
  
  console.log('\nAgent completed the task!');
  console.log(`Total steps: ${history.length}`);
  
  if (history.usage) {
    console.log(`Token usage: ${history.usage.total_tokens} total tokens`);
    console.log(`Prompt tokens: ${history.usage.prompt_tokens}`);
    console.log(`Completion tokens: ${history.usage.completion_tokens}`);
  }
}

// Example with different OpenRouter models
async function testDifferentModels() {
  const testTask = 'Go to google.com and search for "OpenRouter API" then tell me the first result title';
  
  for (const [name, modelId] of Object.entries(models)) {
    console.log(`\n--- Testing with ${name} (${modelId}) ---`);
    
    const testLLM = new ChatOpenRouter({
      model: modelId,
      api_key: apiKey,
      temperature: 0.1,
      http_referer: 'https://github.com/Yonom/browser-use-ts',
    });

    const agent = new Agent({
      task: testTask,
      llm: testLLM,
      maxStepsPerRun: 8
    });

    try {
      const history = await agent.run();
      console.log(`✅ ${name}: ${history.length} steps completed`);
      if (history.usage) {
        console.log(`   Token usage: ${history.usage.total_tokens} total`);
      }
    } catch (error) {
      console.log(`❌ ${name}: Error - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Example with structured output
async function testStructuredOutput() {
  const { z } = await import('zod');
  
  const OutputSchema = z.object({
    title: z.string().describe('The title of the webpage'),
    url: z.string().describe('The current URL'),
    first_link_text: z.string().describe('Text of the first link clicked'),
  });

  const structuredLLM = new ChatOpenRouter({
    model: models.claude, // Use Claude for structured output
    api_key: apiKey,
    temperature: 0.1,
  });

  const agent = new Agent({
    task: 'Go to example.com, click on the first link, and extract the page information',
    llm: structuredLLM,
    maxStepsPerRun: 10,
    outputSchema: OutputSchema
  });

  try {
    const result = await agent.run();
    console.log('\n--- Structured Output Example ---');
    console.log('Extracted data:', result.data);
    if (result.usage) {
      console.log(`Token usage: ${result.usage.total_tokens} total`);
    }
  } catch (error) {
    console.log('❌ Structured output example failed:', error instanceof Error ? error.message : String(error));
  }
}

if (require.main === module) {
  // Run the main search example
  runSearch()
    .then(() => {
      console.log('\nMain OpenRouter example completed!');
      // Uncomment to test different models
      // return testDifferentModels();
    })
    .then(() => {
      // Uncomment to test structured output
      // return testStructuredOutput();
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { llm, models };