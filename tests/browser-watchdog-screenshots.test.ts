import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { getTestServer } from 'pytest-httpserver';

describe('Browser Watchdog Screenshots', () => {
  let testServer: any;

  beforeAll(async () => {
    testServer = await getTestServer();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  test('should capture screenshots in headless mode', async () => {
    // Create a browser session with headless=True
    const profile = new BrowserProfile({
      headless: true,  // Explicitly set headless mode
      user_data_dir: undefined,
      keep_alive: false
    });

    const browserSession = new BrowserSession({ profile });

    try {
      // Start the session
      await browserSession.start();
      
      // Set up test page with visible content
      testServer.expect_request('/').respond_with_data(
        `<html>
        <head><title>Headless Screenshot Test</title></head>
        <body style="background: white; padding: 20px;">
          <h1 style="color: black;">This is a test page</h1>
          <p style="color: blue;">Testing screenshot capture in headless mode</p>
          <div style="width: 200px; height: 100px; background: red;">Red Box</div>
        </body>
        </html>`,
        200,
        { 'Content-Type': 'text/html' }
      );

      // Navigate to test page
      const page = await browserSession.getActivePage();
      await page.goto(testServer.url_for('/'));
      await page.waitForLoadState('networkidle');

      // Take screenshot
      const screenshotB64 = await browserSession.takeScreenshot();

      // Verify screenshot was captured
      expect(screenshotB64).not.toBeNull();
      expect(typeof screenshotB64).toBe('string');
      expect(screenshotB64.length).toBeGreaterThan(0);

      // Decode and validate the screenshot
      const screenshotBytes = Buffer.from(screenshotB64, 'base64');

      // Verify PNG signature
      const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(screenshotBytes.subarray(0, 8).equals(pngSignature)).toBe(true);
      
      // Should be a reasonable size (not just a blank image)
      expect(screenshotBytes.length).toBeGreaterThan(5000);

      // Test full page screenshot
      const fullPageScreenshot = await browserSession.takeScreenshot({ fullPage: true });
      expect(fullPageScreenshot).not.toBeNull();
      
      const fullPageBytes = Buffer.from(fullPageScreenshot, 'base64');
      expect(fullPageBytes.subarray(0, 8).equals(pngSignature)).toBe(true);
      expect(fullPageBytes.length).toBeGreaterThan(5000);

    } finally {
      await browserSession.stop();
    }
  });

  test('should include screenshot in state summary', async () => {
    const profile = new BrowserProfile({
      headless: true,
      user_data_dir: undefined,
      keep_alive: false
    });

    const browserSession = new BrowserSession({ profile });

    try {
      await browserSession.start();

      // Set up test page
      testServer.expect_request('/state-test').respond_with_data(
        '<html><body><h1>State Summary Test</h1></body></html>',
        200,
        { 'Content-Type': 'text/html' }
      );
      
      const page = await browserSession.getActivePage();
      await page.goto(testServer.url_for('/state-test'));
      await page.waitForLoadState('networkidle');

      // Get state summary
      const state = await browserSession.getBrowserStateSummary({ cacheClickableElementsHashes: false });

      // Verify screenshot is included
      expect(state.screenshot).not.toBeNull();
      expect(typeof state.screenshot).toBe('string');
      expect(state.screenshot.length).toBeGreaterThan(0);

      // Decode and validate
      const screenshotBytes = Buffer.from(state.screenshot, 'base64');
      const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(screenshotBytes.subarray(0, 8).equals(pngSignature)).toBe(true);
      expect(screenshotBytes.length).toBeGreaterThan(1000);

    } finally {
      await browserSession.stop();
    }
  });

  test('should handle screenshots gracefully with closed pages', async () => {
    const profile = new BrowserProfile({
      headless: true,
      user_data_dir: undefined,
      keep_alive: false
    });

    const browserSession = new BrowserSession({ profile });

    try {
      await browserSession.start();

      // Close all pages to test edge case
      const browserContext = await browserSession.getBrowserContext();
      const pages = browserContext.pages();
      for (const page of pages) {
        await page.close();
      }

      // Browser should auto-create a new page on about:blank with animation
      // With AboutBlankWatchdog, about:blank pages now have animated content
      const state = await browserSession.getBrowserStateSummary({ cacheClickableElementsHashes: false });
      
      // Should handle about:blank pages gracefully
      expect(state.screenshot).toBeDefined();
      expect(state.url === 'about:blank' || state.url.startsWith('chrome://')).toBe(true);

      // Now navigate to a real page and verify screenshot works
      testServer.expect_request('/test').respond_with_data(
        '<html><body><h1>Test Page</h1></body></html>',
        200,
        { 'Content-Type': 'text/html' }
      );

      const page = await browserSession.getActivePage();
      await page.goto(testServer.url_for('/test'));
      await page.waitForLoadState('networkidle');

      // Get state with screenshot
      const newState = await browserSession.getBrowserStateSummary({ cacheClickableElementsHashes: false });
      
      // Should have a screenshot now
      expect(newState.screenshot).not.toBeNull();
      expect(typeof newState.screenshot).toBe('string');
      expect(newState.screenshot.length).toBeGreaterThan(100);
      expect(newState.url.toLowerCase()).toContain('test');

    } finally {
      await browserSession.stop();
    }
  });

  test('should handle parallel screenshots with long page', async () => {
    // Generate a very long page (50,000px+)
    const sections: string[] = [];
    
    for (let i = 0; i < 120; i++) {
      const color = `rgb(${i % 256}, ${(i * 2) % 256}, ${(i * 3) % 256})`;
      sections.push(
        `<div style="height: 500px; background: ${color}; 
          display: flex; align-items: center; justify-content: center; 
          font-size: 48px; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">
          Section ${i + 1} - Testing Parallel Screenshots
        </div>`
      );
    }

    const htmlContent = `
      <html>
      <head><title>Very Long Page</title></head>
      <body style="margin: 0; padding: 0;">
        ${sections.join('')}
      </body>
      </html>
    `;

    // Set up the test page
    testServer.expect_request('/longpage').respond_with_data(
      htmlContent,
      200,
      { 'Content-Type': 'text/html' }
    );

    // Create multiple browser sessions for parallel testing
    const browserSessions: BrowserSession[] = [];
    const numSessions = 5; // Using 5 instead of 10 for faster test execution

    for (let i = 0; i < numSessions; i++) {
      const profile = new BrowserProfile({
        headless: true,
        user_data_dir: undefined,
        keep_alive: false
      });
      const session = new BrowserSession({ profile });
      browserSessions.push(session);
    }

    try {
      // Start all sessions
      await Promise.all(browserSessions.map(session => session.start()));

      // Navigate all to the long page
      await Promise.all(browserSessions.map(async (session) => {
        const page = await session.getActivePage();
        await page.goto(testServer.url_for('/longpage'));
        await page.waitForLoadState('networkidle');
      }));

      // Take screenshots in parallel
      const screenshotPromises = browserSessions.map(async (session, index) => {
        const startTime = Date.now();
        
        // Regular screenshot
        const screenshot = await session.takeScreenshot();
        
        // Full page screenshot
        const fullPageScreenshot = await session.takeScreenshot({ fullPage: true });
        
        const duration = Date.now() - startTime;
        
        return {
          index,
          screenshot,
          fullPageScreenshot,
          duration
        };
      });

      const results = await Promise.all(screenshotPromises);

      // Verify all screenshots were captured successfully
      for (const result of results) {
        expect(result.screenshot).not.toBeNull();
        expect(result.screenshot.length).toBeGreaterThan(1000);
        
        expect(result.fullPageScreenshot).not.toBeNull();
        // Full page screenshot should be significantly larger
        expect(result.fullPageScreenshot.length).toBeGreaterThan(10000);
        
        console.log(`Session ${result.index}: Screenshot captured in ${result.duration}ms`);
      }

      // All screenshots should complete within reasonable time
      const maxDuration = Math.max(...results.map(r => r.duration));
      expect(maxDuration).toBeLessThan(30000); // 30 seconds max

    } finally {
      // Clean up all sessions
      await Promise.all(browserSessions.map(session => session.stop()));
    }
  });
});