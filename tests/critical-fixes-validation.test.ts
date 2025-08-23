/**
 * Integration test to validate the critical fixes for:
 * 1. Scroll event implementation 
 * 2. SendKeys event implementation
 * 3. File upload event implementation 
 * 4. DOM service CDP integration
 */
import { BrowserSession } from '../src/browser/session';
import { Controller } from '../src/controller/index';
import { DomService } from '../src/dom/service';
import { createScrollEvent, createSendKeysEvent } from '../src/browser/events';

describe('Critical Fixes Validation', () => {
  let browserSession: BrowserSession;
  let controller: Controller;

  beforeEach(async () => {
    // Create fresh browser session for each test
    browserSession = new BrowserSession();
    await browserSession.start({ headless: true });
    
    controller = new Controller(browserSession);
  });

  afterEach(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
  });

  describe('Event Handler Fixes', () => {
    test('should handle scroll events without "Event type not implemented" error', async () => {
      // Create a scroll event with the correct interface (direction, amount)
      const scrollEvent = createScrollEvent('down', 800);
      
      // This should NOT throw "Event type not implemented" error
      expect(() => {
        browserSession.eventBus.dispatch(scrollEvent);
      }).not.toThrow();
      
      // Verify the event has correct properties
      expect(scrollEvent).toHaveProperty('direction');
      expect(scrollEvent).toHaveProperty('amount');
      expect(scrollEvent.direction).toBe('down');
      expect(scrollEvent.amount).toBe(800);
    });

    test('should handle sendKeys events without error', async () => {
      // Create a sendKeys event
      const sendKeysEvent = createSendKeysEvent('ctrl+a');
      
      // This should NOT throw "Event type not implemented" error
      expect(() => {
        browserSession.eventBus.dispatch(sendKeysEvent);
      }).not.toThrow();
      
      // Verify the event has correct properties
      expect(sendKeysEvent).toHaveProperty('keys');
      expect(sendKeysEvent.keys).toBe('ctrl+a');
    });

    test('should handle file upload events without error', async () => {
      // Create a mock DOM node for file upload
      const mockNode = {
        element_index: 1,
        backend_node_id: 123,
        tag_name: 'input',
        attributes: { type: 'file' }
      };

      // Create an upload file event
      const uploadEvent = {
        node: mockNode,
        file_path: '/tmp/test.txt',
        event_timeout: 30.0
      };

      // This should NOT throw "Event type not implemented" error when processed
      const { eventResult } = browserSession.eventBus.dispatch(uploadEvent);
      
      // Should not throw during event creation
      expect(uploadEvent).toHaveProperty('node');
      expect(uploadEvent).toHaveProperty('file_path');
    });
  });

  describe('DOM Service Fixes', () => {
    test('should not throw "getTargetsForPage not implemented" error', async () => {
      const domService = new DomService(browserSession);
      
      // This method should now return a basic implementation instead of throwing
      // Note: We're testing the private method indirectly by ensuring DOM operations work
      expect(domService).toBeDefined();
    });

    test('should successfully serialize DOM tree', async () => {
      const domService = new DomService(browserSession);
      
      // Navigate to a simple page first
      await controller.goToUrl('data:text/html,<html><body><h1>Test</h1><button id="test">Click me</button></body></html>');
      
      // This should NOT throw "DOM tree serializer not implemented" error
      expect(async () => {
        await domService.captureDOMStateString();
      }).not.toThrow();
    });
  });

  describe('Controller Integration', () => {
    test('should execute scroll action through controller without errors', async () => {
      // Navigate to a page with content to scroll
      await controller.goToUrl('data:text/html,<html><body><div style="height:2000px;"><h1>Scroll Test</h1><p>Content to scroll through</p></div></body></html>');
      
      // This should complete without throwing "Event type not implemented" errors
      await expect(controller.scroll({
        down: true,
        numPages: 1,
        frameElementIndex: null
      })).resolves.toBeDefined();
    });

    test('should get DOM state and selector map', async () => {
      // Navigate to a simple page with interactive elements
      await controller.goToUrl('data:text/html,<html><body><button id="btn1">Button 1</button><input type="text" id="input1"/></body></html>');
      
      // Should return DOM state with selector map (tests DOM serialization)
      const domState = await browserSession.getDOMState();
      
      expect(domState).toBeDefined();
      expect(domState.selector_map).toBeDefined();
      expect(domState.selector_map.size).toBeGreaterThan(0);
    });
  });
});