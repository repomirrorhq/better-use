/**
 * Example of implementing file upload functionality.
 * 
 * This shows how to upload files to file input elements on web pages.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { Agent } from '../../src/agent';
import { Controller } from '../../src/controller';
import { ActionResult } from '../../src/agent/views';
import { BrowserSession } from '../../src/browser/session';
import { ChatOpenAI } from '../../src/llm/providers/openai';

// Initialize controller
const controller = new Controller();

// Register custom upload file action
controller.action(
  'Upload file to interactive element with file path',
  async (params: {
    index: number;
    path: string;
    browser_session: BrowserSession;
    available_file_paths: string[];
  }) => {
    const { index, path: filePath, browser_session, available_file_paths } = params;

    if (!available_file_paths.includes(filePath)) {
      return ActionResult.error(`File path ${filePath} is not available`);
    }

    try {
      // Check if file exists
      await fs.access(filePath);
    } catch {
      return ActionResult.error(`File ${filePath} does not exist`);
    }

    try {
      // Get the DOM element by index
      const domElement = await browser_session.getDomElementByIndex(index);

      if (!domElement) {
        const msg = `No element found at index ${index}`;
        console.log(msg);
        return ActionResult.error(msg);
      }

      // Check if it's a file input element
      if (domElement.tagName?.toLowerCase() !== 'input' || 
          domElement.attributes?.type !== 'file') {
        const msg = `Element at index ${index} is not a file input element`;
        console.log(msg);
        return ActionResult.error(msg);
      }

      // Upload the file using the browser session
      await browser_session.uploadFile(index, filePath);

      const msg = `Successfully uploaded file to index ${index}`;
      console.log(msg);
      return ActionResult.success(msg, { includeInMemory: true });

    } catch (error) {
      const msg = `Failed to upload file to index ${index}: ${error instanceof Error ? error.message : String(error)}`;
      console.log(msg);
      return ActionResult.error(msg);
    }
  }
);

async function main() {
  const browserSession = new BrowserSession();
  await browserSession.start();
  
  const llm = new ChatOpenAI({
    model: 'gpt-4-turbo',
    apiKey: process.env.OPENAI_API_KEY!
  });

  // List of file paths the agent is allowed to upload
  // In a real scenario, you'd want to be very careful about what files
  // the agent can access and upload
  const availableFilePaths = [
    '/tmp/test_document.pdf',
    '/tmp/test_image.jpg',
  ];

  // Create test files if they don't exist
  for (const filePath of availableFilePaths) {
    try {
      await fs.access(filePath);
    } catch {
      // File doesn't exist, create it
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'Test file content for upload example');
    }
  }

  // Create the agent with file upload capability
  const agent = new Agent({
    task: `
      Go to https://www.w3schools.com/howto/howto_html_file_upload_button.asp and try to upload one of the available test files.
    `,
    llm,
    browserSession,
    controller,
    // Pass the available file paths to the controller context
    customContext: { available_file_paths: availableFilePaths },
  });

  // Run the agent
  await agent.run(10);

  // Cleanup
  await browserSession.kill();

  // Clean up test files
  for (const filePath of availableFilePaths) {
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist, ignore error
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}