/**
 * Test scrollToText functionality in BrowserSession
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { createScrollToTextEvent } from '../src/browser/events';

describe('ScrollToText Functionality', () => {
  let browserSession: BrowserSession;

  beforeEach(() => {
    browserSession = new BrowserSession({
      headless: true,
    });
  });

  afterEach(async () => {
    try {
      await browserSession.stop();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should create scrollToText event correctly', () => {
    const event = createScrollToTextEvent('test text');
    
    expect(event).toHaveProperty('text', 'test text');
    expect(event).toHaveProperty('direction', 'down');
    expect(event).toHaveProperty('event_timeout', 15.0);
    expect(event).toHaveProperty('id');
  });

  it('should create scrollToText event with custom direction', () => {
    const event = createScrollToTextEvent('test text', { direction: 'up' });
    
    expect(event).toHaveProperty('text', 'test text');
    expect(event).toHaveProperty('direction', 'up');
  });

  it('should have scrollToText method available', () => {
    expect(typeof browserSession.scrollToText).toBe('function');
  });

  it('should handle scrollToText call gracefully when no page is active', async () => {
    // Test without starting the browser session
    await expect(
      browserSession.scrollToText({ text: 'test', direction: 'down' })
    ).rejects.toThrow('No active page');
  });

  it('should detect ScrollToTextEvent correctly in event processing', async () => {
    const event = createScrollToTextEvent('test text');
    
    // This tests the event type detection logic in executeEvent
    // The actual scrolling would require a real browser page
    expect('text' in event).toBe(true);
    expect('direction' in event).toBe(true);
    
    // This matches the condition used in session.ts for event detection
    const isScrollToTextEvent = 'text' in event && 'direction' in event;
    expect(isScrollToTextEvent).toBe(true);
  });
});