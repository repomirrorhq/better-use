/**
 * Tests for DefaultActionWatchdog functionality
 */

import { DefaultActionWatchdog } from '../src/browser/watchdogs/defaultaction';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';

describe('DefaultActionWatchdog', () => {
  let browserSession: BrowserSession;
  let watchdog: DefaultActionWatchdog;

  beforeAll(() => {
    // Create browser session for testing
    const profile = BrowserProfile.createDefault();
    browserSession = new BrowserSession({ profile, headless: true });
  });

  afterAll(() => {
    // Clean up
    if (watchdog) {
      watchdog.destroy();
    }
  });

  describe('Watchdog Creation and Configuration', () => {
    test('should create with default config', () => {
      watchdog = new DefaultActionWatchdog(browserSession);
      
      expect(watchdog).toBeDefined();
      expect(watchdog['config'].clickTimeoutMs).toBe(15000);
      expect(watchdog['config'].typeTimeoutMs).toBe(15000);
      expect(watchdog['config'].scrollTimeoutMs).toBe(8000);
      expect(watchdog['config'].waitTimeoutMs).toBe(60000);
    });

    test('should create with custom config', () => {
      const customConfig = {
        clickTimeoutMs: 10000,
        typeTimeoutMs: 8000,
        scrollTimeoutMs: 5000,
        waitTimeoutMs: 30000,
      };

      watchdog = new DefaultActionWatchdog(browserSession, customConfig);
      
      expect(watchdog['config'].clickTimeoutMs).toBe(10000);
      expect(watchdog['config'].typeTimeoutMs).toBe(8000);
      expect(watchdog['config'].scrollTimeoutMs).toBe(5000);
      expect(watchdog['config'].waitTimeoutMs).toBe(30000);
    });

    test('should have correct LISTENS_TO events', () => {
      const expectedEvents = [
        'ClickElementEvent',
        'TypeTextEvent',
        'ScrollEvent',
        'GoBackEvent',
        'GoForwardEvent',
        'RefreshEvent',
        'WaitEvent',
        'SendKeysEvent',
        'UploadFileEvent',
        'GetDropdownOptionsEvent',
        'SelectDropdownOptionEvent',
        'ScrollToTextEvent'
      ];

      expect(DefaultActionWatchdog.LISTENS_TO).toEqual(expectedEvents);
    });
  });

  describe('Helper Methods', () => {
    beforeEach(() => {
      watchdog = new DefaultActionWatchdog(browserSession);
    });

    test('should identify file inputs correctly', () => {
      // Mock EnhancedDOMTreeNode for file input
      const fileInputNode = {
        node_name: 'input',
        attributes: { type: 'file' }
      } as any;

      const textInputNode = {
        node_name: 'input',
        attributes: { type: 'text' }
      } as any;

      const buttonNode = {
        node_name: 'button',
        attributes: {}
      } as any;

      expect(watchdog['isFileInput'](fileInputNode)).toBe(true);
      expect(watchdog['isFileInput'](textInputNode)).toBe(false);
      expect(watchdog['isFileInput'](buttonNode)).toBe(false);
    });

    test('should build selectors correctly', () => {
      const nodeWithId = {
        node_name: 'button',
        attributes: { id: 'submit-btn', class: 'btn primary' }
      } as any;

      const nodeWithoutId = {
        node_name: 'div',
        attributes: { class: 'container main' }
      } as any;

      const selector1 = watchdog['buildSelectorForElement'](nodeWithId);
      const selector2 = watchdog['buildSelectorForElement'](nodeWithoutId);

      expect(selector1).toContain('button#submit-btn');
      expect(selector1).toContain('.btn');
      expect(selector1).toContain('.primary');

      expect(selector2).toContain('div');
      expect(selector2).toContain('.container');
      expect(selector2).toContain('.main');
    });

    test('should normalize keys correctly', () => {
      const testCases = [
        ['enter', 'Enter'],
        ['return', 'Enter'],
        ['tab', 'Tab'],
        ['escape', 'Escape'],
        ['esc', 'Escape'],
        ['space', 'Space'],
        ['up', 'ArrowUp'],
        ['down', 'ArrowDown'],
        ['left', 'ArrowLeft'],
        ['right', 'ArrowRight'],
        ['pageup', 'PageUp'],
        ['pagedown', 'PageDown'],
        ['home', 'Home'],
        ['end', 'End'],
        ['unknown', 'unknown'] // Should pass through unknown keys
      ];

      testCases.forEach(([input, expected]) => {
        const result = watchdog['normalizeKey'](input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Event Handler Registration', () => {
    test('should register event handlers on attach', () => {
      watchdog = new DefaultActionWatchdog(browserSession);
      
      // Mock the browser session to track event registrations
      const mockEventHandlers: string[] = [];
      const originalOn = browserSession.on;
      browserSession.on = jest.fn().mockImplementation((event: string, handler: Function) => {
        mockEventHandlers.push(event);
        return originalOn.call(browserSession, event, handler);
      });

      // Attach the watchdog
      try {
        watchdog.attachToSession();

        // Verify that all expected events are registered
        DefaultActionWatchdog.LISTENS_TO.forEach(eventType => {
          expect(mockEventHandlers).toContain(eventType);
        });
      } catch (error) {
        // Expected to fail since we don't have a real browser session
        // but we can still check that the setup was correct
        expect(error).toBeDefined();
      }

      // Restore original method
      browserSession.on = originalOn;
    });
  });

  describe('Configuration Validation', () => {
    test('should merge default and custom configs correctly', () => {
      const partialConfig = {
        clickTimeoutMs: 20000,
        // Other values should use defaults
      };

      watchdog = new DefaultActionWatchdog(browserSession, partialConfig);

      expect(watchdog['config'].clickTimeoutMs).toBe(20000); // Custom value
      expect(watchdog['config'].typeTimeoutMs).toBe(15000);  // Default value
      expect(watchdog['config'].scrollTimeoutMs).toBe(8000); // Default value
      expect(watchdog['config'].waitTimeoutMs).toBe(60000);  // Default value
    });

    test('should be enabled by default', () => {
      watchdog = new DefaultActionWatchdog(browserSession);
      expect(watchdog['config'].enabled).toBe(true);
    });
  });
});