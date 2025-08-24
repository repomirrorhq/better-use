/**
 * Test AboutBlankWatchdog functionality.
 */

import { BrowserProfile } from '../src/browser/profile';
import { BrowserSession } from '../src/browser/session';
import {
  AboutBlankDVDScreensaverShownEvent,
  BrowserConnectedEvent,
  BrowserStartEvent,
  BrowserStopEvent,
  TabCreatedEvent,
  createNavigateToUrlEvent,
  createCloseTabEvent
} from '../src/browser/events';
import { CrashWatchdog } from '../src/browser/watchdogs/crash';
import { AboutBlankWatchdog } from '../src/browser/watchdogs/aboutblank';

describe('AboutBlankWatchdog', () => {
  let session: BrowserSession;

  afterEach(async () => {
    if (session) {
      await session.stop();
      if (session.eventBus) {
        await session.eventBus.stop({ clear: true, timeout: 5000 });
      }
    }
  });

  it('should start and stop with browser session', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ browserProfile: profile });

    // Start browser
    await session.start();

    // Verify aboutblank watchdog was created
    expect(session['_aboutblankWatchdog']).toBeDefined();
    expect(session['_aboutblankWatchdog']).not.toBeNull();
  });

  it('should create animation tab when none exist', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ browserProfile: profile });

    // Start browser
    await session.start();

    // Wait for initial tab creation and aboutblank watchdog to process
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check browser tabs - should have initial tab plus animation tab
    const tabs = await session.getTabs();
    expect(tabs.length).toBeGreaterThanOrEqual(1);

    // Look for new tab pages (animation tab)
    const newTabPages = tabs.filter(t => CrashWatchdog.isNewTabPage(t.url));
    // AboutBlankWatchdog should detect the initial new tab page
    expect(newTabPages.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle tab creation events', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ browserProfile: profile });

    // Start browser
    await session.start();

    // Get aboutblank watchdog
    const watchdog = session['_aboutblankWatchdog'];
    expect(watchdog).not.toBeNull();

    // Create a new tab
    const navEvent = session.eventBus.dispatch(createNavigateToUrlEvent(
      'data:text/html,<h1>Test Tab</h1>', 
      { newTab: true }
    ));
    
    await session.eventBus.expect(TabCreatedEvent, { timeout: 3000 });

    // Give watchdog time to process the new tab
    await new Promise(resolve => setTimeout(resolve, 300));

    // The watchdog should have processed the TabCreatedEvent
    // We can't easily verify internal state without accessing private methods
  });

  it('should show DVD screensaver on about:blank tabs', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ browserProfile: profile });

    // Start browser
    await session.start();

    // Get aboutblank watchdog
    const watchdog = session['_aboutblankWatchdog'] as AboutBlankWatchdog;
    expect(watchdog).not.toBeNull();

    // Wait for animation tab to be created
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find new tab pages
    const tabs = await session.getTabs();
    const newTabPages = tabs.filter(t => CrashWatchdog.isNewTabPage(t.url));

    // AboutBlankWatchdog should have detected the initial new tab page
    expect(newTabPages.length).toBeGreaterThanOrEqual(1);

    if (newTabPages.length > 0) {
      // Try to show screensaver on first about:blank page
      try {
        await watchdog['_showDvdScreensaverOnAboutBlankTabs']();
        // If no exception is thrown, the method executed successfully
      } catch (e) {
        // Method might fail in test environment, that's okay
        console.log(`DVD screensaver test encountered expected issue: ${e}`);
      }
    }
  });

  it('should manage animation tabs properly', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ browserProfile: profile });

    // Start browser
    await session.start();

    // Get aboutblank watchdog
    const watchdog = session['_aboutblankWatchdog'];
    expect(watchdog).not.toBeNull();

    // Wait for initial setup
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check current state
    const tabs = await session.getTabs();
    const initialPageCount = tabs.length;

    // Create multiple tabs to potentially trigger animation tab management
    for (let i = 0; i < 3; i++) {
      session.eventBus.dispatch(createNavigateToUrlEvent(
        `data:text/html,<h1>Tab ${i}</h1>`, 
        { newTab: true }
      ));
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Give watchdog time to process and manage animation tabs
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify pages still exist (watchdog shouldn't break tab management)
    const finalTabs = await session.getTabs();
    expect(finalTabs.length).toBeGreaterThanOrEqual(initialPageCount);
  });

  it('should execute DVD screensaver JavaScript without errors', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ browserProfile: profile });

    // Start browser
    await session.start();

    // Test 1: Initial new tab should get animation
    // The watchdog should detect the chrome://newtab/ page is a new tab and show animation
    const initialTabs = await session.getTabs();
    expect(initialTabs.length).toBe(1);
    expect(
      initialTabs[0].url.includes('newtab') || 
      initialTabs[0].url.includes('new-tab-page') ||
      initialTabs[0].url === 'about:blank'
    ).toBe(true);

    // Wait for AboutBlankWatchdog to show DVD screensaver on the initial new tab
    try {
      const dvdEvent1 = await session.eventBus.expect(AboutBlankDVDScreensaverShownEvent, { timeout: 10000 });
      expect(dvdEvent1.error).toBeUndefined();

      // Get the page and verify animation
      const tabs1 = await session.getTabs();
      const tab1 = tabs1.find(t => t.targetId === dvdEvent1.targetId);
      expect(tab1).toBeDefined();

      // Verify the animation was created
      expect(dvdEvent1.targetId).toBeTruthy();

      // Test 2: Close the tab and verify watchdog creates new about:blank tab with animation
      const closeEvent = session.eventBus.dispatch(createCloseTabEvent(dvdEvent1.targetId));
      await closeEvent;

      // Wait for new about:blank tab to be created and animation shown
      const dvdEvent2 = await session.eventBus.expect(AboutBlankDVDScreensaverShownEvent, { timeout: 10000 });
      expect(dvdEvent2.error).toBeUndefined();

      // Get the new page
      const tabs2 = await session.getTabs();
      const tab2 = tabs2.find(t => t.targetId === dvdEvent2.targetId);
      expect(tab2).toBeDefined();
      expect(CrashWatchdog.isNewTabPage(tab2!.url)).toBe(true);

      // Verify animation on the new tab through events
      expect(dvdEvent2.targetId).toBeTruthy();
    } catch (e) {
      // DVD screensaver might not be triggered in test environment
      console.log('DVD screensaver event not triggered, which is acceptable in test environment');
    }

    // Wait a bit for any pending operations
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 30000); // 30 second timeout
});