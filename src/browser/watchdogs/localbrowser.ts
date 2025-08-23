/**
 * Local browser watchdog for managing browser subprocess lifecycle
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import * as net from 'net';
import * as glob from 'glob';
import axios from 'axios';

import { BaseWatchdog } from './base';
import { 
  BrowserKillEvent,
  BrowserLaunchEvent,
  BrowserLaunchResult,
  BrowserStopEvent,
} from '../events';
import { BaseEvent } from '../../utils';

const globPromise = promisify(glob);

interface ProcessInfo {
  pid: number;
  process: ChildProcess;
}

export class LocalBrowserWatchdog extends BaseWatchdog {
  static readonly LISTENS_TO = [
    BrowserLaunchEvent,
    BrowserKillEvent,
    BrowserStopEvent,
  ];

  static readonly EMITS: typeof BaseEvent[] = [];

  // Private state for subprocess management
  private subprocess: ProcessInfo | null = null;
  private ownsBrowserResources: boolean = true;
  private tempDirsToCleanup: string[] = [];
  private originalUserDataDir: string | null = null;

  async onBrowserLaunchEvent(event: BrowserLaunchEvent): Promise<BrowserLaunchResult> {
    try {
      this.logger.debug('[LocalBrowserWatchdog] Received BrowserLaunchEvent, launching local browser...');

      const result = await this.launchBrowser();
      this.subprocess = { pid: result.process.pid!, process: result.process };

      return new BrowserLaunchResult({ cdpUrl: result.cdpUrl });
    } catch (error) {
      this.logger.error(`[LocalBrowserWatchdog] Exception in onBrowserLaunchEvent: ${error}`);
      throw error;
    }
  }

  async onBrowserKillEvent(event: BrowserKillEvent): Promise<void> {
    this.logger.debug('[LocalBrowserWatchdog] Killing local browser process');

    if (this.subprocess) {
      await this.cleanupProcess(this.subprocess);
      this.subprocess = null;
    }

    // Clean up temp directories if any were created
    for (const tempDir of this.tempDirsToCleanup) {
      await this.cleanupTempDir(tempDir);
    }
    this.tempDirsToCleanup = [];

    // Restore original user_data_dir if it was modified
    if (this.originalUserDataDir !== null) {
      this.browserSession.browserProfile.userDataDir = this.originalUserDataDir;
      this.originalUserDataDir = null;
    }

    this.logger.debug('[LocalBrowserWatchdog] Browser cleanup completed');
  }

  async onBrowserStopEvent(event: BrowserStopEvent): Promise<void> {
    if (this.browserSession.isLocal && this.subprocess) {
      this.logger.debug('[LocalBrowserWatchdog] BrowserStopEvent received, dispatching BrowserKillEvent');
      // Dispatch BrowserKillEvent without awaiting so it gets processed after all BrowserStopEvent handlers
      this.eventBus.dispatch(new BrowserKillEvent({}));
    }
  }

  private async launchBrowser(maxRetries: number = 3): Promise<{ process: ChildProcess; cdpUrl: string }> {
    // Keep track of original user_data_dir to restore if needed
    const profile = this.browserSession.browserProfile;
    this.originalUserDataDir = profile.userDataDir || null;
    this.tempDirsToCleanup = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get launch args from profile
        const launchArgs = profile.getArgs();

        // Add debugging port
        const debugPort = await this.findFreePort();
        launchArgs.push(`--remote-debugging-port=${debugPort}`);

        if (!launchArgs.some(arg => arg.includes('--user-data-dir'))) {
          throw new Error(
            'User data dir must be set somewhere in launch args to a non-default path, otherwise Chrome will not let us attach via CDP'
          );
        }

        // Get browser executable
        let browserPath: string;
        if (profile.executablePath) {
          browserPath = profile.executablePath;
          this.logger.debug(`[LocalBrowserWatchdog] 📦 Using custom local browser executable_path= ${browserPath}`);
        } else {
          browserPath = await this.findInstalledBrowserPath();
          if (!browserPath) {
            this.logger.error(
              '[LocalBrowserWatchdog] ⚠️ No local browser binary found, installing browser using playwright subprocess...'
            );
            browserPath = await this.installBrowserWithPlaywright();
          }
        }

        this.logger.debug(`[LocalBrowserWatchdog] 📦 Found local browser installed at executable_path= ${browserPath}`);
        if (!browserPath) {
          throw new Error('No local Chrome/Chromium install found, and failed to install with playwright');
        }

        // Launch browser subprocess directly
        this.logger.debug(`[LocalBrowserWatchdog] 🚀 Launching browser subprocess with ${launchArgs.length} args...`);
        const subprocess = spawn(browserPath, launchArgs, {
          stdio: 'pipe',
        });

        this.logger.debug(
          `[LocalBrowserWatchdog] 🎭 Browser running with browser_pid= ${subprocess.pid} 🔗 listening on CDP port :${debugPort}`
        );

        // Wait for CDP to be ready and get the URL
        const cdpUrl = await this.waitForCdpUrl(debugPort);

        // Success! Clean up any temp dirs we created but didn't use
        for (const tmpDir of this.tempDirsToCleanup) {
          try {
            await fs.rmdir(tmpDir, { recursive: true });
          } catch (error) {
            // Ignore cleanup errors
          }
        }

        return { process: subprocess, cdpUrl };

      } catch (error) {
        const errorStr = (error as Error).message.toLowerCase();

        // Check if this is a user_data_dir related error
        const isUserDataDirError = ['singletonlock', 'user data directory', 'cannot create', 'already in use']
          .some(err => errorStr.includes(err));

        if (isUserDataDirError) {
          this.logger.warn(`Browser launch failed (attempt ${attempt + 1}/${maxRetries}): ${error}`);

          if (attempt < maxRetries - 1) {
            // Create a temporary directory for next attempt
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'browseruse-tmp-'));
            this.tempDirsToCleanup.push(tmpDir);

            // Update profile to use temp directory
            profile.userDataDir = tmpDir;
            this.logger.debug(`Retrying with temporary user_data_dir: ${tmpDir}`);

            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }

        // Not a recoverable error or last attempt failed
        // Restore original user_data_dir before raising
        if (this.originalUserDataDir !== null) {
          profile.userDataDir = this.originalUserDataDir;
        }

        // Clean up any temp dirs we created
        for (const tmpDir of this.tempDirsToCleanup) {
          try {
            await fs.rmdir(tmpDir, { recursive: true });
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }

        throw error;
      }
    }

    // Should not reach here, but just in case
    if (this.originalUserDataDir !== null) {
      this.browserSession.browserProfile.userDataDir = this.originalUserDataDir;
    }
    throw new Error(`Failed to launch browser after ${maxRetries} attempts`);
  }

  private async findInstalledBrowserPath(): Promise<string> {
    const platform = os.platform();
    let patterns: string[] = [];

    // Get playwright browsers path from environment variable if set
    let playwrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH;

    if (platform === 'darwin') { // macOS
      if (!playwrightPath) {
        playwrightPath = '~/Library/Caches/ms-playwright';
      }
      patterns = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        `${playwrightPath}/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        `${playwrightPath}/chromium_headless_shell-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
      ];
    } else if (platform === 'linux') {
      if (!playwrightPath) {
        playwrightPath = '~/.cache/ms-playwright';
      }
      patterns = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/local/bin/google-chrome',
        `${playwrightPath}/chromium-*/chrome-linux/chrome`,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/local/bin/chromium',
        '/snap/bin/chromium',
        '/usr/bin/google-chrome-beta',
        '/usr/bin/google-chrome-dev',
        '/usr/bin/brave-browser',
        `${playwrightPath}/chromium_headless_shell-*/chrome-linux/chrome`,
      ];
    } else if (platform === 'win32') {
      if (!playwrightPath) {
        playwrightPath = process.env.LOCALAPPDATA + '\\ms-playwright';
      }
      patterns = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${playwrightPath}\\chromium-*\\chrome-win\\chrome.exe`,
        'C:\\Program Files\\Chromium\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Chromium\\Application\\chrome.exe`,
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${playwrightPath}\\chromium_headless_shell-*\\chrome-win\\chrome.exe`,
      ];
    }

    for (const pattern of patterns) {
      // Expand user home directory
      const expandedPattern = pattern.replace('~', os.homedir());

      // Check if pattern contains wildcards
      if (expandedPattern.includes('*')) {
        // Use glob to expand the pattern
        try {
          const matches = await globPromise(expandedPattern);
          if (matches.length > 0) {
            // Sort matches and take the last one (alphanumerically highest version)
            matches.sort();
            const browserPath = matches[matches.length - 1];
            try {
              await fs.access(browserPath);
              return browserPath;
            } catch (error) {
              continue;
            }
          }
        } catch (error) {
          continue;
        }
      } else {
        // Direct path check
        try {
          await fs.access(expandedPattern);
          return expandedPattern;
        } catch (error) {
          continue;
        }
      }
    }

    throw new Error('No browser executable found');
  }

  private async installBrowserWithPlaywright(): Promise<string> {
    // Run in subprocess with timeout
    const subprocess = spawn('uvx', ['playwright', 'install', 'chrome', '--with-deps'], {
      stdio: 'pipe',
    });

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 60000);
      });

      const processPromise = new Promise<void>((resolve, reject) => {
        subprocess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
        subprocess.on('error', reject);
      });

      await Promise.race([processPromise, timeoutPromise]);

      this.logger.debug('[LocalBrowserWatchdog] 📦 Playwright install completed');
      const browserPath = await this.findInstalledBrowserPath();
      if (browserPath) {
        return browserPath;
      }
      throw new Error('No local browser path found after: uvx playwright install chrome --with-deps');
    } catch (error) {
      // Kill the subprocess if it's still running
      if (!subprocess.killed) {
        subprocess.kill();
      }
      
      if ((error as Error).message === 'timeout') {
        throw new Error('Timeout getting browser path from playwright');
      }
      throw new Error(`Error getting browser path: ${error}`);
    }
  }

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
      server.on('error', reject);
    });
  }

  private async waitForCdpUrl(port: number, timeout: number = 30000): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(`http://localhost:${port}/json/version`, {
          timeout: 1000,
        });
        
        if (response.status === 200) {
          // Chrome is ready
          return `http://localhost:${port}/`;
        }
      } catch (error) {
        // Connection error - Chrome might not be ready yet
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw new Error(`Browser did not start within ${timeout}ms`);
  }

  private async cleanupProcess(processInfo: ProcessInfo): Promise<void> {
    if (!processInfo) {
      return;
    }

    try {
      // Try graceful shutdown first
      processInfo.process.kill('SIGTERM');

      // Wait up to 5 seconds for graceful shutdown
      const waitForExit = new Promise<void>((resolve) => {
        processInfo.process.on('exit', () => resolve());
        setTimeout(() => resolve(), 5000);
      });

      await waitForExit;

      // If still running, force kill
      if (!processInfo.process.killed) {
        processInfo.process.kill('SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      // Ignore any errors during cleanup
    }
  }

  private async cleanupTempDir(tempDir: string): Promise<void> {
    if (!tempDir) {
      return;
    }

    try {
      // Only remove if it's actually a temp directory we created
      if (tempDir.includes('browseruse-tmp-')) {
        await fs.rmdir(tempDir, { recursive: true });
      }
    } catch (error) {
      this.logger.debug(`Failed to cleanup temp dir ${tempDir}: ${error}`);
    }
  }

  get browserPid(): number | null {
    return this.subprocess?.pid || null;
  }

  static async getBrowserPidViaCdp(browser: any): Promise<number | null> {
    try {
      const cdpSession = await browser.newBrowserCDPSession();
      const result = await cdpSession.send('SystemInfo.getProcessInfo');
      const processInfo = result.processInfo || {};
      const pid = processInfo.id;
      await cdpSession.detach();
      return pid;
    } catch (error) {
      // If we can't get PID via CDP, it's not critical
      return null;
    }
  }
}