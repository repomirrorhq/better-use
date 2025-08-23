/**
 * Multi-tab example showing agent tab management capabilities.
 * 
 * This demonstrates how the agent can open multiple browser tabs
 * and navigate between them during task execution.
 */

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';

// video: https://preview.screen.studio/share/clenCmS6
const llm = new ChatOpenAI({
  model: 'gpt-4-turbo',
  apiKey: process.env.OPENAI_API_KEY!
});

const agent = new Agent({
  task: 'open 3 tabs with elon musk, sam altman, and steve jobs, then go back to the first and stop',
  llm,
});

async function main() {
  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}