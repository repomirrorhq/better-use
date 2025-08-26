/**
 * Browser session management with Playwright integration
 */

import { Browser, BrowserContext, ChromiumBrowser, Page, chromium } from 'playwright';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { BrowserProfile } from './profile';
import { BrowserStateSummary, PageInfo, TabInfo, createBrowserStateSummary, createPageInfo, createTabInfo } from './views';
import { 
  ClickElementEvent, 
  NavigateToUrlEvent, 
  ScreenshotEvent, 
  TargetID,
  TypeTextEvent 
} from './events';
import { BrowserException } from '../exceptions';
import { sleep } from '../utils';
import { CONFIG } from '../config';
import { getLogger } from '../logging';
import { createSerializedDOMStateWithLLMRepresentation } from '../dom/serializer/serializer';
import { DefaultActionWatchdog } from './watchdogs/defaultaction';
import { ScreenshotWatchdog } from './watchdogs/screenshot';

export interface BrowserSessionConfig {
  profile?: BrowserProfile;
  headless?: boolean;
  timeout?: number;
}

export class BrowserSession extends EventEmitter {
  private browser: ChromiumBrowser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  public currentPageId: string | null = null;
  public profile: BrowserProfile;
  private isStarted = false;
  private _loggedUniqueSessionIds = new Set<string>();

  // Public properties for compatibility with controller
  public readonly id: string;
  public agentFocus: { targetId: string } | null = null;
  public eventBus = this; // Use EventEmitter as event bus
  public cdpUrl?: string;
  public downloadedFiles: string[] = [];
  public watchdogs: any[] = []; // Watchdogs for tracking browser events
  private watchdogsAttached = false;
  private cachedSelectorMap: Map<number, any> | null = null;
  private cdpSessionPool: Map<string, any> = new Map(); // CDP session pool for WebSocket persistence

  constructor(config: BrowserSessionConfig = {}) {
    super();
    this.id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.profile = config.profile || BrowserProfile.createDefault();
    if (config.headless !== undefined) {
      this.profile.update({ headless: config.headless });
    }
  }

  // ============================================================================
  // Logging & String Representation
  // ============================================================================

  /**
   * Get dynamic logger with session and target ID for consistent logging
   */
  get logger() {
    return getLogger(`browser_use.${this.toString()}`);
  }

  /**
   * Get human-friendly semi-unique identifier for differentiating different BrowserSession instances in logs
   */
  private get _idForLogs(): string {
    let strId = this.id.slice(-4); // default to last 4 chars of truly random uuid
    const portMatch = (this.cdpUrl || 'no-cdp').match(/:(\d+)/);
    const portNumber = portMatch ? portMatch[1] : null;
    
    if (portNumber) {
      const portIsRandom = !portNumber.startsWith('922');
      const portIsUniqueEnough = !this._loggedUniqueSessionIds.has(portNumber);
      
      if (portIsRandom && portIsUniqueEnough) {
        // if cdp port is random/unique enough to identify this session, use it as our id in logs
        this._loggedUniqueSessionIds.add(portNumber);
        strId = portNumber;
      }
    }
    
    return strId;
  }

  /**
   * Get formatted target ID for logs
   */
  private get _targetIdForLogs(): string {
    const red = '\x1b[91m';
    const reset = '\x1b[0m';
    return this.agentFocus?.targetId?.slice(-2) || `${red}--${reset}`;
  }

  /**
   * String representation for logs
   */
  toString(): string {
    return `BrowserSession🅑 ${this._idForLogs} 🅣 ${this._targetIdForLogs}`;
  }


  // ============================================================================
  // Watchdog System
  // ============================================================================

  /**
   * Initialize and attach all watchdogs to handle browser events
   */
  private async attachAllWatchdogs(): Promise<void> {
    if (this.watchdogsAttached) {
      return;
    }

    try {
      // Initialize DefaultActionWatchdog - handles scroll, click, type, etc.
      const defaultActionWatchdog = new DefaultActionWatchdog(this, {
        enabled: true,
      });
      
      defaultActionWatchdog.attachToSession();
      this.watchdogs.push(defaultActionWatchdog);
      
      // Initialize ScreenshotWatchdog - handles screenshot capture
      const screenshotWatchdog = new ScreenshotWatchdog(this, {
        enabled: true,
        defaultFormat: 'png',
        timeout: 30000,
      });
      
      screenshotWatchdog.attachToSession();
      this.watchdogs.push(screenshotWatchdog);
      
      this.watchdogsAttached = true;
      this.logger.debug('📡 All watchdogs attached successfully');
      
    } catch (error) {
      this.logger.error('❌ Failed to attach watchdogs:', error);
      throw error;
    }
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Dispatch an event and return a promise-like object for chaining
   * This method emits events to watchdogs for handling
   */
  dispatch<T = any>(event: any): { eventResult: () => Promise<T> } {
    const eventResult = async (): Promise<T> => {
      // Determine event type based on properties and emit to watchdogs
      let eventType: string;
      
      if ('url' in event && ('wait_until' in event || 'timeout_ms' in event)) {
        eventType = 'NavigateToUrlEvent';
      } else if ('target_id' in event || 'tabId' in event) {
        eventType = 'SwitchTabEvent';
      } else if ('node' in event && 'while_holding_ctrl' in event) {
        eventType = 'ClickElementEvent';
      } else if ('keys' in event) {
        eventType = 'SendKeysEvent';
      } else if ('text' in event && 'node' in event) {
        eventType = 'TypeTextEvent';
      } else if ('direction' in event && 'amount' in event) {
        eventType = 'ScrollEvent';
      } else if ('text' in event && 'direction' in event) {
        eventType = 'ScrollToTextEvent';
      } else if ('node' in event && 'file_path' in event) {
        eventType = 'UploadFileEvent';
      } else if ('event_timeout' in event && 'id' in event && 'timestamp' in event && 
                 !('url' in event) && !('direction' in event) && !('node' in event) && !('text' in event)) {
        eventType = 'GoBackEvent';
      } else {
        throw new Error(`Event type not implemented: ${JSON.stringify(Object.keys(event))}`);
      }
      
      // Create a promise that resolves when the event is handled
      return new Promise((resolve, reject) => {
        // Set up a one-time listener for completion
        const handleCompletion = (result?: T) => {
          resolve(result || (undefined as T));
        };
        
        const handleError = (error: Error) => {
          reject(error);
        };
        
        // For most events, we emit and assume they complete successfully
        // In a more robust implementation, watchdogs would emit completion events
        try {
          this.emit(eventType, event);
          
          // For navigation events, we handle them directly for now
          if (eventType === 'NavigateToUrlEvent') {
            this.navigateToUrl(event).then(() => handleCompletion()).catch(handleError);
          } else if (eventType === 'GoBackEvent') {
            this.goBack().then(() => handleCompletion()).catch(handleError);
          } else {
            // For other events, assume they complete immediately
            // Watchdogs will handle the actual implementation
            handleCompletion();
          }
        } catch (error) {
          handleError(error as Error);
        }
      });
    };

    return { eventResult };
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
      const launchOptions: any = {
        headless: this.profile.headless,
        args: this.profile.getChromeArgs(),
        timeout: this.profile.timeout,
        // executablePath: this.profile.chromeExecutablePath, // TODO: Add support
      };

      // Only add userDataDir if it's explicitly set (not the default)
      if (this.profile.userDataDir && this.profile.userDataDir !== CONFIG.BROWSER_USE_DEFAULT_USER_DATA_DIR) {
        // Use launchPersistentContext for persistent user data
        this.context = await chromium.launchPersistentContext(this.profile.userDataDir, {
          ...launchOptions,
          viewport: {
            width: this.profile.viewportWidth,
            height: this.profile.viewportHeight,
          },
          deviceScaleFactor: this.profile.deviceScaleFactor,
          ignoreHTTPSErrors: this.profile.toJSON().ignore_certificate_errors,
        });
        // For persistent context, browser handle is the context
        this.browser = this.context as any;
      } else {
        this.browser = await chromium.launch(launchOptions);
        
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
      }

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

      // Handle popup windows created with window.open()
      this.context.on('page', async (newPage: Page) => {
        const newPageId = this.generatePageId();
        this.pages.set(newPageId, newPage);
        this.setupPageEventListeners(newPage, newPageId);
        
        this.logger.debug(`New popup window detected: ${newPageId}, URL: ${newPage.url()}`);
        
        // Emit tab created event for watchdogs
        this.emit('tabCreated', {
          url: newPage.url(),
          target_id: newPageId,
          timestamp: Date.now()
        });
      });

      this.isStarted = true;
      this.emit('browserConnected', { cdp_url: 'playwright://session' });
      
      // Initialize watchdogs after browser is started
      await this.attachAllWatchdogs();
      
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
    const page = this.getInternalCurrentPage();
    
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
    const page = this.getInternalCurrentPage();
    
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
    const page = this.getInternalCurrentPage();
    
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
    const page = this.getInternalCurrentPage();
    
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
      const currentPage = this.getInternalCurrentPage();
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

      // Get page info with actual dimensions
      const viewport = currentPage.viewportSize() || { width: 1280, height: 720 };
      let pageWidth = viewport.width;
      let pageHeight = viewport.height;

      try {
        // Try to get actual page dimensions using evaluate
        const dimensions = await currentPage.evaluate(() => {
          return {
            scrollWidth: Math.max(
              document.documentElement.scrollWidth,
              document.body?.scrollWidth || 0
            ),
            scrollHeight: Math.max(
              document.documentElement.scrollHeight,
              document.body?.scrollHeight || 0
            ),
          };
        });
        pageWidth = dimensions.scrollWidth;
        pageHeight = dimensions.scrollHeight;
      } catch (error) {
        // Fallback to viewport size if evaluation fails
        getLogger('browser').debug(`Failed to get page dimensions: ${error}`);
      }

      const pageInfo = createPageInfo(
        viewport.width,
        viewport.height,
        pageWidth,
        pageHeight,
      );

      // Add basic DOM state with selector map
      const domState = await this.getDOMState();
      
      return createBrowserStateSummary(
        url,
        title,
        screenshot,
        tabs,
        this.currentPageId || '',
        pageInfo,
        { dom_state: domState }
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
      url: this.getInternalCurrentPage().url(),
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

  private getInternalCurrentPage(): Page {
    if (!this.currentPageId || !this.pages.has(this.currentPageId)) {
      throw new BrowserException('No active page available');
    }
    return this.pages.get(this.currentPageId)!;
  }

  private generatePageId(): string {
    return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private nodeToSelector(node: any): string {
    // Check if we have a pre-built selector (from our simplified approach)
    if (node.selector) {
      return node.selector;
    }
    
    // Build selector from standard attributes
    if (node.attributes) {
      if (node.attributes.id) {
        return `#${node.attributes.id}`;
      }
      if (node.attributes.class) {
        return `.${node.attributes.class.split(' ')[0]}`;
      }
    }
    
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

  get browserProfile(): BrowserProfile {
    return this.profile;
  }

  getCurrentPage(): Page {
    if (!this.currentPageId || !this.pages.has(this.currentPageId)) {
      throw new BrowserException('No active page available');
    }
    return this.pages.get(this.currentPageId)!;
  }

  async getTabs(): Promise<TabInfo[]> {
    const tabs: TabInfo[] = [];
    
    for (const [pageId, page] of this.pages) {
      try {
        const url = page.url();
        const title = await page.title();
        tabs.push({
          url,
          title,
          target_id: pageId,
        });
      } catch (error) {
        // If page is closed or unavailable, skip it
        console.warn(`Failed to get info for tab ${pageId}:`, error);
      }
    }
    
    return tabs;
  }

  async getCurrentPageUrl(): Promise<string> {
    const currentPage = this.getInternalCurrentPage();
    if (!currentPage) {
      throw new Error('No current page available');
    }
    return currentPage.url();
  }

  async getCurrentPageTitle(): Promise<string> {
    const currentPage = this.getInternalCurrentPage();
    if (!currentPage) {
      throw new Error('No current page available');
    }
    try {
      return await currentPage.title();
    } catch (error) {
      this.logger.warn(`Failed to get page title: ${error}`);
      return 'Page';
    }
  }

  async addInitScript(script: string): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not available');
    }
    try {
      await this.context.addInitScript(script);
    } catch (error) {
      // If page isn't ready, this may fail - that's expected
      throw error;
    }
  }

  getCurrentTargetId(): string | null {
    return this.currentPageId;
  }

  async getElementByIndex(index: number): Promise<any> {
    try {
      const currentPage = this.getInternalCurrentPage();
      
      // Use the same approach as getDOMState - get all interactive elements and find by index
      const elementInfo = await currentPage.evaluate((targetIndex) => {
        let currentIndex = 1; // Start from index 1 as per Python version
        
        // Get all interactive elements (buttons, links, inputs, etc.) - same as getDOMState
        const interactiveSelector = 'a, button, input, select, textarea, [onclick], [role="button"], [tabindex]:not([tabindex="-1"]), .clickable';
        const allElements = Array.from(document.querySelectorAll(interactiveSelector));
        
        for (const element of allElements) {
          const htmlElement = element as HTMLElement;
          if (htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0) {
            if (currentIndex === targetIndex) {
              const rect = element.getBoundingClientRect();
              return {
                tagName: element.tagName.toLowerCase(),
                id: (element as any).id,
                className: (element as any).className,
                selector: (element as any).id ? '#' + (element as any).id : 
                         (element as any).className ? '.' + (element as any).className.split(' ')[0] :
                         element.tagName.toLowerCase(),
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                },
                text: element.textContent ? element.textContent.trim() : ''
              };
            }
            currentIndex++;
          }
        }
        return null;
      }, index);
      
      if (!elementInfo) {
        throw new Error(`Element with index ${index} not found`);
      }
      
      // Create a mock EnhancedDOMTreeNode that will pass validation
      const element = this.createMockDOMNode(elementInfo, index);
      
      return element;
    } catch (error) {
      throw new Error(`Failed to get element by index ${index}: ${error}`);
    }
  }

  isFileInput(node: any): boolean {
    // Check if element is a file input
    // First check if DOM watchdog has the method
    const domWatchdog = this.watchdogs.find((w: any) => w.constructor.name === 'DOMWatchdog');
    if (domWatchdog && typeof domWatchdog.isFileInput === 'function') {
      return domWatchdog.isFileInput(node);
    }
    
    // Fallback: check if it's an INPUT element with type="file"
    if (node?.node_name && node.node_name.toUpperCase() === 'INPUT') {
      if (node.attributes?.type) {
        return node.attributes.type.toLowerCase() === 'file';
      }
    }
    
    return false;
  }

  async getOrCreateCdpSession(targetId?: string): Promise<any> {
    // Create a CDP-compatible client using Playwright's CDP functionality
    let currentPage;
    try {
      currentPage = this.getCurrentPage();
    } catch (error) {
      return null;
    }
    if (!currentPage) {
      return null;
    }

    // Use targetId or generate one based on page URL
    const sessionKey = targetId || currentPage.url() || 'default';
    
    // Check if we already have a session for this target in the pool
    if (this.cdpSessionPool.has(sessionKey)) {
      this.logger.debug(`Reusing existing CDP session for target: ${sessionKey}`);
      return this.cdpSessionPool.get(sessionKey);
    }

    // Create new CDP session
    this.logger.debug(`Creating new CDP session for target: ${sessionKey}`);
    const cdpSession = await currentPage.context().newCDPSession(currentPage);
    
    const wrappedSession = {
      cdpClient: {
        send: {
          Runtime: {
            evaluate: async (params: any, sessionId?: string) => {
              return await cdpSession.send('Runtime.evaluate', params);
            }
          },
          DOM: {
            getDocument: async (params = {}, sessionId?: string) => {
              return await cdpSession.send('DOM.getDocument', params);
            },
            getOuterHTML: async (params: any, sessionId?: string) => {
              return await cdpSession.send('DOM.getOuterHTML', params);
            }
          },
          Target: {
            getTargetInfo: async (params: any, sessionId?: string) => {
              return await cdpSession.send('Target.getTargetInfo', params);
            }
          },
          Page: {
            getLayoutMetrics: async (params = {}, sessionId?: string) => {
              return await cdpSession.send('Page.getLayoutMetrics', params);
            }
          }
        }
      },
      sessionId: sessionKey,
      rawSession: cdpSession // Keep reference to raw session for cleanup
    };
    
    // Store in pool for reuse
    this.cdpSessionPool.set(sessionKey, wrappedSession);
    
    return wrappedSession;
  }
  
  /**
   * Clear CDP session for a specific target
   */
  clearCdpSession(targetId?: string): void {
    const sessionKey = targetId || 'default';
    if (this.cdpSessionPool.has(sessionKey)) {
      this.logger.debug(`Clearing CDP session for target: ${sessionKey}`);
      const session = this.cdpSessionPool.get(sessionKey);
      // Detach the raw CDP session if possible
      if (session?.rawSession?.detach) {
        try {
          session.rawSession.detach();
        } catch (error) {
          // Ignore detach errors
        }
      }
      this.cdpSessionPool.delete(sessionKey);
    }
  }
  
  /**
   * Clear all CDP sessions in the pool
   */
  clearAllCdpSessions(): void {
    this.logger.debug(`Clearing all ${this.cdpSessionPool.size} CDP sessions`);
    for (const [key, session] of this.cdpSessionPool.entries()) {
      // Detach the raw CDP session if possible
      if (session?.rawSession?.detach) {
        try {
          session.rawSession.detach();
        } catch (error) {
          // Ignore detach errors
        }
      }
    }
    this.cdpSessionPool.clear();
  }

  // Add cdpClient getter for compatibility
  get cdpClient(): any {
    // Return a synchronous wrapper that creates the session on demand
    let currentPage;
    try {
      currentPage = this.getCurrentPage();
    } catch (error) {
      return null;
    }
    if (!currentPage) {
      return null;
    }

    return {
      send: {
        Runtime: {
          evaluate: async (params: any, sessionId?: string) => {
            const cdpSession = await currentPage.context().newCDPSession(currentPage);
            return await cdpSession.send('Runtime.evaluate', params);
          }
        },
        DOM: {
          getDocument: async (params = {}, sessionId?: string) => {
            const cdpSession = await currentPage.context().newCDPSession(currentPage);
            return await cdpSession.send('DOM.getDocument', params);
          },
          getOuterHTML: async (params: any, sessionId?: string) => {
            const cdpSession = await currentPage.context().newCDPSession(currentPage);
            return await cdpSession.send('DOM.getOuterHTML', params);
          }
        },
        Target: {
          getTargetInfo: async (params: any, sessionId?: string) => {
            const cdpSession = await currentPage.context().newCDPSession(currentPage);
            return await cdpSession.send('Target.getTargetInfo', params);
          }
        }
      }
    };
  }


  /**
   * Get list of downloaded files
   */
  async getDownloadedFiles(): Promise<string[]> {
    // Get downloads from the downloads watchdog
    const downloadsWatchdog = this.watchdogs.find(w => w.constructor.name === 'DownloadsWatchdog');
    if (downloadsWatchdog) {
      // Access the download files from the watchdog
      // In the current implementation, downloads are tracked by the watchdog
      return this.downloadedFiles || [];
    }
    return [];
  }

  /**
   * Get selector map for elements from cached state or DOM watchdog
   */
  async getSelectorMap(): Promise<Map<number, any>> {
    // First try cached selector map
    if (this.cachedSelectorMap) {
      return this.cachedSelectorMap;
    }

    // Try to get from DOM watchdog
    const domWatchdog = this.watchdogs.find(w => w.constructor.name === 'DOMWatchdog');
    if (domWatchdog?.selectorMap) {
      this.cachedSelectorMap = domWatchdog.selectorMap;
      return domWatchdog.selectorMap;
    }

    // Return empty map if no selector map available
    return new Map();
  }

  /**
   * Update cached selector map
   */
  updateSelectorMap(selectorMap: Map<number, any>): void {
    this.cachedSelectorMap = selectorMap;
  }

  /**
   * Get target ID from tab ID (stub implementation)
   */
  async getTargetIdFromTabId(tabId: string): Promise<string | null> {
    return tabId; // Simple mapping for now
  }

  /**
   * Get target ID from URL (stub implementation)
   */
  async getTargetIdFromUrl(url: string): Promise<string | null> {
    // Search through pages for matching URL
    for (const [pageId, page] of this.pages) {
      try {
        if (page.url() === url) {
          return pageId;
        }
      } catch (error) {
        // Ignore errors for closed pages
      }
    }
    return null;
  }

  /**
   * Get most recently opened target ID (stub implementation)
   */
  async getMostRecentlyOpenedTargetId(): Promise<string> {
    // Return the current page ID or first available
    if (this.currentPageId) {
      return this.currentPageId;
    }
    
    const pages = Array.from(this.pages.keys());
    if (pages.length > 0) {
      return pages[pages.length - 1]; // Return last page
    }
    
    throw new Error('No pages available');
  }

  async sendKeys(event: { keys: string; event_timeout?: number }): Promise<void> {
    // The actual sendKeys implementation is handled by the DefaultActionWatchdog
    // This method just logs for debugging, the real work happens in the watchdog
    this.logger.debug(`⌨️ Processing sendKeys event: "${event.keys}"`);
  }

  async scrollEvent(event: { direction: string; amount: number; node?: any; event_timeout?: number }): Promise<void> {
    // This method is kept for compatibility but the actual scroll implementation
    // is handled by the DefaultActionWatchdog through the event system
    this.logger.debug(`📜 Processing scroll event: ${event.direction} ${event.amount}px (handled by watchdog)`);
  }

  async scrollToText(event: { text: string; direction?: 'up' | 'down' }): Promise<void> {
    try {
      const currentPage = this.getInternalCurrentPage();
      this.logger.debug(`🔍 Scrolling to text: "${event.text}"`);

      // Try to find and scroll to text using the same logic as the watchdog
      const found = await currentPage.evaluate((text: string) => {
        // Use TreeWalker to find text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );
        
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent && node.textContent.includes(text)) {
            const element = node.parentElement;
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return true;
            }
          }
        }
        return false;
      }, event.text);

      if (found) {
        this.logger.debug(`✅ Successfully scrolled to text: "${event.text}"`);
      } else {
        this.logger.warn(`⚠️ Text not found: "${event.text}"`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to scroll to text "${event.text}":`, error);
      throw error;
    }
  }

  async uploadFile(event: { node: any; file_path: string; event_timeout?: number }): Promise<void> {
    // The actual file upload implementation is handled by the DefaultActionWatchdog
    // This method just logs for debugging, the real work happens in the watchdog
    const elementIndex = event.node.element_index || 'unknown';
    this.logger.debug(`📁 Processing file upload event: "${event.file_path}" to element ${elementIndex}`);
  }

  /**
   * Create a mock EnhancedDOMTreeNode that passes validation
   * This is a simplified approach for testing without full DOM integration
   */
  private createMockDOMNode(elementInfo: any, index: number): any {
    return {
      // DOM Node data
      node_id: index,
      backend_node_id: index,
      node_type: 1, // ELEMENT_NODE
      node_name: elementInfo.tagName.toUpperCase(),
      node_value: '',
      
      // Attributes
      attributes: {
        id: elementInfo.id || '',
        class: elementInfo.className || '',
      },
      
      // Visibility and interaction
      is_scrollable: false,
      is_visible: true,
      
      // Position
      absolute_position: {
        x: elementInfo.rect.x,
        y: elementInfo.rect.y,
        width: elementInfo.rect.width,
        height: elementInfo.rect.height,
      },
      
      // Browser context
      target_id: this.currentPageId || 'default',
      frame_id: 'main',
      session_id: 'default',
      
      // Document and shadow DOM
      content_document: null,
      shadow_root_type: '',
      shadow_roots: [],
      
      // Tree structure
      parent_node: null,
      children_nodes: [],
      
      // Accessibility
      ax_node: null,
      
      // Snapshot
      snapshot_node: null,
      
      // Element index
      element_index: index,
      
      // UUID
      uuid: `mock-${index}-${Date.now()}`,
      
      // Custom selector for click handling
      selector: elementInfo.selector,
    };
  }

  /**
   * Get DOM state with selector map for current page
   */
  private async getDOMState(): Promise<any> {
    try {
      const currentPage = this.getInternalCurrentPage();
      
      // Wait for page to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get all clickable/interactable elements from the page using evaluate
      const elements = await currentPage.evaluate(() => {
        const selectorMap: any = {};
        let index = 1; // Start from index 1 as per Python version
        
        // Get all interactive elements (buttons, links, inputs, etc.)
        const interactiveSelector = 'a, button, input, select, textarea, [onclick], [role="button"], [tabindex]:not([tabindex="-1"]), .clickable';
        const allElements = Array.from(document.querySelectorAll(interactiveSelector));
        
        allElements.forEach((element: Element) => {
          const htmlElement = element as HTMLElement;
          if (htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0) {
            const rect = element.getBoundingClientRect();
            
            selectorMap[index] = {
              tagName: element.tagName.toLowerCase(),
              attributes: {
                class: htmlElement.className || '',
                id: htmlElement.id || '',
                type: (htmlElement as any).type || null,
                href: (htmlElement as any).href || null,
              },
              text: element.textContent ? element.textContent.trim() : '',
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: rect.width > 0 && rect.height > 0
            };
            index++;
          }
        });
        
        return selectorMap;
      });
      
      
      // Return DOM state with llmRepresentation method
      // Keep selector map as plain object for JSON serialization
      const selectorMap = elements || {};

      return createSerializedDOMStateWithLLMRepresentation(
        null, // root node - placeholder for now
        selectorMap
      );
    } catch (error) {
      console.warn('Failed to get DOM state, returning empty state:', error);
      return createSerializedDOMStateWithLLMRepresentation(null, {});
    }
  }

  /**
   * Get the number of open pages/tabs
   */
  getPageCount(): number {
    return this.pages.size;
  }

  /**
   * Create a new blank page
   */
  async createNewPage(url: string = 'about:blank'): Promise<void> {
    if (!this.context) {
      throw new BrowserException('Browser context not available');
    }

    const newPage = await this.context.newPage();
    await newPage.goto(url);
    
    const newPageId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.pages.set(newPageId, newPage);
    
    this.emit('tabCreated', {
      url: url,
      target_id: newPageId,
      timestamp: Date.now()
    });
  }

  /**
   * Switch to the most recently opened page/tab
   */
  async switchToLatestPage(): Promise<void> {
    const pageIds = Array.from(this.pages.keys());
    if (pageIds.length > 0) {
      const latestPageId = pageIds[pageIds.length - 1];
      await this.switchTab(latestPageId);
    }
  }

  /**
   * Go back in browser history
   */
  async goBack(): Promise<void> {
    const currentPage = this.getCurrentPage();
    if (currentPage) {
      await currentPage.goBack();
    }
  }

  /**
   * List all tabs (alias for getTabs for compatibility)
   */
  async listTabs(): Promise<TabInfo[]> {
    return await this.getTabs();
  }

  /**
   * Remove highlights from the page
   */
  async removeHighlights(): Promise<void> {
    const currentPage = this.getCurrentPage();
    if (!currentPage) {
      return;
    }

    try {
      const result = await currentPage.evaluate(() => {
        // Remove all browser-use highlight elements
        const highlights = document.querySelectorAll('[data-browser-use-highlight]');
        console.log('Removing', highlights.length, 'browser-use highlight elements');
        highlights.forEach(el => el.remove());
        
        // Also remove by ID in case selector missed anything
        const highlightContainer = document.getElementById('browser-use-debug-highlights');
        if (highlightContainer) {
          console.log('Removing highlight container by ID');
          highlightContainer.remove();
        }
        
        // Final cleanup - remove any orphaned tooltips
        const orphanedTooltips = document.querySelectorAll('[data-browser-use-highlight="tooltip"]');
        orphanedTooltips.forEach(el => el.remove());
        
        return { removed: highlights.length };
      });

      if (result && result.removed > 0) {
        getLogger('browser').debug(`Successfully removed ${result.removed} highlight elements`);
      }
    } catch (error) {
      getLogger('browser').warning(`Failed to remove highlights: ${error}`);
    }
  }

  /**
   * Get the underlying browser instance
   */
  getBrowser(): ChromiumBrowser | null {
    return this.browser;
  }

  /**
   * Check if this is a local browser session
   */
  get isLocal(): boolean {
    // For now, assume all sessions are local unless connecting via CDP
    return !this.cdpUrl;
  }
}