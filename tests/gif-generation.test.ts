/**
 * Tests for the GIF generation system
 */

import {
  createHistoryGIF,
  decodeUnicodeEscapesToUTF8,
  isNewTabPage,
  PLACEHOLDER_4PX_SCREENSHOT,
  HistoryItem,
  AgentHistoryList
} from '../src/agent/gif';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock canvas to avoid requiring full canvas setup in tests
jest.mock('canvas', () => ({
  createCanvas: jest.fn(() => ({
    width: 800,
    height: 600,
    getContext: jest.fn(() => ({
      fillStyle: '',
      fillRect: jest.fn(),
      font: '',
      textAlign: '',
      fillText: jest.fn(),
      measureText: jest.fn(() => ({ width: 100 })),
      beginPath: jest.fn(),
      roundRect: jest.fn(),
      fill: jest.fn(),
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({
        data: Buffer.alloc(800 * 600 * 4) // RGBA data
      }))
    }))
  })),
  loadImage: jest.fn(() => Promise.resolve({ 
    width: 800, 
    height: 600 
  })),
  registerFont: jest.fn()
}));

// Mock GIF encoder
jest.mock('gif-encoder-2', () => {
  return jest.fn().mockImplementation(() => ({
    setDelay: jest.fn(),
    setRepeat: jest.fn(),
    setTransparent: jest.fn(),
    start: jest.fn(),
    addFrame: jest.fn(),
    finish: jest.fn(),
    out: {
      getData: jest.fn(() => Buffer.from('fake gif data'))
    }
  }));
});

// Mock fs.writeFileSync globally
jest.mock('fs', () => {
  const original = jest.requireActual('fs');
  return {
    ...original,
    writeFileSync: jest.fn(),
    existsSync: jest.fn(() => false), // Default to false for safety
  };
});

describe('GIF Generation System', () => {
  const tempDir = os.tmpdir();

  beforeEach(() => {
    // Clear any existing mock calls
    jest.clearAllMocks();
  });

  describe('decodeUnicodeEscapesToUTF8', () => {
    it('should decode Unicode escape sequences', () => {
      const input = 'Hello \\u4e16\\u754c'; // Hello 世界 (Hello World in Chinese)
      const result = decodeUnicodeEscapesToUTF8(input);
      expect(result).toBe('Hello 世界');
    });

    it('should return original text if no escape sequences', () => {
      const input = 'Hello World';
      const result = decodeUnicodeEscapesToUTF8(input);
      expect(result).toBe('Hello World');
    });

    it('should handle invalid escape sequences gracefully', () => {
      const input = 'Hello \\uXXXX World';
      const result = decodeUnicodeEscapesToUTF8(input);
      expect(result).toBe(input); // Should return original if decode fails
    });

    it('should handle empty string', () => {
      const result = decodeUnicodeEscapesToUTF8('');
      expect(result).toBe('');
    });
  });

  describe('isNewTabPage', () => {
    it('should identify Chrome new tab pages', () => {
      expect(isNewTabPage('chrome://newtab/')).toBe(true);
      expect(isNewTabPage('chrome://new-tab-page/')).toBe(true);
    });

    it('should identify about:blank pages', () => {
      expect(isNewTabPage('about:blank')).toBe(true);
      expect(isNewTabPage('about:newtab')).toBe(true);
    });

    it('should identify Edge new tab pages', () => {
      expect(isNewTabPage('edge://newtab/')).toBe(true);
      expect(isNewTabPage('edge://new-tab-page/')).toBe(true);
    });

    it('should not identify regular pages as new tab pages', () => {
      expect(isNewTabPage('https://www.example.com')).toBe(false);
      expect(isNewTabPage('http://localhost:3000')).toBe(false);
      expect(isNewTabPage('file:///path/to/file.html')).toBe(false);
    });
  });

  const testScreenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbVGw8wAAAABJRU5ErkJggg=='; // 1x1 transparent PNG

  const createMockHistoryItem = (
    url: string = 'https://example.com',
    screenshot: string | null = testScreenshotBase64,
    nextGoal: string = 'Test goal'
  ): HistoryItem => ({
    state: {
      get_screenshot: () => screenshot,
      url: url
    },
    model_output: {
      current_state: {
        next_goal: nextGoal,
        evaluation_previous_goal: 'Previous goal',
        memory: 'Memory state'
      }
    }
  });

  const createMockHistory = (items: HistoryItem[]): AgentHistoryList => ({
    history: items,
    screenshots: (returnNoneIfNotScreenshot?: boolean) => {
      return items.map(item => item.state.get_screenshot());
    }
  });

  describe('createHistoryGIF', () => {

    it('should handle empty history gracefully', async () => {
      const emptyHistory: AgentHistoryList = {
        history: [],
        screenshots: () => []
      };

      // Should not throw and should handle empty history
      await expect(createHistoryGIF('Test task', emptyHistory)).resolves.toBeUndefined();
    });

    it('should handle history with no screenshots', async () => {
      const historyWithoutScreenshots = createMockHistory([
        createMockHistoryItem('https://example.com', null)
      ]);

      await expect(createHistoryGIF('Test task', historyWithoutScreenshots)).resolves.toBeUndefined();
    });

    it('should skip placeholder screenshots', async () => {
      const historyWithPlaceholders = createMockHistory([
        createMockHistoryItem('about:blank', PLACEHOLDER_4PX_SCREENSHOT),
        createMockHistoryItem('https://example.com', testScreenshotBase64)
      ]);

      const outputPath = path.join(tempDir, 'test-placeholders.gif');
      await createHistoryGIF('Test task', historyWithPlaceholders, { 
        output_path: outputPath,
        show_task: false,
        show_goals: false
      });

      // Should have created the file (mocked)
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });

    it('should skip new tab page screenshots', async () => {
      const historyWithNewTabPages = createMockHistory([
        createMockHistoryItem('chrome://newtab/', testScreenshotBase64),
        createMockHistoryItem('https://example.com', testScreenshotBase64)
      ]);

      const outputPath = path.join(tempDir, 'test-newtab.gif');
      await createHistoryGIF('Test task', historyWithNewTabPages, { 
        output_path: outputPath,
        show_task: false,
        show_goals: false
      });

      // Should have created the file (mocked)
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });

    it('should create GIF with valid screenshots', async () => {
      const validHistory = createMockHistory([
        createMockHistoryItem('https://example.com', testScreenshotBase64, 'Navigate to page'),
        createMockHistoryItem('https://example.com/login', testScreenshotBase64, 'Fill login form'),
        createMockHistoryItem('https://example.com/dashboard', testScreenshotBase64, 'View dashboard')
      ]);

      const outputPath = path.join(tempDir, 'test-valid.gif');
      await createHistoryGIF('Test automation task', validHistory, { 
        output_path: outputPath,
        show_task: true,
        show_goals: true,
        duration: 2000
      });

      // Verify GIF encoder was set up correctly
      const GIFEncoder = require('gif-encoder-2');
      const encoderInstance = GIFEncoder.mock.results[GIFEncoder.mock.results.length - 1].value;
      
      expect(encoderInstance.setDelay).toHaveBeenCalledWith(2000);
      expect(encoderInstance.setRepeat).toHaveBeenCalledWith(0);
      expect(encoderInstance.start).toHaveBeenCalled();
      expect(encoderInstance.finish).toHaveBeenCalled();
      
      // Should have written the file
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });

    it('should handle custom configuration options', async () => {
      const history = createMockHistory([
        createMockHistoryItem('https://example.com', testScreenshotBase64)
      ]);

      const customConfig = {
        output_path: path.join(tempDir, 'custom-config.gif'),
        duration: 5000,
        show_task: false,
        show_goals: true,
        show_logo: false,
        font_size: 32,
        title_font_size: 48,
        margin: 30
      };

      await createHistoryGIF('Custom task', history, customConfig);

      // Verify custom duration was used
      const GIFEncoder = require('gif-encoder-2');
      const encoderInstance = GIFEncoder.mock.results[GIFEncoder.mock.results.length - 1].value;
      expect(encoderInstance.setDelay).toHaveBeenCalledWith(5000);
    });

    it('should handle Unicode text in goals', async () => {
      const historyWithUnicode = createMockHistory([
        createMockHistoryItem('https://example.com', testScreenshotBase64, '点击登录按钮'), // Chinese text
        createMockHistoryItem('https://example.com', testScreenshotBase64, 'انقر على زر الدخول') // Arabic text
      ]);

      const outputPath = path.join(tempDir, 'unicode-test.gif');
      await createHistoryGIF('Unicode test task', historyWithUnicode, { 
        output_path: outputPath,
        show_goals: true
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });

    it('should handle missing model output gracefully', async () => {
      const historyWithoutModelOutput: AgentHistoryList = {
        history: [{
          state: {
            get_screenshot: () => testScreenshotBase64,
            url: 'https://example.com'
          },
          model_output: null
        }],
        screenshots: () => [testScreenshotBase64]
      };

      const outputPath = path.join(tempDir, 'no-model-output.gif');
      await createHistoryGIF('Test task', historyWithoutModelOutput, { 
        output_path: outputPath,
        show_goals: true
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });

    it('should handle long task text with dynamic font sizing', async () => {
      const longTask = 'This is a very long task description that should trigger dynamic font sizing to ensure it fits within the canvas boundaries. '.repeat(5);
      
      const history = createMockHistory([
        createMockHistoryItem('https://example.com', testScreenshotBase64)
      ]);

      const outputPath = path.join(tempDir, 'long-task.gif');
      await createHistoryGIF(longTask, history, { 
        output_path: outputPath,
        show_task: true
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });
  });

  describe('GIF Generation Integration', () => {
    it('should handle errors during GIF creation gracefully', async () => {
      // Mock fs.writeFileSync to throw an error
      const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('Write permission denied');
      });

      const history = createMockHistory([
        createMockHistoryItem('https://example.com', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbVGw8wAAAABJRU5ErkJggg==')
      ]);

      await expect(createHistoryGIF('Test task', history, {
        output_path: '/invalid/path/test.gif'
      })).rejects.toThrow();

      // Restore original function
      writeFileSyncSpy.mockRestore();
    });
  });
});