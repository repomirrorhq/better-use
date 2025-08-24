/**
 * Test DomService behavior with chrome:// URLs and new tab pages.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { DomService } from '../src/dom/service';
import * as http from 'http';

describe('DomServiceChromeURLs', () => {
  let session: BrowserSession | null = null;
  let server: http.Server;
  let serverUrl: string;

  beforeEach((done) => {
    // Create test server
    server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>Test Page</h1>
              <button id="test-button">Click me</button>
              <a href="#link">Test Link</a>
            </body>
          </html>
        `);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, () => {
      const port = (server.address() as any).port;
      serverUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterEach(async () => {
    if (session) {
      await session.close();
      session = null;
    }
    server.close();
  });

  test('about:blank returns empty DOM', async () => {
    const profile = new BrowserProfile({ headless: true, keep_alive: false });
    session = new BrowserSession({ profile });
    await session.start();

    const page = await session.getPage();
    await page.goto('about:blank');

    const domService = new DomService(page);
    const domState = await domService.getClickableElements();

    // Verify empty DOM is returned
    expect(domState.elementTree.tagName).toBe('body');
    expect(domState.elementTree.xpath).toBe('');
    expect(domState.elementTree.attributes).toEqual({});
    expect(domState.elementTree.children).toEqual([]);
    expect(domState.elementTree.isVisible).toBe(false);
    expect(domState.selectorMap).toEqual({});
  }, 30000);

  test('chrome://new-tab-page returns empty DOM', async () => {
    const profile = new BrowserProfile({ headless: true, keep_alive: false });
    session = new BrowserSession({ profile });
    await session.start();

    const page = await session.getPage();
    
    // Try to navigate to chrome://new-tab-page
    // This might fail in some environments, so we handle it gracefully
    try {
      await page.goto('chrome://new-tab-page', { waitUntil: 'domcontentloaded', timeout: 5000 });
    } catch (error) {
      // Chrome URLs might be blocked in headless mode
      // Skip this test if we can't access chrome:// URLs
      console.log('Chrome URL navigation blocked, skipping test');
      return;
    }

    const domService = new DomService(page);
    const domState = await domService.getClickableElements();

    // Verify empty DOM
    expect(domState.elementTree.tagName).toBe('body');
    expect(domState.elementTree.children.length).toBe(0);
    expect(domState.selectorMap).toEqual({});
  }, 30000);

  test('chrome://version returns empty DOM', async () => {
    const profile = new BrowserProfile({ headless: true, keep_alive: false });
    session = new BrowserSession({ profile });
    await session.start();

    const page = await session.getPage();
    
    // Try to navigate to chrome://version
    try {
      await page.goto('chrome://version', { waitUntil: 'domcontentloaded', timeout: 5000 });
    } catch (error) {
      // Chrome URLs might be blocked in headless mode
      console.log('Chrome URL navigation blocked, skipping test');
      return;
    }

    const domService = new DomService(page);
    const domState = await domService.getClickableElements();

    // Verify empty DOM
    expect(domState.elementTree.tagName).toBe('body');
    expect(domState.elementTree.children.length).toBe(0);
    expect(domState.selectorMap).toEqual({});
  }, 30000);

  test('regular URL returns populated DOM', async () => {
    const profile = new BrowserProfile({ headless: true, keep_alive: false });
    session = new BrowserSession({ profile });
    await session.start();

    const page = await session.getPage();
    await page.goto(serverUrl);

    const domService = new DomService(page);
    const domState = await domService.getClickableElements();

    // Verify DOM is populated (either root is not body, or body has children)
    const hasContent = domState.elementTree.tagName !== 'body' || domState.elementTree.children.length > 0;
    expect(hasContent).toBe(true);
    
    // Should have some selector mappings for the clickable elements
    const selectorCount = Object.keys(domState.selectorMap).length;
    expect(selectorCount).toBeGreaterThan(0);
  }, 30000);

  test('data URL returns populated DOM', async () => {
    const profile = new BrowserProfile({ headless: true, keep_alive: false });
    session = new BrowserSession({ profile });
    await session.start();

    const page = await session.getPage();
    await page.goto('data:text/html,<html><body><h1>Data URL Test</h1><button>Click</button></body></html>');

    const domService = new DomService(page);
    const domState = await domService.getClickableElements();

    // Verify DOM is populated
    const hasContent = domState.elementTree.tagName !== 'body' || domState.elementTree.children.length > 0;
    expect(hasContent).toBe(true);
  }, 30000);

  test('empty page with no content returns minimal DOM', async () => {
    const profile = new BrowserProfile({ headless: true, keep_alive: false });
    session = new BrowserSession({ profile });
    await session.start();

    const page = await session.getPage();
    await page.goto('data:text/html,<html><body></body></html>');

    const domService = new DomService(page);
    const domState = await domService.getClickableElements();

    // Even empty HTML should return a DOM structure
    expect(domState.elementTree.tagName).toBeDefined();
    expect(domState.elementTree.xpath).toBeDefined();
    
    // But should have no clickable elements
    expect(domState.selectorMap).toEqual({});
  }, 30000);
});