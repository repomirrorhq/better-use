/**
 * Browser session management with Playwright integration
 */

import { chromium, Browser, BrowserContext, Page, ChromiumBrowser } from 'playwright';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { BrowserProfile } from './profile';
import { BrowserStateSummary, TabInfo, PageInfo, createBrowserStateSummary, createTabInfo, createPageInfo } from './views';
import { 
  NavigateToUrlEvent, 
  ClickElementEvent, 
  TypeTextEvent, 
  ScreenshotEvent,
  TargetID 
} from './events';
import { BrowserException } from '../exceptions';
import { sleep } from '../utils';

export interface BrowserSessionConfig {
  profile?: BrowserProfile;
  headless?: boolean;
  timeout?: number;
}

export class BrowserSession extends EventEmitter {
  private browser: ChromiumBrowser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private currentPageId: string | null = null;
  private profile: BrowserProfile;
  private isStarted = false;
  private logger = console; // TODO: Use proper logger

  constructor(config: BrowserSessionConfig = {}) {
    super();
    this.profile = config.profile || BrowserProfile.createDefault();
    if (config.headless !== undefined) {
      this.profile.update({ headless: config.headless });
    }
  }

  // ============================================================================
  // Browser Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    try {
      this.logger.debug('Starting browser session...');
      
      // Launch Chromium with profile settings
      this.browser = await chromium.launch({
        headless: this.profile.headless,
        args: this.profile.getChromeArgs(),
        timeout: this.profile.timeout,
        // executablePath: this.profile.chromeExecutablePath, // TODO: Add support
      });

      // Create browser context
      this.context = await this.browser.newContext({
        viewport: {
          width: this.profile.viewportWidth,
          height: this.profile.viewportHeight,
        },
        deviceScaleFactor: this.profile.deviceScaleFactor,
        // userAgent: '...', // TODO: Add custom user agent support
        ignoreHTTPSErrors: this.profile.toJSON().ignore_certificate_errors,
      });

      // Set up proxy if configured
      if (this.profile.proxy) {
        // Note: Playwright proxy needs to be set during context creation
        // This is a limitation we'll need to handle in the profile setup
        this.logger.warn('Proxy configuration should be set during browser launch');
      }

      // Create initial page
      const page = await this.context.newPage();
      const pageId = this.generatePageId();
      this.pages.set(pageId, page);
      this.currentPageId = pageId;

      // Set up page event listeners
      this.setupPageEventListeners(page, pageId);

      this.isStarted = true;
      this.emit('browserConnected', { cdp_url: 'playwright://session' });
      
      this.logger.debug('Browser session started successfully');
    } catch (error) {
      this.logger.error('Failed to start browser session:', error);
      throw new BrowserException(`Failed to start browser: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      this.logger.debug('Stopping browser session...');

      // Close all pages
      for (const [pageId, page] of this.pages) {
        try {
          if (!page.isClosed()) {
            await page.close();
          }
        } catch (error) {
          this.logger.warn(`Error closing page ${pageId}:`, error);
        }
      }
      this.pages.clear();

      // Close context
      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.currentPageId = null;
      this.isStarted = false;
      this.emit('browserStopped', { reason: 'Manual stop' });
      
      this.logger.debug('Browser session stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping browser session:', error);
      throw new BrowserException(`Failed to stop browser: ${error}`);
    }
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  async navigateToUrl(event: NavigateToUrlEvent): Promise<void> {
    const page = this.getCurrentPage();
    
    try {
      this.logger.debug(`Navigating to: ${event.url}`);
      
      if (event.new_tab) {
        // Create new page/tab
        const newPage = await this.context!.newPage();
        const newPageId = this.generatePageId();
        this.pages.set(newPageId, newPage);
        this.setupPageEventListeners(newPage, newPageId);
        this.currentPageId = newPageId;
        
        await newPage.goto(event.url, {
          waitUntil: event.wait_until as any,
          timeout: event.timeout_ms || this.profile.navigationTimeout,
        });
      } else {
        await page.goto(event.url, {
          waitUntil: event.wait_until as any,
          timeout: event.timeout_ms || this.profile.navigationTimeout,
        });
      }

      this.emit('navigationComplete', {
        target_id: this.currentPageId,
        url: event.url,
        status: 200,
      });
      
    } catch (error) {
      this.logger.error(`Navigation failed for ${event.url}:`, error);
      this.emit('navigationComplete', {
        target_id: this.currentPageId,
        url: event.url,
        status: null,
        error_message: String(error),
      });
      throw new BrowserException(`Navigation failed: ${error}`);
    }
  }

  // ============================================================================
  // Interaction
  // ============================================================================

  async clickElement(event: ClickElementEvent): Promise<void> {
    const page = this.getCurrentPage();
    
    try {
      // Find element by index or selector
      const selector = this.nodeToSelector(event.node);
      
      const modifiers = [];
      if (event.while_holding_ctrl) {
        modifiers.push('Control');
      }

      await page.click(selector, {
        button: event.button as any,
        modifiers: modifiers as any,
        timeout: (event.event_timeout || 15) * 1000,
      });

      this.logger.debug(`Clicked element: ${selector}`);
    } catch (error) {
      this.logger.error(`Click failed:`, error);
      throw new BrowserException(`Click failed: ${error}`);
    }
  }

  async typeText(event: TypeTextEvent): Promise<void> {
    const page = this.getCurrentPage();
    
    try {
      const selector = this.nodeToSelector(event.node);
      
      if (event.clear_existing) {
        await page.fill(selector, event.text);
      } else {
        await page.type(selector, event.text);
      }

      this.logger.debug(`Typed text into element: ${selector}`);
    } catch (error) {
      this.logger.error(`Type text failed:`, error);
      throw new BrowserException(`Type text failed: ${error}`);
    }
  }

  // ============================================================================
  // Screenshots
  // ============================================================================

  async takeScreenshot(event: ScreenshotEvent): Promise<string> {
    const page = this.getCurrentPage();
    
    try {
      const options: any = {
        type: 'png',
      };

      if (event.full_page) {
        options.fullPage = true;
      }

      if (event.clip) {
        options.clip = event.clip;
      }

      const screenshot = await page.screenshot(options);
      return screenshot.toString('base64');
    } catch (error) {
      this.logger.error(`Screenshot failed:`, error);
      throw new BrowserException(`Screenshot failed: ${error}`);
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  async getBrowserState(): Promise<BrowserStateSummary> {
    try {
      const currentPage = this.getCurrentPage();
      const url = currentPage.url();
      const title = await currentPage.title();
      const screenshot = await this.takeScreenshot({ full_page: false });

      // Get all tabs
      const tabs: TabInfo[] = [];
      for (const [pageId, page] of this.pages) {
        tabs.push(createTabInfo(
          page.url(),
          await page.title().catch(() => 'Unknown'),
          pageId
        ));
      }

      // Get page info
      const viewport = currentPage.viewportSize() || { width: 1280, height: 720 };
      const pageInfo = createPageInfo(
        viewport.width,
        viewport.height,
        viewport.width, // TODO: Get actual page dimensions
        viewport.height,
      );

      return createBrowserStateSummary(
        url,
        title,
        screenshot,
        tabs,
        this.currentPageId || '',
        pageInfo
      );
    } catch (error) {
      this.logger.error(`Failed to get browser state:`, error);
      throw new BrowserException(`Failed to get browser state: ${error}`);
    }
  }

  // ============================================================================
  // Tab Management
  // ============================================================================

  async switchTab(targetId?: TargetID): Promise<void> {
    if (!targetId) {
      // Switch to most recently created tab
      const pageIds = Array.from(this.pages.keys());
      if (pageIds.length > 0) {
        this.currentPageId = pageIds[pageIds.length - 1];
      }
    } else if (this.pages.has(targetId)) {
      this.currentPageId = targetId;
    } else {
      throw new BrowserException(`Tab with ID ${targetId} not found`);
    }

    this.emit('agentFocusChanged', {
      target_id: this.currentPageId,
      url: this.getCurrentPage().url(),
    });
  }

  async closeTab(targetId: TargetID): Promise<void> {
    const page = this.pages.get(targetId);
    if (!page) {
      throw new BrowserException(`Tab with ID ${targetId} not found`);
    }

    try {
      await page.close();
      this.pages.delete(targetId);

      // If we closed the current tab, switch to another one
      if (this.currentPageId === targetId) {
        const remainingPages = Array.from(this.pages.keys());
        this.currentPageId = remainingPages.length > 0 ? remainingPages[0] : null;
      }

      this.emit('tabClosed', { target_id: targetId });
    } catch (error) {
      this.logger.error(`Failed to close tab ${targetId}:`, error);
      throw new BrowserException(`Failed to close tab: ${error}`);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getCurrentPage(): Page {
    if (!this.currentPageId || !this.pages.has(this.currentPageId)) {
      throw new BrowserException('No active page available');
    }
    return this.pages.get(this.currentPageId)!;
  }

  private generatePageId(): string {
    return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private nodeToSelector(node: any): string {
    // This is a simplified selector generation
    // In the full implementation, this would use the DOM tree information
    if (node.element_index !== undefined) {
      return `[data-element-index="${node.element_index}"]`;
    }
    
    // Fallback to a generic selector
    return `*[data-node-id="${node.node_id}"]`;
  }

  private setupPageEventListeners(page: Page, pageId: string): void {
    page.on('load', () => {
      this.emit('navigationComplete', {
        target_id: pageId,
        url: page.url(),
        status: 200,
      });
    });

    page.on('crash', () => {
      this.emit('targetCrashed', {
        target_id: pageId,
        error: 'Page crashed',
      });
    });

    page.on('close', () => {
      this.pages.delete(pageId);
      this.emit('tabClosed', { target_id: pageId });
    });
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get isRunning(): boolean {
    return this.isStarted && this.browser !== null;
  }

  get currentTabId(): TargetID | null {
    return this.currentPageId;
  }

  get tabCount(): number {
    return this.pages.size;
  }
}