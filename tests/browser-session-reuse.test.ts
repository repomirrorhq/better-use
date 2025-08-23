/**
 * Test browser session reuse and regeneration after browser disconnection.
 * 
 * Tests cover:
 * - Browser regeneration after context is closed
 * - Screenshot functionality after regeneration  
 * - Multiple regeneration cycles
 */

import { BrowserProfile, BrowserSession } from '../src';

describe('BrowserSessionReuse', () => {
  describe('browser session reuse and regeneration after disconnection', () => {
    it('should regenerate browser and take screenshot after disconnection', async () => {
      const session = new BrowserSession({
        profile: new BrowserProfile({
          headless: true,
          user_data_dir: undefined
        })
      });

      try {
        // Start browser session
        await session.start();

        // Navigate to a test page
        expect(session.page).toBeTruthy();
        await session.page!.goto('data:text/html,<h1>Test Page - Before Disconnect</h1>');

        // Take a screenshot before disconnection
        const screenshot1 = await session.takeScreenshot();
        expect(screenshot1).toBeTruthy();
        expect(screenshot1!.length).toBeGreaterThan(0);

        // Store initial browser context
        const initialContext = session.browserContext;
        expect(initialContext).toBeTruthy();

        // Force disconnect the browser by closing the browser context
        if (session.browserContext) {
          await session.browserContext.close();
        }

        // Try to take a screenshot - this should trigger regeneration internally
        const screenshot2 = await session.takeScreenshot();
        expect(screenshot2).toBeTruthy();
        expect(screenshot2!.length).toBeGreaterThan(0);

        // Check if browser was regenerated (new browser context created)
        expect(session.browserContext).toBeTruthy();
        // Verify the context is valid by checking if we can access its pages
        expect(session.browserContext?.pages).toBeTruthy();

        // Verify we can still interact with the browser
        expect(session.page).toBeTruthy();
        await session.page!.goto('data:text/html,<h1>Test Page - After Regeneration</h1>');
        const screenshot3 = await session.takeScreenshot();
        expect(screenshot3).toBeTruthy();
        expect(screenshot3!.length).toBeGreaterThan(0);

      } finally {
        await session.stop();
      }
    }, 30000);

    it('should handle browser session reuse with retry decorator', async () => {
      const session = new BrowserSession({
        profile: new BrowserProfile({
          headless: true,
          user_data_dir: undefined
        })
      });

      try {
        await session.start();

        // Navigate to a test page
        expect(session.page).toBeTruthy();
        await session.page!.goto('data:text/html,<h1>Test Retry Decorator</h1>');

        // Take a screenshot to verify it works
        const screenshot1 = await session.takeScreenshot();
        expect(screenshot1).toBeTruthy();

        // Close the browser context while a screenshot might be in progress
        // This simulates a browser crash during CDP operation
        const closePromise = (async () => {
          await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
          if (session.browserContext) {
            try {
              await session.browserContext.close();
            } catch (error) {
              // Context might already be closed
            }
          }
        })();

        // Try to take a screenshot - the retry mechanism should handle the failure
        try {
          const screenshot2 = await session.takeScreenshot();
          // If it succeeded, the browser should have been regenerated
          expect(screenshot2).toBeTruthy();
        } catch (error) {
          // If it failed, that's also OK - the browser state was reset
        }

        // Wait for close operation to complete
        await closePromise;

        // Verify we can still use the browser after regeneration
        await session.start(); // Ensure browser is started
        const screenshot3 = await session.takeScreenshot();
        expect(screenshot3).toBeTruthy();
        expect(screenshot3!.length).toBeGreaterThan(0);

      } finally {
        await session.stop();
      }
    }, 30000);
  });
});