/**
 * Screenshot watchdog for handling screenshot requests
 * 
 * Handles screenshot capture using Playwright's built-in screenshot functionality.
 */

import { BaseWatchdog } from './base';
import { BrowserSession } from '../session';
import { ScreenshotEvent } from '../events-classes';
import { BrowserException } from '../../exceptions';
import { getLogger } from '../../logging';

export interface ScreenshotWatchdogConfig {
  enabled?: boolean;
  defaultFormat?: 'png' | 'jpeg';
  quality?: number; // For JPEG format
  timeout?: number; // Screenshot timeout in milliseconds
}

export class ScreenshotWatchdog extends BaseWatchdog {
  public static readonly LISTENS_TO = [ScreenshotEvent];
  public static readonly EMITS = [];

  protected logger = getLogger('ScreenshotWatchdog');
  private defaultFormat: 'png' | 'jpeg';
  private quality: number;
  private timeout: number;

  constructor(
    browserSession: BrowserSession,
    config: ScreenshotWatchdogConfig = {}
  ) {
    super(browserSession, config);
    this.defaultFormat = config.defaultFormat || 'png';
    this.quality = config.quality || 90;
    this.timeout = config.timeout || 30000;
  }

  async onScreenshotEvent(event: ScreenshotEvent): Promise<string> {
    this.logger.debug('[ScreenshotWatchdog] Handler START - onScreenshotEvent called');
    
    try {
      // Get the current page
      const page = this.browserSession.getCurrentPage();
      if (!page) {
        throw new BrowserException('No active page for screenshot');
      }

      // Prepare screenshot options
      const screenshotOptions: any = {
        type: this.defaultFormat,
        timeout: this.timeout,
      };

      // Add quality for JPEG format
      if (this.defaultFormat === 'jpeg') {
        screenshotOptions.quality = this.quality;
      }

      // Handle full page screenshot
      if (event.fullPage) {
        screenshotOptions.fullPage = true;
        this.logger.debug('[ScreenshotWatchdog] Taking full page screenshot');
      } else {
        this.logger.debug('[ScreenshotWatchdog] Taking viewport screenshot');
      }

      // Handle clip parameters if provided
      if (event.clip) {
        screenshotOptions.clip = {
          x: event.clip.x,
          y: event.clip.y,
          width: event.clip.width,
          height: event.clip.height,
        };
        this.logger.debug(`[ScreenshotWatchdog] Taking clipped screenshot: ${JSON.stringify(screenshotOptions.clip)}`);
      }

      // Take screenshot using Playwright
      this.logger.debug(`[ScreenshotWatchdog] Taking screenshot with options: ${JSON.stringify(screenshotOptions)}`);
      const screenshotBuffer = await page.screenshot(screenshotOptions);

      // Convert buffer to base64
      const base64Screenshot = screenshotBuffer.toString('base64');
      
      this.logger.debug('[ScreenshotWatchdog] Screenshot captured successfully');
      return base64Screenshot;

    } catch (error) {
      this.logger.error(`[ScreenshotWatchdog] Screenshot failed: ${error}`);
      throw new BrowserException(`Screenshot failed: ${error}`);
    } finally {
      // Try to remove highlights even on failure
      try {
        await this.browserSession.removeHighlights();
      } catch (error) {
        this.logger.debug(`[ScreenshotWatchdog] Failed to remove highlights: ${error}`);
      }
    }
  }

  /**
   * Take a screenshot with custom options
   */
  async takeScreenshot(options: {
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    format?: 'png' | 'jpeg';
    quality?: number;
  } = {}): Promise<string> {
    const screenshotEvent = new ScreenshotEvent({
      fullPage: options.fullPage,
      clip: options.clip,
    });

    // Temporarily override format and quality if provided
    const originalFormat = this.defaultFormat;
    const originalQuality = this.quality;

    if (options.format) {
      this.defaultFormat = options.format;
    }
    if (options.quality) {
      this.quality = options.quality;
    }

    try {
      const result = await this.onScreenshotEvent(screenshotEvent);
      return result;
    } finally {
      // Restore original settings
      this.defaultFormat = originalFormat;
      this.quality = originalQuality;
    }
  }

  /**
   * Take a full page screenshot
   */
  async takeFullPageScreenshot(): Promise<string> {
    return this.takeScreenshot({ fullPage: true });
  }

  /**
   * Take a viewport screenshot
   */
  async takeViewportScreenshot(): Promise<string> {
    return this.takeScreenshot({ fullPage: false });
  }

  /**
   * Take a screenshot of a specific area
   */
  async takeClippedScreenshot(clip: { x: number; y: number; width: number; height: number }): Promise<string> {
    return this.takeScreenshot({ clip });
  }

  async cleanup(): Promise<void> {
    // No specific cleanup needed for screenshot watchdog
  }
}