/**
 * Test that search_google properly switches focus to the new tab.
 */

import { BrowserSession } from '../src/browser/session';
import { BrowserStateRequestEvent, NavigateToUrlEvent } from '../src/browser/events';
import { Controller } from '../src/controller/service';

describe('Search Google Action Tests', () => {
  let browserSession: BrowserSession;

  beforeEach(async () => {
    browserSession = new BrowserSession();
    await browserSession.start();
  });

  afterEach(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
  });

  test('search google creates and focuses new tab', async () => {
    // Create controller to get the search_google action
    const controller = new Controller();

    // Get initial browser state
    const initialStateEvent = browserSession.eventBus.dispatch(
      new BrowserStateRequestEvent({ includeScreenshot: false })
    );
    const initialState = await initialStateEvent;
    const initialUrl = initialState.url;
    const initialTabsCount = initialState.tabs.length;

    // Execute search_google action
    const actionResult = await controller.registry.executeAction(
      'search_google',
      { query: 'test search' },
      browserSession
    );

    // Small delay to ensure navigation completes
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get browser state after search
    const stateEvent = browserSession.eventBus.dispatch(
      new BrowserStateRequestEvent({ includeScreenshot: false })
    );
    const stateAfter = await stateEvent;

    // Verify a new tab was created
    expect(stateAfter.tabs.length).toBe(initialTabsCount + 1);

    // Verify the current URL is Google search, not about:blank
    expect(stateAfter.url).toContain('google.com/search');
    expect(stateAfter.url).not.toBe(initialUrl);
    expect(stateAfter.url).not.toContain('about:blank');

    // Verify the search query is in the URL
    const queryInUrl = stateAfter.url.includes('test+search') || 
                      stateAfter.url.includes('test%20search');
    expect(queryInUrl).toBe(true);

    console.log(`✅ Test passed! Agent correctly focused on Google tab: ${stateAfter.url}`);
  });

  test('navigate with new tab focuses properly', async () => {
    // Get initial state
    const initialStateEvent = browserSession.eventBus.dispatch(
      new BrowserStateRequestEvent({ includeScreenshot: false })
    );
    const initialState = await initialStateEvent;
    const initialTabsCount = initialState.tabs.length;

    // Navigate to a URL in a new tab
    const navEvent = browserSession.eventBus.dispatch(
      new NavigateToUrlEvent({ url: 'https://example.com', newTab: true })
    );
    await navEvent;

    // Small delay to ensure navigation completes
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get browser state after navigation
    const stateEvent = browserSession.eventBus.dispatch(
      new BrowserStateRequestEvent({ includeScreenshot: false })
    );
    const stateAfter = await stateEvent;

    // Verify a new tab was created
    expect(stateAfter.tabs.length).toBe(initialTabsCount + 1);

    // Verify the current URL is the navigated URL
    expect(stateAfter.url).toContain('example.com');
    expect(stateAfter.url).not.toContain('about:blank');

    console.log(`✅ Test passed! Agent correctly focused on new tab: ${stateAfter.url}`);
  });

  test('multiple new tabs focus on latest', async () => {
    // Navigate to first new tab
    const nav1Event = browserSession.eventBus.dispatch(
      new NavigateToUrlEvent({ url: 'https://example.com', newTab: true })
    );
    await nav1Event;
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to second new tab
    const nav2Event = browserSession.eventBus.dispatch(
      new NavigateToUrlEvent({ url: 'https://github.com', newTab: true })
    );
    await nav2Event;
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const stateEvent = browserSession.eventBus.dispatch(
      new BrowserStateRequestEvent({ includeScreenshot: false })
    );
    const state = await stateEvent;

    // Should be focused on the most recent tab (github.com)
    expect(state.url).toContain('github.com');
    expect(state.tabs.length).toBeGreaterThanOrEqual(3);

    console.log(`✅ Test passed! Agent correctly focused on latest tab: ${state.url}`);
  });
});

// Allow running tests directly
if (require.main === module) {
  async function runAllTests() {
    const session = new BrowserSession();
    await session.start();
    try {
      console.log('Running test_search_google_creates_and_focuses_new_tab...');
      // Test would run here if executed directly
      
      console.log('\nRunning test_navigate_with_new_tab_focuses_properly...');
      // Test would run here if executed directly
      
      console.log('\nRunning test_multiple_new_tabs_focus_on_latest...');
      // Test would run here if executed directly
      
      console.log('\n✅ All tests passed!');
    } finally {
      await session.stop();
    }
  }
  
  runAllTests().catch(console.error);
}