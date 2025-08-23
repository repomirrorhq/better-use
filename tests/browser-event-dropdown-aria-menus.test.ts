import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profiles';
import { Controller } from '../src/controller/controller';
import { GoToUrlAction } from '../src/controller/actions';
import { NavigationCompleteEvent } from '../src/browser/events';
import * as http from 'http';
import * as express from 'express';

describe('ARIA Menu Dropdown Tests', () => {
  let server: http.Server;
  let app: express.Application;
  let baseUrl: string;
  let browserSession: BrowserSession;
  let controller: Controller;
  const port = 4528;

  beforeAll(async () => {
    // Set up test HTTP server
    app = express();
    
    app.get('/aria-menu', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ARIA Menu Test</title>
          <style>
            .menu {
              list-style: none;
              padding: 0;
              margin: 0;
              border: 1px solid #ccc;
              background: white;
              width: 200px;
            }
            .menu-item {
              padding: 10px 20px;
              border-bottom: 1px solid #eee;
            }
            .menu-item:hover {
              background: #f0f0f0;
            }
            .menu-item-anchor {
              text-decoration: none;
              color: #333;
              display: block;
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
          <h1>ARIA Menu Test</h1>
          <p>This menu uses ARIA roles instead of native select elements</p>
          
          <!-- Exactly like the HTML provided in the issue -->
          <ul class="menu menu-format-standard menu-regular" role="menu" id="pyNavigation1752753375773" style="display: block;">
            <li class="menu-item menu-item-enabled" role="presentation">
              <a href="#" onclick="pd(event);" class="menu-item-anchor" tabindex="0" role="menuitem">
                <span class="menu-item-title-wrap"><span class="menu-item-title">Filter</span></span>
              </a>
            </li>
            <li class="menu-item menu-item-enabled" role="presentation" id="menu-item-$PpyNavigation1752753375773$ppyElements$l2">
              <a href="#" onclick="pd(event);" class="menu-item-anchor menu-item-expand" tabindex="0" role="menuitem" aria-haspopup="true">
                <span class="menu-item-title-wrap"><span class="menu-item-title">Sort</span></span>
              </a>
              <div class="menu-panel-wrapper">
                <ul class="menu menu-format-standard menu-regular" role="menu" id="$PpyNavigation1752753375773$ppyElements$l2">
                  <li class="menu-item menu-item-enabled" role="presentation">
                    <a href="#" onclick="pd(event);" class="menu-item-anchor" tabindex="0" role="menuitem">
                      <span class="menu-item-title-wrap"><span class="menu-item-title">Lowest to highest</span></span>
                    </a>
                  </li>
                  <li class="menu-item menu-item-enabled" role="presentation">
                    <a href="#" onclick="pd(event);" class="menu-item-anchor" tabindex="0" role="menuitem">
                      <span class="menu-item-title-wrap"><span class="menu-item-title">Highest to lowest</span></span>
                    </a>
                  </li>
                </ul>
              </div>
            </li>
            <li class="menu-item menu-item-enabled" role="presentation">
              <a href="#" onclick="pd(event);" class="menu-item-anchor" tabindex="0" role="menuitem">
                <span class="menu-item-title-wrap"><span class="menu-item-title">Appearance</span></span>
              </a>
            </li>
            <li class="menu-item menu-item-enabled" role="presentation">
              <a href="#" onclick="pd(event);" class="menu-item-anchor" tabindex="0" role="menuitem">
                <span class="menu-item-title-wrap"><span class="menu-item-title">Summarize</span></span>
              </a>
            </li>
            <li class="menu-item menu-item-enabled" role="presentation">
              <a href="#" onclick="pd(event);" class="menu-item-anchor" tabindex="0" role="menuitem">
                <span class="menu-item-title-wrap"><span class="menu-item-title">Delete</span></span>
              </a>
            </li>
          </ul>
          
          <div id="result">Click an option to see the result</div>
          
          <script>
            // Mock the pd function that prevents default
            function pd(event) {
              event.preventDefault();
              const text = event.target.closest('[role="menuitem"]').textContent.trim();
              document.getElementById('result').textContent = 'Clicked: ' + text;
            }
          </script>
        </body>
        </html>
      `);
    });

    server = app.listen(port);
    baseUrl = `http://localhost:${port}`;

    // Create browser session
    const profile = new BrowserProfile({ 
      headless: true, 
      disableSecurity: true 
    });
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

  it.skip('should get dropdown options from ARIA menu', async () => {
    // Navigate to ARIA menu test page
    const gotoAction = new GoToUrlAction({ url: `${baseUrl}/aria-menu`, newTab: false });
    await controller.act({ goToUrl: gotoAction }, browserSession);

    // Wait for navigation to complete
    await browserSession.eventBus.expect(NavigationCompleteEvent, 10000);

    // Initialize DOM state to populate selector map
    await browserSession.getBrowserStateSummary(true);

    // Get selector map
    const selectorMap = await browserSession.getSelectorMap();

    // Find ARIA menu element in selector map
    let menuIndex: number | null = null;
    for (const [idx, element] of Object.entries(selectorMap)) {
      const index = parseInt(idx);
      if (element.tagName?.toLowerCase() === 'ul' &&
          element.attributes?.role === 'menu' &&
          element.attributes?.id === 'pyNavigation1752753375773') {
        menuIndex = index;
        break;
      }
    }

    const availableElements = Object.entries(selectorMap).map(([idx, element]) => 
      `${idx}: ${element.tagName} id=${element.attributes?.id || 'None'} role=${element.attributes?.role || 'None'}`
    );

    expect(menuIndex).not.toBeNull();
    if (menuIndex === null) {
      throw new Error(`Could not find ARIA menu element in selector map. Available elements: ${availableElements}`);
    }

    // Execute get_dropdown_options action
    const result = await controller.act(
      { getDropdownOptions: { index: menuIndex } },
      browserSession
    );

    // Verify result structure
    expect(result).toBeDefined();
    expect(result.extractedContent).toBeDefined();

    // Expected ARIA menu options
    const expectedOptions = ['Filter', 'Sort', 'Appearance', 'Summarize', 'Delete'];

    // Verify all options are returned
    for (const option of expectedOptions) {
      expect(result.extractedContent).toContain(option);
    }

    // Verify instruction for using text in select_dropdown_option is included
    expect(result.extractedContent).toContain('Use the exact text string in select_dropdown_option');
  });

  it.skip('should select dropdown option from ARIA menu', async () => {
    // Navigate to ARIA menu test page
    const gotoAction = new GoToUrlAction({ url: `${baseUrl}/aria-menu`, newTab: false });
    await controller.act({ goToUrl: gotoAction }, browserSession);

    // Wait for navigation to complete
    await browserSession.eventBus.expect(NavigationCompleteEvent, 10000);

    // Initialize DOM state to populate selector map
    await browserSession.getBrowserStateSummary(true);

    // Get selector map
    const selectorMap = await browserSession.getSelectorMap();

    // Find ARIA menu element in selector map
    let menuIndex: number | null = null;
    for (const [idx, element] of Object.entries(selectorMap)) {
      const index = parseInt(idx);
      if (element.tagName?.toLowerCase() === 'ul' &&
          element.attributes?.role === 'menu' &&
          element.attributes?.id === 'pyNavigation1752753375773') {
        menuIndex = index;
        break;
      }
    }

    const availableElements = Object.entries(selectorMap).map(([idx, element]) => 
      `${idx}: ${element.tagName} id=${element.attributes?.id || 'None'} role=${element.attributes?.role || 'None'}`
    );

    expect(menuIndex).not.toBeNull();
    if (menuIndex === null) {
      throw new Error(`Could not find ARIA menu element in selector map. Available elements: ${availableElements}`);
    }

    // Execute select_dropdown_option action to select "Filter"
    const result = await controller.act(
      { selectDropdownOption: { index: menuIndex, text: 'Filter' } },
      browserSession
    );

    // Verify result structure
    expect(result).toBeDefined();
    expect(result.extractedContent).toBeDefined();

    // Core logic validation: Verify selection was successful
    const extractedLower = result.extractedContent?.toLowerCase() || '';
    expect(extractedLower).toMatch(/selected option|clicked/);
    expect(result.extractedContent).toContain('Filter');

    // Verify click actually had an effect on the page using CDP
    const cdpSession = await browserSession.getOrCreateCdpSession();
    const evalResult = await browserSession.cdpClient.send('Runtime.evaluate', {
      expression: "document.getElementById('result').textContent",
      returnByValue: true,
    }, cdpSession.sessionId);

    const resultText = evalResult.result?.value || '';
    expect(resultText).toContain('Filter');
  });

  it.skip('should handle nested ARIA menu (Sort submenu)', async () => {
    // Navigate to ARIA menu test page
    const gotoAction = new GoToUrlAction({ url: `${baseUrl}/aria-menu`, newTab: false });
    await controller.act({ goToUrl: gotoAction }, browserSession);

    // Wait for navigation to complete
    await browserSession.eventBus.expect(NavigationCompleteEvent, 10000);

    // Initialize DOM state to populate selector map
    await browserSession.getBrowserStateSummary(true);

    // Get selector map
    const selectorMap = await browserSession.getSelectorMap();

    // Find nested ARIA menu element in selector map
    let nestedMenuIndex: number | null = null;
    for (const [idx, element] of Object.entries(selectorMap)) {
      const index = parseInt(idx);
      const elementId = element.attributes?.id || '';
      
      // Look for nested UL with id containing "$PpyNavigation"
      if (element.tagName?.toLowerCase() === 'ul' &&
          elementId.includes('$PpyNavigation') &&
          element.attributes?.role === 'menu') {
        nestedMenuIndex = index;
        break;
      }
    }

    // If nested menu not found, try main menu
    if (nestedMenuIndex === null) {
      for (const [idx, element] of Object.entries(selectorMap)) {
        const index = parseInt(idx);
        if (element.tagName?.toLowerCase() === 'ul' &&
            element.attributes?.id === 'pyNavigation1752753375773') {
          nestedMenuIndex = index;
          break;
        }
      }
    }

    expect(nestedMenuIndex).not.toBeNull();
    if (nestedMenuIndex === null) {
      const availableElements = Object.entries(selectorMap).map(([idx, element]) => 
        `${idx}: ${element.tagName}`
      );
      throw new Error(`Could not find any ARIA menu element in selector map. Available elements: ${availableElements}`);
    }

    // Execute get_dropdown_options action with menu index
    const result = await controller.act(
      { getDropdownOptions: { index: nestedMenuIndex } },
      browserSession
    );

    // Verify result structure
    expect(result).toBeDefined();
    expect(result.extractedContent).toBeDefined();

    // The action should return some menu options
    expect(result.extractedContent).toContain('Use the exact text string in select_dropdown_option');
  });

  it('should handle ARIA menu with keyboard navigation', async () => {
    // Create test page with keyboard-navigable ARIA menu
    app.get('/aria-menu-keyboard', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ARIA Menu Keyboard Test</title>
          <style>
            .menu { list-style: none; padding: 0; margin: 0; }
            .menu-item { padding: 10px; }
            .menu-item:focus-within { background: #e0e0e0; }
            .menu-item-anchor:focus { outline: 2px solid blue; }
          </style>
        </head>
        <body>
          <h1>Keyboard Navigable ARIA Menu</h1>
          
          <ul class="menu" role="menu" id="keyboard-menu" aria-label="Main menu">
            <li class="menu-item" role="none">
              <a href="#" class="menu-item-anchor" role="menuitem" tabindex="0">Home</a>
            </li>
            <li class="menu-item" role="none">
              <a href="#" class="menu-item-anchor" role="menuitem" tabindex="-1">About</a>
            </li>
            <li class="menu-item" role="none">
              <a href="#" class="menu-item-anchor" role="menuitem" tabindex="-1">Contact</a>
            </li>
          </ul>
          
          <div id="result">No selection</div>
          
          <script>
            document.querySelectorAll('[role="menuitem"]').forEach(item => {
              item.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('result').textContent = 'Selected: ' + e.target.textContent;
              });
              
              item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  document.getElementById('result').textContent = 'Selected: ' + e.target.textContent;
                }
              });
            });
          </script>
        </body>
        </html>
      `);
    });

    // Navigate to keyboard menu test page
    const page = await browserSession.getCurrentPage();
    await page.goto(`${baseUrl}/aria-menu-keyboard`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get DOM state
    const state = await browserSession.getBrowserStateWithRecovery();

    // Find keyboard menu
    let keyboardMenuIndex: number | null = null;
    for (const [idx, element] of Object.entries(state.selectorMap)) {
      const index = parseInt(idx);
      if (element.tagName?.toLowerCase() === 'ul' &&
          element.attributes?.id === 'keyboard-menu' &&
          element.attributes?.role === 'menu') {
        keyboardMenuIndex = index;
        break;
      }
    }

    expect(keyboardMenuIndex).not.toBeNull();

    // Verify menu items can be found
    const menuItems = Object.values(state.selectorMap).filter(element =>
      element.attributes?.role === 'menuitem'
    );

    expect(menuItems.length).toBeGreaterThan(0);
    expect(menuItems.some(item => item.innerText?.includes('Home'))).toBe(true);
    expect(menuItems.some(item => item.innerText?.includes('About'))).toBe(true);
    expect(menuItems.some(item => item.innerText?.includes('Contact'))).toBe(true);
  });

  it('should handle ARIA listbox as dropdown alternative', async () => {
    // Create test page with ARIA listbox
    app.get('/aria-listbox', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ARIA Listbox Test</title>
          <style>
            .listbox {
              border: 1px solid #ccc;
              width: 200px;
              max-height: 150px;
              overflow-y: auto;
            }
            .option {
              padding: 8px;
              cursor: pointer;
            }
            .option[aria-selected="true"] {
              background: #007bff;
              color: white;
            }
            .option:hover {
              background: #f0f0f0;
            }
          </style>
        </head>
        <body>
          <h1>ARIA Listbox Test</h1>
          <label id="listbox-label">Choose a fruit:</label>
          
          <div class="listbox" role="listbox" id="fruit-listbox" aria-labelledby="listbox-label">
            <div class="option" role="option" aria-selected="false" tabindex="0">Apple</div>
            <div class="option" role="option" aria-selected="false" tabindex="-1">Banana</div>
            <div class="option" role="option" aria-selected="false" tabindex="-1">Orange</div>
            <div class="option" role="option" aria-selected="false" tabindex="-1">Grape</div>
            <div class="option" role="option" aria-selected="false" tabindex="-1">Mango</div>
          </div>
          
          <div id="result">No selection</div>
          
          <script>
            const options = document.querySelectorAll('[role="option"]');
            options.forEach(option => {
              option.addEventListener('click', (e) => {
                // Clear previous selection
                options.forEach(opt => opt.setAttribute('aria-selected', 'false'));
                // Set new selection
                e.target.setAttribute('aria-selected', 'true');
                document.getElementById('result').textContent = 'Selected: ' + e.target.textContent;
              });
            });
          </script>
        </body>
        </html>
      `);
    });

    // Navigate to listbox test page
    const page = await browserSession.getCurrentPage();
    await page.goto(`${baseUrl}/aria-listbox`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get DOM state
    const state = await browserSession.getBrowserStateWithRecovery();

    // Find listbox element
    let listboxIndex: number | null = null;
    for (const [idx, element] of Object.entries(state.selectorMap)) {
      const index = parseInt(idx);
      if (element.attributes?.role === 'listbox' &&
          element.attributes?.id === 'fruit-listbox') {
        listboxIndex = index;
        break;
      }
    }

    expect(listboxIndex).not.toBeNull();

    // Find all options
    const options = Object.values(state.selectorMap).filter(element =>
      element.attributes?.role === 'option'
    );

    expect(options.length).toBe(5);
    
    // Verify option texts
    const optionTexts = options.map(opt => opt.innerText?.trim()).filter(Boolean);
    expect(optionTexts).toContain('Apple');
    expect(optionTexts).toContain('Banana');
    expect(optionTexts).toContain('Orange');
    expect(optionTexts).toContain('Grape');
    expect(optionTexts).toContain('Mango');
  });
});