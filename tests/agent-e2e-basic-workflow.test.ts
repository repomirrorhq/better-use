import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '../src/agent';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { MockLLM } from './test-utils/mockLLM';
import { AgentHistory } from '../src/agent/views';

describe('Agent E2E - Basic Workflow', () => {
  let browser: BrowserSession;

  beforeAll(async () => {
    browser = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        disableImages: true,
      }),
    });
    await browser.start();
  });

  afterAll(async () => {
    if (browser) {
      await browser.stop();
    }
  });

  it('should complete a basic navigation and extraction task', async () => {
    // Create a mock LLM that returns specific actions
    const mockActions = [
      // First, navigate to example.com
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'https://example.com',
          },
        },
      },
      // Then extract the page title
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Example Domain',
      },
      // Finally, done
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Go to example.com and tell me the page title',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 5,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify the agent completed the task
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThan(0);

    // Check that navigation occurred
    const navStep = history.find(
      (step) => step.action?.name === 'navigate_to_url'
    );
    expect(navStep).toBeDefined();
    expect(navStep?.action?.parameters?.url).toBe('https://example.com');

    // Check that extraction occurred
    const extractStep = history.find(
      (step) => step.action?.name === 'extract_page_info'
    );
    expect(extractStep).toBeDefined();

    // Check that the agent marked the task as done
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should handle errors gracefully', async () => {
    // Create a mock LLM that returns an invalid action
    const mockActions = [
      {
        action: {
          name: 'invalid_action_that_does_not_exist',
          parameters: {},
        },
      },
      // After error, provide a valid action
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Test error handling',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 3,
      includeGif: false,
    });

    const history = await agent.run();

    // Agent should handle the error and continue
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThan(0);

    // Should have an error in the history
    const errorStep = history.find((step) => step.error !== undefined);
    expect(errorStep).toBeDefined();

    // Should still complete
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should respect maxStepsPerRun limit', async () => {
    // Create a mock LLM that never completes
    const mockActions = Array(10).fill({
      action: {
        name: 'wait',
        parameters: {
          seconds: 0.1,
        },
      },
    });

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Test max steps limit',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 3,
      includeGif: false,
    });

    const history = await agent.run();

    // Should stop at maxStepsPerRun
    expect(history.length).toBeLessThanOrEqual(3);
  }, 30000);

  it('should handle multi-step form interaction', async () => {
    const mockActions = [
      // Navigate to a test form page
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'data:text/html,<html><body><form><input type="text" id="name" /><input type="email" id="email" /><button type="submit">Submit</button></form></body></html>',
          },
        },
      },
      // Fill the name field
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'Test User',
            index: 0,
          },
        },
      },
      // Fill the email field
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'test@example.com',
            index: 1,
          },
        },
      },
      // Click submit
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 2,
          },
        },
      },
      // Done
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Fill out the form with name "Test User" and email "test@example.com"',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 10,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify all actions were executed
    expect(history.length).toBeGreaterThanOrEqual(4);
    
    // Check navigation
    const navStep = history.find(
      (step) => step.action?.name === 'navigate_to_url'
    );
    expect(navStep).toBeDefined();

    // Check form filling
    const typeSteps = history.filter(
      (step) => step.action?.name === 'type_text'
    );
    expect(typeSteps.length).toBe(2);

    // Check form submission
    const clickStep = history.find(
      (step) => step.action?.name === 'click_element'
    );
    expect(clickStep).toBeDefined();

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should handle screenshot capture when requested', async () => {
    const mockActions = [
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'https://example.com',
          },
        },
      },
      {
        action: {
          name: 'screenshot',
          parameters: {},
        },
      },
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Navigate to example.com and take a screenshot',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 5,
      includeGif: false,
      includeScreenshot: true,
    });

    const history = await agent.run();

    // Verify screenshot action was executed
    const screenshotStep = history.find(
      (step) => step.action?.name === 'screenshot'
    );
    expect(screenshotStep).toBeDefined();

    // At least one step should have a screenshot
    const stepsWithScreenshot = history.filter(
      (step) => step.screenshot !== undefined
    );
    expect(stepsWithScreenshot.length).toBeGreaterThan(0);
  }, 30000);
});