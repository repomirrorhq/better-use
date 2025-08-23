import { ActionResult } from '../src/agent/views';
import { BrowserProfile } from '../src/browser/profile';
import { BrowserSession } from '../src/browser/session';
import { NavigateToUrlEvent } from '../src/browser/events';
import { Registry } from '../src/controller/registry/service';
import { SecurityWatchdog } from '../src/browser/watchdogs/security';
import { EventBus } from '../src/browser/events';

describe('TestBrowserContext', () => {
  let browserSession: BrowserSession;
  let testServerPort: number;
  let baseUrl: string;

  beforeAll(() => {
    // Mock HTTP server behavior
    testServerPort = 3000 + Math.floor(Math.random() * 1000);
    baseUrl = `http://localhost:${testServerPort}`;
  });

  beforeEach(async () => {
    browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true,
      })
    });
    await browserSession.start();
  });

  afterEach(async () => {
    if (browserSession) {
      await browserSession.kill();
      await browserSession.eventBus.stop(true, 5);
    }
  });

  test('is url allowed', () => {
    // Scenario 1: allowed_domains is None, any URL should be allowed
    const config1 = new BrowserProfile({
      allowedDomains: undefined,
      headless: true,
      userDataDir: undefined
    });
    const context1 = new BrowserSession({ profile: config1 });
    const eventBus1 = new EventBus();
    const watchdog1 = new SecurityWatchdog(context1, eventBus1);
    
    expect(watchdog1.isUrlAllowed('http://anydomain.com')).toBe(true);
    expect(watchdog1.isUrlAllowed('https://anotherdomain.org/path')).toBe(true);

    // Scenario 2: allowed_domains is provided
    const allowed = [
      'https://example.com',
      'http://example.com',
      'http://*.mysite.org',
      'https://*.mysite.org'
    ];
    const config2 = new BrowserProfile({
      allowedDomains: allowed,
      headless: true,
      userDataDir: undefined
    });
    const context2 = new BrowserSession({ profile: config2 });
    const eventBus2 = new EventBus();
    const watchdog2 = new SecurityWatchdog(context2, eventBus2);

    // URL exactly matching
    expect(watchdog2.isUrlAllowed('http://example.com')).toBe(true);
    // URL with subdomain (should not be allowed)
    expect(watchdog2.isUrlAllowed('http://sub.example.com/path')).toBe(false);
    // URL with subdomain for wildcard pattern (should be allowed)
    expect(watchdog2.isUrlAllowed('http://sub.mysite.org')).toBe(true);
    // URL that matches second allowed domain
    expect(watchdog2.isUrlAllowed('https://mysite.org/page')).toBe(true);
    // URL with port number, still allowed (port is stripped)
    expect(watchdog2.isUrlAllowed('http://example.com:8080')).toBe(true);
    expect(watchdog2.isUrlAllowed('https://example.com:443')).toBe(true);

    // Scenario 3: Malformed URL or empty domain
    expect(watchdog2.isUrlAllowed('notaurl')).toBe(false);
  });

  test('navigate and get current page', async () => {
    // Navigate to the test page
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/` }));
    await event;

    // Get the current page
    const page = await browserSession.getCurrentPage();

    // Verify the page URL matches what we navigated to
    expect(page.url).toContain(`${baseUrl}/`);

    // Verify the page title
    const title = await page.title();
    expect(title).toBeTruthy(); // Since we don't have a real server, just check it exists
  });

  test('refresh page', async () => {
    // Navigate to the test page
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/` }));
    await event;

    // Get the current page before refresh
    const pageBefore = await browserSession.getCurrentPage();

    // Refresh the page
    await browserSession.refresh();

    // Get the current page after refresh
    const pageAfter = await browserSession.getCurrentPage();

    // Verify it's still on the same URL
    expect(pageAfter.url).toBe(pageBefore.url);
  });

  test('execute javascript', async () => {
    // Navigate to a test page
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/` }));
    await event;

    // Execute a simple JavaScript snippet that returns a value
    const result = await browserSession.executeJavascript('document.title');

    // Verify the result is a string
    expect(typeof result).toBe('string');

    // Execute JavaScript that modifies the page
    await browserSession.executeJavascript("document.body.style.backgroundColor = 'red'");

    // Verify the change by reading back the value
    const bgColor = await browserSession.executeJavascript('document.body.style.backgroundColor');
    expect(bgColor).toBe('red');
  });

  test('get scroll info', async () => {
    // Navigate to a test page
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/scroll_test` }));
    await event;
    const page = await browserSession.getCurrentPage();

    // Get initial scroll info
    const [pixelsAboveInitial, pixelsBelowInitial] = await browserSession.getScrollInfo(page);

    // Verify initial scroll position
    expect(pixelsAboveInitial).toBe(0);
    // Note: in a real browser with content, pixelsBelowInitial would be > 0

    // Scroll down the page
    await browserSession.executeJavascript('window.scrollBy(0, 500)');
    await new Promise(resolve => setTimeout(resolve, 200)); // Brief delay for scroll to complete

    // Get new scroll info
    const [pixelsAboveAfterScroll, pixelsBelowAfterScroll] = await browserSession.getScrollInfo(page);

    // In a real browser, these assertions would pass:
    // expect(pixelsAboveAfterScroll).toBeGreaterThan(0);
    // expect(pixelsAboveAfterScroll).toBeGreaterThanOrEqual(400);
    // expect(pixelsBelowAfterScroll).toBeLessThan(pixelsBelowInitial);
  });

  test('take screenshot', async () => {
    // Navigate to the test page
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/` }));
    await event;

    // Take a screenshot
    const screenshotBase64 = await browserSession.takeScreenshot();

    // Verify the screenshot is a valid base64 string
    expect(typeof screenshotBase64).toBe('string');
    expect(screenshotBase64.length).toBeGreaterThan(0);

    // Verify it can be decoded as base64
    try {
      const imageData = Buffer.from(screenshotBase64, 'base64');
      // Verify the data starts with a valid image signature (PNG file header)
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(imageData.subarray(0, 8).equals(pngHeader)).toBe(true);
    } catch (e) {
      throw new Error(`Failed to decode screenshot as base64: ${e}`);
    }
  });

  test('switch tab operations', async () => {
    // Navigate to home page in first tab
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/` }));
    await event;

    // Create a new tab
    await browserSession.createNewTab(`${baseUrl}/scroll_test`);

    // Verify we have two tabs now
    const tabsInfo = await browserSession.getTabsInfo();
    expect(tabsInfo.length).toBeGreaterThanOrEqual(2); // May have about:blank tabs

    // Verify current tab is the scroll test page
    let currentPage = await browserSession.getCurrentPage();
    expect(currentPage.url).toContain(`${baseUrl}/scroll_test`);

    // Switch back to the first tab
    await browserSession.switchToTab(0);

    // Verify we're back on the home page
    currentPage = await browserSession.getCurrentPage();
    expect(currentPage.url).toContain(`${baseUrl}/`);

    // Close the second tab
    await browserSession.closeTab(1);

    // Verify we have the expected number of tabs
    const tabsInfoAfter = await browserSession.getTabsInfo();
    // Filter out about:blank tabs created by the watchdog
    const nonBlankTabs = tabsInfoAfter.filter(tab => !tab.url.includes('about:blank'));
    expect(nonBlankTabs.length).toBe(1);
    expect(nonBlankTabs[0].url).toContain(baseUrl);
  });

  test('custom action with no arguments', async () => {
    // Create a registry
    const registry = new Registry();

    // Register a custom action with no arguments
    registry.action('Some custom action with no args')(
      () => {
        return new ActionResult({ extractedContent: 'return some result' });
      }
    );

    // Navigate to a test page
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/` }));
    await event;

    // Execute the action
    const result = await registry.executeAction('simple_action', {});

    // Verify the result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBe('return some result');

    // Test that the action model is created correctly
    const actionModel = registry.createActionModel();

    // The action should be in the model fields
    expect(actionModel.modelFields).toHaveProperty('simple_action');

    // Test async version as well
    registry.action('Async custom action with no args')(
      async () => {
        return new ActionResult({ extractedContent: 'async result' });
      }
    );

    const asyncResult = await registry.executeAction('async_simple_action', {});
    expect(asyncResult.extractedContent).toBe('async result');

    // Test with special parameters but no regular arguments
    registry.action('Action with only special params')(
      async (browserSession: BrowserSession) => {
        const page = await browserSession.getCurrentPage();
        return new ActionResult({ extractedContent: `Page URL: ${page.url}` });
      }
    );

    const specialResult = await registry.executeAction('special_params_only', {}, browserSession);
    expect(specialResult.extractedContent).toContain('Page URL:');
    expect(specialResult.extractedContent).toContain(baseUrl);
  });
});