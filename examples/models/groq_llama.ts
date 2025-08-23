import { Agent, ChatGroq } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

// Get API key from environment
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error('GROQ_API_KEY is not set');
}

// Initialize Groq LLM with Llama 4 model
const llm = new ChatGroq({
  model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
  api_key: apiKey,
  temperature: 0.1,
});

// Available Groq models
const groqModels = {
  llama4_maverick: 'meta-llama/llama-4-maverick-17b-128e-instruct',
  llama4_scout: 'meta-llama/llama-4-scout-17b-16e-instruct',
  llama3_70b: 'llama-3.3-70b-versatile',
  llama3_8b: 'llama-3.1-8b-instant',
  mixtral: 'mixtral-8x7b-32768',
  gemma: 'gemma2-9b-it',
  qwen: 'qwen/qwen3-32b',
  kimi: 'moonshotai/kimi-k2-instruct',
  gpt_oss_20b: 'openai/gpt-oss-20b',
  gpt_oss_120b: 'openai/gpt-oss-120b',
};

async function main() {
  const task = 'Go to amazon.com, search for laptop, sort by best rating, and give me the price of the first result';
  
  const agent = new Agent({
    task,
    llm,
    maxStepsPerRun: 20
  });

  const history = await agent.run();
  
  console.log('\nAgent completed the Amazon laptop search!');
  console.log(`Total steps: ${history.length}`);
  
  if (history.usage) {
    console.log(`Token usage: ${history.usage.total_tokens} total tokens`);
    console.log(`Prompt tokens: ${history.usage.prompt_tokens}`);
    console.log(`Completion tokens: ${history.usage.completion_tokens}`);
  }
}

// Example testing different Groq models
async function testGroqModels() {
  const testTask = 'Go to google.com and search for "Groq AI inference" and tell me the first result title';
  
  // Test a few different models
  const modelsToTest = ['llama4_maverick', 'llama3_70b', 'mixtral', 'llama3_8b'];
  
  for (const modelKey of modelsToTest) {
    const modelId = groqModels[modelKey as keyof typeof groqModels];
    console.log(`\n--- Testing ${modelKey} (${modelId}) ---`);
    
    const testLLM = new ChatGroq({
      model: modelId,
      api_key: apiKey,
      temperature: 0.1,
    });

    const agent = new Agent({
      task: testTask,
      llm: testLLM,
      maxStepsPerRun: 8
    });

    try {
      const history = await agent.run();
      console.log(`✅ ${modelKey}: ${history.length} steps completed`);
      if (history.usage) {
        console.log(`   Tokens: ${history.usage.total_tokens} total`);
      }
    } catch (error) {
      console.log(`❌ ${modelKey}: Error - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Example with structured output using Llama 4
async function testStructuredOutput() {
  const { z } = await import('zod');
  
  const ProductSchema = z.object({
    name: z.string().describe('Product name'),
    price: z.string().describe('Product price'),
    rating: z.number().describe('Product rating out of 5'),
    availability: z.string().describe('Product availability status'),
  });

  // Use a model that supports JSON schema
  const structuredLLM = new ChatGroq({
    model: groqModels.llama4_maverick, // Supports JSON schema
    api_key: apiKey,
    temperature: 0.1,
  });

  const agent = new Agent({
    task: 'Go to amazon.com, search for "wireless earbuds", and get details of the first product',
    llm: structuredLLM,
    maxStepsPerRun: 15,
    outputSchema: ProductSchema
  });

  try {
    const result = await agent.run();
    console.log('\n--- Structured Output Example (Llama 4) ---');
    console.log('Extracted product data:', result.data);
    if (result.usage) {
      console.log(`Token usage: ${result.usage.total_tokens} total`);
    }
  } catch (error) {
    console.log('❌ Structured output example failed:', error instanceof Error ? error.message : String(error));
  }
}

// Example with tool calling model
async function testToolCalling() {
  const { z } = await import('zod');
  
  const SearchResultSchema = z.object({
    title: z.string().describe('Page title'),
    url: z.string().describe('Current URL'),
    search_term: z.string().describe('What was searched for'),
    first_result_text: z.string().describe('Text of the first search result'),
  });

  // Use a model that supports tool calling
  const toolLLM = new ChatGroq({
    model: groqModels.kimi, // Supports tool calling
    api_key: apiKey,
    temperature: 0.1,
  });

  const agent = new Agent({
    task: 'Go to google.com, search for "Groq LPU inference", and extract information about the first result',
    llm: toolLLM,
    maxStepsPerRun: 10,
    outputSchema: SearchResultSchema
  });

  try {
    const result = await agent.run();
    console.log('\n--- Tool Calling Example (Kimi) ---');
    console.log('Extracted search data:', result.data);
    if (result.usage) {
      console.log(`Token usage: ${result.usage.total_tokens} total`);
    }
  } catch (error) {
    console.log('❌ Tool calling example failed:', error instanceof Error ? error.message : String(error));
  }
}

if (require.main === module) {
  // Run the main Llama 4 example
  main()
    .then(() => {
      console.log('\nMain Groq Llama 4 example completed!');
      // Uncomment to test different models
      // return testGroqModels();
    })
    .then(() => {
      // Uncomment to test structured output
      // return testStructuredOutput();
    })
    .then(() => {
      // Uncomment to test tool calling
      // return testToolCalling();
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { llm, groqModels };