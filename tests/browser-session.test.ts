import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as http from 'http';
import { AddressInfo } from 'net';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';

/**
 * Test HTTP server for serving test pages
 */
class TestHttpServer {
  private server: http.Server;
  private port?: number;

  constructor() {
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      
      const url = req.url || '/';
      
      if (url === '/') {
        res.end('<html><head><title>Test Home Page</title></head><body><h1>Test Home Page</h1><p>Welcome to the test site</p></body></html>');
      } else if (url === '/page1') {
        res.end('<html><head><title>Test Page 1</title></head><body><h1>Test Page 1</h1><p>This is test page 1</p></body></html>');
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });
  }

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(0, () => {
        const address = this.server.address() as AddressInfo;
        this.port = address.port;
        resolve(`http://localhost:${this.port}`);
      });
    });
  }

  stop(): void {
    this.server.close();
  }
}

describe('Browser Session Tests', () => {
  let httpServer: TestHttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    // Start HTTP server
    httpServer = new TestHttpServer();
    baseUrl = await httpServer.start();
  }, 30000);

  afterAll(async () => {
    // Cleanup
    httpServer?.stop();
  }, 30000);

  describe('Browser Lifecycle', () => {
    it('should start and stop browser session', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      // Test starting
      await browserSession.start();
      expect(browserSession.isRunning).toBe(true);
      expect(browserSession.currentTabId).not.toBeNull();
      expect(browserSession.tabCount).toBe(1);

      // Test stopping
      await browserSession.stop();
      expect(browserSession.isRunning).toBe(false);
    }, 30000);

    it('should get browser state', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      await browserSession.start();
      
      try {
        const state = await browserSession.getBrowserState();
        
        expect(state).toBeDefined();
        expect(state.url).toBeDefined();
        expect(state.title).toBeDefined();
        expect(state.screenshot).toBeDefined();
        expect(state.tabs).toBeInstanceOf(Array);
        expect(state.tabs.length).toBeGreaterThan(0);
        expect(state.current_tab_id).toBeDefined();
        expect(state.page_info).toBeDefined();
        expect(state.timestamp).toBeDefined();
        
        // Check page info structure
        expect(state.page_info.viewport_width).toBeGreaterThan(0);
        expect(state.page_info.viewport_height).toBeGreaterThan(0);
        
      } finally {
        await browserSession.stop();
      }
    }, 30000);

    it('should navigate to URL', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      await browserSession.start();
      
      try {
        // Navigate using the event interface
        await browserSession.navigateToUrl({
          url: baseUrl,
          new_tab: false,
          wait_until: 'load',
          timeout_ms: 30000
        });

        const state = await browserSession.getBrowserState();
        expect(state.url).toBe(baseUrl);
        expect(state.title).toBe('Test Home Page');
      } finally {
        await browserSession.stop();
      }
    }, 30000);

    it('should open new tab', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      await browserSession.start();
      
      try {
        const initialTabCount = browserSession.tabCount;
        
        // Open in new tab
        await browserSession.navigateToUrl({
          url: `${baseUrl}/page1`,
          new_tab: true,
          wait_until: 'load',
          timeout_ms: 30000
        });

        expect(browserSession.tabCount).toBe(initialTabCount + 1);
        
        const state = await browserSession.getBrowserState();
        expect(state.tabs.length).toBe(initialTabCount + 1);
        expect(state.url).toBe(`${baseUrl}/page1`);
        expect(state.title).toBe('Test Page 1');
      } finally {
        await browserSession.stop();
      }
    }, 30000);
  });

  describe('Tab Management', () => {
    it('should switch between tabs', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      await browserSession.start();
      
      try {
        // Navigate to first page
        await browserSession.navigateToUrl({
          url: baseUrl,
          new_tab: false,
          wait_until: 'load',
          timeout_ms: 30000
        });

        const tab1Id = browserSession.currentTabId;
        
        // Open second page in new tab
        await browserSession.navigateToUrl({
          url: `${baseUrl}/page1`,
          new_tab: true,
          wait_until: 'load',
          timeout_ms: 30000
        });

        const tab2Id = browserSession.currentTabId;
        expect(tab2Id).not.toBe(tab1Id);

        // Switch back to first tab
        await browserSession.switchTab(tab1Id!);
        expect(browserSession.currentTabId).toBe(tab1Id);
        
        const state = await browserSession.getBrowserState();
        expect(state.url).toBe(baseUrl);
        expect(state.title).toBe('Test Home Page');
      } finally {
        await browserSession.stop();
      }
    }, 30000);

    it('should close tab', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      await browserSession.start();
      
      try {
        // Open second page in new tab
        await browserSession.navigateToUrl({
          url: `${baseUrl}/page1`,
          new_tab: true,
          wait_until: 'load',
          timeout_ms: 30000
        });

        const initialTabCount = browserSession.tabCount;
        const tabToClose = browserSession.currentTabId;
        
        // Close the current tab
        await browserSession.closeTab(tabToClose!);
        
        expect(browserSession.tabCount).toBe(initialTabCount - 1);
        expect(browserSession.currentTabId).not.toBe(tabToClose);
      } finally {
        await browserSession.stop();
      }
    }, 30000);
  });

  describe('Screenshots', () => {
    it('should take screenshot', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      await browserSession.start();
      
      try {
        await browserSession.navigateToUrl({
          url: baseUrl,
          new_tab: false,
          wait_until: 'load',
          timeout_ms: 30000
        });

        const screenshot = await browserSession.takeScreenshot({
          full_page: false
        });

        expect(screenshot).toBeDefined();
        expect(typeof screenshot).toBe('string');
        expect(screenshot.length).toBeGreaterThan(0);
        
        // Should be valid base64 (basic check)
        expect(() => Buffer.from(screenshot, 'base64')).not.toThrow();
      } finally {
        await browserSession.stop();
      }
    }, 30000);

    it('should take full page screenshot', async () => {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true
        }),
        headless: true
      });

      await browserSession.start();
      
      try {
        await browserSession.navigateToUrl({
          url: baseUrl,
          new_tab: false,
          wait_until: 'load',
          timeout_ms: 30000
        });

        const screenshot = await browserSession.takeScreenshot({
          full_page: true
        });

        expect(screenshot).toBeDefined();
        expect(typeof screenshot).toBe('string');
        expect(screenshot.length).toBeGreaterThan(0);
      } finally {
        await browserSession.stop();
      }
    }, 30000);
  });
});