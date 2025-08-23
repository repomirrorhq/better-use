import { Agent, BrowserProfile, BrowserSession, ChatGoogle } from '../../src';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';

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
  temperature: 0.1
});

// Configure browser with custom downloads directory
const downloadsPath = join(homedir(), 'Downloads');
const browserSession = new BrowserSession({
  browserProfile: new BrowserProfile({ 
    downloads_path: downloadsPath,
    headless: false // Show browser so we can see the download happening
  })
});

async function runDownload() {
  console.log(`Downloads will be saved to: ${downloadsPath}`);

  const agent = new Agent({
    task: 'Go to "https://file-examples.com/" and download the smallest doc file.',
    llm,
    browserSession,
    maxStepsPerRun: 25
  });

  const history = await agent.run();

  console.log('\nAgent completed the download task!');
  console.log(`Total steps: ${history.length}`);
  
  if (history.usage) {
    console.log(`Token usage: ${history.usage.total_tokens} total tokens`);
  }

  // Show downloaded files info
  if (browserSession.downloadedFiles && browserSession.downloadedFiles.length > 0) {
    console.log('\nDownloaded files:');
    browserSession.downloadedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.filename} (${file.size ? `${file.size} bytes` : 'size unknown'})`);
      console.log(`     Path: ${file.path}`);
    });
  } else {
    console.log('\nNo files were downloaded or download tracking not available');
  }
}

// Example with different file types
async function downloadDifferentFileTypes() {
  const tasks = [
    {
      task: 'Go to https://file-examples.com/ and download a small PDF file',
      description: 'PDF download'
    },
    {
      task: 'Go to https://file-examples.com/ and download a small image file (PNG or JPG)',
      description: 'Image download'  
    },
    {
      task: 'Go to https://file-examples.com/ and download a small Excel file',
      description: 'Excel download'
    }
  ];

  for (const { task, description } of tasks) {
    console.log(`\n--- ${description} ---`);
    
    const agent = new Agent({
      task,
      llm,
      browserSession,
      maxStepsPerRun: 15
    });

    try {
      await agent.run();
      console.log(`✅ ${description} completed`);
    } catch (error) {
      console.log(`❌ ${description} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function cleanupExample() {
  // Clean up browser session
  try {
    await browserSession.close();
    console.log('Browser session closed successfully');
  } catch (error) {
    console.error('Error closing browser session:', error);
  }
}

if (require.main === module) {
  // Run the main download example
  runDownload()
    .then(() => {
      console.log('\nMain download example completed!');
      // Uncomment to test different file types
      // return downloadDifferentFileTypes();
    })
    .then(() => {
      return cleanupExample();
    })
    .catch(error => {
      console.error('Error:', error);
      cleanupExample().finally(() => process.exit(1));
    });
}

export { browserSession };