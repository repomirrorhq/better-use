/**
 * Example of creating CSV/Excel-like files with stock data.
 * 
 * This shows how the agent can research information and create structured files.
 */

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';

const llm = new ChatOpenAI({
  model: 'gpt-4-turbo',
  apiKey: process.env.OPENAI_API_KEY!
});

const task = 'Find current stock price of companies Meta and Amazon. Then, make me a CSV file with 2 columns: company name, stock price.';

const agent = new Agent({ 
  task, 
  llm 
});

async function main() {
  const startTime = Date.now();
  
  const history = await agent.run();
  
  // Token usage
  console.log('Usage:', history.usage);
  
  const endTime = Date.now();
  console.log(`Time taken: ${(endTime - startTime) / 1000} seconds`);
}

if (require.main === module) {
  main().catch(console.error);
}