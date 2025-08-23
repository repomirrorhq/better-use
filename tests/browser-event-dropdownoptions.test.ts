/**
 * Test GetDropdownOptionsEvent and SelectDropdownOptionEvent functionality.
 * 
 * This file consolidates all tests related to dropdown functionality including:
 * - Native <select> dropdowns
 * - ARIA role="menu" dropdowns  
 * - Custom dropdown implementations
 */

import { ActionModel, ActionResult } from '../src/agent/views';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Controller } from '../src/controller/service';
import { GoToUrlAction } from '../src/controller/views';
import { 
  GetDropdownOptionsEvent, 
  NavigationCompleteEvent, 
  SelectDropdownOptionEvent 
} from '../src/browser/events';

describe('GetDropdownOptionsEvent Tests', () => {
  let browserSession: BrowserSession;
  let controller: Controller;
  
  beforeEach(async () => {
    browserSession = new BrowserSession(
      new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true,
        chromiumSandbox: false
      })
    );
    await browserSession.start();
    controller = new Controller();
  });
  
  afterEach(async () => {
    if (browserSession) {
      await browserSession.kill();
    }
  });
  
  const nativeDropdownHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Native Dropdown Test</title>
    </head>
    <body>
      <h1>Native Dropdown Test</h1>
      <select id="test-dropdown" name="test-dropdown">
        <option value="">Please select</option>
        <option value="option1">First Option</option>
        <option value="option2">Second Option</option>
        <option value="option3">Third Option</option>
      </select>
      <div id="result">No selection made</div>
      <script>
        document.getElementById('test-dropdown').addEventListener('change', function(e) {
          document.getElementById('result').textContent = 'Selected: ' + e.target.options[e.target.selectedIndex].text;
        });
      </script>
    </body>
    </html>
  `;
  
  const ariaMenuHtml = `
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
  `;
  
  const customDropdownHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Custom Dropdown Test</title>
      <style>
        .dropdown {
          position: relative;
          display: inline-block;
          width: 200px;
        }
        .dropdown-button {
          padding: 10px;
          border: 1px solid #ccc;
          background: white;
          cursor: pointer;
          width: 100%;
        }
        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          border: 1px solid #ccc;
          background: white;
          display: block;
          z-index: 1000;
        }
        .dropdown-menu.hidden {
          display: none;
        }
        .dropdown .item {
          padding: 10px;
          cursor: pointer;
        }
        .dropdown .item:hover {
          background: #f0f0f0;
        }
        .dropdown .item.selected {
          background: #e0e0e0;
        }
        #result {
          margin-top: 20px;
          padding: 10px;
          border: 1px solid #ddd;
        }
      </style>
    </head>
    <body>
      <h1>Custom Dropdown Test</h1>
      <p>This is a custom dropdown implementation (like Semantic UI)</p>
      
      <div class="dropdown ui" id="custom-dropdown">
        <div class="dropdown-button" onclick="toggleDropdown()">
          <span id="selected-text">Choose an option</span>
        </div>
        <div class="dropdown-menu" id="dropdown-menu">
          <div class="item" data-value="red" onclick="selectOption('Red', 'red')">Red</div>
          <div class="item" data-value="green" onclick="selectOption('Green', 'green')">Green</div>
          <div class="item" data-value="blue" onclick="selectOption('Blue', 'blue')">Blue</div>
          <div class="item" data-value="yellow" onclick="selectOption('Yellow', 'yellow')">Yellow</div>
        </div>
      </div>
      
      <div id="result">No selection made</div>
      
      <script>
        function toggleDropdown() {
          const menu = document.getElementById('dropdown-menu');
          menu.classList.toggle('hidden');
        }
        
        function selectOption(text, value) {
          document.getElementById('selected-text').textContent = text;
          document.getElementById('result').textContent = 'Selected: ' + text + ' (value: ' + value + ')';
          // Mark as selected
          document.querySelectorAll('.item').forEach(item => item.classList.remove('selected'));
          event.target.classList.add('selected');
          // Close dropdown
          document.getElementById('dropdown-menu').classList.add('hidden');
        }
      </script>
    </body>
    </html>
  `;
  
  test('native select dropdown options', async () => {
    // Set up page with native dropdown
    const page = browserSession.getCurrentPage();
    await page.setContent(nativeDropdownHtml);
    await page.waitForTimeout(500);
    
    // Initialize DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get selector map and find select element
    const selectorMap = await browserSession.getSelectorMap();
    let dropdownIndex: number | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'select' && 
          element.attributes?.id === 'test-dropdown') {
        dropdownIndex = parseInt(idx);
        break;
      }
    }
    
    expect(dropdownIndex).toBeDefined();
    
    // Test via controller action
    const getOptionsAction = new ActionModel({
      getDropdownOptions: { index: dropdownIndex! }
    });
    
    const result = await controller.act(getOptionsAction, browserSession);
    
    // Verify result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Verify all expected options are present
    const expectedOptions = ['Please select', 'First Option', 'Second Option', 'Third Option'];
    for (const option of expectedOptions) {
      expect(result.extractedContent).toContain(option);
    }
    
    // Verify instruction is included
    expect(result.extractedContent).toContain('Use the exact text string');
    expect(result.extractedContent).toContain('select_dropdown_option');
    
    // Also test direct event dispatch
    const node = await browserSession.getElementByIndex(dropdownIndex!);
    expect(node).toBeTruthy();
    
    const event = browserSession.eventBus.dispatch(new GetDropdownOptionsEvent({ node }));
    const dropdownData = await event.eventResult(3000);
    
    expect(dropdownData).toBeTruthy();
    expect(dropdownData.options).toBeDefined();
    expect(dropdownData.type).toBe('select');
  });
  
  test('ARIA menu dropdown options', async () => {
    // Set up page with ARIA menu
    const page = browserSession.getCurrentPage();
    await page.setContent(ariaMenuHtml);
    await page.waitForTimeout(500);
    
    // Initialize DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get selector map and find ARIA menu
    const selectorMap = await browserSession.getSelectorMap();
    let menuIndex: number | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'ul' && 
          element.attributes?.role === 'menu' &&
          element.attributes?.id === 'pyNavigation1752753375773') {
        menuIndex = parseInt(idx);
        break;
      }
    }
    
    expect(menuIndex).toBeDefined();
    
    // Test via controller action
    const getOptionsAction = new ActionModel({
      getDropdownOptions: { index: menuIndex! }
    });
    
    const result = await controller.act(getOptionsAction, browserSession);
    
    // Verify result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Verify expected ARIA menu options are present
    const expectedOptions = ['Filter', 'Sort', 'Appearance', 'Summarize', 'Delete'];
    for (const option of expectedOptions) {
      expect(result.extractedContent).toContain(option);
    }
    
    // Also test direct event dispatch
    const node = await browserSession.getElementByIndex(menuIndex!);
    expect(node).toBeTruthy();
    
    const event = browserSession.eventBus.dispatch(new GetDropdownOptionsEvent({ node }));
    const dropdownData = await event.eventResult(3000);
    
    expect(dropdownData).toBeTruthy();
    expect(dropdownData.options).toBeDefined();
    expect(dropdownData.type).toBe('aria');
  });
  
  test('custom dropdown options', async () => {
    // Set up page with custom dropdown
    const page = browserSession.getCurrentPage();
    await page.setContent(customDropdownHtml);
    await page.waitForTimeout(500);
    
    // Initialize DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get selector map and find custom dropdown
    const selectorMap = await browserSession.getSelectorMap();
    let dropdownIndex: number | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.attributes?.id === 'custom-dropdown' && 
          element.attributes?.class?.includes('dropdown')) {
        dropdownIndex = parseInt(idx);
        break;
      }
    }
    
    expect(dropdownIndex).toBeDefined();
    
    // Test via controller action
    const getOptionsAction = new ActionModel({
      getDropdownOptions: { index: dropdownIndex! }
    });
    
    const result = await controller.act(getOptionsAction, browserSession);
    
    // Verify result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    
    // Verify expected custom dropdown options are present
    const expectedOptions = ['Red', 'Green', 'Blue', 'Yellow'];
    for (const option of expectedOptions) {
      expect(result.extractedContent).toContain(option);
    }
    
    // Also test direct event dispatch
    const node = await browserSession.getElementByIndex(dropdownIndex!);
    expect(node).toBeTruthy();
    
    const event = browserSession.eventBus.dispatch(new GetDropdownOptionsEvent({ node }));
    const dropdownData = await event.eventResult(3000);
    
    expect(dropdownData).toBeTruthy();
    expect(dropdownData.options).toBeDefined();
    expect(dropdownData.type).toBe('custom');
  });
  
  test('element not found error', async () => {
    // Set up any page
    const page = browserSession.getCurrentPage();
    await page.setContent(nativeDropdownHtml);
    await page.waitForTimeout(500);
    
    // Try to get dropdown options with invalid index
    const getOptionsAction = new ActionModel({
      getDropdownOptions: { index: 99999 }
    });
    
    const result = await controller.act(getOptionsAction, browserSession);
    
    // Should return an error
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.error).toBeTruthy();
    expect(result.error?.toLowerCase()).toContain('not found');
  });
});

describe('SelectDropdownOptionEvent Tests', () => {
  let browserSession: BrowserSession;
  let controller: Controller;
  
  beforeEach(async () => {
    browserSession = new BrowserSession(
      new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true,
        chromiumSandbox: false
      })
    );
    await browserSession.start();
    controller = new Controller();
  });
  
  afterEach(async () => {
    if (browserSession) {
      await browserSession.kill();
    }
  });
  
  test('select native dropdown option', async () => {
    // Set up page with native dropdown
    const page = browserSession.getCurrentPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <body>
        <select id="test-dropdown">
          <option value="">Please select</option>
          <option value="option1">First Option</option>
          <option value="option2">Second Option</option>
          <option value="option3">Third Option</option>
        </select>
        <div id="result">No selection made</div>
        <script>
          document.getElementById('test-dropdown').addEventListener('change', function(e) {
            document.getElementById('result').textContent = 'Selected: ' + e.target.options[e.target.selectedIndex].text;
          });
        </script>
      </body>
      </html>
    `);
    await page.waitForTimeout(500);
    
    // Initialize DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get selector map and find select element
    const selectorMap = await browserSession.getSelectorMap();
    let dropdownIndex: number | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'select' && 
          element.attributes?.id === 'test-dropdown') {
        dropdownIndex = parseInt(idx);
        break;
      }
    }
    
    expect(dropdownIndex).toBeDefined();
    
    // Test via controller action
    const selectAction = new ActionModel({
      selectDropdownOption: { 
        index: dropdownIndex!, 
        text: 'Second Option' 
      }
    });
    
    const result = await controller.act(selectAction, browserSession);
    
    // Verify result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Second Option');
    
    // Verify the selection actually worked
    const selectedIndex = await page.evaluate(() => {
      const select = document.getElementById('test-dropdown') as HTMLSelectElement;
      return select.selectedIndex;
    });
    
    expect(selectedIndex).toBe(2);
    
    // Verify the result div was updated
    const resultText = await page.evaluate(() => {
      return document.getElementById('result')?.textContent;
    });
    
    expect(resultText).toBe('Selected: Second Option');
  });
  
  test('select ARIA menu option', async () => {
    // Set up page with ARIA menu (simplified version)
    const page = browserSession.getCurrentPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <body>
        <ul role="menu" id="test-menu">
          <li role="presentation">
            <a href="#" onclick="selectItem(event, 'Filter')" role="menuitem">Filter</a>
          </li>
          <li role="presentation">
            <a href="#" onclick="selectItem(event, 'Sort')" role="menuitem">Sort</a>
          </li>
          <li role="presentation">
            <a href="#" onclick="selectItem(event, 'Delete')" role="menuitem">Delete</a>
          </li>
        </ul>
        <div id="result">No selection</div>
        <script>
          function selectItem(event, item) {
            event.preventDefault();
            document.getElementById('result').textContent = 'Clicked: ' + item;
          }
        </script>
      </body>
      </html>
    `);
    await page.waitForTimeout(500);
    
    // Initialize DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get selector map and find ARIA menu
    const selectorMap = await browserSession.getSelectorMap();
    let menuIndex: number | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'ul' && 
          element.attributes?.role === 'menu' &&
          element.attributes?.id === 'test-menu') {
        menuIndex = parseInt(idx);
        break;
      }
    }
    
    expect(menuIndex).toBeDefined();
    
    // Test via controller action
    const selectAction = new ActionModel({
      selectDropdownOption: { 
        index: menuIndex!, 
        text: 'Filter' 
      }
    });
    
    const result = await controller.act(selectAction, browserSession);
    
    // Verify result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Filter');
    
    // Verify the click had an effect
    const resultText = await page.evaluate(() => {
      return document.getElementById('result')?.textContent;
    });
    
    expect(resultText).toContain('Filter');
  });
  
  test('select custom dropdown option', async () => {
    // Set up page with custom dropdown
    const page = browserSession.getCurrentPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <body>
        <div class="dropdown" id="custom-dropdown">
          <div class="dropdown-button">
            <span id="selected-text">Choose an option</span>
          </div>
          <div class="dropdown-menu">
            <div class="item" onclick="selectOption('Red')">Red</div>
            <div class="item" onclick="selectOption('Green')">Green</div>
            <div class="item" onclick="selectOption('Blue')">Blue</div>
          </div>
        </div>
        <div id="result">No selection made</div>
        <script>
          function selectOption(text) {
            document.getElementById('selected-text').textContent = text;
            document.getElementById('result').textContent = 'Selected: ' + text;
          }
        </script>
      </body>
      </html>
    `);
    await page.waitForTimeout(500);
    
    // Initialize DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get selector map and find custom dropdown
    const selectorMap = await browserSession.getSelectorMap();
    let dropdownIndex: number | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.attributes?.id === 'custom-dropdown' && 
          element.attributes?.class?.includes('dropdown')) {
        dropdownIndex = parseInt(idx);
        break;
      }
    }
    
    expect(dropdownIndex).toBeDefined();
    
    // Test via controller action
    const selectAction = new ActionModel({
      selectDropdownOption: { 
        index: dropdownIndex!, 
        text: 'Green' 
      }
    });
    
    const result = await controller.act(selectAction, browserSession);
    
    // Verify result
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Green');
    
    // Verify the selection worked
    const resultText = await page.evaluate(() => {
      return document.getElementById('result')?.textContent;
    });
    
    expect(resultText).toBe('Selected: Green');
  });
  
  test('option not found error', async () => {
    // Set up page with native dropdown
    const page = browserSession.getCurrentPage();
    await page.setContent(`
      <select id="test-dropdown">
        <option value="opt1">Option 1</option>
        <option value="opt2">Option 2</option>
      </select>
    `);
    await page.waitForTimeout(500);
    
    // Initialize DOM state
    await browserSession.getBrowserStateSummary(true);
    
    // Get selector map and find select element
    const selectorMap = await browserSession.getSelectorMap();
    let dropdownIndex: number | undefined;
    
    for (const [idx, element] of Object.entries(selectorMap)) {
      if (element.tagName?.toLowerCase() === 'select') {
        dropdownIndex = parseInt(idx);
        break;
      }
    }
    
    expect(dropdownIndex).toBeDefined();
    
    // Try to select non-existent option
    const selectAction = new ActionModel({
      selectDropdownOption: { 
        index: dropdownIndex!, 
        text: 'Non-existent Option' 
      }
    });
    
    const result = await controller.act(selectAction, browserSession);
    
    // Should return an error
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.error).toBeTruthy();
    expect(result.error?.toLowerCase()).toContain('not found');
  });
});