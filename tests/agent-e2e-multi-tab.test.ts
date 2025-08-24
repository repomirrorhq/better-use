import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '../src/agent';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { MockLLM } from './test-utils/mockLLM';

describe('Agent E2E - Multi-Tab Navigation', () => {
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

  it('should handle opening and switching between multiple tabs', async () => {
    const mockActions = [
      // Navigate to first page
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'https://example.com',
          },
        },
      },
      // Open a new tab with a different URL
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'https://www.iana.org/',
            new_tab: true,
          },
        },
      },
      // Switch back to first tab
      {
        action: {
          name: 'switch_tab',
          parameters: {
            tab_index: 0,
          },
        },
      },
      // Extract info from first tab
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Example Domain',
      },
      // Switch to second tab
      {
        action: {
          name: 'switch_tab',
          parameters: {
            tab_index: 1,
          },
        },
      },
      // Extract info from second tab
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Internet Assigned Numbers Authority',
      },
      // Close second tab
      {
        action: {
          name: 'close_tab',
          parameters: {
            tab_index: 1,
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
      task: 'Open example.com and iana.org in separate tabs, extract info from both, then close the second tab',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 10,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify the agent completed all steps
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThanOrEqual(7);

    // Check that both navigations occurred
    const navSteps = history.filter(
      (step) => step.action?.name === 'navigate_to_url'
    );
    expect(navSteps.length).toBe(2);
    expect(navSteps[1].action?.parameters?.new_tab).toBe(true);

    // Check tab switching
    const switchSteps = history.filter(
      (step) => step.action?.name === 'switch_tab'
    );
    expect(switchSteps.length).toBeGreaterThanOrEqual(2);

    // Check extraction from both tabs
    const extractSteps = history.filter(
      (step) => step.action?.name === 'extract_page_info'
    );
    expect(extractSteps.length).toBe(2);

    // Check tab closure
    const closeStep = history.find(
      (step) => step.action?.name === 'close_tab'
    );
    expect(closeStep).toBeDefined();

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should handle opening links in new tabs', async () => {
    const mockActions = [
      // Navigate to a page with links
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'data:text/html,<html><body><a href="https://example.com" target="_blank">Link 1</a><a href="https://www.iana.org" target="_blank">Link 2</a></body></html>',
          },
        },
      },
      // Click first link (opens in new tab)
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 0,
          },
        },
      },
      // Click second link (opens in another new tab)
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 1,
          },
        },
      },
      // Get all tab URLs
      {
        action: {
          name: 'get_tabs_info',
          parameters: {},
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
      task: 'Click on links that open in new tabs',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 8,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify clicks were executed
    const clickSteps = history.filter(
      (step) => step.action?.name === 'click_element'
    );
    expect(clickSteps.length).toBe(2);

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should maintain context across tabs', async () => {
    const mockActions = [
      // Navigate to first page
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'data:text/html,<html><body><div id="data1">Data from tab 1</div></body></html>',
          },
        },
      },
      // Extract data from first tab
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Data from tab 1',
      },
      // Open new tab
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: 'data:text/html,<html><body><div id="data2">Data from tab 2</div></body></html>',
            new_tab: true,
          },
        },
      },
      // Extract data from second tab
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Data from tab 2',
      },
      // Compare data from both tabs (agent should have context)
      {
        action: {
          name: 'done',
          parameters: {
            summary: 'Collected data from tab 1 and tab 2',
          },
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Collect data from multiple tabs and compare',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 8,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify data was extracted from both tabs
    const extractSteps = history.filter(
      (step) => step.action?.name === 'extract_page_info'
    );
    expect(extractSteps.length).toBe(2);

    // Check that agent maintained context
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
    expect(doneStep?.action?.parameters?.summary).toContain('tab 1');
    expect(doneStep?.action?.parameters?.summary).toContain('tab 2');
  }, 30000);

  it('should handle tab limit gracefully', async () => {
    const mockActions = [];
    
    // Try to open many tabs
    for (let i = 0; i < 5; i++) {
      mockActions.push({
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: `data:text/html,<html><body>Tab ${i + 1}</body></html>`,
            new_tab: i > 0,
          },
        },
      });
    }
    
    // Get tabs info to verify count
    mockActions.push({
      action: {
        name: 'get_tabs_info',
        parameters: {},
      },
    });
    
    // Done
    mockActions.push({
      action: {
        name: 'done',
        parameters: {},
      },
    });

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Open multiple tabs to test tab management',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 10,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify navigation attempts
    const navSteps = history.filter(
      (step) => step.action?.name === 'navigate_to_url'
    );
    expect(navSteps.length).toBeGreaterThan(0);

    // Check completion without errors
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
    
    // Check no critical errors occurred
    const criticalErrors = history.filter(
      (step) => step.error && step.error.includes('crashed')
    );
    expect(criticalErrors.length).toBe(0);
  }, 30000);
});