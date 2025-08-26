import { ActionModel, ActionResult } from '../src/agent/views';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Controller } from '../src/controller/service';
import { GoToUrlAction, InputTextAction } from '../src/controller/views';
import { TypeTextEvent, createNavigateToUrlEvent } from '../src/browser/events';
import { EnhancedDOMTreeNode, NodeType } from '../src/dom/views';
import * as http from 'http';
import express from 'express';

describe('TypeTextEvent Tests', () => {
  let server: http.Server;
  let app: express.Application;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;
  const port = 3457;

  beforeAll(async () => {
    // Setup express server
    app = express();
    
    // Add routes for test pages
    app.get('/', (req, res) => {
      res.send('<html><head><title>Test Home Page</title></head><body><h1>Test Home Page</h1><p>Welcome to the test site</p></body></html>');
    });

    app.get('/form', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Form Test Page</title>
        </head>
        <body>
          <h1>Test Form</h1>
          <form>
            <input type="text" id="name" name="name" placeholder="Enter name">
            <input type="email" id="email" name="email" placeholder="Enter email">
            <textarea id="message" name="message" placeholder="Enter message"></textarea>
            <input type="password" id="password" name="password" placeholder="Enter password">
            <button type="submit">Submit</button>
          </form>
        </body>
        </html>
      `);
    });

    app.get('/searchform', (req, res) => {
      res.send(`
        <html>
        <head><title>Search Form</title></head>
        <body>
          <h1>Search Form</h1>
          <form action="/search" method="get">
            <input type="text" id="searchbox" name="q" placeholder="Search...">
            <button type="submit">Search</button>
          </form>
        </body>
        </html>
      `);
    });

    app.get('/readonly', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Readonly Test</title></head>
        <body>
          <h1>Readonly Field Test</h1>
          <input type="text" id="readonly-input" value="Cannot change this" readonly>
          <input type="text" id="normal-input" placeholder="Can change this">
        </body>
        </html>
      `);
    });

    app.get('/autofocus-form', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Autofocus Form</title></head>
        <body>
          <h1>Form with Autofocus</h1>
          <input type="text" id="first-input" placeholder="First input">
          <input type="text" id="autofocus-input" placeholder="Has autofocus" autofocus>
          <input type="text" id="third-input" placeholder="Third input">
        </body>
        </html>
      `);
    });

    app.get('/iframe-form', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Iframe Form</title>
        </head>
        <body>
          <h2>Iframe Form</h2>
          <input type="text" id="iframe-input" name="iframe-field" placeholder="Type here in iframe">
          <div id="iframe-result"></div>
        </body>
        </html>
      `);
    });

    app.get('/page-with-form-iframe', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page with Form Iframe</title>
        </head>
        <body>
          <h1>Main Page</h1>
          <p>This page contains an iframe with a form:</p>
          <iframe id="form-iframe" src="${baseUrl}/iframe-form" style="width: 100%; height: 300px; border: 2px solid #333;"></iframe>
          <div>
            <input type="text" id="main-input" placeholder="Main page input">
          </div>
        </body>
        </html>
      `);
    });

    // Start server
    await new Promise<void>((resolve) => {
      server = app.listen(port, () => {
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Setup browser session
    const profile = new BrowserProfile({ headless: true, disableSecurity: true, crossOriginIframes: false });
    browserSession = new BrowserSession(profile);
    await browserSession.start();

    // Setup controller
    controller = new Controller();
  });

  afterAll(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('TestTypeTextEvent', () => {
    test('test_input_text_action', async () => {
      // Navigate to a page with a form
      const gotoAction = { go_to_url: { url: `${baseUrl}/searchform`, newTab: false } as GoToUrlAction };
      
      class GoToUrlActionModel extends ActionModel {
        go_to_url?: GoToUrlAction = undefined;
      }

      await controller.act(new GoToUrlActionModel(gotoAction), browserSession);

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the search input field index
      const selectorMap = await browserSession.getSelectorMap();

      // For demonstration, we'll just use a hard-coded mock value
      const mockInputIndex = 1;

      // Create input text action
      const inputAction = { input_text: { index: mockInputIndex, text: 'Python programming' } as InputTextAction };

      class InputTextActionModel extends ActionModel {
        input_text?: InputTextAction = undefined;
      }

      // The actual input might fail if the page structure changes or in headless mode
      const result = await controller.act(new InputTextActionModel(inputAction), browserSession);

      // Verify the result is an ActionResult
      expect(result).toBeInstanceOf(ActionResult);

      // Check if the action succeeded or failed
      if (result.error === null) {
        // Action succeeded, verify the extracted_content
        expect(result.extractedContent).not.toBeNull();
        expect(result.extractedContent).toContain('Input');
      } else {
        // Action failed, verify the error message contains expected text
        expect(result.error).toMatch(/Element index|does not exist|Failed to input text/);
      }
    });

    test('test_type_text_event_directly', async () => {
      // Navigate to a page with input fields
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the DOM state to find input elements
      const state = await browserSession.getBrowserStateSummary();

      // Find an input field
      let inputNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        if (node.tagName === 'input' && node.attributes?.type === 'text') {
          inputNode = node;
          break;
        }
      }

      if (inputNode) {
        // Test typing text into the input field
        const event = browserSession.eventBus.dispatch(new TypeTextEvent({ node: inputNode, text: 'Hello World', clearExisting: true }));
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // Verify the text was actually typed
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: `document.getElementById("${inputNode.attributes?.id}").value`,
          returnByValue: true
        }, cdpSession.sessionId);
        expect(valueCheck.result?.value).toBe('Hello World');
      }
    });

    test('test_type_text_clear_existing', async () => {
      // Navigate to form page
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get DOM state
      const state = await browserSession.getBrowserStateSummary();

      // Find email input field
      let emailNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        if (node.tagName === 'input' && node.attributes?.type === 'email') {
          emailNode = node;
          break;
        }
      }

      if (emailNode) {
        // First, type some text without clearing
        let event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: emailNode, text: 'first@example.com', clearExisting: false })
        );
        await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);

        // Now type new text with clearing
        event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: emailNode, text: 'second@example.com', clearExisting: true })
        );
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // Verify only the second text is in the field
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: `document.getElementById("${emailNode.attributes?.id}").value`,
          returnByValue: true
        }, cdpSession.sessionId);
        expect(valueCheck.result?.value).toBe('second@example.com');
      }
    });

    test('test_type_text_textarea', async () => {
      // Navigate to form page
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get DOM state
      const state = await browserSession.getBrowserStateSummary();

      // Find textarea element
      let textareaNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        if (node.tagName === 'textarea') {
          textareaNode = node;
          break;
        }
      }

      if (textareaNode) {
        // Type multiline text
        const multilineText = 'Line 1\nLine 2\nLine 3';
        const event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: textareaNode, text: multilineText, clearExisting: true })
        );
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // Verify the multiline text was typed
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: `document.getElementById("${textareaNode.attributes?.id}").value`,
          returnByValue: true
        }, cdpSession.sessionId);
        expect(valueCheck.result?.value).toBe(multilineText);
      }
    });

    test('test_type_text_password_field', async () => {
      // Navigate to form page
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get DOM state
      const state = await browserSession.getBrowserStateSummary();

      // Find password input field
      let passwordNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        if (node.tagName === 'input' && node.attributes?.type === 'password') {
          passwordNode = node;
          break;
        }
      }

      if (passwordNode) {
        // Type password text
        const passwordText = 'SecureP@ssw0rd!';
        const event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: passwordNode, text: passwordText, clearExisting: true })
        );
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // Verify the password was typed (value is present but masked visually)
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: `document.getElementById("${passwordNode.attributes?.id}").value`,
          returnByValue: true
        }, cdpSession.sessionId);
        expect(valueCheck.result?.value).toBe(passwordText);
      }
    });

    test('test_type_text_readonly_field', async () => {
      // Navigate to page
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/readonly`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get DOM state
      const state = await browserSession.getBrowserStateSummary();

      // Find readonly input field
      let readonlyNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        if (node.tagName === 'input' && node.attributes?.id === 'readonly-input') {
          readonlyNode = node;
          break;
        }
      }

      if (readonlyNode) {
        // Try to type into readonly field
        const event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: readonlyNode, text: 'New text', clearExisting: true })
        );
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();

        // The operation should complete (CDP allows typing into readonly fields)
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // But the value should remain unchanged due to readonly attribute
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: 'document.getElementById("readonly-input").value',
          returnByValue: true
        }, cdpSession.sessionId);
        // Readonly fields keep their original value
        expect(valueCheck.result?.value).toBe('Cannot change this');
      }
    });

    test('test_type_text_special_characters', async () => {
      // Navigate to form page
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get DOM state
      const state = await browserSession.getBrowserStateSummary();

      // Find text input field
      let textNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        if (node.tagName === 'input' && node.attributes?.type === 'text') {
          textNode = node;
          break;
        }
      }

      if (textNode) {
        // Type text with special characters
        const specialText = 'Test @#$%^&*()_+-={}[]|\\:";<>?,./~`';
        const event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: textNode, text: specialText, clearExisting: true })
        );
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // Verify the special characters were typed correctly
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: `document.getElementById("${textNode.attributes?.id}").value`,
          returnByValue: true
        }, cdpSession.sessionId);
        expect(valueCheck.result?.value).toBe(specialText);
      }
    });

    test('test_type_text_empty_string', async () => {
      // Navigate to form page
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get DOM state
      const state = await browserSession.getBrowserStateSummary();

      // Find text input field
      let textNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        if (node.tagName === 'input' && node.attributes?.type === 'text') {
          textNode = node;
          break;
        }
      }

      if (textNode) {
        // First type some text
        let event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: textNode, text: 'Initial text', clearExisting: true })
        );
        await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);

        // Now clear it by typing empty string with clear_existing=True
        event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: textNode, text: '', clearExisting: true })
        );
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // Verify the field is now empty
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: `document.getElementById("${textNode.attributes?.id}").value`,
          returnByValue: true
        }, cdpSession.sessionId);
        expect(valueCheck.result?.value).toBe('');
      }
    });

    test('test_type_text_index_zero_whole_page', async () => {
      // Navigate to page with autofocus
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/autofocus-form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get DOM state
      const state = await browserSession.getBrowserStateSummary();

      // Create a node with index 0 - this should type to the page (whatever has focus)
      const mockNode = new EnhancedDOMTreeNode({
        elementIndex: 0,
        nodeId: 0,
        backendNodeId: 0,
        sessionId: '',
        frameId: '',
        targetId: '',
        nodeType: NodeType.ELEMENT_NODE,
        nodeName: 'body',
        nodeValue: '',
        attributes: {},
        isScrollable: false,
        isVisible: true,
        absolutePosition: undefined,
        contentDocument: undefined,
        shadowRootType: undefined,
        shadowRoots: undefined,
        parentNode: undefined,
        childrenNodes: [],
        axNode: undefined,
        snapshotNode: undefined,
        tagName: 'body'
      });

      // Type text with index 0 - should type to whatever has focus (the autofocus input)
      const event = browserSession.eventBus.dispatch(
        new TypeTextEvent({ node: mockNode, text: 'Hello Page', clearExisting: false })
      );
      const result = await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      const eventResult = await (result as any).eventResult();
      expect(eventResult).not.toBeNull();
      expect(eventResult.success).toBe(true);

      // Verify the text went into the autofocus input
      const cdpSession = await browserSession.getOrCreateCdpSession();

      // Check that the autofocus input has the text
      const autofocusValue = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.getElementById("autofocus-input").value',
        returnByValue: true
      }, cdpSession.sessionId);
      expect(autofocusValue.result?.value).toBe('Hello Page');

      // Check other inputs are empty
      const firstValue = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.getElementById("first-input").value',
        returnByValue: true
      }, cdpSession.sessionId);
      expect(firstValue.result?.value).toBe('');

      const thirdValue = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.getElementById("third-input").value',
        returnByValue: true
      }, cdpSession.sessionId);
      expect(thirdValue.result?.value).toBe('');
    });

    test('test_type_text_nonexistent_element', async () => {
      // Navigate to form page
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/form`));
      await new Promise(resolve => setTimeout(resolve, 500));

      // Focus the first input manually to have a known focused element
      const cdpSession = await browserSession.getOrCreateCdpSession();
      await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.getElementById("name").focus()',
        returnByValue: true
      }, cdpSession.sessionId);

      // Create a node with a non-existent index
      const nonexistentNode = new EnhancedDOMTreeNode({
        elementIndex: 99999,
        nodeId: 99999,
        backendNodeId: 99999,
        sessionId: '',
        frameId: '',
        targetId: '',
        nodeType: NodeType.ELEMENT_NODE,
        nodeName: 'input',
        nodeValue: '',
        attributes: { id: 'nonexistent' },
        isScrollable: false,
        isVisible: true,
        absolutePosition: undefined,
        contentDocument: undefined,
        shadowRootType: undefined,
        shadowRoots: undefined,
        parentNode: undefined,
        childrenNodes: [],
        axNode: undefined,
        snapshotNode: undefined,
        tagName: 'input'
      });

      // Try to type into non-existent element - should fall back to typing to the page
      const event = browserSession.eventBus.dispatch(
        new TypeTextEvent({ node: nonexistentNode, text: 'Fallback text', clearExisting: false })
      );

      // This should complete (might succeed by falling back to page typing)
      const result = await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      const eventResult = await (result as any).eventResult();
      expect(eventResult).not.toBeNull();

      // Check if the text was typed to the focused element as a fallback
      const nameValue = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.getElementById("name").value',
        returnByValue: true
      }, cdpSession.sessionId);

      // Either it failed (and returned an error) or it fell back to typing to the page
      const success = eventResult.success || false;
      if (success) {
        // If it succeeded, it should have typed to the focused element
        expect(nameValue.result?.value).toBe('Fallback text');
      } else {
        // Or it might have failed entirely
        expect(eventResult.error).not.toBeNull();
      }
    });

    test('test_type_text_iframe_input', async () => {
      // Navigate to page with iframe
      await browserSession.navigateToUrl(createNavigateToUrlEvent(`${baseUrl}/page-with-form-iframe`));
      await new Promise(resolve => setTimeout(resolve, 1000)); // Give iframe time to load

      // Get DOM state to find the iframe input
      const state = await browserSession.getBrowserStateSummary();

      // Find the input inside the iframe (it should be in the DOM if same-origin)
      let iframeInputNode = null;
      for (const node of Object.values(state.domState.selectorMap)) {
        // Look for the iframe input by its id
        if (node.tagName === 'input' && node.attributes?.id === 'iframe-input') {
          iframeInputNode = node;
          break;
        }
      }

      if (iframeInputNode) {
        // Type text into the iframe input
        const event = browserSession.eventBus.dispatch(
          new TypeTextEvent({ node: iframeInputNode, text: 'Text in iframe', clearExisting: true })
        );
        const result = await Promise.race([
          event,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        const eventResult = await (result as any).eventResult();
        expect(eventResult).not.toBeNull();
        expect(eventResult.success).toBe(true);

        // Verify the text was typed into the iframe input
        const cdpSession = await browserSession.getOrCreateCdpSession();
        const iframeValue = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: `
            (() => {
              const iframe = document.getElementById('form-iframe');
              if (iframe && iframe.contentDocument) {
                const input = iframe.contentDocument.getElementById('iframe-input');
                return input ? input.value : null;
              }
              return null;
            })()
          `,
          returnByValue: true
        }, cdpSession.sessionId);
        expect(iframeValue.result?.value).toBe('Text in iframe');

        // Verify the main page input is still empty
        const mainValue = await browserSession.cdpClient.send('Runtime.evaluate', {
          expression: 'document.getElementById("main-input").value',
          returnByValue: true
        }, cdpSession.sessionId);
        expect(mainValue.result?.value).toBe('');
      } else {
        // If cross-origin iframes are disabled, we won't see the iframe content
        console.log('Iframe input not found - likely due to crossOriginIframes=false');
      }
    });
  });
});