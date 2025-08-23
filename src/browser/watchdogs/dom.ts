/**
 * DOM watchdog for browser DOM tree management using CDP
 */

import { BaseWatchdog } from './base';
import { 
  BrowserErrorEvent,
  BrowserStateRequestEvent,
  ScreenshotEvent,
  TabCreatedEvent,
} from '../events';
import { DomService } from '../../dom/service';
import { SerializedDOMState } from '../../dom/views';
import { EnhancedDOMTreeNode } from '../../dom/enhanced_snapshot';
import { BrowserStateSummary, PageInfo } from '../views';

export class DOMWatchdog extends BaseWatchdog {
  static readonly LISTENS_TO = [TabCreatedEvent, BrowserStateRequestEvent];
  static readonly EMITS = [BrowserErrorEvent];

  // Public properties for other watchdogs
  public selectorMap: Map<number, EnhancedDOMTreeNode> | null = null;
  public currentDomState: SerializedDOMState | null = null;
  public enhancedDomTree: EnhancedDOMTreeNode | null = null;

  // Internal DOM service
  private domService: DomService | null = null;

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

    // Try to inject the script, but don't fail if the Page domain isn't ready yet
    try {
      await this.browserSession.cdpAddInitScript(initScript);
    } catch (error) {
      if (error instanceof Error && error.message.includes("'Page.addScriptToEvaluateOnNewDocument' wasn't found")) {
        this.logger.debug(`Page domain not ready for new tab, skipping init script injection: ${error}`);
      } else {
        throw error;
      }
    }
  }

  private getRecentEventsStr(limit: number = 10): string | null {
    try {
      // Get all events from history, sorted by creation time (most recent first)
      const allEvents = Array.from(this.browserSession.eventBus.eventHistory.values())
        .sort((a, b) => b.eventCreatedAt.getTime() - a.eventCreatedAt.getTime());

      // Take the most recent events and get their names
      const recentEventNames = allEvents.slice(0, limit).map(event => event.eventType);

      if (recentEventNames.length > 0) {
        return recentEventNames.join(', ');
      }
    } catch (error) {
      this.logger.debug(`Failed to get recent events: ${error}`);
    }

    return null;
  }

  async onBrowserStateRequestEvent(event: BrowserStateRequestEvent): Promise<BrowserStateSummary> {
    this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: STARTING browser state request');
    
    const pageUrl = await this.browserSession.getCurrentPageUrl();
    this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Got page URL: ${pageUrl}`);
    
    if (this.browserSession.agentFocus) {
      this.logger.debug(
        `📍 Current page URL: ${pageUrl}, target_id: ${this.browserSession.agentFocus.targetId}, session_id: ${this.browserSession.agentFocus.sessionId}`
      );
    } else {
      this.logger.debug(`📍 Current page URL: ${pageUrl}, no cdp_session attached`);
    }

    // Check if we should skip DOM tree build for pointless pages
    const notAMeaningfulWebsite = !pageUrl.toLowerCase().startsWith('http://') && !pageUrl.toLowerCase().startsWith('https://');

    // Wait for page stability
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
        const content = new SerializedDOMState({ root: null, selectorMap: new Map() });

        // Skip screenshot for empty pages
        const screenshotB64 = null;

        // Try to get page info from CDP, fall back to defaults if unavailable
        let pageInfo: PageInfo;
        try {
          pageInfo = await this.getPageInfo();
        } catch (error) {
          this.logger.debug(`Failed to get page info from CDP for empty page: ${error}, using fallback`);
          const viewport = this.browserSession.browserProfile.viewport || { width: 1280, height: 720 };
          pageInfo = new PageInfo({
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

        return new BrowserStateSummary({
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
          recentEvents: event.includeRecentEvents ? this.getRecentEventsStr() : null,
        });
      }

      // Normal path: Build DOM tree if requested
      let content: SerializedDOMState;
      if (event.includeDom) {
        this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: 🌳 Building DOM tree...');

        const previousState = this.browserSession.cachedBrowserStateSummary?.domState || null;

        try {
          this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: Starting buildDomTree...');
          content = await this.buildDomTree(previousState);
          this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: ✅ buildDomTree completed');
        } catch (error) {
          this.logger.warn(`🔍 DOMWatchdog.onBrowserStateRequestEvent: DOM build failed: ${error}, using minimal state`);
          content = new SerializedDOMState({ root: null, selectorMap: new Map() });
        }

        if (!content) {
          this.logger.warn('DOM build returned no content, using minimal state');
          content = new SerializedDOMState({ root: null, selectorMap: new Map() });
        }
      } else {
        content = new SerializedDOMState({ root: null, selectorMap: new Map() });
      }

      // Re-focus top-level page session context
      if (!this.browserSession.agentFocus) {
        throw new Error('No current target ID');
      }
      await this.browserSession.getOrCreateCdpSession({
        targetId: this.browserSession.agentFocus.targetId,
        focus: true,
      });

      // Get screenshot if requested
      let screenshotB64: string | null = null;
      if (event.includeScreenshot) {
        this.logger.debug(
          `🔍 DOMWatchdog.onBrowserStateRequestEvent: 📸 DOM watchdog requesting screenshot, includeScreenshot=${event.includeScreenshot}`
        );
        try {
          const handlers = this.eventBus.handlers.get('ScreenshotEvent') || [];
          const handlerNames = handlers.map(h => h.name || h.toString());
          this.logger.debug(`📸 ScreenshotEvent handlers registered: ${handlers.length} - ${handlerNames}`);

          const screenshotEvent = this.eventBus.dispatch(new ScreenshotEvent({ fullPage: false }));
          this.logger.debug('📸 Dispatched ScreenshotEvent, waiting for event to complete...');

          await screenshotEvent;
          screenshotB64 = await screenshotEvent.eventResult({ raiseIfAny: true, raiseIfNone: true });
        } catch (error) {
          if (error instanceof Error && error.name === 'TimeoutError') {
            this.logger.warn('📸 Screenshot timed out after 6 seconds - no handler registered or slow page?');
          } else {
            this.logger.warn(`📸 Screenshot failed: ${error?.constructor.name}: ${error}`);
          }
        }
      } else {
        this.logger.debug(`📸 Skipping screenshot, includeScreenshot=${event.includeScreenshot}`);
      }

      // Get target title safely
      let title: string;
      try {
        this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: Getting page title...');
        title = await Promise.race([
          this.browserSession.getCurrentPageTitle(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Got title: ${title}`);
      } catch (error) {
        this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Failed to get title: ${error}`);
        title = 'Page';
      }

      // Get comprehensive page info from CDP
      let pageInfo: PageInfo;
      try {
        this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: Getting page info from CDP...');
        pageInfo = await this.getPageInfo();
        this.logger.debug(`🔍 DOMWatchdog.onBrowserStateRequestEvent: Got page info from CDP: ${JSON.stringify(pageInfo)}`);
      } catch (error) {
        this.logger.debug(
          `🔍 DOMWatchdog.onBrowserStateRequestEvent: Failed to get page info from CDP: ${error}, using fallback`
        );
        const viewport = this.browserSession.browserProfile.viewport || { width: 1280, height: 720 };
        pageInfo = new PageInfo({
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

      // Build and cache the browser state summary
      if (screenshotB64) {
        this.logger.debug(
          `🔍 DOMWatchdog.onBrowserStateRequestEvent: 📸 Creating BrowserStateSummary with screenshot, length: ${screenshotB64.length}`
        );
      } else {
        this.logger.debug(
          '🔍 DOMWatchdog.onBrowserStateRequestEvent: 📸 Creating BrowserStateSummary WITHOUT screenshot'
        );
      }

      const browserState = new BrowserStateSummary({
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
        recentEvents: event.includeRecentEvents ? this.getRecentEventsStr() : null,
      });

      // Cache the state
      this.browserSession.cachedBrowserStateSummary = browserState;

      this.logger.debug('🔍 DOMWatchdog.onBrowserStateRequestEvent: ✅ COMPLETED - Returning browser state');
      return browserState;

    } catch (error) {
      this.logger.error(`Failed to get browser state: ${error}`);

      // Return minimal recovery state
      return new BrowserStateSummary({
        domState: new SerializedDOMState({ root: null, selectorMap: new Map() }),
        url: pageUrl,
        title: 'Error',
        tabs: [],
        screenshot: null,
        pageInfo: new PageInfo({
          viewportWidth: 1280,
          viewportHeight: 720,
          pageWidth: 1280,
          pageHeight: 720,
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
        recentEvents: null,
      });
    }
  }

  private async buildDomTree(previousState: SerializedDOMState | null = null): Promise<SerializedDOMState> {
    try {
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: STARTING DOM tree build');
      
      // Remove any existing highlights before building new DOM
      try {
        this.logger.debug('🔍 DOMWatchdog.buildDomTree: Removing existing highlights...');
        await this.browserSession.removeHighlights();
      } catch (error) {
        this.logger.debug(`🔍 DOMWatchdog.buildDomTree: Failed to remove existing highlights: ${error}`);
      }

      // Create or reuse DOM service
      if (this.domService === null) {
        this.domService = new DomService({
          browserSession: this.browserSession,
          logger: this.logger,
          crossOriginIframes: this.browserSession.browserProfile.crossOriginIframes,
        });
      }

      // Get serialized DOM tree using the service
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: Calling DomService.getSerializedDomTree...');
      const start = Date.now();
      
      const result = await this.domService.getSerializedDomTree({
        previousCachedState: previousState,
      });
      
      this.currentDomState = result.domState;
      this.enhancedDomTree = result.enhancedDomTree;
      const timingInfo = result.timingInfo;
      
      const end = Date.now();
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: ✅ DomService.getSerializedDomTree completed');

      this.logger.debug(`Time taken to get DOM tree: ${(end - start) / 1000} seconds`);
      this.logger.debug(`Timing breakdown: ${JSON.stringify(timingInfo)}`);

      // Update selector map for other watchdogs
      this.logger.debug('🔍 DOMWatchdog.buildDomTree: Updating selector maps...');
      this.selectorMap = this.currentDomState.selectorMap;
      
      // Update BrowserSession's cached selector map
      if (this.browserSession) {
        this.browserSession.updateCachedSelectorMap(this.selectorMap);
      }
      this.logger.debug(`🔍 DOMWatchdog.buildDomTree: ✅ Selector maps updated, ${this.selectorMap.size} elements`);

      // Inject highlighting for visual feedback if we have elements
      if (this.selectorMap.size > 0 && this.domService) {
        try {
          this.logger.debug('🔍 DOMWatchdog.buildDomTree: Injecting highlighting script...');
          
          // Import the highlighting function dynamically
          const { injectHighlightingScript } = await import('../../dom/debug/highlights');
          await injectHighlightingScript(this.domService, this.selectorMap);
          
          this.logger.debug(
            `🔍 DOMWatchdog.buildDomTree: ✅ Injected highlighting for ${this.selectorMap.size} elements`
          );
        } catch (error) {
          this.logger.debug(`🔍 DOMWatchdog.buildDomTree: Failed to inject highlighting: ${error}`);
        }
      }

      this.logger.debug('🔍 DOMWatchdog.buildDomTree: ✅ COMPLETED DOM tree build');
      return this.currentDomState;

    } catch (error) {
      this.logger.error(`Failed to build DOM tree: ${error}`);
      await this.eventBus.dispatch(
        new BrowserErrorEvent({
          errorType: 'DOMBuildFailed',
          message: String(error),
        })
      );
      throw error;
    }
  }

  private async waitForStableNetwork(): Promise<void> {
    const startTime = Date.now();

    // Apply minimum wait time first (let page settle)
    const minWait = this.browserSession.browserProfile.minimumWaitPageLoadTime;
    if (minWait > 0) {
      this.logger.debug(`⏳ Minimum wait: ${minWait}s`);
      await new Promise(resolve => setTimeout(resolve, minWait * 1000));
    }

    // Apply network idle wait time (for dynamic content like iframes)
    const networkIdleWait = this.browserSession.browserProfile.waitForNetworkIdlePageLoadTime;
    if (networkIdleWait > 0) {
      this.logger.debug(`⏳ Network idle wait: ${networkIdleWait}s`);
      await new Promise(resolve => setTimeout(resolve, networkIdleWait * 1000));
    }

    const elapsed = (Date.now() - startTime) / 1000;
    this.logger.debug(`✅ Page stability wait completed in ${elapsed.toFixed(2)}s`);
  }

  private async getPageInfo(): Promise<PageInfo> {
    // Get CDP session for the current target
    if (!this.browserSession.agentFocus) {
      throw new Error('No active CDP session - browser may not be connected yet');
    }

    const cdpSession = await this.browserSession.getOrCreateCdpSession({
      targetId: this.browserSession.agentFocus.targetId,
      focus: true,
    });

    // Get layout metrics which includes all the information we need
    const metrics = await Promise.race([
      cdpSession.cdpClient.send('Page.getLayoutMetrics'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
    ]);

    // Extract different viewport types
    const layoutViewport = metrics.layoutViewport || {};
    const visualViewport = metrics.visualViewport || {};
    const cssVisualViewport = metrics.cssVisualViewport || {};
    const cssLayoutViewport = metrics.cssLayoutViewport || {};
    const contentSize = metrics.contentSize || {};

    // Calculate device pixel ratio to convert between device pixels and CSS pixels
    const cssWidth = cssVisualViewport.clientWidth || cssLayoutViewport.clientWidth || 1280.0;
    const deviceWidth = visualViewport.clientWidth || cssWidth;
    const devicePixelRatio = cssWidth > 0 ? deviceWidth / cssWidth : 1.0;

    // For viewport dimensions, use CSS pixels (what JavaScript sees)
    const viewportWidth = Math.floor(cssLayoutViewport.clientWidth || layoutViewport.clientWidth || 1280);
    const viewportHeight = Math.floor(cssLayoutViewport.clientHeight || layoutViewport.clientHeight || 720);

    // For total page dimensions, content size is typically in device pixels, so convert to CSS pixels
    const rawPageWidth = contentSize.width || (viewportWidth * devicePixelRatio);
    const rawPageHeight = contentSize.height || (viewportHeight * devicePixelRatio);
    const pageWidth = Math.floor(rawPageWidth / devicePixelRatio);
    const pageHeight = Math.floor(rawPageHeight / devicePixelRatio);

    // For scroll position, use CSS visual viewport if available, otherwise CSS layout viewport
    const scrollX = Math.floor(cssVisualViewport.pageX || cssLayoutViewport.pageX || 0);
    const scrollY = Math.floor(cssVisualViewport.pageY || cssLayoutViewport.pageY || 0);

    // Calculate scroll information - pixels that are above/below/left/right of current viewport
    const pixelsAbove = scrollY;
    const pixelsBelow = Math.max(0, pageHeight - viewportHeight - scrollY);
    const pixelsLeft = scrollX;
    const pixelsRight = Math.max(0, pageWidth - viewportWidth - scrollX);

    return new PageInfo({
      viewportWidth,
      viewportHeight,
      pageWidth,
      pageHeight,
      scrollX,
      scrollY,
      pixelsAbove,
      pixelsBelow,
      pixelsLeft,
      pixelsRight,
    });
  }

  // Public Helper Methods

  async getElementByIndex(index: number): Promise<EnhancedDOMTreeNode | null> {
    if (!this.selectorMap) {
      await this.buildDomTree();
    }

    return this.selectorMap?.get(index) || null;
  }

  clearCache(): void {
    this.selectorMap = null;
    this.currentDomState = null;
    this.enhancedDomTree = null;
    // Keep the DOM service instance to reuse its CDP client connection
  }

  isFileInput(element: EnhancedDOMTreeNode): boolean {
    return element.nodeName.toUpperCase() === 'INPUT' && 
           (element.attributes?.type || '').toLowerCase() === 'file';
  }

  static isElementVisibleAccordingToAllParents(
    node: EnhancedDOMTreeNode, 
    htmlFrames: EnhancedDOMTreeNode[]
  ): boolean {
    return DomService.isElementVisibleAccordingToAllParents(node, htmlFrames);
  }

  async destroy(): Promise<void> {
    if (this.domService) {
      await this.domService.destroy();
      this.domService = null;
    }
  }
}