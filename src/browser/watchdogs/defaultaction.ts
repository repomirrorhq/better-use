/**
 * Default browser action handlers using Playwright.
 * 
 * This watchdog handles the core browser automation actions:
 * - Clicking elements
 * - Typing text into elements
 * - Scrolling pages and elements
 * - Keyboard shortcuts and navigation
 * - File uploads
 * - Dropdown interactions
 */

import { BaseWatchdog, WatchdogConfig } from './base';
import { BrowserSession } from '../session';
import { BrowserException } from '../../exceptions';
import { EnhancedDOMTreeNode } from '../../dom/views';
import { 
  ClickElementEvent, 
  TypeTextEvent, 
  ScrollEvent, 
  GoBackEvent,
  GoForwardEvent,
  RefreshEvent,
  WaitEvent,
  SendKeysEvent,
  UploadFileEvent,
  GetDropdownOptionsEvent,
  SelectDropdownOptionEvent,
  ScrollToTextEvent 
} from '../events';
import { sleep } from '../../utils';

export interface DefaultActionConfig extends WatchdogConfig {
  clickTimeoutMs?: number;
  typeTimeoutMs?: number;
  scrollTimeoutMs?: number;
  waitTimeoutMs?: number;
}

export class DefaultActionWatchdog extends BaseWatchdog {
  protected config: DefaultActionConfig;

  static LISTENS_TO = [
    'ClickElementEvent',
    'TypeTextEvent', 
    'ScrollEvent',
    'GoBackEvent',
    'GoForwardEvent',
    'RefreshEvent',
    'WaitEvent',
    'SendKeysEvent',
    'UploadFileEvent',
    'GetDropdownOptionsEvent',
    'SelectDropdownOptionEvent',
    'ScrollToTextEvent'
  ];

  constructor(browserSession: BrowserSession, config: DefaultActionConfig = {}) {
    const mergedConfig = {
      clickTimeoutMs: 15000,
      typeTimeoutMs: 15000, 
      scrollTimeoutMs: 8000,
      waitTimeoutMs: 60000,
      enabled: true,
      ...config
    };
    super(browserSession, mergedConfig);
    this.config = mergedConfig;
  }

  protected onAttached(): void {
    this.logger.debug('[DefaultActionWatchdog] Attached to session');
  }

  protected onDetached(): void {
    this.logger.debug('[DefaultActionWatchdog] Detached from session');
  }

  // ============================================================================
  // Click Element Handler
  // ============================================================================

  async on_ClickElementEvent(event: ClickElementEvent): Promise<Record<string, any> | null> {
    try {
      const elementNode = event.node;
      const indexForLogging = elementNode.element_index || 'unknown';
      
      this.logger.debug(`🖱️ Attempting to click element with index ${indexForLogging}`);

      // Get the current page
      const page = await this.getCurrentPage();
      
      // Check if element is a file input (should not be clicked)
      if (this.isFileInput(elementNode)) {
        const msg = `Index ${indexForLogging} - has an element which opens file upload dialog. To upload files please use a specific function to upload files`;
        this.logger.info(msg);
        throw new BrowserException('Click triggered a file input element which could not be handled, use the dedicated file upload function instead');
      }

      // Build selector for the element
      const selector = this.buildSelectorForElement(elementNode);
      
      // Check if element exists and is visible
      const element = await page.locator(selector).first();
      await element.waitFor({ state: 'visible', timeout: this.config.clickTimeoutMs });
      
      // Track initial number of pages for new tab detection
      const initialPageCount = this.browserSession.getPageCount();
      
      // Perform click with modifiers if needed
      const clickOptions: any = {
        timeout: this.config.clickTimeoutMs,
        force: false, // Don't force click hidden elements
      };
      
      if (event.while_holding_ctrl) {
        clickOptions.modifiers = ['Control'];
        this.logger.debug('🖱️ Clicking with Ctrl modifier for new tab');
      }

      // Get element bounds for metadata
      const boundingBox = await element.boundingBox();
      let clickMetadata = null;
      if (boundingBox) {
        const centerX = boundingBox.x + boundingBox.width / 2;
        const centerY = boundingBox.y + boundingBox.height / 2;
        clickMetadata = { click_x: centerX, click_y: centerY };
      }

      // Perform the actual click
      await element.click(clickOptions);
      
      // Wait briefly for potential new page/navigation
      await sleep(500);
      
      // Check for new tab/page creation
      const finalPageCount = this.browserSession.getPageCount();
      if (finalPageCount > initialPageCount) {
        const msg = 'New tab opened - switching to it';
        this.logger.info(`🔗 ${msg}`);
        
        // Switch to the new tab if not holding ctrl
        if (!event.while_holding_ctrl) {
          await this.browserSession.switchToLatestPage();
        }
      }

      const elementText = await this.getElementText(elementNode, page);
      this.logger.debug(`🖱️ Clicked button with index ${indexForLogging}: ${elementText}`);
      
      return clickMetadata;
      
    } catch (error: any) {
      const elementInfo = `<${event.node.node_name || 'unknown'} index=${event.node.element_index || 'unknown'}>`;
      this.logger.error(`Failed to click element ${elementInfo}: ${error.message}`);
      throw new BrowserException(`Failed to click element ${elementInfo}. The element may not be interactable or visible. ${error.name}: ${error.message}`);
    }
  }

  // ============================================================================
  // Type Text Handler
  // ============================================================================

  async on_TypeTextEvent(event: TypeTextEvent): Promise<Record<string, any> | null> {
    try {
      const elementNode = event.node;
      const indexForLogging = elementNode.element_index || 'unknown';
      
      this.logger.debug(`⌨️ Attempting to type "${event.text}" into element with index ${indexForLogging}`);

      const page = await this.getCurrentPage();

      // If index is 0 or falsy, type to the focused element on the page
      if (!elementNode.element_index || elementNode.element_index === 0) {
        await page.keyboard.type(event.text);
        this.logger.info(`⌨️ Typed "${event.text}" to the page (current focus)`);
        return null;
      }

      // Build selector and locate element
      const selector = this.buildSelectorForElement(elementNode);
      const element = await page.locator(selector).first();
      
      // Wait for element to be ready for input
      await element.waitFor({ state: 'visible', timeout: this.config.typeTimeoutMs });
      
      // Clear existing text if requested
      if (event.clear_existing && event.text) {
        await element.clear();
      }

      // Get element bounds for metadata
      const boundingBox = await element.boundingBox();
      let inputMetadata = null;
      if (boundingBox) {
        const centerX = boundingBox.x + boundingBox.width / 2;
        const centerY = boundingBox.y + boundingBox.height / 2;
        inputMetadata = { input_x: centerX, input_y: centerY };
      }

      // Focus the element and type
      await element.focus();
      await element.type(event.text, { delay: 18 }); // 18ms delay between keystrokes

      this.logger.info(`⌨️ Typed "${event.text}" into element with index ${indexForLogging}`);
      return inputMetadata;

    } catch (error: any) {
      this.logger.error(`Failed to type text: ${error.message}`);
      throw new BrowserException(`Failed to input text into element: ${error.message}`);
    }
  }

  // ============================================================================
  // Scroll Handler
  // ============================================================================

  async on_ScrollEvent(event: ScrollEvent): Promise<void> {
    try {
      const page = await this.getCurrentPage();
      
      // Convert direction and amount to pixels
      const pixels = event.direction === 'down' ? event.amount : -event.amount;
      
      if (event.node) {
        // Element-specific scrolling
        const elementNode = event.node;
        const indexForLogging = elementNode.backend_node_id || elementNode.element_index || 'unknown';
        
        const selector = this.buildSelectorForElement(elementNode);
        const element = await page.locator(selector).first();
        await element.waitFor({ state: 'visible', timeout: this.config.scrollTimeoutMs });
        
        // Scroll the element's container
        await element.hover(); // Ensure element is focused for scrolling
        await page.mouse.wheel(0, pixels);
        
        this.logger.debug(`📜 Scrolled element ${indexForLogging} container ${event.direction} by ${event.amount} pixels`);
      } else {
        // Page-level scrolling
        await page.mouse.wheel(0, pixels);
        this.logger.debug(`📜 Scrolled page ${event.direction} by ${event.amount} pixels`);
      }

    } catch (error: any) {
      this.logger.error(`Failed to scroll: ${error.message}`);
      throw new BrowserException(`Failed to scroll: ${error.message}`);
    }
  }

  // ============================================================================
  // Navigation Handlers
  // ============================================================================

  async on_GoBackEvent(event: GoBackEvent): Promise<void> {
    try {
      const page = await this.getCurrentPage();
      await page.goBack({ timeout: 15000 });
      this.logger.info('🔙 Navigated back');
    } catch (error: any) {
      this.logger.error(`Failed to go back: ${error.message}`);
      throw new BrowserException(`Failed to navigate back: ${error.message}`);
    }
  }

  async on_GoForwardEvent(event: GoForwardEvent): Promise<void> {
    try {
      const page = await this.getCurrentPage();
      await page.goForward({ timeout: 15000 });
      this.logger.info('🔜 Navigated forward');
    } catch (error: any) {
      this.logger.error(`Failed to go forward: ${error.message}`);
      throw new BrowserException(`Failed to navigate forward: ${error.message}`);
    }
  }

  async on_RefreshEvent(event: RefreshEvent): Promise<void> {
    try {
      const page = await this.getCurrentPage();
      await page.reload({ timeout: 15000 });
      this.logger.info('🔄 Page refreshed');
    } catch (error: any) {
      this.logger.error(`Failed to refresh: ${error.message}`);
      throw new BrowserException(`Failed to refresh page: ${error.message}`);
    }
  }

  // ============================================================================
  // Wait Handler
  // ============================================================================

  async on_WaitEvent(event: WaitEvent): Promise<void> {
    try {
      const actualSeconds = Math.min(Math.max(event.seconds || 3.0, 0), event.max_seconds || 10.0);
      
      if (actualSeconds !== (event.seconds || 3.0)) {
        this.logger.info(`🕒 Waiting for ${actualSeconds} seconds (capped from ${event.seconds}s)`);
      } else {
        this.logger.info(`🕒 Waiting for ${actualSeconds} seconds`);
      }

      await sleep(actualSeconds * 1000);
    } catch (error: any) {
      this.logger.error(`Failed to wait: ${error.message}`);
      throw new BrowserException(`Failed to wait: ${error.message}`);
    }
  }

  // ============================================================================
  // Send Keys Handler  
  // ============================================================================

  async on_SendKeysEvent(event: SendKeysEvent): Promise<void> {
    try {
      const page = await this.getCurrentPage();
      const keys = event.keys.toLowerCase();

      if (keys.includes('+')) {
        // Handle modifier key combinations
        const parts = keys.split('+');
        const key = parts[parts.length - 1];
        const modifiers = parts.slice(0, -1);

        // Convert modifiers to Playwright format
        const playwrightModifiers: string[] = [];
        for (const modifier of modifiers) {
          const mod = modifier.trim().toLowerCase();
          if (['alt', 'option'].includes(mod)) {
            playwrightModifiers.push('Alt');
          } else if (['ctrl', 'control'].includes(mod)) {
            playwrightModifiers.push('Control');
          } else if (['meta', 'cmd', 'command'].includes(mod)) {
            playwrightModifiers.push('Meta');
          } else if (mod === 'shift') {
            playwrightModifiers.push('Shift');
          }
        }

        // Send the key combination
        await page.keyboard.press(`${playwrightModifiers.join('+')}+${this.normalizeKey(key)}`, { delay: 100 });
        
      } else {
        // Single key
        const normalizedKey = this.normalizeKey(keys);
        await page.keyboard.press(normalizedKey, { delay: 100 });
      }

      this.logger.info(`⌨️ Sent keys: ${event.keys}`);

      // Wait briefly for potential navigation after Enter
      if (['enter', 'return'].includes(keys.toLowerCase())) {
        await sleep(500);
      }

    } catch (error: any) {
      this.logger.error(`Failed to send keys: ${error.message}`);
      throw new BrowserException(`Failed to send keys: ${error.message}`);
    }
  }

  // ============================================================================
  // File Upload Handler
  // ============================================================================

  async on_UploadFileEvent(event: UploadFileEvent): Promise<void> {
    try {
      const elementNode = event.node;
      const indexForLogging = elementNode.element_index || 'unknown';

      if (!this.isFileInput(elementNode)) {
        throw new BrowserException(`Element ${indexForLogging} is not a file input. Use click_element for non-file input elements.`);
      }

      const page = await this.getCurrentPage();
      const selector = this.buildSelectorForElement(elementNode);
      
      // Set files for the input element
      await page.setInputFiles(selector, event.file_path);
      
      this.logger.info(`📎 Uploaded file ${event.file_path} to element ${indexForLogging}`);

    } catch (error: any) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw new BrowserException(`Failed to upload file: ${error.message}`);
    }
  }

  // ============================================================================
  // Dropdown Handlers
  // ============================================================================

  async on_GetDropdownOptionsEvent(event: GetDropdownOptionsEvent): Promise<Record<string, string>> {
    try {
      const elementNode = event.node;
      const indexForLogging = elementNode.element_index || 'unknown';
      
      const page = await this.getCurrentPage();
      const selector = this.buildSelectorForElement(elementNode);
      
      // Use JavaScript to extract dropdown options
      const dropdownData = await page.evaluate((sel: string) => {
        const element = document.querySelector(sel) as HTMLElement;
        if (!element) return { error: 'Element not found' };

        // Check if it's a native select element
        if (element.tagName.toLowerCase() === 'select') {
          const selectElement = element as HTMLSelectElement;
          const options = Array.from(selectElement.options).map((opt, idx) => ({
            text: opt.text.trim(),
            value: opt.value,
            index: idx,
            selected: opt.selected
          }));
          
          return {
            type: 'select',
            options,
            id: selectElement.id || '',
            name: selectElement.name || ''
          };
        }

        // Check for ARIA dropdown
        const role = element.getAttribute('role');
        if (['menu', 'listbox', 'combobox'].includes(role || '')) {
          const menuItems = element.querySelectorAll('[role="menuitem"], [role="option"]');
          const options: any[] = [];
          
          menuItems.forEach((item, idx) => {
            const text = item.textContent?.trim() || '';
            if (text) {
              options.push({
                text,
                value: item.getAttribute('data-value') || text,
                index: idx,
                selected: item.getAttribute('aria-selected') === 'true'
              });
            }
          });

          return {
            type: 'aria',
            options,
            id: element.id || '',
            name: element.getAttribute('aria-label') || ''
          };
        }

        // Check for custom dropdown
        if (element.classList.contains('dropdown')) {
          const menuItems = element.querySelectorAll('.item, .option, [data-value]');
          const options: any[] = [];
          
          menuItems.forEach((item, idx) => {
            const text = item.textContent?.trim() || '';
            if (text) {
              options.push({
                text,
                value: item.getAttribute('data-value') || text,
                index: idx,
                selected: item.classList.contains('selected')
              });
            }
          });

          return {
            type: 'custom',
            options,
            id: element.id || '',
            name: element.getAttribute('aria-label') || ''
          };
        }

        return { error: `Element is not a recognized dropdown type (tag: ${element.tagName}, role: ${role})` };
      }, selector);

      if (dropdownData.error) {
        throw new BrowserException(dropdownData.error);
      }

      if (!dropdownData.options || dropdownData.options.length === 0) {
        throw new BrowserException('No options found in dropdown');
      }

      // Format options for display
      const formattedOptions = dropdownData.options.map((opt: any) => {
        const status = opt.selected ? ' (selected)' : '';
        return `${opt.index}: text="${opt.text}", value="${opt.value}"${status}`;
      });

      const message = `Found ${dropdownData.type} dropdown (Index: ${indexForLogging}, ID: ${dropdownData.id || 'none'}):\n` +
        formattedOptions.join('\n') +
        `\n\nUse the exact text or value in select_dropdown_option(index=${indexForLogging}, text=...)`;

      this.logger.info(`📋 Found ${dropdownData.options.length} dropdown options for index ${indexForLogging}`);

      return {
        type: dropdownData.type,
        options: JSON.stringify(dropdownData.options),
        element_info: `Index: ${indexForLogging}, Type: ${dropdownData.type}, ID: ${dropdownData.id || 'none'}`,
        formatted_options: formattedOptions.join('\n'),
        message
      };

    } catch (error: any) {
      const errorMsg = `Failed to get dropdown options for element ${event.node.element_index || 'unknown'}: ${error.message}`;
      this.logger.error(errorMsg);
      throw new BrowserException(errorMsg);
    }
  }

  async on_SelectDropdownOptionEvent(event: SelectDropdownOptionEvent): Promise<Record<string, string>> {
    try {
      const elementNode = event.node;
      const indexForLogging = elementNode.element_index || 'unknown';
      const targetText = event.text;
      
      const page = await this.getCurrentPage();
      const selector = this.buildSelectorForElement(elementNode);
      
      // Use JavaScript to select the option
      const selectionResult = await page.evaluate((sel: string, text: string) => {
        const element = document.querySelector(sel) as HTMLElement;
        if (!element) return { success: false, error: 'Element not found' };

        const targetTextLower = text.toLowerCase();

        // Handle native select elements
        if (element.tagName.toLowerCase() === 'select') {
          const selectElement = element as HTMLSelectElement;
          const options = Array.from(selectElement.options);
          
          for (const option of options) {
            const optionTextLower = option.text.trim().toLowerCase();
            const optionValueLower = option.value.toLowerCase();
            
            if (optionTextLower === targetTextLower || optionValueLower === targetTextLower) {
              selectElement.value = option.value;
              option.selected = true;
              
              // Trigger change event
              const changeEvent = new Event('change', { bubbles: true });
              selectElement.dispatchEvent(changeEvent);
              
              return {
                success: true,
                message: `Selected option: ${option.text.trim()} (value: ${option.value})`,
                value: option.value
              };
            }
          }
          
          return {
            success: false,
            error: `Option with text or value '${text}' not found in select element`
          };
        }

        // Handle ARIA dropdowns
        const role = element.getAttribute('role');
        if (['menu', 'listbox', 'combobox'].includes(role || '')) {
          const menuItems = element.querySelectorAll('[role="menuitem"], [role="option"]');
          
          for (const item of Array.from(menuItems)) {
            const itemTextLower = (item.textContent?.trim() || '').toLowerCase();
            const itemValueLower = (item.getAttribute('data-value') || '').toLowerCase();
            
            if (itemTextLower === targetTextLower || itemValueLower === targetTextLower) {
              // Clear previous selections
              menuItems.forEach(mi => {
                mi.setAttribute('aria-selected', 'false');
                mi.classList.remove('selected');
              });
              
              // Select this item
              item.setAttribute('aria-selected', 'true');
              item.classList.add('selected');
              
              // Trigger click event
              (item as HTMLElement).click();
              
              return {
                success: true,
                message: `Selected ARIA menu item: ${item.textContent?.trim()}`
              };
            }
          }
        }

        // Handle custom dropdowns
        if (element.classList.contains('dropdown')) {
          const menuItems = element.querySelectorAll('.item, .option, [data-value]');
          
          for (const item of Array.from(menuItems)) {
            const itemTextLower = (item.textContent?.trim() || '').toLowerCase();
            const itemValueLower = (item.getAttribute('data-value') || '').toLowerCase();
            
            if (itemTextLower === targetTextLower || itemValueLower === targetTextLower) {
              // Clear previous selections
              menuItems.forEach(mi => {
                mi.classList.remove('selected', 'active');
              });
              
              // Select this item
              item.classList.add('selected', 'active');
              
              // Update dropdown text if there's a text element
              const textElement = element.querySelector('.text');
              if (textElement) {
                textElement.textContent = item.textContent?.trim() || '';
              }
              
              // Trigger events
              (item as HTMLElement).click();
              const changeEvent = new Event('change', { bubbles: true });
              element.dispatchEvent(changeEvent);
              
              return {
                success: true,
                message: `Selected custom dropdown item: ${item.textContent?.trim()}`
              };
            }
          }
        }

        return {
          success: false,
          error: `Element is not a recognized dropdown or option '${text}' not found`
        };
      }, selector, targetText);

      if (selectionResult.success) {
        const msg = selectionResult.message || `Selected option: ${targetText}`;
        this.logger.debug(msg);
        
        return {
          success: 'true',
          message: msg,
          value: selectionResult.value || targetText,
          element_index: String(indexForLogging)
        };
      } else {
        const errorMsg = selectionResult.error || `Failed to select option: ${targetText}`;
        this.logger.error(`❌ ${errorMsg}`);
        throw new BrowserException(errorMsg);
      }

    } catch (error: any) {
      const errorMsg = `Failed to select dropdown option "${event.text}" for element ${event.node.element_index || 'unknown'}: ${error.message}`;
      this.logger.error(errorMsg);
      throw new BrowserException(errorMsg);
    }
  }

  // ============================================================================
  // Scroll to Text Handler
  // ============================================================================

  async on_ScrollToTextEvent(event: ScrollToTextEvent): Promise<void> {
    try {
      const page = await this.getCurrentPage();
      
      // Try to find and scroll to text
      const found = await page.evaluate((text: string) => {
        // Use TreeWalker to find text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );
        
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent && node.textContent.includes(text)) {
            const element = node.parentElement;
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return true;
            }
          }
        }
        return false;
      }, event.text);

      if (found) {
        this.logger.debug(`📜 Scrolled to text: "${event.text}"`);
      } else {
        this.logger.warn(`⚠️ Text not found: "${event.text}"`);
        throw new BrowserException(`Text not found: "${event.text}"`);
      }

    } catch (error: any) {
      this.logger.error(`Failed to scroll to text: ${error.message}`);
      throw new BrowserException(`Failed to scroll to text: ${error.message}`);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async getCurrentPage() {
    // Use browserSession's private getCurrentPage by accessing it through a getter method
    try {
      return (this.browserSession as any).getCurrentPage();
    } catch (error) {
      throw new BrowserException(`No active page available: ${error}`);
    }
  }

  private isFileInput(node: EnhancedDOMTreeNode): boolean {
    const tagName = node.node_name?.toLowerCase();
    const elementType = node.attributes?.type?.toLowerCase();
    return tagName === 'input' && elementType === 'file';
  }

  private buildSelectorForElement(node: EnhancedDOMTreeNode): string {
    // Build CSS selector from tag, attributes, etc.
    let selector = node.node_name || '*';
    
    if (node.attributes?.id) {
      selector += `#${node.attributes.id}`;
    }
    
    if (node.attributes?.class) {
      const classes = node.attributes.class.split(' ').filter(c => c.trim());
      selector += classes.map(c => `.${c}`).join('');
    }
    
    return selector;
  }

  private async getElementText(node: EnhancedDOMTreeNode, page: any): Promise<string> {
    try {
      const selector = this.buildSelectorForElement(node);
      const element = await page.locator(selector).first();
      const text = await element.textContent() || '';
      return text.trim();
    } catch {
      return node.node_name || 'unknown element';
    }
  }

  private normalizeKey(key: string): string {
    const keyMap: Record<string, string> = {
      'enter': 'Enter',
      'return': 'Enter', 
      'tab': 'Tab',
      'delete': 'Delete',
      'backspace': 'Backspace',
      'escape': 'Escape',
      'esc': 'Escape',
      'space': 'Space',
      'up': 'ArrowUp',
      'down': 'ArrowDown', 
      'left': 'ArrowLeft',
      'right': 'ArrowRight',
      'pageup': 'PageUp',
      'pagedown': 'PageDown',
      'home': 'Home',
      'end': 'End'
    };

    return keyMap[key.toLowerCase()] || key;
  }
}