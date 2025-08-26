import { Agent, AgentHistoryList } from '../src/agent';
import { BrowserProfile, BrowserSession } from '../src/browser';
import { createMockLLM } from './test-utils/mockLLM';
import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';

jest.setTimeout(60000);

describe('Agent GIF Generation with Navigation', () => {
  let server: http.Server;
  let serverUrl: string;
  let tempDir: string;

  beforeAll((done) => {
    const app = express();
    
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page for GIF</title>
          <style>
            body {
              background-color: #f0f0f0;
              font-family: Arial, sans-serif;
              padding: 50px;
            }
            h1 {
              color: #333;
              font-size: 48px;
            }
            .content {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
          </style>
        </head>
        <body>
          <div class="content">
            <h1>Test Page for GIF Generation</h1>
            <p>This page has real content that should appear in the GIF.</p>
            <button id="test-button">Click Me</button>
          </div>
        </body>
        </html>
      `);
    });

    server = app.listen(0, () => {
      const address = server.address() as any;
      serverUrl = `http://localhost:${address.port}`;
      done();
    });

    // Create temp directory for test files
    tempDir = path.join(__dirname, 'temp-gif-tests');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll((done) => {
    server.close(done);
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('gif generation with real navigation', async () => {
    const navigateAction = JSON.stringify({
      action: [{ go_to_url: { url: serverUrl } }]
    });
    const doneAction = JSON.stringify({
      action: [{ done: { text: 'Navigated successfully', success: true } }]
    });
    
    const llmWithNavigation = createMockLLM([navigateAction, doneAction]);
    const gifPath = path.join(tempDir, 'test_agent.gif');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: undefined
      })
    });
    
    await browserSession.start();

    try {
      const agent = new Agent({
        task: `Navigate to ${serverUrl} and verify the page loads`,
        llm: llmWithNavigation,
        browserSession,
        generateGif: gifPath
      });

      const history: AgentHistoryList = await agent.run({ maxSteps: 3 });

      // Verify the task completed
      const result = history.finalResult();
      expect(result).toBeDefined();

      // Give a moment for GIF to be written
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify GIF was created
      expect(fs.existsSync(gifPath)).toBe(true);

      // Verify GIF has substantial content (not just placeholders)
      const gifStats = fs.statSync(gifPath);
      expect(gifStats.size).toBeGreaterThan(10000);

      // Verify history contains real screenshots (not placeholders)
      let hasRealScreenshot = false;
      const placeholderScreenshot = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP8//8/AwwwMSAB3BwAlm4DBfIlvvkAAAAASUVORK5CYII=';
      
      for (const item of history.history) {
        const screenshotB64 = item.state?.getScreenshot();
        if (screenshotB64 && screenshotB64 !== placeholderScreenshot) {
          hasRealScreenshot = true;
          break;
        }
      }

      expect(hasRealScreenshot).toBe(true);
    } finally {
      await browserSession.stop();
    }
  });

  test('gif generation without vision', async () => {
    const navigateAction = JSON.stringify({
      action: [{ go_to_url: { url: serverUrl } }]
    });
    const doneAction = JSON.stringify({
      action: [{ done: { text: 'Successfully tested without vision', success: true } }]
    });
    
    const llmNoVision = createMockLLM([navigateAction, doneAction]);
    const gifPath = path.join(tempDir, 'no_vision_test.gif');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: undefined
      })
    });
    
    await browserSession.start();

    try {
      const agent = new Agent({
        task: `Navigate to ${serverUrl} without using vision`,
        llm: llmNoVision,
        browserSession,
        useVision: false,
        generateGif: gifPath
      });

      const history: AgentHistoryList = await agent.run({ maxSteps: 3 });

      // Verify the task completed
      const result = history.finalResult();
      expect(result).toBeDefined();

      // Give a moment for GIF to be written
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify GIF was created even without vision
      expect(fs.existsSync(gifPath)).toBe(true);

      // Verify GIF has content (non-zero size)
      const gifStats = fs.statSync(gifPath);
      expect(gifStats.size).toBeGreaterThan(0);

      // Verify we have screenshots in history for GIF generation
      const screenshots = history.screenshots({ returnNoneIfNotScreenshot: true });
      expect(screenshots).toBeDefined();
      expect(screenshots.length).toBeGreaterThan(0);

      // Verify at least one valid screenshot exists (not all placeholders)
      const placeholderScreenshot = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAE0lEQVR42mP8/5+BgYGBgYGBgQEAAP//AwMC/wE=';
      const validScreenshots = screenshots.filter(
        s => s && s !== placeholderScreenshot
      );
      expect(validScreenshots.length).toBeGreaterThan(0);
    } finally {
      await browserSession.stop();
    }
  });

  test('gif not created when only placeholders', async () => {
    const llm = createMockLLM();
    const gifPath = path.join(tempDir, 'should_not_exist.gif');

    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableSecurity: true,
        userDataDir: undefined
      })
    });
    
    await browserSession.start();

    try {
      const agent = new Agent({
        task: 'Just complete without navigation',
        llm,
        browserSession,
        generateGif: gifPath
      });

      const history: AgentHistoryList = await agent.run({ maxSteps: 2 });

      // Task should complete
      const result = history.finalResult();
      expect(result).toBeDefined();

      // GIF should NOT be created
      expect(fs.existsSync(gifPath)).toBe(false);
    } finally {
      await browserSession.stop();
    }
  });
});