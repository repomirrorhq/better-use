/**
 * DOM watchdog for browser DOM tree management
 * 
 * This watchdog acts as a bridge between the event-driven browser session
 * and the DOM service implementation, maintaining cached state and providing
 * helper methods for other watchdogs.
 */

import { BaseWatchdog } from './base';
import { BrowserSession } from '../session';
import { TabCreatedEvent, BrowserStateRequestEvent, ScreenshotEvent, BrowserErrorEvent } from '../events-classes';
import { BrowserStateSummary, PageInfo, createPageInfo, createBrowserStateSummary } from '../views';
import { DomService } from '../../dom/service';
import { SerializedDOMState, EnhancedDOMTreeNode } from '../../dom/views';
import { sleep } from '../../utils';
import { getLogger } from '../../logging';

export interface DOMWatchdogConfig {
  enabled?: boolean;
}

export class DOMWatchdog extends BaseWatchdog {
  public static readonly LISTENS_TO = [TabCreatedEvent, BrowserStateRequestEvent];
  public static readonly EMITS = [BrowserErrorEvent];

  // Public properties for other watchdogs
  public selectorMap: Map<number, EnhancedDOMTreeNode> | null = null;
  public currentDomState: SerializedDOMState | null = null;
  public enhancedDomTree: EnhancedDOMTreeNode | null = null;

  // Internal DOM service
  private domService: DomService | null = null;
  private customLogger = getLogger('DOMWatchdog');
  
  protected get logger() {
    return this.customLogger;
  }

  constructor(
    browserSession: BrowserSession,
    config: DOMWatchdogConfig = {}
  ) {
    super(browserSession, config);
  }

  async onTabCreatedEvent(event: TabCreatedEvent): Promise<void> {
    this.logger.debug('💉 Injecting DOM Service init script to track event listeners added to DOM elements by JS...');

    const initScript = `
      // check to make sure we're not inside the PDF viewer
      window.isPdfViewer = !!document?.body?.querySelector('body > embed[type="application/pdf"][width="100%"]')
      if (!window.isPdfViewer) {

        // Permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
        (() => {
          if (window._eventListenerTrackerInitialized) return;
          window._eventListenerTrackerInitialized = true;

          const originalAddEventListener = EventTarget.prototype.addEventListener;
          const eventListenersMap = new WeakMap();

          EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (typeof listener === "function") {
              let listeners = eventListenersMap.get(this);
              if (!listeners) {
                listeners = [];
                eventListenersMap.set(this, listeners);
              }

              listeners.push({
                type,
                listener,
                listenerPreview: listener.toString().slice(0, 100),
                options
              });
            }

            return originalAddEventListener.call(this, type, listener, options);
          };

          window.getEventListenersForNode = (node) => {
            const listeners = eventListenersMap.get(node) || [];
            return listeners.map(({ type, listenerPreview, options }) => ({
              type,
              listenerPreview,
              options
            }));
          };
        })();
      }
    `;

    // Try to inject the script, but don't fail if the page isn't ready
    try {
      await this.browserSession.addInitScript(initScript);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not ready')) {
        this.logger.debug(`Page not ready for new tab, skipping init script injection: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  private getRecentEventsStr(limit: number = 10): string | null {
    try {
      // Simple implementation for TypeScript - EventEmitter doesn't have built-in history
      // This would need to be implemented if event history tracking is needed
      return null;
    } catch (error) {
      this.logger.debug(`Failed to get recent events: ${error}`);
      return null;
    }
  }

  async onBrowserStateRequestEvent(event: BrowserStateRequestEvent): Promise<BrowserStateSummary> {
    this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: STARTING browser state request');
    
    const pageUrl = await this.browserSession.getCurrentPageUrl();
    this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Got page URL: ${pageUrl}`);
    
    if (this.browserSession.agentFocus) {
      this.logger.debug(
        `📍 Current page URL: ${pageUrl}, target_id: ${this.browserSession.agentFocus.targetId}`
      );
    } else {
      this.logger.debug(`📍 Current page URL: ${pageUrl}, no active session`);
    }

    // Check if we should skip DOM tree build for pointless pages
    const notAMeaningfulWebsite = !pageUrl.toLowerCase().startsWith('http');

    // Wait for page stability using browser profile settings
    if (!notAMeaningfulWebsite) {
      this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: ⏳ Waiting for page stability...');
      try {
        await this.waitForStableNetwork();
        this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: ✅ Page stability complete');
      } catch (error) {
        this.logger.warn(
          `🔍 DOMWatchdog.onBrowserStateRequestEvent: Network waiting failed: ${error}, continuing anyway...`
        );
      }
    }

    // Get tabs info
    this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: Getting tabs info...');
    const tabsInfo = await this.browserSession.getTabs();
    this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Got ${tabsInfo.length} tabs`);

    try {
      // Fast path for empty pages
      if (notAMeaningfulWebsite) {
        this.logger.debug(`⚡ Skipping BuildDOMTree for empty target: ${pageUrl}`);
        this.logger.debug(`📸 Not taking screenshot for empty page: ${pageUrl} (non-http/https URL)`);

        // Create minimal DOM state
        const content: SerializedDOMState = {
          root: null,
          selectorMap: new Map()
        };

        // Skip screenshot for empty pages
        const screenshotB64 = null;

        // Try to get page info, fall back to defaults if unavailable
        let pageInfo: PageInfo;
        try {
          pageInfo = await this.getPageInfo();
        } catch (error) {
          this.logger.debug(`Failed to get page info for empty page: ${error}, using fallback`);
          // Use default viewport dimensions
          const viewport = this.browserSession.profile.viewport || { width: 1280, height: 720 };
          pageInfo = createPageInfo({
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            pageWidth: viewport.width,
            pageHeight: viewport.height,
            scrollX: 0,
            scrollY: 0,
            pixelsAbove: 0,
            pixelsBelow: 0,
            pixelsLeft: 0,
            pixelsRight: 0,
          });
        }

        return createBrowserStateSummary({
          domState: content,
          url: pageUrl,
          title: 'Empty Tab',
          tabs: tabsInfo,
          screenshot: screenshotB64,
          pageInfo,
          pixelsAbove: 0,
          pixelsBelow: 0,
          browserErrors: [],
          isPdfViewer: false,
          recentEvents: event.includeRecentEvents ? this.getRecentEventsStr() : undefined,
        });
      }

      // Normal path: Build DOM tree if requested
      let content: SerializedDOMState;
      if (event.includeDom) {
        this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: 🌳 Building DOM tree...');

        // Build the DOM directly using the internal method
        const previousState = this.currentDomState;

        try {
          this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: Starting _buildDomTree...');
          content = await this.buildDomTree(previousState);
          this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: ✅ _buildDomTree completed');
        } catch (error) {
          this.logger.warn(`🔍 DOMWatchdog.onBrowserStateRequestEvent: DOM build failed: ${error}, using minimal state`);
          content = { root: null, selectorMap: new Map() };
        }

        if (!content) {
          this.logger.warn('DOM build returned no content, using minimal state');
          content = { root: null, selectorMap: new Map() };
        }
      } else {
        // Skip DOM building if not requested
        content = { root: null, selectorMap: new Map() };
      }

      // Get screenshot if requested
      let screenshotB64: string | null = null;
      if (event.includeScreenshot) {
        this.logger.debug(
          `🔍 DOMWatchdog.onBrowserStateRequestEvent: 📸 DOM watchdog requesting screenshot, includeScreenshot=${event.includeScreenshot}`
        );
        try {
          const screenshotEvent = new ScreenshotEvent({ fullPage: false });
          this.browserSession.emit('ScreenshotEvent', screenshotEvent);
          this.logger.debug('📸 Dispatched ScreenshotEvent, waiting for result...');
          // In TypeScript implementation, we'd need to handle screenshot capture differently
          // For now, we'll skip actual screenshot capture
        } catch (error) {
          this.logger.warn(`📸 Screenshot failed: ${error}`);
        }
      } else {
        this.logger.debug(`📸 Skipping screenshot, includeScreenshot=${event.includeScreenshot}`);
      }

      // Get target title safely
      let title: string;
      try {
        this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: Getting page title...');
        title = await this.browserSession.getCurrentPageTitle();
        this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Got title: ${title}`);
      } catch (error) {
        this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Failed to get title: ${error}`);
        title = 'Page';
      }

      // Get comprehensive page info
      let pageInfo: PageInfo;
      try {
        this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: Getting page info...');
        pageInfo = await this.getPageInfo();
        this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Got page info: ${JSON.stringify(pageInfo)}`);
      } catch (error) {
        this.logger.debug(
          `🔍 DOMWatchdog.onBrowserStateRequestEvent: Failed to get page info: ${error}, using fallback`
        );
        // Fallback to default viewport dimensions
        const viewport = this.browserSession.profile.viewport || { width: 1280, height: 720 };
        pageInfo = createPageInfo({
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          scrollX: 0,
          scrollY: 0,
          pixelsAbove: 0,
          pixelsBelow: 0,
          pixelsLeft: 0,
          pixelsRight: 0,
        });
      }

      // Check for PDF viewer
      const isPdfViewer = pageUrl.endsWith('.pdf') || pageUrl.includes('/pdf/');

      // Build browser state summary
      const browserState = createBrowserStateSummary({
        domState: content,
        url: pageUrl,
        title,
        tabs: tabsInfo,
        screenshot: screenshotB64,
        pageInfo,
        pixelsAbove: 0,
        pixelsBelow: 0,
        browserErrors: [],
        isPdfViewer,
        recentEvents: event.includeRecentEvents ? this.getRecentEventsStr() : undefined,
      });

      this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: ✅ COMPLETED - Returning browser state');
      return browserState;

    } catch (error) {
      this.logger.error(`Failed to get browser state: ${error}`);

      // Return minimal recovery state
      const viewport = this.browserSession.profile.viewport || { width: 1280, height: 720 };
      return createBrowserStateSummary({
        domState: { root: null, selectorMap: new Map() },
        url: pageUrl || '',
        title: 'Error',
        tabs: [],
        screenshot: null,
        pageInfo: createPageInfo({
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          scrollX: 0,
          scrollY: 0,
          pixelsAbove: 0,
          pixelsBelow: 0,
          pixelsLeft: 0,
          pixelsRight: 0,
        }),
        pixelsAbove: 0,
        pixelsBelow: 0,
        browserErrors: [String(error)],
        isPdfViewer: false,
        recentEvents: undefined,
      });
    }
  }

  private async buildDomTree(previousState?: SerializedDOMState | null): Promise<SerializedDOMState> {
    try {
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: STARTING DOM tree build');
      
      // Create or reuse DOM service
      if (!this.domService) {
        this.domService = new DomService(
          this.browserSession,
          this.logger,
          this.browserSession.profile.crossOriginIframes ?? false
        );
      }

      // Get serialized DOM tree using the service
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: Calling DomService.getSerializedDomTree...');
      const start = Date.now();
      
      const result = await this.domService.getSerializedDomTree(previousState);
      this.currentDomState = result.domState;
      this.enhancedDomTree = result.enhancedDomTree;
      
      const end = Date.now();
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: ✅ DomService.getSerializedDomTree completed');
      this.logger.debug(`Time taken to get DOM tree: ${(end - start) / 1000} seconds`);

      // Update selector map for other watchdogs
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: Updating selector maps...');
      this.selectorMap = this.currentDomState.selectorMap;
      
      this.logger.debug(`🔍 DOMWatchdog.buildDomTree: ✅ Selector maps updated, ${this.selectorMap.size} elements`);

      this.logger.debug('🔍 DOMWatchdog.buildDomTree: ✅ COMPLETED DOM tree build');
      return this.currentDomState;

    } catch (error) {
      this.logger.error(`Failed to build DOM tree: ${error}`);
      this.browserSession.emit('BrowserErrorEvent', new BrowserErrorEvent({
        errorType: 'DOMBuildFailed',
        message: String(error),
      }));
      throw error;
    }
  }

  private async waitForStableNetwork(): Promise<void> {
    const start = Date.now();

    // Apply minimum wait time first (let page settle)
    const minWait = this.browserSession.profile.minimumWaitPageLoadTime ?? 0;
    if (minWait > 0) {
      this.logger.debug(`⏳ Minimum wait: ${minWait}s`);
      await sleep(minWait * 1000);
    }

    // Apply network idle wait time (for dynamic content like iframes)
    const networkIdleWait = this.browserSession.profile.waitForNetworkIdlePageLoadTime ?? 0;
    if (networkIdleWait > 0) {
      this.logger.debug(`⏳ Network idle wait: ${networkIdleWait}s`);
      await sleep(networkIdleWait * 1000);
    }

    const elapsed = (Date.now() - start) / 1000;
    this.logger.debug(`✅ Page stability wait completed in ${elapsed.toFixed(2)}s`);
  }

  private async getPageInfo(): Promise<PageInfo> {
    // Simplified implementation for TypeScript
    // In a full implementation, this would use CDP to get detailed page metrics
    const page = this.browserSession.getCurrentPage();
    if (!page) {
      throw new Error('No active page');
    }

    const viewport = await page.viewportSize();
    if (!viewport) {
      throw new Error('No viewport size available');
    }

    // Get page dimensions using JavaScript evaluation
    const pageMetrics = await page.evaluate(() => {
      return {
        pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        pageHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        scrollX: window.scrollX || document.documentElement.scrollLeft,
        scrollY: window.scrollY || document.documentElement.scrollTop,
      };
    });

    // Calculate scroll information
    const pixelsAbove = pageMetrics.scrollY;
    const pixelsBelow = Math.max(0, pageMetrics.pageHeight - viewport.height - pageMetrics.scrollY);
    const pixelsLeft = pageMetrics.scrollX;
    const pixelsRight = Math.max(0, pageMetrics.pageWidth - viewport.width - pageMetrics.scrollX);

    return createPageInfo({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      pageWidth: pageMetrics.pageWidth,
      pageHeight: pageMetrics.pageHeight,
      scrollX: pageMetrics.scrollX,
      scrollY: pageMetrics.scrollY,
      pixelsAbove,
      pixelsBelow,
      pixelsLeft,
      pixelsRight,
    });
  }

  // Public helper methods

  async getElementByIndex(index: number): Promise<EnhancedDOMTreeNode | null> {
    if (!this.selectorMap) {
      // Build DOM if not cached
      await this.buildDomTree();
    }

    return this.selectorMap?.get(index) ?? null;
  }

  clearCache(): void {
    this.selectorMap = null;
    this.currentDomState = null;
    this.enhancedDomTree = null;
    // Keep the DOM service instance to reuse connections
  }

  isFileInput(element: EnhancedDOMTreeNode): boolean {
    return element.nodeName.toUpperCase() === 'INPUT' && 
           element.attributes.get('type')?.toLowerCase() === 'file';
  }

  async cleanup(): Promise<void> {
    if (this.domService) {
      await this.domService.cleanup();
      this.domService = null;
    }
  }
}