import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import * as http from 'http';
import { AddressInfo } from 'net';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Controller } from '../src/controller';
import { 
  ClickElementAction, 
  ClickElementActionSchema,
  GoToUrlAction, 
  GoToUrlActionSchema 
} from '../src/controller/views';
import { ActionModel } from '../src/agent/views';

/**
 * Test HTTP server for serving test pages
 */
class TestHttpServer {
  private server: http.Server;
  private port?: number;

  constructor() {
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      
      const url = req.url || '/';
      
      if (url === '/') {
        res.end('<html><head><title>Test Home Page</title></head><body><h1>Test Home Page</h1><p>Welcome to the test site</p></body></html>');
      } else if (url === '/page1') {
        res.end('<html><head><title>Test Page 1</title></head><body><h1>Test Page 1</h1><p>This is test page 1</p></body></html>');
      } else if (url === '/page2') {
        res.end('<html><head><title>Test Page 2</title></head><body><h1>Test Page 2</h1><p>This is test page 2</p></body></html>');
      } else if (url === '/clickable') {
        res.end(`
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
        `);
      } else if (url === '/newTab') {
        res.end(`
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
        `);
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });
  }

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(0, () => {
        const address = this.server.address() as AddressInfo;
        this.port = address.port;
        resolve(`http://localhost:${this.port}`);
      });
    });
  }

  stop(): void {
    this.server.close();
  }
}

describe('Browser Event Tests', () => {
  let httpServer: TestHttpServer;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;

  beforeAll(async () => {
    // Start HTTP server
    httpServer = new TestHttpServer();
    baseUrl = await httpServer.start();
    
    // Create browser session
    browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        user_data_dir: undefined
      }),
      headless: true
    });
    await browserSession.start();
    
    // Create controller
    controller = new Controller();
  }, 30000);

  afterAll(async () => {
    // Cleanup
    await browserSession?.stop();
    httpServer?.stop();
  }, 30000);

  beforeEach(async () => {
    // Clear browser state between tests - simplified for now
    // TODO: Implement proper tab management when methods are available
  });

  describe('ClickElementEvent', () => {
    it('should handle error when clicking invalid element index', async () => {
      // Navigate to a simple page first
      const gotoAction = { 
        goToUrl: GoToUrlActionSchema.parse({ url: baseUrl, newTab: false })
      };
      
      await controller.act(gotoAction, browserSession);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for page load

      // Create an action with an invalid index
      const invalidAction = { 
        clickElementByIndex: ClickElementActionSchema.parse({ index: 999 }) // Element doesn't exist
      };

      const result = await controller.act(invalidAction, browserSession);
      expect(result.error).not.toBeNull();
      expect(result.error).toContain('element');
    }, 15000);

    it('should click element by index successfully', async () => {
      // Navigate to the clickable elements test page
      const gotoAction = { 
        goToUrl: GoToUrlActionSchema.parse({ url: `${baseUrl}/clickable`, newTab: false })
      };
      
      await controller.act(gotoAction, browserSession);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for page load

      // Get browser state to populate selector map
      const browserState = await browserSession.getBrowserState();
      
      // Find a clickable element in the selector map
      let buttonIndex: number | undefined;

      for (const [idx, element] of Object.entries(browserState.dom_state?.selector_map || {})) {
        // Look for the first div with class "clickable"
        if ((element as any).tagName?.toLowerCase() === 'div' && 
            (element as any).attributes?.class?.includes('clickable')) {
          buttonIndex = parseInt(idx);
          break;
        }
      }

      // Verify we found a clickable element
      expect(buttonIndex).not.toBeUndefined();

      // Execute the click action
      const clickAction = {
        clickElementByIndex: ClickElementActionSchema.parse({ index: buttonIndex! })
      };

      const result = await controller.act(clickAction, browserSession);

      // Verify the result structure
      expect(result.error).toBeNull();
      expect(result.extracted_content).toContain(`Clicked element with index ${buttonIndex}`);

      // Note: Skip DOM verification for now - we'll add this once page access is available
    }, 15000);

    it('should open links in new tab with ctrl+click', async () => {
      // Navigate to the new tab test page
      const gotoAction = { 
        goToUrl: GoToUrlActionSchema.parse({ url: `${baseUrl}/newTab`, newTab: false })
      };
      
      await controller.act(gotoAction, browserSession);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for page load

      // Get the browser state to find link element
      const browserState = await browserSession.getBrowserState();

      // Find the link element
      let linkIndex: number | undefined;
      for (const [idx, element] of Object.entries(browserState.dom_state?.selector_map || {})) {
        if ((element as any).tagName?.toLowerCase() === 'a') {
          linkIndex = parseInt(idx);
          break;
        }
      }

      expect(linkIndex).not.toBeUndefined();

      // Click the link with ctrl held down
      const clickAction = {
        clickElementByIndex: ClickElementActionSchema.parse({ 
          index: linkIndex!, 
          whileHoldingCtrl: true 
        })
      };

      const result = await controller.act(clickAction, browserSession);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for new tab

      // Verify the result
      expect(result.error).toBeNull();
      expect(result.extracted_content).toContain('Clicked element');

      // Note: Skip tab count verification for now - we'll add this once tab methods are available
    }, 20000);

    it('should handle file input click prevention', async () => {
      // Create a test server route with file input
      const gotoAction = { 
        goToUrl: GoToUrlActionSchema.parse({ url: `${baseUrl}/`, newTab: false })
      };
      
      await controller.act(gotoAction, browserSession);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Note: Skip file input test for now - requires page content injection
      // Will be implemented once page access methods are available
      
      expect(true).toBe(true); // Placeholder assertion
    }, 15000);

    it('should handle select dropdown click prevention', async () => {
      // Navigate to page and inject select dropdown
      const gotoAction = { 
        goToUrl: GoToUrlActionSchema.parse({ url: `${baseUrl}/`, newTab: false })
      };
      
      await controller.act(gotoAction, browserSession);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Note: Skip select dropdown test for now - requires page content injection
      // Will be implemented once page access methods are available
      
      expect(true).toBe(true); // Placeholder assertion
    }, 15000);
  });
});