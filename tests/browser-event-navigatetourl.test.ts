import { ActionModel, ActionResult } from '../src/agent/views';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Controller } from '../src/controller/service';
import { GoToUrlAction } from '../src/controller/views';
import { NavigateToUrlEvent, TabCreatedEvent } from '../src/browser/events';

describe('NavigateToUrlEvent Tests', () => {
  let browserSession: BrowserSession;
  let controller: Controller;
  
  beforeEach(async () => {
    const profile = new BrowserProfile({
      headless: true,
      disableSecurity: true,
      crossOriginIframes: false
    });
    browserSession = new BrowserSession(profile);
    await browserSession.start();
    controller = new Controller();
  });
  
  afterEach(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
  });
  
  test('go to url action', async () => {
    // Test successful navigation to a valid page
    const actionModel = new ActionModel({
      goToUrl: { 
        url: 'https://example.com', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    
    // Verify the successful navigation result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Navigated to');
    
    // Verify we're on the correct page
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('example.com');
  });
  
  test('go to url network error', async () => {
    // Create action model for go_to_url with an invalid domain
    const actionModel = new ActionModel({
      goToUrl: { 
        url: 'https://www.nonexistentdndbeyond.com/', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    // Execute the action - should return soft error instead of throwing
    const result = await controller.act(actionModel, browserSession);
    
    // Verify the result
    expect(result).toBeInstanceOf(ActionResult);
    
    // Test that browser state recovery works after error
    const summary = await browserSession.getBrowserStateSummary(false);
    expect(summary).toBeTruthy();
  });
  
  test('navigate to url event directly', async () => {
    // Test navigation to a valid URL
    const event = browserSession.eventBus.dispatch(
      new NavigateToUrlEvent({ url: 'https://example.com' })
    );
    
    await expect(event).resolves.toBeDefined();
    
    // Wait a bit for navigation to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify we're on the correct page
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('example.com');
  });
  
  test('go to url new tab', async () => {
    // Get initial tab count
    const initialTabCount = browserSession.tabs.length;
    
    // Navigate to URL in new tab
    const actionModel = new ActionModel({
      goToUrl: { 
        url: 'https://example.com', 
        newTab: true 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Navigated to');
    
    // Verify new tab was created
    const finalTabCount = browserSession.tabs.length;
    expect(finalTabCount).toBe(initialTabCount + 1);
    
    // Verify we're on the new page
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('example.com');
  });
  
  test('navigate relative url', async () => {
    // First navigate to base URL
    const baseAction = new ActionModel({
      goToUrl: { 
        url: 'https://example.com', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    await controller.act(baseAction, browserSession);
    
    // Now navigate using relative URL
    const relativeAction = new ActionModel({
      goToUrl: { 
        url: '/test', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(relativeAction, browserSession);
    
    // Verify navigation worked
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Check we're on the right page
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('example.com/test');
  });
  
  test('navigate javascript url', async () => {
    // Navigate to a normal page first
    const normalAction = new ActionModel({
      goToUrl: { 
        url: 'https://example.com', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    await controller.act(normalAction, browserSession);
    
    // Try to navigate to javascript: URL (should be handled gracefully)
    const jsAction = new ActionModel({
      goToUrl: { 
        url: 'javascript:alert("test")', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(jsAction, browserSession);
    
    // Should either succeed or fail gracefully
    expect(result).toBeInstanceOf(ActionResult);
  });
  
  test('navigate data url', async () => {
    // Create a simple data URL
    const dataUrl = 'data:text/html,<html><head><title>Data URL Test</title></head><body><h1>Data URL Content</h1></body></html>';
    
    const actionModel = new ActionModel({
      goToUrl: { 
        url: dataUrl, 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    
    // Verify navigation
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Verify we can get the page title
    const page = await browserSession.getCurrentPage();
    const title = await page.title();
    expect(title).toBe('Data URL Test');
  });
  
  test('navigate with hash', async () => {
    // Create HTML with anchors
    const htmlWithAnchors = `
      <!DOCTYPE html>
      <html>
      <head><title>Page with Anchors</title></head>
      <body>
        <h1 id="top">Top of Page</h1>
        <div style="height: 2000px;">Content</div>
        <h2 id="section1">Section 1</h2>
        <div style="height: 1000px;">More content</div>
        <h2 id="section2">Section 2</h2>
      </body>
      </html>
    `;
    
    // First set up the page
    const page = browserSession.getCurrentPage();
    await page.setContent(htmlWithAnchors);
    const baseUrl = page.url();
    
    // Navigate to hash
    const actionModel = new ActionModel({
      goToUrl: { 
        url: `${baseUrl}#section1`, 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    
    // Verify navigation
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Verify URL includes hash
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('#section1');
  });
  
  test('navigate with query params', async () => {
    // Create HTML that shows query params
    const searchHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Search Page</title></head>
      <body>
        <h1>Search Results</h1>
        <div id="query"></div>
        <script>
          const params = new URLSearchParams(window.location.search);
          document.getElementById('query').textContent = 'Query: ' + params.get('q');
        </script>
      </body>
      </html>
    `;
    
    // Set up the page
    const page = browserSession.getCurrentPage();
    await page.setContent(searchHtml);
    const baseUrl = page.url();
    
    // Navigate with query parameters
    const actionModel = new ActionModel({
      goToUrl: { 
        url: `${baseUrl}?q=test+query&page=1`, 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    
    // Verify navigation
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Verify URL includes query params
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toMatch(/q=test(\+|%20)query/);
    expect(currentUrl).toContain('page=1');
    
    // Verify the query was processed
    const queryText = await page.evaluate(() => {
      return document.getElementById('query')?.textContent;
    });
    expect(queryText).toBe('Query: test query');
  });
  
  test('navigate multiple tabs', async () => {
    // Navigate to first page in current tab
    const action1 = new ActionModel({
      goToUrl: { 
        url: 'https://example.com/page1', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    await controller.act(action1, browserSession);
    
    // Open second page in new tab
    const action2 = new ActionModel({
      goToUrl: { 
        url: 'https://example.com/page2', 
        newTab: true 
      } as GoToUrlAction)
    });
    
    await controller.act(action2, browserSession);
    
    // Open home page in yet another new tab
    const action3 = new ActionModel({
      goToUrl: { 
        url: 'https://example.com', 
        newTab: true 
      } as GoToUrlAction)
    });
    
    await controller.act(action3, browserSession);
    
    // Should have 3 tabs now
    expect(browserSession.tabs.length).toBe(3);
    
    // Current tab should be the last one opened
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('example.com');
    expect(currentUrl).not.toContain('/page');
  });
  
  test('navigate timeout handling', async () => {
    // Try to navigate to a URL that will likely timeout
    // Using a private IP that's unlikely to respond
    const timeoutUrl = 'http://192.0.2.1:8080/timeout';
    
    const actionModel = new ActionModel({
      goToUrl: { 
        url: timeoutUrl, 
        newTab: false 
      } as GoToUrlAction)
    });
    
    // This should complete without hanging indefinitely
    const result = await controller.act(actionModel, browserSession);
    
    // Should get a result (possibly with error)
    expect(result).toBeInstanceOf(ActionResult);
  });
  
  test('navigate redirect', async () => {
    // For this test, we'll use a real redirect URL
    const actionModel = new ActionModel({
      goToUrl: { 
        url: 'http://google.com', // This redirects to https://www.google.com
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    
    // Verify navigation succeeded
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Should end up on https after redirect
    await new Promise(resolve => setTimeout(resolve, 500));
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('https://');
    expect(currentUrl).toContain('google.com');
  });
  
  test('navigate to url event with new tab and tab created event', async () => {
    const initialTabCount = browserSession.tabs.length;
    
    // Navigate to URL in new tab via direct event
    const navEvent = browserSession.eventBus.dispatch(
      new NavigateToUrlEvent({ 
        url: 'https://example.com/page2', 
        newTab: true 
      } as GoToUrlAction)
    );
    await navEvent;
    
    // Verify new tab was created
    expect(browserSession.tabs.length).toBe(initialTabCount + 1);
    
    // Check that current page is the new tab
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('example.com/page2');
    
    // Check event history for TabCreatedEvent
    const eventHistory = Array.from(browserSession.eventBus.eventHistory.values());
    const createdEvents = eventHistory.filter(e => e instanceof TabCreatedEvent);
    expect(createdEvents.length).toBeGreaterThanOrEqual(1);
  });
  
  test('navigate with new tab focuses properly', async () => {
    // Get initial state
    const initialTabsCount = browserSession.tabs.length;
    const initialUrl = await browserSession.getCurrentPageUrl();
    
    // Navigate to a URL in a new tab
    const navEvent = browserSession.eventBus.dispatch(
      new NavigateToUrlEvent({ 
        url: 'https://example.com', 
        newTab: true 
      } as GoToUrlAction)
    );
    await navEvent;
    
    // Small delay to ensure navigation completes
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get browser state after navigation
    const currentUrl = await browserSession.getCurrentPageUrl();
    
    // Verify a new tab was created
    expect(browserSession.tabs.length).toBe(initialTabsCount + 1);
    
    // Verify focus switched to the new tab
    expect(currentUrl).toContain('example.com');
  });
  
  test('navigate preserves cookies and session', async () => {
    // Navigate to a page that sets cookies
    const page = browserSession.getCurrentPage();
    await page.goto('https://httpbin.org/cookies/set?test=value');
    
    // Navigate to another page on same domain
    const actionModel = new ActionModel({
      goToUrl: { 
        url: 'https://httpbin.org/cookies', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    
    // Verify navigation
    expect(result).toBeInstanceOf(ActionResult);
    
    // Check that cookies are preserved
    const cookies = await page.context().cookies();
    const testCookie = cookies.find(c => c.name === 'test');
    expect(testCookie).toBeDefined();
    expect(testCookie?.value).toBe('value');
  });
  
  test('navigate handles about:blank', async () => {
    const actionModel = new ActionModel({
      goToUrl: { 
        url: 'about:blank', 
        newTab: false 
      } as GoToUrlAction)
    });
    
    const result = await controller.act(actionModel, browserSession);
    
    // Should handle about:blank gracefully
    expect(result).toBeInstanceOf(ActionResult);
    
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).toContain('about:blank');
  });
});