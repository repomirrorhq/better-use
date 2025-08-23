import { Controller } from '../src/controller';
import { BrowserSession, BrowserProfile } from '../src/browser';
import { ActionResult } from '../src/agent/views';
import express from 'express';
import http from 'http';

jest.setTimeout(60000);

describe('Controller Actions Integration', () => {
  let server: http.Server;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;

  beforeAll((done) => {
    // Create test HTTP server
    const app = express();
    
    app.get('/', (req, res) => {
      res.send('<html><head><title>Test Home Page</title></head><body><h1>Test Home Page</h1><p>Welcome to the test site</p></body></html>');
    });

    app.get('/page1', (req, res) => {
      res.send('<html><head><title>Test Page 1</title></head><body><h1>Test Page 1</h1><p>This is test page 1</p></body></html>');
    });

    app.get('/page2', (req, res) => {
      res.send('<html><head><title>Test Page 2</title></head><body><h1>Test Page 2</h1><p>This is test page 2</p></body></html>');
    });

    app.get('/search', (req, res) => {
      res.send(`
        <html>
        <head><title>Search Results</title></head>
        <body>
          <h1>Search Results</h1>
          <div class="results">
            <div class="result">Result 1</div>
            <div class="result">Result 2</div>
            <div class="result">Result 3</div>
          </div>
        </body>
        </html>
      `);
    });

    server = app.listen(0, async () => {
      const address = server.address() as any;
      baseUrl = `http://localhost:${address.port}`;
      
      // Initialize browser session
      browserSession = new BrowserSession({
        profile: new BrowserProfile({
          headless: true,
          userDataDir: undefined,
          keepAlive: true
        })
      });
      await browserSession.start();
      
      done();
    });
  });

  afterAll(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    controller = new Controller();
  });

  test('registry contains expected default actions', () => {
    const commonActions = [
      'go_to_url',
      'search_google',
      'click_element_by_index',
      'input_text',
      'scroll',
      'go_back',
      'switch_tab',
      'close_tab',
      'wait'
    ];

    for (const action of commonActions) {
      const registeredAction = controller.registry.actions[action];
      expect(registeredAction).toBeDefined();
      expect(registeredAction.function).toBeDefined();
      expect(registeredAction.description).toBeDefined();
    }
  });

  test('custom action registration and execution', async () => {
    // Define a custom action
    interface CustomParams {
      text: string;
    }

    const customActionFunction = async (params: CustomParams, browserSession: BrowserSession) => {
      const page = await browserSession.getCurrentPage();
      return new ActionResult({
        extractedContent: `Custom action executed with: ${params.text} on ${page.url}`
      });
    };
    
    controller.registry.registerAction('custom_action', {
      function: customActionFunction,
      description: 'Test custom action'
    });

    // Navigate to a page first
    const gotoAction: any = {
      go_to_url: { url: `${baseUrl}/page1`, new_tab: false }
    };

    await controller.act(gotoAction, browserSession);

    // Execute the custom action
    const customAction: any = {
      custom_action: { text: 'test_value' }
    };

    const result = await controller.act(customAction, browserSession);

    // Verify the result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeDefined();
    expect(result.extractedContent).toContain('Custom action executed with: test_value on');
    expect(result.extractedContent).toContain(`${baseUrl}/page1`);
  });

  test('wait action correctly waits for specified duration', async () => {
    // Verify wait action exists
    const waitActionInfo = controller.registry.actions['wait'];
    expect(waitActionInfo).toBeDefined();

    // Test 1 second wait
    const waitAction: any = {
      wait: { seconds: 1 }
    };

    const startTime = Date.now();
    const result = await controller.act(waitAction, browserSession);
    const endTime = Date.now();

    // Verify the result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeDefined();
    expect(result.extractedContent).toContain('Waiting for');

    // Verify timing (accounting for LLM call deduction of 3s)
    const elapsed = (endTime - startTime) / 1000;
    expect(elapsed).toBeLessThanOrEqual(0.2); // Allow some timing margin

    // Test longer wait
    const waitAction5: any = {
      wait: { seconds: 5 }
    };

    const startTime2 = Date.now();
    const result2 = await controller.act(waitAction5, browserSession);
    const endTime2 = Date.now();

    // Verify the result
    expect(result2).toBeInstanceOf(ActionResult);
    expect(result2.extractedContent).toContain('Waiting for');

    // Verify timing (5s - 3s = 2s)
    const elapsed2 = (endTime2 - startTime2) / 1000;
    expect(elapsed2).toBeGreaterThanOrEqual(1.9);
    expect(elapsed2).toBeLessThanOrEqual(2.2);
  });

  test('go_back action navigates to previous page', async () => {
    // Navigate to first page
    const gotoAction1: any = {
      go_to_url: { url: `${baseUrl}/page1`, new_tab: false }
    };
    await controller.act(gotoAction1, browserSession);

    // Store the first page URL
    const page1 = await browserSession.getCurrentPage();
    const firstUrl = page1.url;
    console.log(`First page URL: ${firstUrl}`);

    // Navigate to second page
    const gotoAction2: any = {
      go_to_url: { url: `${baseUrl}/page2`, new_tab: false }
    };
    await controller.act(gotoAction2, browserSession);

    // Verify we're on the second page
    const page2 = await browserSession.getCurrentPage();
    const secondUrl = page2.url;
    console.log(`Second page URL: ${secondUrl}`);
    expect(secondUrl).toContain(`${baseUrl}/page2`);

    // Execute go back action
    const goBackAction: any = {
      go_back: {}
    };
    const result = await controller.act(goBackAction, browserSession);

    // Verify the result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeDefined();
    expect(result.extractedContent).toContain('Navigated back');

    // Wait for navigation to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify we're back on the first page
    const page3 = await browserSession.getCurrentPage();
    const finalUrl = page3.url;
    console.log(`Final page URL after going back: ${finalUrl}`);
    expect(finalUrl).toContain(`${baseUrl}/page1`);
  });

  test('navigation chain with history', async () => {
    // Set up a chain of navigation: Home -> Page1 -> Page2
    const urls = [`${baseUrl}/`, `${baseUrl}/page1`, `${baseUrl}/page2`];

    // Navigate to each page in sequence
    for (const url of urls) {
      const action: any = {
        go_to_url: { url, new_tab: false }
      };
      await controller.act(action, browserSession);

      // Verify current page
      const page = await browserSession.getCurrentPage();
      expect(page.url).toContain(url);
    }

    // Go back twice and verify each step
    const expectedUrls = urls.slice(0, -1).reverse();
    for (const expectedUrl of expectedUrls) {
      const goBackAction: any = {
        go_back: {}
      };
      await controller.act(goBackAction, browserSession);
      
      // Wait for navigation to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const page = await browserSession.getCurrentPage();
      expect(page.url).toContain(expectedUrl);
    }
  });

  test('done action completes successfully', async () => {
    const doneAction: any = {
      done: { text: 'Task completed successfully', success: true }
    };

    const result = await controller.act(doneAction, browserSession);

    expect(result).toBeInstanceOf(ActionResult);
    expect(result.isDone).toBe(true);
    expect(result.extractedContent).toContain('Task completed successfully');
  });

  test('search_google action', async () => {
    const searchAction: any = {
      search_google: { query: 'test query' }
    };

    const result = await controller.act(searchAction, browserSession);

    expect(result).toBeInstanceOf(ActionResult);
    // Should navigate to Google search
    const page = await browserSession.getCurrentPage();
    expect(page.url).toContain('google.com/search');
    expect(page.url).toContain('q=test+query');
  });

  test('send_keys action', async () => {
    // Navigate to a page first
    const gotoAction: any = {
      go_to_url: { url: `${baseUrl}/`, new_tab: false }
    };
    await controller.act(gotoAction, browserSession);

    // Send keys action
    const sendKeysAction: any = {
      send_keys: { keys: ['Enter'] }
    };

    const result = await controller.act(sendKeysAction, browserSession);

    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toContain('Enter');
  });

  test('multiple actions in sequence', async () => {
    // Navigate to home
    const action1: any = {
      go_to_url: { url: `${baseUrl}/`, new_tab: false }
    };
    const result1 = await controller.act(action1, browserSession);
    expect(result1).toBeInstanceOf(ActionResult);

    // Wait
    const action2: any = {
      wait: { seconds: 1 }
    };
    const result2 = await controller.act(action2, browserSession);
    expect(result2).toBeInstanceOf(ActionResult);

    // Navigate to page1
    const action3: any = {
      go_to_url: { url: `${baseUrl}/page1`, new_tab: false }
    };
    const result3 = await controller.act(action3, browserSession);
    expect(result3).toBeInstanceOf(ActionResult);

    // Go back
    const action4: any = {
      go_back: {}
    };
    const result4 = await controller.act(action4, browserSession);
    expect(result4).toBeInstanceOf(ActionResult);

    // Verify final state
    await new Promise(resolve => setTimeout(resolve, 1000));
    const page = await browserSession.getCurrentPage();
    expect(page.url).toContain(baseUrl);
  });
});