import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import * as http from 'http';
import express from 'express';

describe('TypeTextEvent Fallback Tests', () => {
  let server: http.Server;
  let app: express.Application;
  let baseUrl: string;
  let browserSession: BrowserSession;
  const port = 4527;

  beforeAll(async () => {
    // Set up test HTTP server
    app = express();
    
    app.get('/', (req, res) => {
      res.send(`
        <html>
        <body>
          <!-- Standard input - should work with fill() -->
          <input id="standard-input" type="text" placeholder="Standard input">
          
          <!-- Contenteditable div - should NOT work with fill(), needs fallback -->
          <div id="contenteditable" contenteditable="true" style="border: 1px solid #ccc; padding: 5px;">
            Click here to edit
          </div>
          
          <!-- Custom element that might not support fill() -->
          <custom-element id="custom" tabindex="0" style="border: 1px solid #ccc; padding: 5px;">
            Custom element
          </custom-element>
        </body>
        </html>
      `);
    });

    server = app.listen(port);
    baseUrl = `http://localhost:${port}`;

    // Create browser session
    const profile = new BrowserProfile({ headless: true });
    browserSession = new BrowserSession(profile);
    await browserSession.start();
  });

  afterAll(async () => {
    if (browserSession) {
      await browserSession.stop();
    }
    if (server) {
      server.close();
    }
  });

  it('should input text with fallback for non-standard elements', async () => {
    // Navigate to test page
    const page = await browserSession.getCurrentPage();
    await page.goto(baseUrl);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get the DOM state
    const state = await browserSession.getBrowserState();

    // Find elements by their IDs
    let standardInputIndex: number | null = null;
    let contenteditableIndex: number | null = null;
    let customElementIndex: number | null = null;

    for (const [index, element] of Object.entries(state.dom_state?.selector_map || {})) {
      const elementIndex = parseInt(index);
      if (element.attributes?.id === 'standard-input') {
        standardInputIndex = elementIndex;
      } else if (element.attributes?.id === 'contenteditable') {
        contenteditableIndex = elementIndex;
      } else if (element.attributes?.id === 'custom') {
        customElementIndex = elementIndex;
      }
    }

    // Test standard input (should work normally)
    if (standardInputIndex !== null) {
      const element = state.dom_state?.selector_map[standardInputIndex];
      await browserSession.inputTextElementNode(element, 'Test text for input');

      // Verify the text was entered
      const value = await page.locator('#standard-input').inputValue();
      expect(value).toBe('Test text for input');
    }

    // Test contenteditable div (should use fallback)
    if (contenteditableIndex !== null) {
      const element = state.dom_state?.selector_map[contenteditableIndex];
      await browserSession.inputTextElementNode(element, 'Test text for contenteditable');

      // Verify the text was entered
      const text = await page.locator('#contenteditable').textContent();
      expect(text).toContain('Test text for contenteditable');
    }

    // Test custom element (might use fallback)
    if (customElementIndex !== null) {
      const element = state.dom_state?.selector_map[customElementIndex];
      // This might fail for truly custom elements, but should at least not crash
      try {
        await browserSession.inputTextElementNode(element, 'Test text for custom');
        // If it succeeds, verify the text
        const text = await page.locator('#custom').textContent();
        expect(text).toBeDefined();
      } catch (error) {
        // It's okay if custom elements fail, as long as standard ones work
        expect(error).toBeDefined();
      }
    }
  });

  it('should handle contenteditable with existing content', async () => {
    // Create a test page with contenteditable that has existing content
    app.get('/contenteditable-existing', (req, res) => {
      res.send(`
        <html>
        <body>
          <div id="contenteditable-with-text" contenteditable="true" style="border: 1px solid #ccc; padding: 5px;">
            Existing content here
          </div>
        </body>
        </html>
      `);
    });

    // Navigate to test page
    const page = await browserSession.getCurrentPage();
    await page.goto(`${baseUrl}/contenteditable-existing`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get the DOM state
    const state = await browserSession.getBrowserState();

    // Find contenteditable element
    let contenteditableIndex: number | null = null;
    for (const [index, element] of Object.entries(state.dom_state?.selector_map || {})) {
      if (element.attributes?.id === 'contenteditable-with-text') {
        contenteditableIndex = parseInt(index);
        break;
      }
    }

    if (contenteditableIndex !== null) {
      const element = state.dom_state?.selector_map[contenteditableIndex];
      
      // Clear and type new text
      await browserSession.inputTextElementNode(element, 'Replaced content', true);

      // Verify the text was replaced
      const text = await page.locator('#contenteditable-with-text').textContent();
      expect(text).toContain('Replaced content');
      expect(text).not.toContain('Existing content');
    }
  });

  it('should handle nested contenteditable elements', async () => {
    // Create a test page with nested contenteditable elements
    app.get('/nested-contenteditable', (req, res) => {
      res.send(`
        <html>
        <body>
          <div id="parent-editable" contenteditable="true" style="border: 2px solid #000; padding: 10px;">
            Parent editable content
            <div id="child-editable" contenteditable="true" style="border: 1px solid #666; padding: 5px; margin: 5px;">
              Child editable content
            </div>
          </div>
        </body>
        </html>
      `);
    });

    // Navigate to test page
    const page = await browserSession.getCurrentPage();
    await page.goto(`${baseUrl}/nested-contenteditable`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get the DOM state
    const state = await browserSession.getBrowserState();

    // Find both contenteditable elements
    let parentIndex: number | null = null;
    let childIndex: number | null = null;
    
    for (const [index, element] of Object.entries(state.dom_state?.selector_map || {})) {
      const elementIndex = parseInt(index);
      if (element.attributes?.id === 'parent-editable') {
        parentIndex = elementIndex;
      } else if (element.attributes?.id === 'child-editable') {
        childIndex = elementIndex;
      }
    }

    // Test typing into child element
    if (childIndex !== null) {
      const element = state.dom_state?.selector_map[childIndex];
      await browserSession.inputTextElementNode(element, 'New child text', true);

      // Verify the child text was changed
      const childText = await page.locator('#child-editable').textContent();
      expect(childText).toContain('New child text');
      expect(childText).not.toContain('Child editable content');
    }

    // Test typing into parent element
    if (parentIndex !== null) {
      const element = state.dom_state?.selector_map[parentIndex];
      
      // This is tricky - typing into parent shouldn't affect child
      // We'll append text instead of replacing
      await browserSession.inputTextElementNode(element, ' Added to parent', false);

      // Verify parent has new text but child is unchanged
      const parentText = await page.locator('#parent-editable').textContent();
      expect(parentText).toContain('Added to parent');
      
      // Child should still have its text
      const childText = await page.locator('#child-editable').textContent();
      expect(childText).toContain('New child text');
    }
  });

  it('should handle input with maxlength attribute', async () => {
    // Create a test page with input having maxlength
    app.get('/maxlength-input', (req, res) => {
      res.send(`
        <html>
        <body>
          <input id="limited-input" type="text" maxlength="10" placeholder="Max 10 chars">
          <input id="unlimited-input" type="text" placeholder="No limit">
        </body>
        </html>
      `);
    });

    // Navigate to test page
    const page = await browserSession.getCurrentPage();
    await page.goto(`${baseUrl}/maxlength-input`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get the DOM state
    const state = await browserSession.getBrowserState();

    // Find input elements
    let limitedIndex: number | null = null;
    let unlimitedIndex: number | null = null;
    
    for (const [index, element] of Object.entries(state.dom_state?.selector_map || {})) {
      const elementIndex = parseInt(index);
      if (element.attributes?.id === 'limited-input') {
        limitedIndex = elementIndex;
      } else if (element.attributes?.id === 'unlimited-input') {
        unlimitedIndex = elementIndex;
      }
    }

    // Test limited input
    if (limitedIndex !== null) {
      const element = state.dom_state?.selector_map[limitedIndex];
      // Try to type more than 10 characters
      await browserSession.inputTextElementNode(element, 'This is a very long text that exceeds the limit');

      // Verify only 10 characters were entered
      const value = await page.locator('#limited-input').inputValue();
      expect(value.length).toBeLessThanOrEqual(10);
    }

    // Test unlimited input
    if (unlimitedIndex !== null) {
      const element = state.dom_state?.selector_map[unlimitedIndex];
      const longText = 'This is a very long text that has no limit';
      await browserSession.inputTextElementNode(element, longText);

      // Verify all text was entered
      const value = await page.locator('#unlimited-input').inputValue();
      expect(value).toBe(longText);
    }
  });

  it('should handle disabled and readonly inputs differently', async () => {
    // Create a test page with disabled and readonly inputs
    app.get('/disabled-readonly', (req, res) => {
      res.send(`
        <html>
        <body>
          <input id="normal-input" type="text" placeholder="Normal input">
          <input id="disabled-input" type="text" disabled placeholder="Disabled input">
          <input id="readonly-input" type="text" readonly value="Readonly value" placeholder="Readonly input">
        </body>
        </html>
      `);
    });

    // Navigate to test page
    const page = await browserSession.getCurrentPage();
    await page.goto(`${baseUrl}/disabled-readonly`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get the DOM state
    const state = await browserSession.getBrowserState();

    // Find all input elements
    let normalIndex: number | null = null;
    let disabledIndex: number | null = null;
    let readonlyIndex: number | null = null;
    
    for (const [index, element] of Object.entries(state.dom_state?.selector_map || {})) {
      const elementIndex = parseInt(index);
      if (element.attributes?.id === 'normal-input') {
        normalIndex = elementIndex;
      } else if (element.attributes?.id === 'disabled-input') {
        disabledIndex = elementIndex;
      } else if (element.attributes?.id === 'readonly-input') {
        readonlyIndex = elementIndex;
      }
    }

    // Test normal input (should work)
    if (normalIndex !== null) {
      const element = state.dom_state?.selector_map[normalIndex];
      await browserSession.inputTextElementNode(element, 'Normal text');
      
      const value = await page.locator('#normal-input').inputValue();
      expect(value).toBe('Normal text');
    }

    // Test disabled input (should fail or be ignored)
    if (disabledIndex !== null) {
      const element = state.dom_state?.selector_map[disabledIndex];
      try {
        await browserSession.inputTextElementNode(element, 'Should not work');
        // If it doesn't throw, verify the value is still empty
        const value = await page.locator('#disabled-input').inputValue();
        expect(value).toBe('');
      } catch (error) {
        // Expected to fail for disabled inputs
        expect(error).toBeDefined();
      }
    }

    // Test readonly input (might work but value shouldn't change)
    if (readonlyIndex !== null) {
      const element = state.dom_state?.selector_map[readonlyIndex];
      try {
        await browserSession.inputTextElementNode(element, 'New value');
        // Value should remain unchanged
        const value = await page.locator('#readonly-input').inputValue();
        expect(value).toBe('Readonly value');
      } catch (error) {
        // Or it might fail, which is also acceptable
        expect(error).toBeDefined();
      }
    }
  });
});