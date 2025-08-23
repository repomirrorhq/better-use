/**
 * Screenshot storage service for browser-use agents.
 * 
 * This service handles storing screenshots to disk and retrieving them as base64 strings.
 * Screenshots are saved in a dedicated screenshots subdirectory within the agent's working directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Simple screenshot storage service that saves screenshots to disk
 */
export class ScreenshotService {
  private agentDirectory: string;
  private screenshotsDir: string;

  /**
   * Initialize with agent directory path
   * @param agentDirectory Path to the agent's working directory
   */
  constructor(agentDirectory: string) {
    this.agentDirectory = agentDirectory;
    this.screenshotsDir = path.join(this.agentDirectory, 'screenshots');
    
    // Create screenshots subdirectory synchronously on initialization
    this.initializeDirectory();
  }

  /**
   * Create the screenshots directory if it doesn't exist
   */
  private initializeDirectory(): void {
    try {
      require('fs').mkdirSync(this.screenshotsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, which is fine
      if ((error as any).code !== 'EEXIST') {
        throw new Error(`Failed to create screenshots directory: ${error}`);
      }
    }
  }

  /**
   * Store screenshot to disk and return the full path as string
   * @param screenshotB64 Base64 encoded screenshot data
   * @param stepNumber Current step number for filename
   * @returns Promise resolving to the full file path
   */
  async storeScreenshot(screenshotB64: string, stepNumber: number): Promise<string> {
    const screenshotFilename = `step_${stepNumber}.png`;
    const screenshotPath = path.join(this.screenshotsDir, screenshotFilename);

    // Validate base64 format
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Pattern.test(screenshotB64)) {
      throw new Error('Invalid base64 format');
    }

    try {
      // Decode base64 and save to disk
      const screenshotData = Buffer.from(screenshotB64, 'base64');
      await fs.writeFile(screenshotPath, screenshotData);
      return screenshotPath;
    } catch (error) {
      throw new Error(`Failed to store screenshot: ${error}`);
    }
  }

  /**
   * Load screenshot from disk path and return as base64
   * @param screenshotPath Full path to the screenshot file
   * @returns Promise resolving to base64 string or null if file doesn't exist
   */
  async getScreenshot(screenshotPath: string): Promise<string | null> {
    if (!screenshotPath) {
      return null;
    }

    try {
      // Check if file exists
      await fs.access(screenshotPath);
      
      // Load from disk and encode to base64
      const screenshotData = await fs.readFile(screenshotPath);
      return screenshotData.toString('base64');
    } catch (error) {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Get the screenshots directory path
   * @returns The full path to the screenshots directory
   */
  getScreenshotsDirectory(): string {
    return this.screenshotsDir;
  }

  /**
   * List all screenshot files in the directory
   * @returns Promise resolving to array of screenshot filenames
   */
  async listScreenshots(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.screenshotsDir);
      return files.filter(file => file.endsWith('.png')).sort();
    } catch (error) {
      // Directory doesn't exist or can't be read
      return [];
    }
  }

  /**
   * Delete all screenshots in the directory
   * @returns Promise that resolves when cleanup is complete
   */
  async cleanup(): Promise<void> {
    try {
      const files = await this.listScreenshots();
      await Promise.all(
        files.map(file => 
          fs.unlink(path.join(this.screenshotsDir, file)).catch(() => {
            // Ignore errors - file might already be deleted
          })
        )
      );
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Get the size of the screenshots directory in bytes
   * @returns Promise resolving to total size in bytes
   */
  async getDirectorySize(): Promise<number> {
    try {
      const files = await fs.readdir(this.screenshotsDir);
      let totalSize = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(this.screenshotsDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        } catch {
          // Ignore individual file errors
        }
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }
}

export default ScreenshotService;