/**
 * Example of file system operations with browser automation.
 * 
 * This demonstrates how the agent can read web content and save it to files.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';

const SCRIPT_DIR = path.dirname(__filename);
const agentDir = path.join(SCRIPT_DIR, 'file_system');
const conversationDir = path.join(agentDir, 'conversations', 'conversation');

// Ensure directories exist
await fs.mkdir(agentDir, { recursive: true });
console.log(`Agent logs directory: ${agentDir}`);

const task = `
Go to https://mertunsall.github.io/posts/post1.html
Save the title of the article in "data.md"
Then, use append_file to add the first sentence of the article to "data.md"
Then, read the file to see its content and make sure it's correct.
Finally, share the file with me.

NOTE: DO NOT USE extract_structured_data action - everything is visible in browser state.
`.trim();

const llm = new ChatOpenAI({
  model: 'gpt-4-turbo',
  apiKey: process.env.OPENAI_API_KEY!
});

const agent = new Agent({
  task,
  llm,
  saveConversationPath: conversationDir,
  fileSystemPath: path.join(agentDir, 'fs'),
});

async function main() {
  const agentHistory = await agent.run();
  console.log(`Final result: ${agentHistory.finalResult()}`, { flush: true } as any);

  // Wait for user input before cleanup
  console.log('Press Enter to clean the file system...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', async () => {
    try {
      // Clean the file system
      await fs.rm(path.join(agentDir, 'fs'), { recursive: true, force: true });
      console.log('File system cleaned up.');
      process.exit(0);
    } catch (error) {
      console.error('Error cleaning up file system:', error);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  main().catch(console.error);
}