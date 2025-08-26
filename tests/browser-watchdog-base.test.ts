import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import {
  BrowserStartEvent,
  BrowserConnectedEvent,
  NavigateToUrlEvent,
  TabCreatedEvent,
  NavigationCompleteEvent,
  BrowserStopEvent,
  BrowserStoppedEvent
} from '../src/browser/events';

describe('Browser Watchdog Integration', () => {
  jest.setTimeout(30000);

  test('watchdog integration with session lifecycle', async () => {
    const profile = new BrowserProfile({ headless: true });
    const session = new BrowserSession({ profile });

    // Start browser via event
    session.eventBus.dispatch(new BrowserStartEvent());

    // Wait for browser started event
    const startedEvent = await session.eventBus.expect(
      BrowserConnectedEvent,
      { timeout: 5000 }
    ) as BrowserConnectedEvent;
    expect(startedEvent.cdpUrl).toBeDefined();

    // Create a test page to ensure watchdogs are monitoring
    session.eventBus.dispatch(new NavigateToUrlEvent({
      url: 'about:blank',
      newTab: true
    }));

    // Wait for tab created event
    await session.eventBus.expect(TabCreatedEvent, { timeout: 2000 });

    // Navigate to a real page to generate some network activity
    session.eventBus.dispatch(new NavigateToUrlEvent({
      url: 'data:text/html,<h1>Integration Test</h1>',
      newTab: true
    }));

    // Wait for navigation to complete successfully (proves watchdogs aren't interfering)
    const navComplete = await session.eventBus.expect(
      NavigationCompleteEvent,
      {
        predicate: (e: NavigationCompleteEvent) => 
          e.url === 'data:text/html,<h1>Integration Test</h1>',
        timeout: 5000
      }
    ) as NavigationCompleteEvent;
    
    expect(navComplete.url).toBe('data:text/html,<h1>Integration Test</h1>');
    expect(navComplete.errorMessage).toBeUndefined();

    // Verify all watchdogs are still operational
    expect(session['_crashWatchdog']).toBeDefined();
    expect(session['_downloadsWatchdog']).toBeDefined();
    expect(session['_securityWatchdog']).toBeDefined();
    expect(session['_storageStateWatchdog']).toBeDefined();
    expect(session['_aboutBlankWatchdog']).toBeDefined();

    // Stop browser via event
    session.eventBus.dispatch(new BrowserStopEvent());

    // Wait for browser stopped event
    const stoppedEvent = await session.eventBus.expect(
      BrowserStoppedEvent,
      { timeout: 5000 }
    ) as BrowserStoppedEvent;
    expect(stoppedEvent.reason).toBeDefined();
  });

  test('watchdog event handler registration', async () => {
    const profile = new BrowserProfile({ headless: true });
    const session = new BrowserSession({ profile });

    try {
      // Start browser
      session.eventBus.dispatch(new BrowserStartEvent());
      await session.eventBus.expect(BrowserConnectedEvent, { timeout: 5000 });

      // Verify event handlers are registered by checking event bus
      const eventBus = session.eventBus;

      // Each watchdog should have been initialized with the event bus
      const watchdogs = [
        session['_crashWatchdog'],
        session['_downloadsWatchdog'],
        session['_securityWatchdog'],
        session['_storageStateWatchdog'],
        session['_aboutBlankWatchdog']
      ];

      for (const watchdog of watchdogs) {
        if (watchdog) {
          expect(watchdog.eventBus).toBe(eventBus);
        }
      }

    } finally {
      // Clean up
      await session.stop();
    }
  });
});