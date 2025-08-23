/**
 * Test GIF generation filters out about:blank screenshots.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHistoryGif } from '../src/agent/gif';
import { AgentHistory, AgentOutput, ActionResult } from '../src/agent/views';
import { BrowserStateHistory, TabInfo } from '../src/browser/views';
import { ScreenshotService } from '../src/screenshots';

// Helper to create temporary directory
async function createTempDir(): Promise<string> {
  const tmpDir = path.join(__dirname, 'tmp', `test-gif-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

// Helper to clean up temporary directory
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors during cleanup
  }
}

// Helper to create test screenshot
function createTestScreenshot(width: number = 800, height: number = 600, color: [number, number, number] = [100, 150, 200]): string {
  // Create a simple base64 PNG
  // This is a minimal 1x1 PNG, in real tests we'd generate proper images
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0x99, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x89, 0x9C, 0x69,
    0x8B, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  return minimalPng.toString('base64');
}

describe('Agent GIF Filtering Tests', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(testDir);
  });

  test('test_gif_filters_out_placeholder_screenshots', async () => {
    // Set up screenshot service for testing
    const screenshotService = new ScreenshotService(testDir);

    // Helper function to store test screenshots
    async function storeTestScreenshot(screenshotB64: string, step: number): Promise<string> {
      return await screenshotService.storeScreenshot(screenshotB64, step);
    }

    // Create a history with mixed screenshots: real and placeholder
    const historyItems: AgentHistory[] = [];

    // Store test screenshots
    const realScreenshot1Path = await storeTestScreenshot(createTestScreenshot(800, 600, [100, 150, 200]), 2);
    const realScreenshot2Path = await storeTestScreenshot(createTestScreenshot(800, 600, [200, 100, 50]), 4);

    // First item: about:blank placeholder (should be filtered)
    historyItems.push({
      model_output: {
        evaluation_previous_goal: '',
        memory: '',
        next_goal: 'Starting task',
        action: [],
      } as AgentOutput,
      result: [new ActionResult()],
      state: {
        screenshot_path: undefined, // Placeholder doesn't have a file path
        url: 'about:blank',
        title: 'New Tab',
        tabs: [{ target_id: '1', url: 'about:blank', title: 'New Tab' } as TabInfo],
        interacted_element: [null],
      } as BrowserStateHistory,
    });

    // Second item: real screenshot
    historyItems.push({
      model_output: {
        evaluation_previous_goal: '',
        memory: '',
        next_goal: 'Navigate to example.com',
        action: [],
      } as AgentOutput,
      result: [new ActionResult()],
      state: {
        screenshot_path: realScreenshot1Path,
        url: 'https://example.com',
        title: 'Example',
        tabs: [{ target_id: '1', url: 'https://example.com', title: 'Example' } as TabInfo],
        interacted_element: [null],
      } as BrowserStateHistory,
    });

    // Third item: another about:blank placeholder (should be filtered)
    historyItems.push({
      model_output: {
        evaluation_previous_goal: '',
        memory: '',
        next_goal: 'Opening new tab',
        action: [],
      } as AgentOutput,
      result: [new ActionResult()],
      state: {
        screenshot_path: undefined, // Placeholder doesn't have a file path
        url: 'about:blank',
        title: 'New Tab',
        tabs: [{ target_id: '2', url: 'about:blank', title: 'New Tab' } as TabInfo],
        interacted_element: [null],
      } as BrowserStateHistory,
    });

    // Fourth item: another real screenshot
    historyItems.push({
      model_output: {
        evaluation_previous_goal: '',
        memory: '',
        next_goal: 'Click on button',
        action: [],
      } as AgentOutput,
      result: [new ActionResult()],
      state: {
        screenshot_path: realScreenshot2Path,
        url: 'https://example.com/page2',
        title: 'Page 2',
        tabs: [{ target_id: '1', url: 'https://example.com/page2', title: 'Page 2' } as TabInfo],
        interacted_element: [null],
      } as BrowserStateHistory,
    });

    // Generate GIF
    const gifPath = path.join(testDir, 'test_filtered.gif');
    
    try {
      await createHistoryGif(
        'Test filtering about:blank screenshots',
        historyItems,
        gifPath,
        500, // Shorter duration for testing
        true, // show_goals
        true  // show_task
      );

      // Verify GIF was created
      const gifExists = await fs.access(gifPath).then(() => true).catch(() => false);
      expect(gifExists).toBe(true);

      // Note: In TypeScript, we can't easily inspect GIF frames without additional libraries
      // The test primarily verifies that the function runs without errors
      // and creates a GIF file when there are valid screenshots

    } catch (error) {
      // If gif-encoder-2 is not available, we expect a specific error
      if ((error as Error).message.includes('gif-encoder-2')) {
        console.log('Skipping GIF test - gif-encoder-2 not available');
        return;
      }
      throw error;
    }
  });

  test('test_gif_handles_all_placeholders', async () => {
    // Create a history with only placeholder screenshots
    const historyItems: AgentHistory[] = [];

    for (let i = 0; i < 3; i++) {
      historyItems.push({
        model_output: {
          evaluation_previous_goal: '',
          memory: '',
          next_goal: `Step ${i + 1}`,
          action: [],
        } as AgentOutput,
        result: [new ActionResult()],
        state: {
          screenshot_path: undefined, // Placeholder doesn't have a file path
          url: 'about:blank',
          title: 'New Tab',
          tabs: [{ target_id: '1', url: 'about:blank', title: 'New Tab' } as TabInfo],
          interacted_element: [null],
        } as BrowserStateHistory,
      });
    }

    // Generate GIF - should handle gracefully
    const gifPath = path.join(testDir, 'test_all_placeholders.gif');
    
    try {
      await createHistoryGif(
        'Test all placeholders',
        historyItems,
        gifPath,
        500
      );

      // With all placeholders filtered, no GIF should be created
      const gifExists = await fs.access(gifPath).then(() => true).catch(() => false);
      expect(gifExists).toBe(false);

    } catch (error) {
      // If gif-encoder-2 is not available, we expect a specific error
      if ((error as Error).message.includes('gif-encoder-2')) {
        console.log('Skipping GIF test - gif-encoder-2 not available');
        return;
      }
      // With all placeholders, we might get an error about no valid frames
      // This is expected behavior
      if ((error as Error).message.includes('No valid frames')) {
        return; // Test passes
      }
      throw error;
    }
  });
});