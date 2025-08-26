/**
 * Test agent shutdown and cleanup.
 */

import { Agent, BrowserProfile, BrowserSession } from '../src';
import { createMockLLM } from './test-utils/mockLLM';
import { describe, test, expect } from '@jest/globals';

describe('Agent Shutdown and Cleanup', () => {
  test('agent exits within 10s', async () => {
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        keepAlive: false
      })
    });
    await browserSession.start();

    // Create mock LLM that returns done immediately (default behavior)
    const mockLLM = createMockLLM();

    const agent = new Agent({
      task: 'Test task',
      llm: mockLLM,
      browserSession,
      agentDirectory: process.cwd()
    });

    const startTime = Date.now();
    const result = await agent.run({ maxSteps: 1 });
    const exitTime = (Date.now() - startTime) / 1000;

    expect(result.isDone()).toBe(true);
    expect(result.isSuccessful()).toBe(true);
    expect(exitTime).toBeLessThan(10);

    // Verify browser session was cleaned up
    expect((browserSession as any)._cdpClientRoot).toBeNull();
  }, 15000);

  test('no leaked asyncio tasks equivalent - check promises', async () => {
    // In Node.js, we can't directly track asyncio tasks like in Python
    // Instead, we'll verify that all promises resolve and cleanup happens
    
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        keepAlive: false
      })
    });
    await browserSession.start();

    const mockLLM = createMockLLM();

    const agent = new Agent({
      task: 'Test task',
      llm: mockLLM,
      browserSession,
      agentDirectory: process.cwd()
    });

    await agent.run({ maxSteps: 1 });

    // Wait briefly for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In TypeScript/Node.js, we verify cleanup by checking that resources are released
    expect((browserSession as any)._cdpClientRoot).toBeNull();
    expect((browserSession as any).browser).toBeNull();
  }, 15000);

  test('multiple agents cleanup', async () => {
    const exitTimes: number[] = [];

    for (let i = 0; i < 3; i++) {
      const browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true,
          keepAlive: false
        })
      });
      await browserSession.start();

      const mockLLM = createMockLLM();

      const agent = new Agent({
        task: `Test task ${i + 1}`,
        llm: mockLLM,
        browserSession,
        agentDirectory: process.cwd()
      });

      const startTime = Date.now();
      const result = await agent.run({ maxSteps: 1 });
      const exitTime = (Date.now() - startTime) / 1000;

      expect(result.isDone()).toBe(true);
      exitTimes.push(exitTime);

      // Small delay between agents
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // All agents should exit quickly
    exitTimes.forEach((exitTime, i) => {
      expect(exitTime).toBeLessThan(10);
    });
  }, 45000);

  test('browser session stop method', async () => {
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        keepAlive: true  // Keep alive so we can test stop()
      })
    });
    await browserSession.start();

    // Verify browser is connected
    expect((browserSession as any)._cdpClientRoot).not.toBeNull();

    // Call stop() - should clear event buses but keep browser alive
    await browserSession.stop();

    // Browser should still be connected (since we didn't kill it)
    // But event bus should be fresh
    expect((browserSession as any).eventBus).not.toBeNull();

    // Now kill to clean up
    await browserSession.stop();

    // After kill, browser should be disconnected
    expect((browserSession as any)._cdpClientRoot).toBeNull();
  }, 15000);

  test('agent with immediate done exits quickly', async () => {
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        keepAlive: false
      })
    });
    await browserSession.start();

    // Create LLM that immediately returns done
    const mockLLM = createMockLLM([
      `{
        "thinking": "null",
        "evaluation_previous_goal": "Starting",
        "memory": "Task started",
        "next_goal": "Complete immediately",
        "action": [
          {
            "done": {
              "text": "Task completed immediately",
              "success": true
            }
          }
        ]
      }`
    ]);

    const agent = new Agent({
      task: 'Complete immediately',
      llm: mockLLM,
      browserSession,
      agentDirectory: process.cwd()
    });

    const startTime = Date.now();
    const result = await agent.run({ maxSteps: 5 });
    const exitTime = (Date.now() - startTime) / 1000;

    expect(result.isDone()).toBe(true);
    expect(result.isSuccessful()).toBe(true);
    expect(exitTime).toBeLessThan(5); // Should be very fast
    expect(result.historyList().length).toBe(1); // Only one step
  }, 10000);

  test('agent respects max steps even with keep_alive', async () => {
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        keepAlive: true
      })
    });
    await browserSession.start();

    // Create LLM that never returns done
    const mockLLM = createMockLLM([
      `{
        "thinking": "null",
        "evaluation_previous_goal": "Continuing",
        "memory": "Still working",
        "next_goal": "Keep going",
        "action": [
          {
            "scroll": {
              "direction": "down"
            }
          }
        ]
      }`
    ]);

    const agent = new Agent({
      task: 'Never-ending task',
      llm: mockLLM,
      browserSession,
      agentDirectory: process.cwd()
    });

    const startTime = Date.now();
    const result = await agent.run({ maxSteps: 3 });
    const exitTime = (Date.now() - startTime) / 1000;

    expect(result.isDone()).toBe(true); // Should be done after max steps
    expect(result.isSuccessful()).toBe(false); // Not successful (hit max steps)
    expect(result.historyList().length).toBe(3); // Exactly max steps
    expect(exitTime).toBeLessThan(15); // Should not hang

    // Clean up
    await browserSession.stop();
  }, 20000);
});