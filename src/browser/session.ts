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
import { CONFIG } from '../config';
import { getLogger } from '../logging';

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
  private _loggedUniqueSessionIds = new Set<string>();

  // Public properties for compatibility with controller
  public readonly id: string;
  public agentFocus: { targetId: string } | null = null;
  public eventBus = this; // Use EventEmitter as event bus
  public cdpUrl?: string;

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

  /**
   * Get browser profile accessor for compatibility
   */
  get browserProfile() {
    return this.profile;
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Dispatch an event and return a promise-like object for chaining
   * This method provides compatibility with the expected event dispatch pattern
   */
  dispatch<T = any>(event: any): { eventResult: () => Promise<T> } {
    // For now, this is a stub implementation
    // In a full implementation, this would:
    // 1. Process the event
    // 2. Execute the corresponding action
    // 3. Return the result
    
    const eventResult = async (): Promise<T> => {
      // Handle different event types based on their structure/properties
      // Use duck typing to identify event types since constructor.name may not be reliable
      if ('url' in event && ('wait_until' in event || 'timeout_ms' in event)) {
        // NavigateToUrlEvent
        await this.navigateToUrl(event);
        return undefined as T;
      } else if ('target_id' in event || 'tabId' in event) {
        // SwitchTabEvent
        return (event as any).target_id as T;
      } else if ('node' in event && 'while_holding_ctrl' in event) {
        // ClickElementEvent
        await this.clickElement(event);
        return undefined as T;
      } else if ('keys' in event) {
        // SendKeysEvent
        await this.sendKeys(event);
        return undefined as T;
      } else if ('text' in event && 'node' in event) {
        // TypeTextEvent
        await this.typeText(event);
        return undefined as T;
      } else if ('down' in event && 'num_pages' in event) {
        // ScrollEvent
        await this.scroll(event);
        return undefined as T;
      } else if ('text' in event && 'scroll_into_view' in event) {
        // ScrollToTextEvent
        // TODO: Implement scrollToText method
        console.warn('ScrollToTextEvent not fully implemented');
        return undefined as T;
      } else if ('node' in event && 'file_path' in event) {
        // UploadFileEvent - has 'node' and 'file_path' properties
        await this.uploadFile(event);
        return undefined as T;
      } else {
        throw new Error(`Event type not implemented: ${JSON.stringify(Object.keys(event))}`);
      }
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
    const currentPage = this.getCurrentPage();
    if (!currentPage) {
      throw new Error('No current page available');
    }
    return currentPage.url();
  }

  getCurrentTargetId(): string | null {
    return this.currentPageId;
  }

  async getElementByIndex(index: number): Promise<any> {
    try {
      const currentPage = this.getCurrentPage();
      
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
    // This would need to be implemented with proper DOM integration  
    // For now, return false
    return false;
  }

  getOrCreateCdpSession(): any {
    // This would need to be implemented with CDP integration
    // For now, return null
    return null;
  }

  // Add cdpClient getter for compatibility
  get cdpClient(): any {
    return this.getOrCreateCdpSession();
  }


  /**
   * Get list of downloaded files
   * TODO: Implement proper download tracking
   */
  async getDownloadedFiles(): Promise<string[]> {
    // This is a stub implementation
    // In a full implementation, this would track downloads via CDP
    return [];
  }

  /**
   * Get selector map for elements (stub implementation)
   * TODO: Implement proper selector mapping
   */
  async getSelectorMap(): Promise<Record<string, string>> {
    return {};
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

  async sendKeys(event: { keys: string }): Promise<void> {
    // TODO: Implement sending keys
    console.log(`⌨️ Sending keys: "${event.keys}"`);
  }

  async scroll(event: { down: boolean; num_pages: number }): Promise<void> {
    // TODO: Implement scrolling
    console.log(`📜 Scrolling ${event.down ? 'down' : 'up'} ${event.num_pages} pages`);
  }

  async uploadFile(event: { index: number; path: string }): Promise<void> {
    // TODO: Implement file upload
    console.log(`📁 Uploading file "${event.path}" to element ${event.index}`);
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
      const currentPage = this.getCurrentPage();
      
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
      
      
      return {
        selector_map: elements || {},
        _root: null // Placeholder for root node
      };
    } catch (error) {
      console.warn('Failed to get DOM state, returning empty state:', error);
      return {
        selector_map: {},
        _root: null
      };
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
}