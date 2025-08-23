/**
 * Parallel agents example showing concurrent task execution.
 * 
 * This demonstrates running multiple agents simultaneously
 * in the same browser session for parallel task processing.
 * 
 * NOTE: This is experimental - multiple agents running in the same browser session.
 */

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { BrowserSession } from '../../src/browser/session';

const browserSession = new BrowserSession({
  browserProfile: {
    keepAlive: true,
    headless: false,
    recordVideoDir: './tmp/recordings',
    userDataDir: '~/.config/browseruse/profiles/default',
  }
});

const llm = new ChatOpenAI({
  model: 'gpt-4-turbo',
  apiKey: process.env.OPENAI_API_KEY!
});

async function main() {
  await browserSession.start();
  
  const agents = [
    'Search Google for weather in Tokyo',
    'Check Reddit front page title',
    'Look up Bitcoin price on Coinbase',
    // 'Find NASA image of the day',
    // 'Check top story on CNN',
    // 'Search latest SpaceX launch date',
    // 'Look up population of Paris',
    // 'Find current time in Sydney',
    // 'Check who won last Super Bowl',
    // 'Search trending topics on Twitter',
  ].map(task => new Agent({ task, llm, browserSession }));

  console.log(await Promise.all(agents.map(agent => agent.run())));
  await browserSession.kill();
}

if (require.main === module) {
  main().catch(console.error);
}