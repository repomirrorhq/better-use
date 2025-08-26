import { Controller } from '../src/controller';
import { BrowserSession, BrowserProfile } from '../src/browser';
import { ActionModel, ActionResult } from '../src/agent/views';
import { GoToUrlAction, NoParamsAction, SearchGoogleAction, SendKeysAction, DoneAction } from '../src/controller/views';
import { FileSystem } from '../src/filesystem';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';

jest.setTimeout(60000);

describe('Controller Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;
  let tempDir: string;

  beforeAll(async () => {
    // Set up test HTTP server
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

    app.get('/keyboard', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Keyboard Test</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            input, textarea { margin: 10px 0; padding: 5px; width: 300px; }
            #result { margin-top: 20px; padding: 10px; border: 1px solid #ccc; min-height: 30px; }
          </style>
        </head>
        <body>
          <h1>Keyboard Actions Test</h1>
          <form id="testForm">
            <div>
              <label for="textInput">Text Input:</label>
              <input type="text" id="textInput" placeholder="Type here...">
            </div>
            <div>
              <label for="textarea">Textarea:</label>
              <textarea id="textarea" rows="4" placeholder="Type here..."></textarea>
            </div>
          </form>
          <div id="result"></div>
          
          <script>
            document.addEventListener('focusin', function(e) {
              document.getElementById('result').textContent = 'Focused on: ' + e.target.id;
            }, true);
            
            document.addEventListener('keydown', function(e) {
              const element = document.activeElement;
              if (element.id) {
                const resultEl = document.getElementById('result');
                resultEl.textContent += '\\nKeydown: ' + e.key;
                
                if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
                  resultEl.textContent += '\\nCtrl+A detected';
                  setTimeout(() => {
                    resultEl.textContent += '\\nSelection length: ' + 
                      (window.getSelection().toString().length || 
                      (element.selectionEnd - element.selectionStart));
                  }, 50);
                }
              }
            });
          </script>
        </body>
        </html>
      `);
    });

    app.get('/dropdown1', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Dropdown Test</title>
        </head>
        <body>
          <h1>Dropdown Test</h1>
          <select id="test-dropdown" name="test-dropdown">
            <option value="">Please select</option>
            <option value="option1">First Option</option>
            <option value="option2">Second Option</option>
            <option value="option3">Third Option</option>
          </select>
        </body>
        </html>
      `);
    });

    server = app.listen(0, () => {
      const address = server.address() as any;
      baseUrl = `http://localhost:${address.port}`;
    });

    // Create browser session
    browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true
      })
    });
    await browserSession.start();

    // Create temp directory
    tempDir = path.join(__dirname, 'temp-controller-tests');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    controller = new Controller();
  });

  afterAll(async () => {
    await browserSession.stop();
    server.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('registry actions', async () => {
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
      expect(controller.registry.registry.actions[action]).toBeDefined();
      expect(controller.registry.registry.actions[action].function).toBeDefined();
      expect(controller.registry.registry.actions[action].description).toBeDefined();
    }
  });

  test('custom action registration', async () => {
    class CustomParams {
      text: string;
    }

    @controller.action('Test custom action', { param_model: CustomParams })
    async function customAction(params: CustomParams, browserSession: BrowserSession) {
      const page = await browserSession.getCurrentPage();
      return new ActionResult({
        extractedContent: `Custom action executed with: ${params.text} on ${page.url}`
      });
    }

    // Navigate to a page first
    const gotoAction = { go_to_url: { url: `${baseUrl}/page1`, new_tab: false } as GoToUrlAction };
    
    class GoToUrlActionModel extends ActionModel {
      go_to_url?: GoToUrlAction;
    }

    await controller.act(new GoToUrlActionModel(gotoAction), browserSession);

    // Execute custom action
    const customActionData = { custom_action: { text: 'test_value' } };
    
    class CustomActionModel extends ActionModel {
      custom_action?: CustomParams;
    }

    const result = await controller.act(new CustomActionModel(customActionData), browserSession);

    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeDefined();
    expect(result.extractedContent).toContain('Custom action executed with: test_value on');
    expect(result.extractedContent).toContain(`${baseUrl}/page1`);
  });

  test('wait action', async () => {
    // Verify wait action exists
    const waitAction = Object.entries(controller.registry.registry.actions)
      .find(([name, action]) => name.toLowerCase().includes('wait'));
    
    expect(waitAction).toBeDefined();

    // Test wait for 1 second
    const waitActionData = { wait: { seconds: 1 } };
    
    class WaitActionModel extends ActionModel {
      wait?: any;
    }

    const startTime = Date.now();
    const result = await controller.act(new WaitActionModel(waitActionData), browserSession);
    const endTime = Date.now();

    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeDefined();
    expect(result.extractedContent).toContain('Waiting for');
    
    // Should be less than 0.1 seconds (accounting for LLM call deduction)
    expect(endTime - startTime).toBeLessThanOrEqual(100);
  });

  test('go back action', async () => {
    // Navigate to first page
    const gotoAction1 = { go_to_url: { url: `${baseUrl}/page1`, new_tab: false } as GoToUrlAction };
    
    class GoToUrlActionModel extends ActionModel {
      go_to_url?: GoToUrlAction;
    }

    await controller.act(new GoToUrlActionModel(gotoAction1), browserSession);

    const page1 = await browserSession.getCurrentPage();
    const firstUrl = page1.url;

    // Navigate to second page
    const gotoAction2 = { go_to_url: { url: `${baseUrl}/page2`, new_tab: false } as GoToUrlAction };
    await controller.act(new GoToUrlActionModel(gotoAction2), browserSession);

    const page2 = await browserSession.getCurrentPage();
    expect(page2.url).toContain(`${baseUrl}/page2`);

    // Go back
    const goBackAction = { go_back: {} as NoParamsAction };
    
    class GoBackActionModel extends ActionModel {
      go_back?: NoParamsAction;
    }

    const result = await controller.act(new GoBackActionModel(goBackAction), browserSession);

    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toContain('Navigated back');

    await new Promise(resolve => setTimeout(resolve, 1000));

    const page3 = await browserSession.getCurrentPage();
    expect(page3.url).toContain(`${baseUrl}/page1`);
  });

  test('navigation chain', async () => {
    const urls = [`${baseUrl}/`, `${baseUrl}/page1`, `${baseUrl}/page2`];

    class GoToUrlActionModel extends ActionModel {
      go_to_url?: GoToUrlAction;
    }

    // Navigate to each page
    for (const url of urls) {
      const actionData = { go_to_url: { url, new_tab: false } as GoToUrlAction };
      await controller.act(new GoToUrlActionModel(actionData), browserSession);
      
      const page = await browserSession.getCurrentPage();
      expect(page.url).toContain(url);
    }

    // Go back twice
    class GoBackActionModel extends ActionModel {
      go_back?: NoParamsAction;
    }

    for (const expectedUrl of urls.slice(0, -1).reverse()) {
      const goBackAction = { go_back: {} as NoParamsAction };
      await controller.act(new GoBackActionModel(goBackAction), browserSession);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const page = await browserSession.getCurrentPage();
      expect(page.url).toContain(expectedUrl);
    }
  });

  test('excluded actions', () => {
    const excludedController = new Controller({ excludeActions: ['search_google', 'scroll'] });
    
    expect(excludedController.registry.registry.actions['search_google']).toBeUndefined();
    expect(excludedController.registry.registry.actions['scroll']).toBeUndefined();
    
    expect(excludedController.registry.registry.actions['go_to_url']).toBeDefined();
    expect(excludedController.registry.registry.actions['click_element_by_index']).toBeDefined();
  });

  test('search google action', async () => {
    await browserSession.getCurrentPage();

    const searchAction = { search_google: { query: 'Python web automation' } as SearchGoogleAction };
    
    class SearchGoogleActionModel extends ActionModel {
      search_google?: SearchGoogleAction;
    }

    const result = await controller.act(new SearchGoogleActionModel(searchAction), browserSession);

    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toContain('Searched for "Python web automation" in Google');

    const page = await browserSession.getCurrentPage();
    expect(page.url).toBeDefined();
    expect(page.url).toContain('Python');
  });

  test('done action', async () => {
    const fileSystem = new FileSystem(tempDir);

    // Navigate to a page first
    const gotoAction = { go_to_url: { url: `${baseUrl}/page1`, new_tab: false } as GoToUrlAction };
    
    class GoToUrlActionModel extends ActionModel {
      go_to_url?: GoToUrlAction;
    }

    await controller.act(new GoToUrlActionModel(gotoAction), browserSession);

    // Test success done action
    const successDoneMessage = 'Successfully completed task';
    const doneAction = { done: { text: successDoneMessage, success: true } as DoneAction };
    
    class DoneActionModel extends ActionModel {
      done?: DoneAction;
    }

    const result = await controller.act(new DoneActionModel(doneAction), browserSession, { fileSystem });

    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toContain(successDoneMessage);
    expect(result.success).toBe(true);
    expect(result.isDone).toBe(true);
    expect(result.error).toBeNull();

    // Test failure done action
    const failedDoneMessage = 'Failed to complete task';
    const failedDoneAction = { done: { text: failedDoneMessage, success: false } as DoneAction };

    const failedResult = await controller.act(new DoneActionModel(failedDoneAction), browserSession, { fileSystem });

    expect(failedResult).toBeInstanceOf(ActionResult);
    expect(failedResult.extractedContent).toContain(failedDoneMessage);
    expect(failedResult.success).toBe(false);
    expect(failedResult.isDone).toBe(true);
    expect(failedResult.error).toBeNull();
  });

  test('send keys action', async () => {
    // Navigate to keyboard test page
    const gotoAction = { go_to_url: { url: `${baseUrl}/keyboard`, new_tab: false } as GoToUrlAction };
    
    class GoToUrlActionModel extends ActionModel {
      go_to_url?: GoToUrlAction;
    }

    const gotoResult = await controller.act(new GoToUrlActionModel(gotoAction), browserSession);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(gotoResult.extractedContent).toContain(`Navigated to ${baseUrl}/keyboard`);

    const page = await browserSession.getCurrentPage();
    const title = await page.title();
    expect(title).toBe('Keyboard Test');

    // Test Tab key
    const tabKeysAction = { send_keys: { keys: 'Tab' } as SendKeysAction };
    
    class SendKeysActionModel extends ActionModel {
      send_keys?: SendKeysAction;
    }

    const tabResult = await controller.act(new SendKeysActionModel(tabKeysAction), browserSession);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(tabResult.extractedContent).toContain('Sent keys: Tab');

    const activeElementId = await page.evaluate(() => document.activeElement?.id);
    expect(activeElementId).toBe('textInput');

    // Type text
    const testText = 'This is a test';
    const typeAction = { send_keys: { keys: testText } as SendKeysAction };
    const typeResult = await controller.act(new SendKeysActionModel(typeAction), browserSession);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(typeResult.extractedContent).toContain(`Sent keys: ${testText}`);

    const inputValue = await page.evaluate(() => (document.getElementById('textInput') as HTMLInputElement)?.value);
    expect(inputValue).toBe(testText);

    // Test Ctrl+A
    const selectAllAction = { send_keys: { keys: 'ControlOrMeta+a' } as SendKeysAction };
    const selectAllResult = await controller.act(new SendKeysActionModel(selectAllAction), browserSession);
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(selectAllResult.extractedContent).toContain('Sent keys: ControlOrMeta+a');

    const selectionLength = await page.evaluate(() => {
      const element = document.activeElement as HTMLInputElement;
      return element.selectionEnd! - element.selectionStart!;
    });
    expect(selectionLength).toBe(testText.length);
  });
});