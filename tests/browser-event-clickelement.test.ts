import { Browser } from 'playwright';
import { ActionResult } from '../src/agent/views';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Controller } from '../src/controller/service';
import { 
  ClickElementAction, 
  GoToUrlAction, 
  UploadFileAction,
  ActionModel 
} from '../src/controller/views';
import { 
  BrowserStateRequestEvent, 
  ClickElementEvent, 
  DialogOpenedEvent, 
  NavigateToUrlEvent 
} from '../src/browser/events';
import { FileSystem } from '../src/filesystem';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Test helper to create a simple HTTP server
class TestHTTPServer {
  private port: number;
  private serverProcess: any;
  
  constructor() {
    this.port = Math.floor(Math.random() * 10000) + 30000;
  }
  
  async start() {
    // Use Node.js built-in http server
    const serverCode = `
      const http = require('http');
      const url = require('url');
      const port = ${this.port};
      
      const routes = new Map();
      routes.set('/', '<html><head><title>Test Home Page</title></head><body><h1>Test Home Page</h1><p>Welcome to the test site</p></body></html>');
      routes.set('/page1', '<html><head><title>Test Page 1</title></head><body><h1>Test Page 1</h1><p>This is test page 1</p></body></html>');
      routes.set('/page2', '<html><head><title>Test Page 2</title></head><body><h1>Test Page 2</h1><p>This is test page 2</p></body></html>');
      
      const server = http.createServer((req, res) => {
        const pathname = url.parse(req.url).pathname;
        const content = routes.get(pathname) || '<html><body>404 Not Found</body></html>';
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(content);
      });
      
      server.listen(port);
      console.log('Server started on port ' + port);
    `;
    
    // Write to temp file and execute
    const tmpFile = path.join(os.tmpdir(), `test-server-${Date.now()}.js`);
    await fs.writeFile(tmpFile, serverCode);
    
    // Start server in background
    this.serverProcess = exec(`node ${tmpFile}`);
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  async stop() {
    if (this.serverProcess) {
      this.serverProcess.stop();
    }
  }
  
  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }
  
  async addRoute(path: string, content: string) {
    // For simplicity, we'll use a fixed set of routes for now
    // In a real implementation, this would dynamically add routes
  }
}

describe('ClickElementEvent Tests', () => {
  let httpServer: TestHTTPServer;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;
  
  beforeAll(async () => {
    httpServer = new TestHTTPServer();
    await httpServer.start();
    baseUrl = httpServer.getBaseUrl();
  });
  
  afterAll(async () => {
    await httpServer.stop();
  });
  
  beforeEach(async () => {
    browserSession = new BrowserSession(
      new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true
      })
    );
    await browserSession.start();
    controller = new Controller();
  });
  
  afterEach(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
  });
  
  test('error handling with invalid index', async () => {
    // Create an action with an invalid index
    const invalidAction = new ActionModel({
      clickElementByIndex: new ClickElementAction({ index: 999 })
    });
    
    // This should fail since the element doesn't exist
    const result = await controller.act(invalidAction, browserSession);
    
    expect(result.error).toBeTruthy();
  });
  
  test('click element by index', async () => {
    // Add clickable elements test page
    const clickableHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Click Test</title>
        <style>
          .clickable {
            margin: 10px;
            padding: 10px;
            border: 1px solid #ccc;
            cursor: pointer;
          }
          #result {
            margin-top: 20px;
            padding: 10px;
            border: 1px solid #ddd;
            min-height: 20px;
          }
        </style>
      </head>
      <body>
        <h1>Click Test</h1>
        <div class="clickable" id="button1" onclick="updateResult('Button 1 clicked')">Button 1</div>
        <div class="clickable" id="button2" onclick="updateResult('Button 2 clicked')">Button 2</div>
        <a href="#" class="clickable" id="link1" onclick="updateResult('Link 1 clicked'); return false;">Link 1</a>
        <div id="result"></div>
        
        <script>
          function updateResult(text) {
            document.getElementById('result').textContent = text;
          }
        </script>
      </body>
      </html>
    `;
    
    // Navigate to test page (using eval to inject HTML directly)
    const page = browserSession.getCurrentPage();
    await page.setContent(clickableHtml);
    await page.waitForTimeout(500);
    
    // Initialize the DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get the selector map
    const selectorMap = await browserSession.getSelectorMap();
    
    // Find a clickable element
    let buttonIndex: number | undefined;
    let buttonText: string | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'div' && 
          element.attributes?.class?.includes('clickable')) {
        buttonIndex = parseInt(idx);
        buttonText = element.getAllChildrenText(2).trim();
        break;
      }
    }
    
    expect(buttonIndex).toBeDefined();
    expect(buttonText).toContain('Button 1');
    
    // Execute the click action
    const clickAction = new ActionModel({
      clickElementByIndex: new ClickElementAction({ index: buttonIndex! })
    });
    
    const result = await controller.act(clickAction, browserSession);
    
    expect(result.error).toBeNull();
    expect(result.extractedContent).toContain(`Clicked element with index ${buttonIndex}`);
    
    // Verify the click had an effect
    const resultText = await page.evaluate(() => {
      return document.getElementById('result')?.textContent;
    });
    
    expect(resultText).toBe('Button 1 clicked');
  });
  
  test('click element opens new tab with ctrl', async () => {
    const newTabHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>New Tab Test</title>
      </head>
      <body>
        <h1>New Tab Test</h1>
        <a href="/page1" id="testLink">Open Page 1</a>
      </body>
      </html>
    `;
    
    const page = browserSession.getCurrentPage();
    await page.setContent(newTabHtml);
    await page.waitForTimeout(500);
    
    // Count initial tabs
    const initialTabs = await browserSession.getTabs();
    const initialTabCount = initialTabs.length;
    
    // Get browser state
    const state = await browserSession.getBrowserStateSummary();
    
    // Find the link element
    let linkIndex: number | undefined;
    for (const [index, element] of Object.entries(state.domState.selectorMap)) {
      if (element.tagName === 'a') {
        linkIndex = parseInt(index);
        break;
      }
    }
    
    expect(linkIndex).toBeDefined();
    
    // Click with ctrl held
    const clickAction = new ActionModel({
      clickElementByIndex: new ClickElementAction({ 
        index: linkIndex!, 
        whileHoldingCtrl: true 
      })
    });
    
    const result = await controller.act(clickAction, browserSession);
    await page.waitForTimeout(1000);
    
    expect(result.extractedContent).toBeTruthy();
    
    // Verify new tab was opened
    const finalTabs = await browserSession.getTabs();
    expect(finalTabs.length).toBe(initialTabCount + 1);
    
    // Verify we're still on original tab
    const currentUrl = await browserSession.getCurrentPageUrl();
    expect(currentUrl).not.toContain('/page1');
  });
  
  test('file input click prevention', async () => {
    const fileInputHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>File Input Test</title>
      </head>
      <body>
        <h1>File Upload Test</h1>
        <input type="file" id="fileInput" />
        <div id="result">No file selected</div>
      </body>
      </html>
    `;
    
    const page = browserSession.getCurrentPage();
    await page.setContent(fileInputHtml);
    await page.waitForTimeout(500);
    
    // Get browser state
    await browserSession.getBrowserStateSummary(true);
    const selectorMap = await browserSession.getSelectorMap();
    
    // Find the file input
    let fileInputIndex: number | undefined;
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'input' && 
          element.attributes?.type === 'file') {
        fileInputIndex = parseInt(idx);
        break;
      }
    }
    
    expect(fileInputIndex).toBeDefined();
    
    // Attempt to click should fail
    const clickAction = new ActionModel({
      clickElementByIndex: new ClickElementAction({ index: fileInputIndex! })
    });
    
    const result = await controller.act(clickAction, browserSession);
    
    expect(result.error).toBeTruthy();
    expect(result.error?.toLowerCase()).toMatch(/file (input|upload)/);
  });
  
  test('select dropdown click prevention', async () => {
    const selectHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Select Dropdown Test</title>
      </head>
      <body>
        <h1>Select Test</h1>
        <select id="testSelect">
          <option value="">Choose one</option>
          <option value="opt1">Option 1</option>
          <option value="opt2">Option 2</option>
        </select>
        <div id="result">Nothing selected</div>
      </body>
      </html>
    `;
    
    const page = browserSession.getCurrentPage();
    await page.setContent(selectHtml);
    await page.waitForTimeout(500);
    
    // Get browser state
    await browserSession.getBrowserStateSummary(true);
    const selectorMap = await browserSession.getSelectorMap();
    
    // Find the select element
    let selectIndex: number | undefined;
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'select') {
        selectIndex = parseInt(idx);
        break;
      }
    }
    
    expect(selectIndex).toBeDefined();
    
    // Attempt to click should fail
    const clickAction = new ActionModel({
      clickElementByIndex: new ClickElementAction({ index: selectIndex! })
    });
    
    const result = await controller.act(clickAction, browserSession);
    
    expect(result.error).toBeTruthy();
    expect(result.error?.toLowerCase()).toContain('select');
    expect(result.error?.toLowerCase()).toContain('dropdown');
  });
  
  test('click triggers alert popup', async () => {
    const alertHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Alert Test</title>
      </head>
      <body>
        <h1>Alert Dialog Test</h1>
        <button id="alertButton" onclick="alert('This is an alert!'); document.getElementById('result').textContent = 'Alert shown';">
          Show Alert
        </button>
        <div id="result">No popup shown</div>
      </body>
      </html>
    `;
    
    const page = browserSession.getCurrentPage();
    await page.setContent(alertHtml);
    await page.waitForTimeout(500);
    
    // Get browser state
    const stateEvent = browserSession.eventBus.dispatch(new BrowserStateRequestEvent());
    const browserState = await stateEvent;
    
    // Find the alert button
    let alertButton: any;
    for (const element of Object.values(browserState.domState.selectorMap)) {
      if (element.attributes?.id === 'alertButton') {
        alertButton = element;
        break;
      }
    }
    
    expect(alertButton).toBeDefined();
    
    // Expect dialog event
    const dialogPromise = browserSession.eventBus.expect(DialogOpenedEvent);
    
    // Click the button
    const clickEvent = browserSession.eventBus.dispatch(new ClickElementEvent({ node: alertButton }));
    await clickEvent;
    
    // Wait for dialog
    const dialogEvent = await Promise.race([
      dialogPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Dialog timeout')), 2000))
    ]) as DialogOpenedEvent;
    
    expect(dialogEvent.dialogType).toBe('alert');
    expect(dialogEvent.message).toContain('This is an alert!');
    
    // Verify page updated
    const resultText = await page.evaluate(() => {
      return document.getElementById('result')?.textContent;
    });
    
    expect(resultText).toBe('Alert shown');
  });
  
  test('file upload with validation', async () => {
    // Create a temporary test file
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
    const testFilePath = path.join(tmpDir, 'test.txt');
    await fs.writeFile(testFilePath, 'Test file content for upload');
    
    try {
      const uploadHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>File Upload Test</title>
        </head>
        <body>
          <h1>File Upload Test</h1>
          <label for="fileInput" class="upload-label">Choose File</label>
          <input type="file" id="fileInput" name="fileInput" style="display: none;" />
          <div id="fileInfo">
            <p id="fileName">No file selected</p>
            <p id="fileSize"></p>
            <p id="fileType"></p>
          </div>
          
          <script>
            document.getElementById('fileInput').addEventListener('change', function(e) {
              const file = e.target.files[0];
              if (file) {
                document.getElementById('fileName').textContent = 'File name: ' + file.name;
                document.getElementById('fileSize').textContent = 'File size: ' + file.size + ' bytes';
                document.getElementById('fileType').textContent = 'File type: ' + (file.type || 'unknown');
              } else {
                document.getElementById('fileName').textContent = 'No file selected';
                document.getElementById('fileSize').textContent = '';
                document.getElementById('fileType').textContent = '';
              }
            });
          </script>
        </body>
        </html>
      `;
      
      const page = browserSession.getCurrentPage();
      await page.setContent(uploadHtml);
      await page.waitForTimeout(500);
      
      // Get browser state
      await browserSession.getBrowserStateSummary(true);
      const selectorMap = await browserSession.getSelectorMap();
      
      // Find the label element
      let labelIndex: number | undefined;
      for (const [idx, element] of Object.entries(selectorMap)) {
        if (element.tagName?.toLowerCase() === 'label' && 
            element.attributes?.class?.includes('upload-label')) {
          labelIndex = parseInt(idx);
          break;
        }
      }
      
      expect(labelIndex).toBeDefined();
      
      // Create FileSystem for test
      const fileSystem = new FileSystem({ baseDir: tmpDir });
      
      // Upload the file
      const uploadAction = new ActionModel({
        uploadFileToElement: { 
          index: labelIndex!, 
          path: testFilePath 
        } as UploadFileAction
      });
      
      const result = await controller.act(
        uploadAction, 
        browserSession,
        [testFilePath], // available file paths
        fileSystem
      );
      
      expect(result.error).toBeNull();
      expect(result.extractedContent).toContain('Successfully uploaded file');
      
      // Wait for JS to process
      await page.waitForTimeout(500);
      
      // Verify file was selected
      const fileInfo = await page.evaluate(() => {
        const input = document.getElementById('fileInput') as HTMLInputElement;
        if (!input || !input.files || input.files.length === 0) {
          return { hasFile: false };
        }
        const file = input.files[0];
        return {
          hasFile: true,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'text/plain'
        };
      });
      
      expect(fileInfo.hasFile).toBe(true);
      expect(fileInfo.fileName).toContain('.txt');
      expect(fileInfo.fileSize).toBeGreaterThan(0);
      
      // Verify UI was updated
      const uiInfo = await page.evaluate(() => {
        const fileName = document.getElementById('fileName')?.textContent || '';
        const fileSize = document.getElementById('fileSize')?.textContent || '';
        return {
          fileNameText: fileName,
          fileSizeText: fileSize,
          hasFileInfo: !fileName.includes('No file selected')
        };
      });
      
      expect(uiInfo.hasFileInfo).toBe(true);
      expect(uiInfo.fileNameText).toContain('.txt');
      expect(uiInfo.fileSizeText).toContain('bytes');
      
    } finally {
      // Clean up
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});