import { ActionModel, ActionResult } from '../src/agent/views';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Controller } from '../src/controller/service';
import { GoToUrlAction, ScrollAction } from '../src/controller/views';
import { ScrollEvent } from '../src/browser/events';
import * as http from 'http';
import express from 'express';

describe('ScrollEvent Tests', () => {
  let server: http.Server;
  let app: express.Application;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;
  const port = 3456;

  beforeAll(async () => {
    // Setup express server
    app = express();
    
    // Add routes for test pages
    app.get('/', (req, res) => {
      res.send('<html><head><title>Test Home Page</title></head><body><h1>Test Home Page</h1><p>Welcome to the test site</p></body></html>');
    });

    app.get('/scrollable', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Scrollable Page</title>
          <style>
            body { margin: 0; padding: 20px; }
            .content { height: 3000px; background: linear-gradient(to bottom, #f0f0f0, #333); }
            .marker { padding: 20px; background: #007bff; color: white; margin: 500px 0; }
          </style>
        </head>
        <body>
          <h1>Scrollable Test Page</h1>
          <div class="content">
            <div class="marker" id="marker1">Marker 1</div>
            <div class="marker" id="marker2">Marker 2</div>
            <div class="marker" id="marker3">Marker 3</div>
          </div>
        </body>
        </html>
      `);
    });

    app.get('/non-scrollable', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Non-Scrollable Page</title>
          <style>
            body { margin: 0; padding: 10px; height: 80px; overflow: hidden; }
            .content { height: 60px; background: #f0f0f0; }
          </style>
        </head>
        <body>
          <div class="content">This page is too small to scroll</div>
        </body>
        </html>
      `);
    });

    app.get('/very-long', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Very Long Page</title>
          <style>
            body { margin: 0; padding: 20px; }
            .content { height: 12000px; background: linear-gradient(to bottom, #f0f0f0, #333); }
            .marker { padding: 20px; background: #007bff; color: white; margin: 2000px 0; }
          </style>
        </head>
        <body>
          <h1 id="top">Very Long Page - Top</h1>
          <div class="content">
            <div class="marker" id="marker1">Marker 1 at 2000px</div>
            <div class="marker" id="marker2">Marker 2 at 4000px</div>
            <div class="marker" id="marker3">Marker 3 at 6000px</div>
            <div class="marker" id="marker4">Marker 4 at 8000px</div>
            <div class="marker" id="marker5">Marker 5 at 10000px</div>
          </div>
          <h1 id="bottom">Very Long Page - Bottom</h1>
        </body>
        </html>
      `);
    });

    app.get('/iframe-content', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 0; padding: 10px; }
            .content { height: 2000px; background: linear-gradient(to bottom, #e0e0e0, #666); }
          </style>
        </head>
        <body>
          <h2 id="iframe-top">Iframe Content - Top</h2>
          <div class="content">
            <div style="margin-top: 900px;">Middle of iframe content</div>
            <div style="margin-top: 900px;">Bottom of iframe content</div>
          </div>
        </body>
        </html>
      `);
    });

    app.get('/page-with-iframe', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page with Iframe</title>
          <style>
            body { margin: 0; padding: 20px; }
            #main-content { height: 200px; background: #f0f0f0; }
            #scrollable-iframe { 
              width: 100%; 
              height: 400px; 
              border: 2px solid #333;
            }
          </style>
        </head>
        <body>
          <div id="main-content">
            <h1>Main Page Content</h1>
            <p>This is the main page with an embedded iframe below.</p>
          </div>
          <iframe id="scrollable-iframe" src="http://localhost:${port}/iframe-content"></iframe>
          <div style="height: 200px; background: #e0e0e0;">
            <p>Content after iframe</p>
          </div>
        </body>
        </html>
      `);
    });

    // Start server
    await new Promise<void>((resolve) => {
      server = app.listen(port, () => {
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Setup browser session
    const profile = new BrowserProfile({ headless: true, disableSecurity: true, crossOriginIframes: false });
    browserSession = new BrowserSession(profile);
    await browserSession.start();

    // Setup controller
    controller = new Controller();
  });

  afterAll(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('TestScrollActions', () => {
    test('test_scroll_actions', async () => {
      // Navigate to scrollable page
      const gotoAction = { go_to_url: { url: `${baseUrl}/scrollable`, newTab: false } as GoToUrlAction };
      
      class GoToUrlActionModel extends ActionModel {
        go_to_url?: GoToUrlAction = undefined;
      }

      await controller.act(new GoToUrlActionModel(gotoAction), browserSession);

      // Test 1: Basic page scroll down
      const scrollAction = { scroll: { down: true, num_pages: 1.0 } as ScrollAction };
      
      class ScrollActionModel extends ActionModel {
        scroll?: ScrollAction = undefined;
      }

      let result = await controller.act(new ScrollActionModel(scrollAction), browserSession);

      // Verify scroll down succeeded
      expect(result).toBeInstanceOf(ActionResult);
      expect(result.error).toBeNull();
      expect(result.extractedContent).not.toBeNull();
      expect(result.extractedContent).toContain('Scrolled down');
      expect(result.extractedContent).toContain('the page');
      expect(result.includeInMemory).toBe(true);

      // Test 2: Basic page scroll up
      const scrollUpAction = { scroll: { down: false, num_pages: 0.5 } as ScrollAction };
      result = await controller.act(new ScrollActionModel(scrollUpAction), browserSession);

      expect(result).toBeInstanceOf(ActionResult);
      expect(result.error).toBeNull();
      expect(result.extractedContent).not.toBeNull();
      expect(result.extractedContent).toContain('Scrolled up');
      expect(result.extractedContent).toContain('0.5 pages');

      // Test 3: Test with invalid element index (should error)
      const invalidScrollAction = { scroll: { down: true, num_pages: 1.0, frame_element_index: 999 } as ScrollAction };
      result = await controller.act(new ScrollActionModel(invalidScrollAction), browserSession);

      // This should fail with error about element not found
      expect(result).toBeInstanceOf(ActionResult);
      expect(result.error).not.toBeNull();
      expect(result.error).toMatch(/Element index 999 not found|Failed to scroll/);

      // Test 4: Model parameter validation
      const scrollWithIndex = { down: true, num_pages: 1.0, frame_element_index: 5 } as ScrollAction;
      expect(scrollWithIndex.down).toBe(true);
      expect(scrollWithIndex.num_pages).toBe(1.0);
      expect(scrollWithIndex.frame_element_index).toBe(5);

      const scrollWithoutIndex = { down: false, num_pages: 0.25 } as ScrollAction;
      expect(scrollWithoutIndex.down).toBe(false);
      expect(scrollWithoutIndex.num_pages).toBe(0.25);
      expect(scrollWithoutIndex.frame_element_index).toBeUndefined();
    });

    test('test_scroll_with_cross_origin_disabled', async () => {
      // Navigate to a page
      await browserSession.page.goto(`${baseUrl}/scrollable`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Test simple scroll - should not hang
      const event1 = browserSession.eventBus.dispatch(new ScrollEvent({ direction: 'down', amount: 500 }));
      const result1 = await Promise.race([
        event1,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      expect(result1).not.toBeNull();

      // Test scroll up
      const event2 = browserSession.eventBus.dispatch(new ScrollEvent({ direction: 'up', amount: 200 }));
      const result2 = await Promise.race([
        event2,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      expect(result2).not.toBeNull();
    });

    test('test_scroll_event_directly', async () => {
      // Test scroll on about:blank (should work)
      const event = browserSession.eventBus.dispatch(new ScrollEvent({ direction: 'down', amount: 100 }));
      const result = await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);
      const eventResult = await (result as any).eventResult();
      expect(eventResult).not.toBeNull();
      expect(eventResult.success).toBe(true);
    });

    test('test_scroll_non_scrollable_page', async () => {
      // Navigate to non-scrollable page
      await browserSession.page.goto(`${baseUrl}/non-scrollable`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get initial scroll position
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const initialScroll = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'window.pageYOffset',
        returnByValue: true
      }, cdpSession.sessionId);
      const initialY = initialScroll.result?.value || 0;

      // Try to scroll down - should succeed but not actually move
      const event = browserSession.eventBus.dispatch(new ScrollEvent({ direction: 'down', amount: 500 }));
      const result = await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      const eventResult = await (result as any).eventResult();
      expect(eventResult).not.toBeNull();
      expect(eventResult.success).toBe(true);

      // Check scroll position didn't change (page isn't scrollable)
      const finalScroll = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'window.pageYOffset',
        returnByValue: true
      }, cdpSession.sessionId);
      const finalY = finalScroll.result?.value || 0;
      expect(finalY).toBe(initialY);
    });

    test('test_scroll_very_long_page', async () => {
      // Navigate to very long page
      await browserSession.page.goto(`${baseUrl}/very-long`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get initial scroll position
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const initialScroll = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'window.pageYOffset',
        returnByValue: true
      }, cdpSession.sessionId);
      const initialY = initialScroll.result?.value || 0;
      expect(initialY).toBe(0);

      // Scroll down by 8000px
      const event = browserSession.eventBus.dispatch(new ScrollEvent({ direction: 'down', amount: 8000 }));
      const result = await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      const eventResult = await (result as any).eventResult();
      expect(eventResult).not.toBeNull();
      expect(eventResult.success).toBe(true);

      // Wait a bit for scroll to take effect
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check scroll position moved significantly
      const finalScroll = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'window.pageYOffset',
        returnByValue: true
      }, cdpSession.sessionId);
      const finalY = finalScroll.result?.value || 0;

      // Get page height to understand constraints
      const pageHeight = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.body.scrollHeight',
        returnByValue: true
      }, cdpSession.sessionId);
      const scrollHeight = pageHeight.result?.value || 0;

      // Should have scrolled down significantly (might not be exactly 8000 due to viewport constraints)
      expect(finalY).toBeGreaterThan(5000);

      // Verify we can see marker 4 which is at 8000px
      const marker4Visible = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `
          (() => {
            const marker = document.getElementById('marker4');
            const rect = marker.getBoundingClientRect();
            return rect.top >= 0 && rect.top <= window.innerHeight;
          })()
        `,
        returnByValue: true
      }, cdpSession.sessionId);
      expect(marker4Visible.result?.value).toBe(true);
    });

    test('test_scroll_iframe_content', async () => {
      // Navigate to page with iframe
      await browserSession.page.goto(`${baseUrl}/page-with-iframe`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Give iframe time to load

      // Get initial scroll position of main page and iframe
      const cdpSession = await browserSession.getOrCreateCdpSession();

      // Check main page scroll
      const mainScroll = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'window.pageYOffset',
        returnByValue: true
      }, cdpSession.sessionId);
      const mainY = mainScroll.result?.value || 0;

      // Check iframe scroll (should start at 0)
      const iframeInitial = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `
          (() => {
            const iframe = document.getElementById('scrollable-iframe');
            if (iframe && iframe.contentWindow) {
              return iframe.contentWindow.pageYOffset || 0;
            }
            return -1;
          })()
        `,
        returnByValue: true
      }, cdpSession.sessionId);
      const iframeY = iframeInitial.result?.value || -1;
      expect(iframeY).toBe(0);

      // Scroll the main page first to bring iframe into view
      const event = browserSession.eventBus.dispatch(new ScrollEvent({ direction: 'down', amount: 100 }));
      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      // Verify the iframe exists and is scrollable
      const iframeScrollable = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `
          (() => {
            const iframe = document.getElementById('scrollable-iframe');
            if (iframe && iframe.contentDocument) {
              const iframeBody = iframe.contentDocument.body;
              return iframeBody.scrollHeight > iframe.clientHeight;
            }
            return false;
          })()
        `,
        returnByValue: true
      }, cdpSession.sessionId);
      expect(iframeScrollable.result?.value).toBe(true);
    });
  });
});