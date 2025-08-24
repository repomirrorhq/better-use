import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Controller } from '../src/controller';
import { InputTextAction, GoToUrlAction } from '../src/controller/registry/views';
import { TypeTextEvent } from '../src/browser/events';
import { EnhancedDOMTreeNode, NodeType } from '../src/dom/types';
import * as http from 'http';
import * as express from 'express';

describe('TypeTextEvent Advanced Tests', () => {
  let server: http.Server;
  let app: express.Application;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;
  const port = 4526;

  beforeAll(async () => {
    // Set up test HTTP server
    app = express();
    
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

    server = app.listen(port);
    baseUrl = `http://localhost:${port}`;

    // Create browser session
    const profile = new BrowserProfile({ headless: true, disableSecurity: true, crossOriginIframes: false });
    browserSession = new BrowserSession(profile);
    await browserSession.start();

    // Create controller
    controller = new Controller();
  });

  afterAll(async () => {
    if (browserSession) {
      await browserSession.kill();
    }
    if (server) {
      server.close();
    }
  });

  it('should input text into form fields using InputTextAction', async () => {
    // Navigate to search form
    const gotoAction = { url: `${baseUrl}/searchform`, newTab: false } as GoToUrlAction;
    await controller.act({ goToUrl: gotoAction }, browserSession);

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get selector map
    const selectorMap = await browserSession.getSelectorMap();

    // Find search input field index (mock for testing)
    const mockInputIndex = 1;

    // Create input text action
    const inputAction = { index: mockInputIndex, text: 'Python programming' } as InputTextAction;
    const result = await controller.act({ inputText: inputAction }, browserSession);

    // Verify result
    expect(result).toBeDefined();
    expect(result.extractedContent).toBeDefined();
    
    if (!result.error) {
      expect(result.extractedContent).toContain('Input');
    } else {
      expect(result.error).toMatch(/Element index|does not exist|Failed to input text/);
    }
  });

  it('should type text directly through event bus', async () => {
    // Navigate to form page
    await browserSession.cdpNavigate(`${baseUrl}/form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find text input field
    let inputNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'input' && node.attributes?.type === 'text') {
        inputNode = node;
        break;
      }
    }

    if (inputNode) {
      // Type text into input field
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({ 
        node: inputNode, 
        text: 'Hello World', 
        clearExisting: true 
      }));
      
      const result = await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      expect(result).toBeDefined();
      
      // Verify text was typed
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `document.getElementById("${inputNode.attributes?.id}").value`,
        returnByValue: true,
      }, cdpSession.sessionId);
      
      expect(valueCheck.result?.value).toBe('Hello World');
    }
  });

  it('should clear existing text when clearExisting is true', async () => {
    // Navigate to form page  
    await browserSession.cdpNavigate(`${baseUrl}/form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find email input field
    let emailNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'input' && node.attributes?.type === 'email') {
        emailNode = node;
        break;
      }
    }

    if (emailNode) {
      // First type some text without clearing
      await browserSession.eventBus.dispatch(new TypeTextEvent({
        node: emailNode,
        text: 'first@example.com',
        clearExisting: false
      }));

      // Now type new text with clearing
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node: emailNode,
        text: 'second@example.com', 
        clearExisting: true
      }));

      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      // Verify only second text is in field
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `document.getElementById("${emailNode.attributes?.id}").value`,
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(valueCheck.result?.value).toBe('second@example.com');
    }
  });

  it('should type multiline text into textarea', async () => {
    // Navigate to form page
    await browserSession.cdpNavigate(`${baseUrl}/form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find textarea element
    let textareaNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'textarea') {
        textareaNode = node;
        break;
      }
    }

    if (textareaNode) {
      // Type multiline text
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node: textareaNode,
        text: multilineText,
        clearExisting: true
      }));

      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      // Verify multiline text was typed
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `document.getElementById("${textareaNode.attributes?.id}").value`,
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(valueCheck.result?.value).toBe(multilineText);
    }
  });

  it('should type into password field', async () => {
    // Navigate to form page
    await browserSession.cdpNavigate(`${baseUrl}/form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find password input field
    let passwordNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'input' && node.attributes?.type === 'password') {
        passwordNode = node;
        break;
      }
    }

    if (passwordNode) {
      // Type password text
      const passwordText = 'SecureP@ssw0rd!';
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node: passwordNode,
        text: passwordText,
        clearExisting: true
      }));

      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      // Verify password was typed
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `document.getElementById("${passwordNode.attributes?.id}").value`,
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(valueCheck.result?.value).toBe(passwordText);
    }
  });

  it('should handle readonly fields gracefully', async () => {
    // Navigate to readonly page
    await browserSession.cdpNavigate(`${baseUrl}/readonly`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find readonly input field
    let readonlyNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'input' && node.attributes?.id === 'readonly-input') {
        readonlyNode = node;
        break;
      }
    }

    if (readonlyNode) {
      // Try to type into readonly field
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node: readonlyNode,
        text: 'New text',
        clearExisting: true
      }));

      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]).catch(() => {});

      // Value should remain unchanged due to readonly attribute
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.getElementById("readonly-input").value',
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(valueCheck.result?.value).toBe('Cannot change this');
    }
  });

  it('should type special characters correctly', async () => {
    // Navigate to form page
    await browserSession.cdpNavigate(`${baseUrl}/form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find text input field
    let textNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'input' && node.attributes?.type === 'text') {
        textNode = node;
        break;
      }
    }

    if (textNode) {
      // Type text with special characters
      const specialText = 'Test @#$%^&*()_+-={}[]|\\:";<>?,./~`';
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node: textNode,
        text: specialText,
        clearExisting: true
      }));

      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      // Verify special characters were typed correctly
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `document.getElementById("${textNode.attributes?.id}").value`,
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(valueCheck.result?.value).toBe(specialText);
    }
  });

  it('should clear field with empty string and clearExisting=true', async () => {
    // Navigate to form page
    await browserSession.cdpNavigate(`${baseUrl}/form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find text input field
    let textNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'input' && node.attributes?.type === 'text') {
        textNode = node;
        break;
      }
    }

    if (textNode) {
      // First type some text
      await browserSession.eventBus.dispatch(new TypeTextEvent({
        node: textNode,
        text: 'Initial text',
        clearExisting: true
      }));

      // Clear by typing empty string with clearExisting=true
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node: textNode,
        text: '',
        clearExisting: true
      }));

      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      // Verify field is now empty
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const valueCheck = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: `document.getElementById("${textNode.attributes?.id}").value`,
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(valueCheck.result?.value).toBe('');
    }
  });

  it('should type to page with index 0 (focused element)', async () => {
    // Navigate to autofocus page
    await browserSession.cdpNavigate(`${baseUrl}/autofocus-form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create a mock node with index 0
    const mockNode: EnhancedDOMTreeNode = {
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
      tagName: 'body',
      parentNodeId: null,
      childNodeIds: []
    };

    // Type text with index 0 - should go to autofocus input
    const event = browserSession.eventBus.dispatch(new TypeTextEvent({
      node: mockNode,
      text: 'Hello Page',
      clearExisting: false
    }));

    await Promise.race([
      event,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]);

    // Verify text went to autofocus input
    const cdpSession = await browserSession.getOrCreateCdpSession();
    
    const autofocusValue = await browserSession.cdpClient.send('Runtime.evaluate', {
      expression: 'document.getElementById("autofocus-input").value',
      returnByValue: true,
    }, cdpSession.sessionId);
    expect(autofocusValue.result?.value).toBe('Hello Page');

    // Check other inputs are empty
    const firstValue = await browserSession.cdpClient.send('Runtime.evaluate', {
      expression: 'document.getElementById("first-input").value',
      returnByValue: true,
    }, cdpSession.sessionId);
    expect(firstValue.result?.value).toBe('');

    const thirdValue = await browserSession.cdpClient.send('Runtime.evaluate', {
      expression: 'document.getElementById("third-input").value',
      returnByValue: true,
    }, cdpSession.sessionId);
    expect(thirdValue.result?.value).toBe('');
  });

  it('should handle non-existent element gracefully', async () => {
    // Navigate to form page
    await browserSession.cdpNavigate(`${baseUrl}/form`);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Focus first input manually
    const cdpSession = await browserSession.getOrCreateCdpSession();
    await browserSession.cdpClient.send('Runtime.evaluate', {
      expression: 'document.getElementById("name").focus()',
      returnByValue: true,
    }, cdpSession.sessionId);

    // Create node with non-existent index
    const nonexistentNode: EnhancedDOMTreeNode = {
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
      tagName: 'input',
      parentNodeId: null,
      childNodeIds: []
    };

    // Try to type into non-existent element
    const event = browserSession.eventBus.dispatch(new TypeTextEvent({
      node: nonexistentNode,
      text: 'Fallback text',
      clearExisting: false
    }));

    const result = await Promise.race([
      event,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]).catch(() => null);

    // Check if text was typed to focused element as fallback
    const nameValue = await browserSession.cdpClient.send('Runtime.evaluate', {
      expression: 'document.getElementById("name").value',
      returnByValue: true,
    }, cdpSession.sessionId);

    // Either it failed or fell back to typing to page
    if (result && !result.error) {
      expect(nameValue.result?.value).toBe('Fallback text');
    }
  });

  it('should type into iframe input field', async () => {
    // Set up iframe URLs first
    baseUrl = `http://localhost:${port}`;
    
    // Navigate to page with iframe
    await browserSession.cdpNavigate(`${baseUrl}/page-with-form-iframe`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give iframe time to load

    // Get browser state
    const state = await browserSession.getBrowserStateAtPageLoad();

    // Find iframe input (if same-origin)
    let iframeInputNode: EnhancedDOMTreeNode | null = null;
    for (const node of Object.values(state.domState.selectorMap)) {
      if (node.tagName === 'input' && node.attributes?.id === 'iframe-input') {
        iframeInputNode = node;
        break;
      }
    }

    if (iframeInputNode) {
      // Type text into iframe input
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node: iframeInputNode,
        text: 'Text in iframe',
        clearExisting: true
      }));

      await Promise.race([
        event,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);

      // Verify text was typed into iframe input
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
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(iframeValue.result?.value).toBe('Text in iframe');

      // Verify main page input is still empty
      const mainValue = await browserSession.cdpClient.send('Runtime.evaluate', {
        expression: 'document.getElementById("main-input").value',
        returnByValue: true,
      }, cdpSession.sessionId);

      expect(mainValue.result?.value).toBe('');
    }
  });
});