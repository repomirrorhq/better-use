/**
 * Local browser watchdog for managing browser subprocess lifecycle
 * 
 * Simplified TypeScript implementation that works with Playwright's browser management.
 * Handles browser process monitoring and cleanup.
 */

import { BaseWatchdog } from './base';
import { BrowserSession } from '../session';
import { BrowserLaunchEvent, BrowserKillEvent, BrowserStopEvent } from '../events-classes';
import { getLogger } from '../../logging';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface LocalBrowserWatchdogConfig {
  enabled?: boolean;
  maxRetries?: number;
}

export class LocalBrowserWatchdog extends BaseWatchdog {
  public static readonly LISTENS_TO = [BrowserLaunchEvent, BrowserKillEvent, BrowserStopEvent];
  public static readonly EMITS = [];

  private browserPid: number | null = null;
  private ownsBrowserResources = true;
  private tempDirsToCleanup: string[] = [];
  private originalUserDataDir: string | null = null;
  protected logger = getLogger('LocalBrowserWatchdog');

  constructor(
    browserSession: BrowserSession,
    config: LocalBrowserWatchdogConfig = {}
  ) {
    super(browserSession, config);
  }

  async onBrowserLaunchEvent(event: BrowserLaunchEvent): Promise<{ cdpUrl: string }> {
    try {
      this.logger.debug('[LocalBrowserWatchdog] Received BrowserLaunchEvent, launching local browser...');

      // In the TypeScript implementation, we let Playwright handle most browser launching
      // This watchdog primarily monitors the process and handles cleanup
      
      // Get the browser instance from the session
      const browser = this.browserSession.getBrowser();
      if (!browser) {
        throw new Error('No browser instance available');
      }

      // Try to get browser PID for monitoring
      try {
        // Get CDP endpoint from browser
        const cdpEndpoint = browser.wsEndpoint();
        if (cdpEndpoint) {
          // Extract port from WebSocket endpoint
          const match = cdpEndpoint.match(/:(\d+)/);
          if (match) {
            const port = parseInt(match[1]);
            const cdpUrl = `http://localhost:${port}/`;
            this.logger.debug(`[LocalBrowserWatchdog] Browser launched with CDP URL: ${cdpUrl}`);
            return { cdpUrl };
          }
        }
      } catch (error) {
        this.logger.debug(`[LocalBrowserWatchdog] Could not get CDP URL: ${error}`);
      }

      // Fallback CDP URL
      return { cdpUrl: 'http://localhost:9222/' };

    } catch (error) {
      this.logger.error(`[LocalBrowserWatchdog] Exception in onBrowserLaunchEvent: ${error}`);
      throw error;
    }
  }

  async onBrowserKillEvent(event: BrowserKillEvent): Promise<void> {
    this.logger.debug('[LocalBrowserWatchdog] Killing local browser process');

    try {
      // Close the browser through Playwright
      const browser = this.browserSession.getBrowser();
      if (browser && browser.isConnected()) {
        await browser.close();
      }
    } catch (error) {
      this.logger.debug(`[LocalBrowserWatchdog] Error closing browser: ${error}`);
    }

    this.browserPid = null;

    // Clean up temp directories if any were created
    await this.cleanupTempDirectories();

    // Restore original user_data_dir if it was modified
    if (this.originalUserDataDir) {
      this.browserSession.profile.update({ userDataDir: this.originalUserDataDir });
      this.originalUserDataDir = null;
    }

    this.logger.debug('[LocalBrowserWatchdog] Browser cleanup completed');
  }

  async onBrowserStopEvent(event: BrowserStopEvent): Promise<void> {
    if (this.browserSession.isLocal && this.browserPid) {
      this.logger.debug('[LocalBrowserWatchdog] BrowserStopEvent received, dispatching BrowserKillEvent');
      
      // Dispatch BrowserKillEvent
      const killEvent = new BrowserKillEvent({});
      this.browserSession.emit('BrowserKillEvent', killEvent);
    }
  }

  private async cleanupTempDirectories(): Promise<void> {
    for (const tempDir of this.tempDirsToCleanup) {
      await this.cleanupTempDir(tempDir);
    }
    this.tempDirsToCleanup = [];
  }

  private async cleanupTempDir(tempDir: string): Promise<void> {
    if (!tempDir) return;

    try {
      // Only remove if it's actually a temp directory we created
      if (tempDir.includes('browseruse-tmp-')) {
        await fs.rm(tempDir, { recursive: true, force: true });
        this.logger.debug(`[LocalBrowserWatchdog] Cleaned up temp directory: ${tempDir}`);
      }
    } catch (error) {
      this.logger.debug(`Failed to cleanup temp dir ${tempDir}: ${error}`);
    }
  }

  private async createTempUserDataDir(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'browseruse-tmp-'));
    this.tempDirsToCleanup.push(tempDir);
    return tempDir;
  }

  /**
   * Get the browser process ID if available
   */
  getBrowserPid(): number | null {
    return this.browserPid;
  }

  /**
   * Check if this watchdog owns the browser resources
   */
  get ownsBrowser(): boolean {
    return this.ownsBrowserResources;
  }

  /**
   * Find a free port for debugging interface
   */
  private static async findFreePort(): Promise<number> {
    const { createServer } = await import('net');
    
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          const port = address.port;
          server.close(() => resolve(port));
        } else {
          reject(new Error('Could not get port'));
        }
      });
    });
  }

  /**
   * Wait for CDP endpoint to be available
   */
  private static async waitForCdpUrl(port: number, timeout = 30000): Promise<string> {
    const startTime = Date.now();
    const cdpUrl = `http://localhost:${port}/`;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${cdpUrl}json/version`);
        if (response.ok) {
          return cdpUrl;
        }
      } catch (error) {
        // Connection error - browser might not be ready yet
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw new Error(`Browser did not start within ${timeout}ms`);
  }

  async cleanup(): Promise<void> {
    await this.cleanupTempDirectories();
    this.browserPid = null;
    this.originalUserDataDir = null;
  }
}