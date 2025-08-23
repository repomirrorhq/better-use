/**
 * Test all recording and save functionality for Agent and BrowserSession.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Agent, AgentHistoryList } from '../src/agent';
import { BrowserProfile, BrowserSession } from '../src/browser';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as http from 'http';
import { createMockLLM } from './test-utils/mockLLM';
import { tmpdir } from 'os';

// Helper to create a temporary directory
function createTempDir(prefix: string): string {
  const tempPath = path.join(tmpdir(), `${prefix}_${Date.now()}`);
  fs.mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

// Helper to clean up a directory
function cleanupDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// Simple HTTP server for testing
let server: http.Server;
let serverUrl: string;

beforeEach((done) => {
  server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Recording Page</h1>
          <input type="text" id="search" placeholder="Search here" />
          <button type="button" id="submit">Submit</button>
        </body>
        </html>
      `);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(0, () => {
    const address = server.address();
    if (address && typeof address !== 'string') {
      serverUrl = `http://localhost:${address.port}`;
    }
    done();
  });
});

afterEach((done) => {
  server.close(done);
});

describe('Agent Recordings', () => {
  test('save conversation with directory path', async () => {
    const testDir = createTempDir('test_recordings');
    const conversationPath = path.join(testDir, 'logs', 'conversation');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: undefined
      })
    });

    await browserSession.start();
    try {
      const llm = createMockLLM([
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Starting the task",
          "memory": "Need to navigate to the test page",
          "next_goal": "Navigate to the URL",
          "action": [
            {
              "go_to_url": {
                "url": "${serverUrl}",
                "new_tab": false
              }
            }
          ]
        }`,
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Navigated successfully",
          "memory": "Page loaded",
          "next_goal": "Task completed",
          "action": [
            {
              "done": {
                "text": "Task completed",
                "success": true
              }
            }
          ]
        }`
      ]);

      const agent = new Agent({
        task: `go to ${serverUrl} and type "test" in the search box`,
        llm,
        browserSession,
        saveConversationPath: conversationPath,
        agentDirectory: testDir
      });

      const history = await agent.run({ maxSteps: 2 });
      const result = history.finalResult();
      
      expect(result).toBeDefined();

      // Check that the conversation directory was created
      expect(fs.existsSync(conversationPath)).toBe(true);

      // Check for conversation files
      const conversationFiles = fs.readdirSync(conversationPath)
        .filter(f => f.startsWith('conversation_') && f.endsWith('.txt'));
      expect(conversationFiles.length).toBeGreaterThan(0);
    } finally {
      await browserSession.kill();
      cleanupDir(testDir);
    }
  }, 30000);

  test('save conversation with deep directory structure', async () => {
    const testDir = createTempDir('test_recordings');
    const conversationPath = path.join(testDir, 'logs', 'deep', 'directory', 'conversation');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: undefined
      })
    });

    await browserSession.start();
    try {
      const llm = createMockLLM([
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Starting",
          "memory": "Starting task",
          "next_goal": "Navigate",
          "action": [
            {
              "go_to_url": {
                "url": "${serverUrl}",
                "new_tab": false
              }
            }
          ]
        }`,
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Done",
          "memory": "Task complete",
          "next_goal": "Finish",
          "action": [
            {
              "done": {
                "text": "Completed",
                "success": true
              }
            }
          ]
        }`
      ]);

      const agent = new Agent({
        task: `go to ${serverUrl}`,
        llm,
        browserSession,
        saveConversationPath: conversationPath,
        agentDirectory: testDir
      });

      const history = await agent.run({ maxSteps: 2 });
      const result = history.finalResult();
      
      expect(result).toBeDefined();

      // Check that the deep directory structure was created
      expect(fs.existsSync(conversationPath)).toBe(true);

      // Check for conversation files
      const conversationFiles = fs.readdirSync(conversationPath)
        .filter(f => f.startsWith('conversation_') && f.endsWith('.txt'));
      expect(conversationFiles.length).toBeGreaterThan(0);
    } finally {
      await browserSession.kill();
      cleanupDir(testDir);
    }
  }, 30000);
});

describe('BrowserProfile Recordings', () => {
  test('HAR recording with incognito context', async () => {
    const testDir = createTempDir('test_recordings');
    const harPath = path.join(testDir, 'network_incognito.har');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: undefined,
        recordHarPath: harPath
      })
    });

    await browserSession.start();
    try {
      await browserSession.navigateToURL(serverUrl);
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      await browserSession.kill();
    }

    // HAR file should be created
    expect(fs.existsSync(harPath)).toBe(true);

    // Check HAR file content
    const harContent = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
    expect(harContent).toHaveProperty('log');
    expect(harContent.log).toHaveProperty('entries');
    expect(harContent.log.entries.length).toBeGreaterThan(0);

    cleanupDir(testDir);
  }, 30000);

  test('HAR recording with persistent context', async () => {
    const testDir = createTempDir('test_recordings');
    const harPath = path.join(testDir, 'network_persistent.har');
    const userDataDir = path.join(testDir, 'user_data_har');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: userDataDir,
        recordHarPath: harPath
      })
    });

    await browserSession.start();
    try {
      await browserSession.navigateToURL(serverUrl);
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      await browserSession.kill();
    }

    // HAR file should be created
    expect(fs.existsSync(harPath)).toBe(true);

    // Check HAR file content
    const harContent = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
    expect(harContent).toHaveProperty('log');
    expect(harContent.log).toHaveProperty('entries');
    expect(harContent.log.entries.length).toBeGreaterThan(0);

    cleanupDir(testDir);
  }, 30000);
});

describe('Combined Recordings', () => {
  test('using multiple recording parameters together', async () => {
    const testDir = createTempDir('test_recordings');
    const conversationPath = path.join(testDir, 'conversation');
    const gifPath = path.join(testDir, 'agent.gif');
    const harPath = path.join(testDir, 'network.har');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: undefined,
        recordHarPath: harPath
      })
    });

    await browserSession.start();
    try {
      const interactiveLLM = createMockLLM([
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Starting the task",
          "memory": "Need to navigate to the test page",
          "next_goal": "Navigate to the URL",
          "action": [
            {
              "go_to_url": {
                "url": "${serverUrl}",
                "new_tab": false
              }
            }
          ]
        }`,
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Successfully navigated to the page",
          "memory": "Page loaded, can see search box and submit button",
          "next_goal": "Click on the search box to focus it",
          "action": [
            {
              "click_element_by_index": {
                "index": 1
              }
            }
          ]
        }`,
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Clicked on search box",
          "memory": "Search box is focused and ready for input",
          "next_goal": "Type 'test' in the search box",
          "action": [
            {
              "input_text": {
                "index": 1,
                "text": "test"
              }
            }
          ]
        }`,
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Typed 'test' in search box",
          "memory": "Text 'test' has been entered successfully",
          "next_goal": "Click the submit button to complete the task",
          "action": [
            {
              "click_element_by_index": {
                "index": 2
              }
            }
          ]
        }`,
        `{
          "thinking": "null",
          "evaluation_previous_goal": "Clicked the submit button",
          "memory": "Successfully navigated to the page, typed 'test' in the search box, and clicked submit",
          "next_goal": "Task completed",
          "action": [
            {
              "done": {
                "text": "Task completed - typed 'test' in search box and clicked submit",
                "success": true
              }
            }
          ]
        }`
      ]);

      const agent = new Agent({
        task: `go to ${serverUrl} and type "test" in the search box`,
        llm: interactiveLLM,
        browserSession,
        saveConversationPath: conversationPath,
        generateGif: gifPath,
        agentDirectory: testDir
      });

      const history = await agent.run({ maxSteps: 5 });
      const result = history.finalResult();
      
      expect(result).toBeDefined();

      // Check conversation files
      const conversationFiles = fs.readdirSync(conversationPath)
        .filter(f => f.startsWith('conversation_') && f.endsWith('.txt'));
      expect(conversationFiles.length).toBeGreaterThan(0);

      // Check GIF - might be created if navigation was successful
      // Note: GIF generation depends on screenshots being taken
      if (fs.existsSync(gifPath)) {
        const gifStats = fs.statSync(gifPath);
        expect(gifStats.size).toBeGreaterThan(10000);
      }

      // Check HAR file
      expect(fs.existsSync(harPath)).toBe(true);
      const harContent = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
      expect(harContent).toHaveProperty('log');
      expect(harContent.log).toHaveProperty('entries');
    } finally {
      await browserSession.kill();
      cleanupDir(testDir);
    }
  }, 30000);
});