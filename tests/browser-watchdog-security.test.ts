/**
 * Test navigation and security functionality.
 */

import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import {
  BrowserStartEvent,
  BrowserConnectedEvent,
  BrowserStopEvent,
  BrowserStoppedEvent,
  NavigateToUrlEvent,
  TabCreatedEvent,
  BrowserErrorEvent,
} from '../src/browser/events';
import { SecurityWatchdog } from '../src/browser/watchdogs/security';

describe('SecurityWatchdog', () => {
  let session: BrowserSession;

  afterEach(async () => {
    if (session) {
      try {
        await session.stop();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('navigation tab created events', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ profile });

    // Track TabCreatedEvents
    const tabCreatedEvents: TabCreatedEvent[] = [];
    session.eventBus.on(TabCreatedEvent, (e: TabCreatedEvent) => tabCreatedEvents.push(e));

    try {
      // Start browser
      session.eventBus.dispatch(new BrowserStartEvent());
      await session.eventBus.expect(BrowserConnectedEvent, 5000);

      // Verify security watchdog was created
      const securityWatchdog = (session as any)._securityWatchdog;
      expect(securityWatchdog).toBeDefined();
      expect(securityWatchdog).toBeInstanceOf(SecurityWatchdog);

      // Create first tab - should emit TabCreatedEvent
      session.eventBus.dispatch(new NavigateToUrlEvent({ 
        url: 'data:text/html,<h1>Tab 1</h1>', 
        newTab: true 
      }));

      // Wait for first TabCreatedEvent
      const firstEvent = await session.eventBus.expect(TabCreatedEvent, 3000) as TabCreatedEvent;
      expect(firstEvent.targetId).toBeDefined();
      expect(typeof firstEvent.url).toBe('string');

      // Create second tab - should emit another TabCreatedEvent
      session.eventBus.dispatch(new NavigateToUrlEvent({ 
        url: 'data:text/html,<h1>Tab 2</h1>', 
        newTab: true 
      }));

      // Wait for second TabCreatedEvent
      const secondEvent = await session.eventBus.expect(TabCreatedEvent, 3000) as TabCreatedEvent;
      expect(secondEvent.targetId).toBeDefined();
      expect(typeof secondEvent.url).toBe('string');

      // Verify we have at least 2 TabCreatedEvents
      expect(tabCreatedEvents.length).toBeGreaterThanOrEqual(2);

      // Verify the events have different tab indices
      const uniqueTabIds = new Set(tabCreatedEvents.map(event => event.tabId));
      expect(uniqueTabIds.size).toBeGreaterThanOrEqual(2);

    } finally {
      // Stop browser
      session.eventBus.dispatch(new BrowserStopEvent());
      await session.eventBus.expect(BrowserStoppedEvent, 5000);
    }
  }, 15000);

  test('security watchdog enforcement', async () => {
    // Create a profile with restricted domains
    const profile = new BrowserProfile({
      headless: true,
      allowedDomains: ['example.com', 'httpbin.org'],
    });
    session = new BrowserSession({ profile });

    // Track BrowserErrorEvents
    const errorEvents: BrowserErrorEvent[] = [];
    session.eventBus.on(BrowserErrorEvent, (e: BrowserErrorEvent) => errorEvents.push(e));

    try {
      // Start browser
      session.eventBus.dispatch(new BrowserStartEvent());
      await session.eventBus.expect(BrowserConnectedEvent, 5000);

      // Verify security watchdog was created
      const securityWatchdog = (session as any)._securityWatchdog as SecurityWatchdog;
      expect(securityWatchdog).toBeDefined();
      expect(securityWatchdog).toBeInstanceOf(SecurityWatchdog);

      // Test that allowed domains work
      const allowedUrl = 'https://httpbin.org/get';
      const allowed = securityWatchdog.isUrlAllowed(allowedUrl);
      expect(allowed).toBe(true);

      // Test that disallowed domains are blocked
      const disallowedUrl = 'https://malicious-site.com/bad';
      const disallowed = securityWatchdog.isUrlAllowed(disallowedUrl);
      expect(disallowed).toBe(false);

      // Test internal URLs are always allowed
      const internalUrls = ['about:blank', 'chrome://newtab/', 'chrome://new-tab-page/'];
      for (const url of internalUrls) {
        expect(securityWatchdog.isUrlAllowed(url)).toBe(true);
      }

      // Test glob patterns work
      const profileWithGlob = new BrowserProfile({
        headless: true,
        allowedDomains: ['*.github.com'],
      });
      securityWatchdog.browserSession.browserProfile = profileWithGlob;

      expect(securityWatchdog.isUrlAllowed('https://api.github.com/repos')).toBe(true);
      expect(securityWatchdog.isUrlAllowed('https://github.com/user')).toBe(true);
      expect(securityWatchdog.isUrlAllowed('https://evil.com/github.com')).toBe(false);

    } finally {
      // Stop browser
      session.eventBus.dispatch(new BrowserStopEvent());
      await session.eventBus.expect(BrowserStoppedEvent, 5000);
    }
  }, 15000);

  test('navigation watchdog agent focus tracking', async () => {
    const profile = new BrowserProfile({ headless: true });
    session = new BrowserSession({ profile });

    try {
      // Start browser
      session.eventBus.dispatch(new BrowserStartEvent());
      await session.eventBus.expect(BrowserConnectedEvent, 5000);

      // Get navigation watchdog (in TypeScript it might be security watchdog)
      const navWatchdog = (session as any)._navigationWatchdog || (session as any)._securityWatchdog;
      expect(navWatchdog).toBeDefined();

      // Initial tab should be tab 0
      expect(navWatchdog.agentTabId).toBe(0);

      // Create a new tab
      session.eventBus.dispatch(new NavigateToUrlEvent({ 
        url: 'data:text/html,<h1>New Tab</h1>', 
        newTab: true 
      }));
      await session.eventBus.expect(TabCreatedEvent, 3000);

      // Give it a moment for focus to update
      await new Promise(resolve => setTimeout(resolve, 200));

      // The agent focus should be on a tab index > 0
      expect(navWatchdog.agentTabId).toBeGreaterThan(0);

    } finally {
      // Stop browser
      session.eventBus.dispatch(new BrowserStopEvent());
      await session.eventBus.expect(BrowserStoppedEvent, 5000);
    }
  }, 15000);
});