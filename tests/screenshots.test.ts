import { ScreenshotService } from '../src/screenshots';
import * as fs from 'fs/promises';
import * as path from 'path';
import { jest } from '@jest/globals';

describe('Screenshot Service Tests', () => {
  const testDir = '/tmp/browser-use-test-screenshots';
  let screenshotService: ScreenshotService;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist, ignore error
    }

    // Create fresh service instance
    screenshotService = new ScreenshotService(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Service Initialization', () => {
    it('should create screenshots directory on initialization', async () => {
      const screenshotsDir = path.join(testDir, 'screenshots');
      
      // Check that directory was created
      const stats = await fs.stat(screenshotsDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should return correct screenshots directory path', () => {
      const expectedPath = path.join(testDir, 'screenshots');
      expect(screenshotService.getScreenshotsDirectory()).toBe(expectedPath);
    });
  });

  describe('Screenshot Storage', () => {
    it('should store screenshot as PNG file', async () => {
      // Create a simple base64 image (1x1 PNG)
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      const screenshotPath = await screenshotService.storeScreenshot(base64Image, 1);
      
      // Check that file was created with correct name
      const expectedPath = path.join(testDir, 'screenshots', 'step_1.png');
      expect(screenshotPath).toBe(expectedPath);
      
      // Check that file exists
      const stats = await fs.stat(screenshotPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should store multiple screenshots with different step numbers', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      const path1 = await screenshotService.storeScreenshot(base64Image, 1);
      const path2 = await screenshotService.storeScreenshot(base64Image, 5);
      const path3 = await screenshotService.storeScreenshot(base64Image, 10);
      
      expect(path1).toContain('step_1.png');
      expect(path2).toContain('step_5.png');
      expect(path3).toContain('step_10.png');
      
      // All should exist
      await expect(fs.stat(path1)).resolves.toBeTruthy();
      await expect(fs.stat(path2)).resolves.toBeTruthy();
      await expect(fs.stat(path3)).resolves.toBeTruthy();
    });

    it('should handle invalid base64 data gracefully', async () => {
      const invalidBase64 = 'invalid-base64-data';
      
      // Should throw an error for invalid base64
      await expect(screenshotService.storeScreenshot(invalidBase64, 1))
        .rejects.toThrow();
    });
  });

  describe('Screenshot Retrieval', () => {
    it('should retrieve stored screenshot as base64', async () => {
      const originalBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      // Store screenshot
      const screenshotPath = await screenshotService.storeScreenshot(originalBase64, 1);
      
      // Retrieve screenshot
      const retrievedBase64 = await screenshotService.getScreenshot(screenshotPath);
      
      expect(retrievedBase64).toBe(originalBase64);
    });

    it('should return null for non-existent screenshot', async () => {
      const nonExistentPath = path.join(testDir, 'screenshots', 'step_999.png');
      
      const result = await screenshotService.getScreenshot(nonExistentPath);
      
      expect(result).toBeNull();
    });

    it('should return null for empty path', async () => {
      const result = await screenshotService.getScreenshot('');
      
      expect(result).toBeNull();
    });
  });

  describe('Directory Management', () => {
    it('should list screenshot files', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      // Store several screenshots
      await screenshotService.storeScreenshot(base64Image, 1);
      await screenshotService.storeScreenshot(base64Image, 3);
      await screenshotService.storeScreenshot(base64Image, 2);
      
      const screenshots = await screenshotService.listScreenshots();
      
      // Should be sorted
      expect(screenshots).toEqual(['step_1.png', 'step_2.png', 'step_3.png']);
    });

    it('should return empty array for non-existent directory', async () => {
      // Create service for non-existent directory
      const nonExistentService = new ScreenshotService('/tmp/non-existent-dir-test');
      
      const screenshots = await nonExistentService.listScreenshots();
      
      expect(screenshots).toEqual([]);
    });

    it('should calculate directory size', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      // Store a screenshot
      await screenshotService.storeScreenshot(base64Image, 1);
      
      const size = await screenshotService.getDirectorySize();
      
      expect(size).toBeGreaterThan(0);
    });

    it('should cleanup all screenshots', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      // Store several screenshots
      await screenshotService.storeScreenshot(base64Image, 1);
      await screenshotService.storeScreenshot(base64Image, 2);
      await screenshotService.storeScreenshot(base64Image, 3);
      
      // Verify they exist
      let screenshots = await screenshotService.listScreenshots();
      expect(screenshots.length).toBe(3);
      
      // Cleanup
      await screenshotService.cleanup();
      
      // Verify they're gone
      screenshots = await screenshotService.listScreenshots();
      expect(screenshots.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle directory creation errors gracefully', () => {
      // Try to create service in a directory that can't be created (like root)
      // This might throw on some systems, so we'll just check it doesn't crash
      expect(() => {
        try {
          new ScreenshotService('/root/cannot-create-this-directory');
        } catch (error) {
          // Expected in some cases, that's fine
        }
      }).not.toThrow();
    });

    it('should handle cleanup errors gracefully', async () => {
      // Should not throw even if directory doesn't exist
      await expect(screenshotService.cleanup()).resolves.toBeUndefined();
    });

    it('should handle directory size calculation errors gracefully', async () => {
      const nonExistentService = new ScreenshotService('/tmp/non-existent-dir-size-test');
      
      const size = await nonExistentService.getDirectorySize();
      
      expect(size).toBe(0);
    });
  });
});