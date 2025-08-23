/**
 * Example of PDF processing and data extraction.
 * 
 * This demonstrates downloading and analyzing PDF documents.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { BrowserSession } from '../../src/browser/session';

const SCRIPT_DIR = path.dirname(__filename);
const agentDir = path.join(SCRIPT_DIR, 'alphabet_earnings');

// Ensure directory exists
await fs.mkdir(agentDir, { recursive: true });

const llm = new ChatOpenAI({
  model: 'gpt-4-turbo',
  apiKey: process.env.OPENAI_API_KEY!
});

const browserSession = new BrowserSession({
  browserProfile: {
    downloadsPath: path.join(agentDir, 'downloads')
  }
});

const task = `
Go to https://abc.xyz/assets/cc/27/3ada14014efbadd7a58472f1f3f4/2025q2-alphabet-earnings-release.pdf.
Read the PDF and save 3 interesting data points in "alphabet_earnings.md" and share it with me!
`.trim();

const agent = new Agent({
  task,
  llm,
  browserSession,
  fileSystemPath: path.join(agentDir, 'fs'),
  flashMode: true,
});

async function main() {
  const agentHistory = await agent.run();
  
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