import { z } from 'zod';
import { ActionResult } from '../agent/views.js';
import { BrowserSession } from '../browser/session.js';
import { 
  ClickElementEvent,
  CloseTabEvent,
  GetDropdownOptionsEvent,
  GoBackEvent,
  NavigateToUrlEvent,
  ScrollEvent,
  ScrollToTextEvent,
  SelectDropdownOptionEvent,
  SendKeysEvent,
  SwitchTabEvent,
  TypeTextEvent,
  UploadFileEvent,
} from '../browser/events.js';
import { BrowserError } from '../browser/views.js';
import { Registry } from './registry/service.js';
import { 
  ClickElementActionSchema,
  CloseTabActionSchema,
  DoneActionSchema,
  GetDropdownOptionsActionSchema,
  GoToUrlActionSchema,
  InputTextActionSchema,
  NoParamsActionSchema,
  ScrollActionSchema,
  SearchGoogleActionSchema,
  SelectDropdownOptionActionSchema,
  SendKeysActionSchema,
  StructuredOutputActionSchema,
  SwitchTabActionSchema,
  UploadFileActionSchema,
} from './views.js';
import { EnhancedDOMTreeNode } from '../dom/service.js';
import { FileSystem } from '../filesystem/file_system.js';
import { BaseChatModel } from '../llm/base.js';
import { UserMessage } from '../llm/messages.js';

function extractLlmErrorMessage(error: Error): string {
  const errorStr = error.message;
  const pattern = /<llm_error_msg>(.*?)<\/llm_error_msg>/s;
  const match = errorStr.match(pattern);
  
  if (match) {
    return match[1].trim();
  }
  
  return errorStr;
}

export interface ControllerConfig<Context = any> {
  excludeActions?: string[];
  outputModel?: z.ZodType<any>;
  displayFilesInDoneText?: boolean;
}

export class Controller<Context = any> {
  private registry: Registry<Context>;
  private displayFilesInDoneText: boolean;

  constructor(config: ControllerConfig<Context> = {}) {
    this.registry = new Registry({ excludeActions: config.excludeActions });
    this.displayFilesInDoneText = config.displayFilesInDoneText ?? true;

    // Register all default browser actions
    this.registerDefaultActions(config.outputModel);
  }

  private registerDefaultActions(outputModel?: z.ZodType<any>) {
    this.registerDoneAction(outputModel);

    // Basic Navigation Actions
    this.registerSearchGoogleAction();
    this.registerGoToUrlAction();
    this.registerGoBackAction();
    this.registerWaitAction();

    // Element Interaction Actions  
    this.registerClickElementAction();
    this.registerInputTextAction();
    this.registerUploadFileAction();

    // Tab Management Actions
    this.registerSwitchTabAction();
    this.registerCloseTabAction();

    // Content Actions
    this.registerExtractStructuredDataAction();
    this.registerScrollAction();
    this.registerSendKeysAction();
    this.registerScrollToTextAction();

    // Dropdown Actions
    this.registerGetDropdownOptionsAction();
    this.registerSelectDropdownOptionAction();

    // File System Actions
    this.registerWriteFileAction();
    this.registerReplaceFileStrAction();
    this.registerReadFileAction();
  }

  private registerSearchGoogleAction() {
    const actionFunction = async (
      params: z.infer<typeof SearchGoogleActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.searchGoogle(params, { browserSession });
    };

    this.registry.actions['searchGoogle'] = {
      name: 'searchGoogle',
      description: 'Search the query in Google, the query should be a search query like humans search in Google, concrete and not vague or super long.',
      function: actionFunction,
      paramSchema: SearchGoogleActionSchema,
    };
  }

  private async searchGoogle(
    params: z.infer<typeof SearchGoogleActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    const searchUrl = `https://www.google.com/search?q=${params.query}&udm=14`;

    // Check if there's already a tab open on Google or agent's about:blank
    let useNewTab = true;
    try {
      const tabs = await browserSession.getTabs();
      const browserSessionLabel = browserSession.id.slice(-4);
      
      console.log(`Checking ${tabs.length} tabs for reusable tab (browser_session_label: ${browserSessionLabel})`);

      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        console.log(`Tab ${i}: url="${tab.url}", title="${tab.title}"`);
        
        // Check if tab is on Google domain
        if (tab.url && ['https://www.google.com', 'https://google.com'].includes(tab.url.replace(/\/$/, '').toLowerCase())) {
          console.log(`Found existing Google tab at index ${i}: ${tab.url}, reusing it`);

          // Switch to this tab first if it's not the current one
          if (browserSession.agentFocus && tab.targetId !== browserSession.agentFocus.targetId) {
            try {
              const switchEvent = browserSession.eventBus.dispatch(new SwitchTabEvent({ targetId: tab.targetId }));
              await switchEvent;
              await switchEvent.eventResult();
            } catch (e) {
              console.warn(`Failed to switch to existing Google tab: ${e}, will use new tab`);
              continue;
            }
          }

          useNewTab = false;
          break;
        }
        // Check if it's an agent-owned about:blank page
        else if (tab.url === 'about:blank' && tab.title && browserSessionLabel && tab.title.includes(browserSessionLabel)) {
          console.log(`Found agent-owned about:blank tab at index ${i} with title: "${tab.title}", reusing it`);

          // Switch to this tab first
          if (browserSession.agentFocus && tab.targetId !== browserSession.agentFocus.targetId) {
            try {
              const switchEvent = browserSession.eventBus.dispatch(new SwitchTabEvent({ targetId: tab.targetId }));
              await switchEvent;
              await switchEvent.eventResult();
            } catch (e) {
              console.warn(`Failed to switch to agent-owned tab: ${e}, will use new tab`);
              continue;
            }
          }

          useNewTab = false;
          break;
        }
      }
    } catch (e) {
      console.log(`Could not check for existing tabs: ${e}, using new tab`);
    }

    // Dispatch navigation event
    try {
      const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({
        url: searchUrl,
        newTab: useNewTab,
      }));
      await event;
      await event.eventResult();
      
      const memory = `Searched Google for '${params.query}'`;
      const msg = `🔍 ${memory}`;
      console.log(msg);
      
      return new ActionResult({
        extractedContent: memory,
        includeInMemory: true,
        longTermMemory: memory,
      });
    } catch (e) {
      console.error(`Failed to search Google: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      return new ActionResult({
        error: `Failed to search Google for "${params.query}": ${cleanMsg}`,
      });
    }
  }

  private registerGoToUrlAction() {
    const actionFunction = async (
      params: z.infer<typeof GoToUrlActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.goToUrl(params, { browserSession });
    };

    this.registry.actions['goToUrl'] = {
      name: 'goToUrl',
      description: 'Navigate to URL, set newTab=True to open in new tab, False to navigate in current tab',
      function: actionFunction,
      paramSchema: GoToUrlActionSchema,
    };
  }

  private async goToUrl(
    params: z.infer<typeof GoToUrlActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      // Dispatch navigation event
      const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({
        url: params.url,
        newTab: params.newTab,
      }));
      await event;
      await event.eventResult();

      let memory: string;
      let msg: string;
      if (params.newTab) {
        memory = `Opened new tab with URL ${params.url}`;
        msg = `🔗 Opened new tab with url ${params.url}`;
      } else {
        memory = `Navigated to ${params.url}`;
        msg = `🔗 ${memory}`;
      }

      console.log(msg);
      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
        longTermMemory: memory,
      });
    } catch (e) {
      const errorMsg = (e as Error).message;
      console.error(`❌ Navigation failed: ${errorMsg}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);

      // Check if it's specifically a RuntimeError about CDP client
      if (e instanceof Error && e.message.includes('CDP client not initialized')) {
        console.error('❌ Browser connection failed - CDP client not properly initialized');
        return new ActionResult({
          error: `Browser connection error: ${errorMsg}`,
        });
      }
      // Check for network-related errors
      else if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') ||
               errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
               errorMsg.includes('ERR_CONNECTION_REFUSED') ||
               errorMsg.includes('ERR_TIMED_OUT') ||
               errorMsg.includes('net::')) {
        const siteUnavailableMsg = `Site unavailable: ${params.url} - ${errorMsg}`;
        console.warn(`⚠️ ${siteUnavailableMsg}`);
        return new ActionResult({
          error: siteUnavailableMsg,
        });
      } else {
        return new ActionResult({
          error: `Navigation failed: ${cleanMsg}`,
        });
      }
    }
  }

  private registerGoBackAction() {
    const actionFunction = async (
      params: z.infer<typeof NoParamsActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.goBack(params, { browserSession });
    };

    this.registry.actions['goBack'] = {
      name: 'goBack',
      description: 'Go back',
      function: actionFunction,
      paramSchema: NoParamsActionSchema,
    };
  }

  private async goBack(
    _: z.infer<typeof NoParamsActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      const event = browserSession.eventBus.dispatch(new GoBackEvent());
      await event;
      const memory = 'Navigated back';
      const msg = `🔙 ${memory}`;
      console.log(msg);
      return new ActionResult({ extractedContent: memory });
    } catch (e) {
      console.error(`Failed to dispatch GoBackEvent: ${(e as Error).constructor.name}: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      const errorMsg = `Failed to go back: ${cleanMsg}`;
      return new ActionResult({ error: errorMsg });
    }
  }

  private registerWaitAction() {
    const actionFunction = async (
      params: { seconds?: number },
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      return this.wait(params.seconds);
    };

    this.registry.actions['wait'] = {
      name: 'wait',
      description: 'Wait for x seconds default 3 (max 10 seconds). This can be used to wait until the page is fully loaded.',
      function: actionFunction,
      paramSchema: z.object({ seconds: z.number().optional().default(3) }),
    };
  }

  private async wait(seconds: number = 3): Promise<ActionResult> {
    const actualSeconds = Math.min(Math.max(seconds, 0), 10);
    const memory = `Waited for ${actualSeconds} seconds`;
    console.log(`🕒 ${memory}`);
    await new Promise(resolve => setTimeout(resolve, actualSeconds * 1000));
    return new ActionResult({
      extractedContent: memory,
      longTermMemory: memory,
    });
  }

  // Placeholder implementations for remaining actions - will be fully implemented in subsequent commits
  private registerClickElementAction() {
    const actionFunction = async (
      params: z.infer<typeof ClickElementActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.clickElement(params, { browserSession });
    };

    this.registry.actions['clickElement'] = {
      name: 'clickElement',
      description: 'Click element by index, set while_holding_ctrl=True to open any resulting navigation in a new tab. Only click on indices that are inside your current browser_state. Never click or assume not existing indices.',
      function: actionFunction,
      paramSchema: ClickElementActionSchema,
    };
  }

  private async clickElement(
    params: z.infer<typeof ClickElementActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      if (params.index === 0) {
        throw new Error('Cannot click on element with index 0. If there are no interactive elements use scroll(), wait(), refresh(), etc. to troubleshoot');
      }

      // Look up the node from the selector map
      const node = await browserSession.getElementByIndex(params.index);
      if (node === null) {
        throw new Error(`Element index ${params.index} not found in DOM`);
      }

      const event = browserSession.eventBus.dispatch(new ClickElementEvent({
        node,
        whileHoldingCtrl: params.whileHoldingCtrl ?? false,
      }));
      await event;
      
      // Wait for handler to complete and get any exception or metadata
      const clickMetadata = await event.eventResult();
      const memory = `Clicked element with index ${params.index}`;
      const msg = `🖱️ ${memory}`;
      console.log(msg);

      return new ActionResult({
        extractedContent: memory,
        includeInMemory: true,
        longTermMemory: memory,
        metadata: typeof clickMetadata === 'object' ? clickMetadata : undefined,
      });
    } catch (e) {
      console.error(`Failed to execute ClickElementEvent: ${(e as Error).constructor.name}: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      const errorMsg = `Failed to click element ${params.index}: ${cleanMsg}`;

      // If it's a select dropdown error, automatically get the dropdown options
      if (e instanceof Error && e.message.includes('dropdown')) {
        try {
          // TODO: Implement dropdown options fallback after implementing getDropdownOptions
          console.log('Dropdown detected but getDropdownOptions not yet implemented');
        } catch (dropdownError) {
          console.error(
            `Failed to get dropdown options as shortcut during click_element_by_index on dropdown: ${(dropdownError as Error).constructor.name}: ${dropdownError}`
          );
        }
      }

      return new ActionResult({ error: errorMsg });
    }
  }

  private registerInputTextAction() {
    const actionFunction = async (
      params: z.infer<typeof InputTextActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      const hasSensitiveData = specialParams.hasSensitiveData as boolean;
      return this.inputText(params, { browserSession, hasSensitiveData });
    };

    this.registry.actions['inputText'] = {
      name: 'inputText',
      description: 'Click and input text into a input interactive element. Only input text into indices that are inside your current browser_state. Never input text into indices that are not inside your current browser_state.',
      function: actionFunction,
      paramSchema: InputTextActionSchema,
    };
  }

  private async inputText(
    params: z.infer<typeof InputTextActionSchema>,
    { browserSession, hasSensitiveData = false }: { browserSession: BrowserSession; hasSensitiveData?: boolean }
  ): Promise<ActionResult> {
    try {
      // Look up the node from the selector map
      const node = await browserSession.getElementByIndex(params.index);
      if (node === null) {
        throw new Error(`Element index ${params.index} not found in DOM`);
      }

      // Dispatch type text event with node
      const event = browserSession.eventBus.dispatch(new TypeTextEvent({
        node,
        text: params.text,
        clearExisting: params.clearExisting ?? true,
      }));
      await event;
      
      const inputMetadata = await event.eventResult();
      const msg = `Input '${params.text}' into element ${params.index}.`;
      console.log(msg);

      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
        longTermMemory: `Input '${params.text}' into element ${params.index}.`,
        metadata: typeof inputMetadata === 'object' ? inputMetadata : undefined,
      });
    } catch (e) {
      // Log the full error for debugging
      console.error(`Failed to dispatch TypeTextEvent: ${(e as Error).constructor.name}: ${e}`);
      const errorMsg = `Failed to input text into element ${params.index}: ${e}`;
      return new ActionResult({ error: errorMsg });
    }
  }

  private registerUploadFileAction() {
    const actionFunction = async (
      params: z.infer<typeof UploadFileActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      const availableFilePaths = (specialParams.availableFilePaths as string[]) || [];
      const fileSystem = specialParams.fileSystem as FileSystem | undefined;
      return this.uploadFile(params, { browserSession, availableFilePaths, fileSystem });
    };

    this.registry.actions['uploadFile'] = {
      name: 'uploadFile',
      description: 'Upload file to interactive element with file path',
      function: actionFunction,
      paramSchema: UploadFileActionSchema,
    };
  }

  private async uploadFile(
    params: z.infer<typeof UploadFileActionSchema>,
    { 
      browserSession, 
      availableFilePaths = [], 
      fileSystem 
    }: { 
      browserSession: BrowserSession; 
      availableFilePaths?: string[]; 
      fileSystem?: FileSystem;
    }
  ): Promise<ActionResult> {
    try {
      // Basic file path validation (simplified version)
      if (!availableFilePaths.includes(params.path)) {
        // Check if it's a downloaded file
        const downloadedFiles = await browserSession.getDownloadedFiles();
        if (!downloadedFiles.includes(params.path)) {
          // TODO: Add FileSystem integration when implemented
          if (fileSystem) {
            console.log('FileSystem integration needed for complete upload file functionality');
          }
          throw new Error(
            `File path ${params.path} is not available. Must be in available_file_paths or downloaded_files.`
          );
        }
      }

      // Check if file exists (basic Node.js fs check)
      const fs = await import('fs');
      if (!fs.existsSync(params.path)) {
        throw new Error(`File ${params.path} does not exist`);
      }

      // Get the element from the selector map
      const node = await browserSession.getElementByIndex(params.index);
      if (node === null) {
        throw new Error(`Element with index ${params.index} not found in DOM`);
      }

      // TODO: Implement sophisticated file input finding logic from Python version
      // For now, assume the element is the file input or dispatch to let the event handler figure it out

      // Dispatch upload file event
      const event = browserSession.eventBus.dispatch(new UploadFileEvent({
        node,
        filePath: params.path,
      }));
      await event;
      await event.eventResult();
      
      const msg = `Successfully uploaded file to index ${params.index}`;
      console.log(`📁 ${msg}`);
      
      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
        longTermMemory: `Uploaded file ${params.path} to element ${params.index}`,
      });
    } catch (e) {
      console.error(`Failed to upload file: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      return new ActionResult({ error: `Failed to upload file: ${cleanMsg}` });
    }
  }

  private registerSwitchTabAction() {
    const actionFunction = async (
      params: z.infer<typeof SwitchTabActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.switchTab(params, { browserSession });
    };

    this.registry.actions['switchTab'] = {
      name: 'switchTab',
      description: 'Switch tab',
      function: actionFunction,
      paramSchema: SwitchTabActionSchema,
    };
  }

  private async switchTab(
    params: z.infer<typeof SwitchTabActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      let targetId: string;
      
      if (params.tabId !== undefined) {
        targetId = await browserSession.getTargetIdFromTabId(params.tabId);
      } else if (params.url !== undefined) {
        targetId = await browserSession.getTargetIdFromUrl(params.url);
      } else {
        targetId = await browserSession.getMostRecentlyOpenedTargetId();
      }

      const event = browserSession.eventBus.dispatch(new SwitchTabEvent({ targetId }));
      await event;
      const newTargetId = await event.eventResult();
      
      if (!newTargetId) {
        throw new Error('SwitchTabEvent did not return a TargetID for the new tab that was switched to');
      }
      
      const memory = `Switched to Tab with ID ${newTargetId.slice(-4)}`;
      console.log(`🔄 ${memory}`);
      
      return new ActionResult({
        extractedContent: memory,
        includeInMemory: true,
        longTermMemory: memory,
      });
    } catch (e) {
      console.error(`Failed to switch tab: ${(e as Error).constructor.name}: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      return new ActionResult({ 
        error: `Failed to switch to tab ${params.tabId || params.url}: ${cleanMsg}` 
      });
    }
  }

  private registerCloseTabAction() {
    const actionFunction = async (
      params: z.infer<typeof CloseTabActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.closeTab(params, { browserSession });
    };

    this.registry.actions['closeTab'] = {
      name: 'closeTab',
      description: 'Close an existing tab',
      function: actionFunction,
      paramSchema: CloseTabActionSchema,
    };
  }

  private async closeTab(
    params: z.infer<typeof CloseTabActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      const targetId = await browserSession.getTargetIdFromTabId(params.tabId);
      
      // Get tab URL for display purposes before closing
      const cdpSession = await browserSession.getOrCreateCdpSession();
      const targetInfo = await cdpSession.cdpClient.send.Target.getTargetInfo({
        targetId: targetId
      }, cdpSession.sessionId);
      const tabUrl = targetInfo.targetInfo.url;

      const event = browserSession.eventBus.dispatch(new CloseTabEvent({ targetId }));
      await event;
      await event.eventResult();
      
      // Helper function for pretty URL display (simplified version)
      const prettyUrl = (url: string) => {
        try {
          const urlObj = new URL(url);
          return urlObj.hostname + urlObj.pathname;
        } catch {
          return url;
        }
      };
      
      const memory = `Closed tab # ${params.tabId} (${prettyUrl(tabUrl)})`;
      console.log(`🗑️ ${memory}`);
      
      return new ActionResult({
        extractedContent: memory,
        includeInMemory: true,
        longTermMemory: memory,
      });
    } catch (e) {
      console.error(`Failed to close tab: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      return new ActionResult({ error: `Failed to close tab ${params.tabId}: ${cleanMsg}` });
    }
  }

  private registerExtractStructuredDataAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Extract structured data action not yet implemented' });
    };
    this.registry.actions['extractStructuredData'] = {
      name: 'extractStructuredData',
      description: 'Extract structured data from page (not yet implemented)',
      function: actionFunction,
      paramSchema: z.object({ query: z.string(), extractLinks: z.boolean().default(false) }),
    };
  }

  private registerScrollAction() {
    const actionFunction = async (
      params: z.infer<typeof ScrollActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.scroll(params, { browserSession });
    };

    this.registry.actions['scroll'] = {
      name: 'scroll',
      description: 'Scroll the page by specified number of pages (set down=True to scroll down, down=False to scroll up, num_pages=number of pages to scroll like 0.5 for half page, 1.0 for one page, etc.). Optional index parameter to scroll within a specific element or its scroll container (works well for dropdowns and custom UI components). Use index=0 or omit index to scroll the entire page.',
      function: actionFunction,
      paramSchema: ScrollActionSchema,
    };
  }

  private async scroll(
    params: z.infer<typeof ScrollActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      // Look up the node from the selector map if index is provided
      // Special case: index 0 means scroll the whole page (root/body element)
      let node: EnhancedDOMTreeNode | null = null;
      if (params.frameElementIndex !== null && params.frameElementIndex !== undefined && params.frameElementIndex !== 0) {
        try {
          node = await browserSession.getElementByIndex(params.frameElementIndex);
          if (node === null) {
            // Element not found - return error
            throw new Error(`Element index ${params.frameElementIndex} not found in DOM`);
          }
        } catch (e) {
          // Error getting element - return error
          throw new Error(`Failed to get element ${params.frameElementIndex}: ${e}`);
        }
      }

      // Dispatch scroll event with node - the complex logic is handled in the event handler
      // Convert pages to pixels (assuming 800px per page as standard viewport height)
      const pixels = Math.round(params.numPages * 800);
      const event = browserSession.eventBus.dispatch(new ScrollEvent({
        direction: params.down ? 'down' : 'up',
        amount: pixels,
        node: node ?? undefined,
      }));
      await event;
      await event.eventResult();
      
      const direction = params.down ? 'down' : 'up';

      // If index is 0 or null/undefined, we're scrolling the page
      const target = (params.frameElementIndex === null || params.frameElementIndex === undefined || params.frameElementIndex === 0) 
        ? 'the page'
        : `element ${params.frameElementIndex}`;

      let longTermMemory: string;
      if (params.numPages === 1.0) {
        longTermMemory = `Scrolled ${direction} ${target} by one page`;
      } else {
        longTermMemory = `Scrolled ${direction} ${target} by ${params.numPages} pages`;
      }

      const msg = `🔍 ${longTermMemory}`;
      console.log(msg);
      
      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
        longTermMemory: longTermMemory,
      });
    } catch (e) {
      console.error(`Failed to dispatch ScrollEvent: ${(e as Error).constructor.name}: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      const errorMsg = `Failed to scroll: ${cleanMsg}`;
      return new ActionResult({ error: errorMsg });
    }
  }

  private registerSendKeysAction() {
    const actionFunction = async (
      params: z.infer<typeof SendKeysActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.sendKeys(params, { browserSession });
    };

    this.registry.actions['sendKeys'] = {
      name: 'sendKeys',
      description: 'Send strings of special keys to use Playwright page.keyboard.press - examples include Escape, Backspace, Insert, PageDown, Delete, Enter, or Shortcuts such as `Control+o`, `Control+Shift+T`',
      function: actionFunction,
      paramSchema: SendKeysActionSchema,
    };
  }

  private async sendKeys(
    params: z.infer<typeof SendKeysActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      const event = browserSession.eventBus.dispatch(new SendKeysEvent({ keys: params.keys }));
      await event;
      await event.eventResult();
      
      const memory = `Sent keys: ${params.keys}`;
      const msg = `⌨️ ${memory}`;
      console.log(msg);
      
      return new ActionResult({
        extractedContent: memory,
        includeInMemory: true,
        longTermMemory: memory,
      });
    } catch (e) {
      console.error(`Failed to dispatch SendKeysEvent: ${(e as Error).constructor.name}: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      const errorMsg = `Failed to send keys: ${cleanMsg}`;
      return new ActionResult({ error: errorMsg });
    }
  }

  private registerScrollToTextAction() {
    const actionFunction = async (
      params: { text: string },
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.scrollToText(params, { browserSession });
    };

    this.registry.actions['scrollToText'] = {
      name: 'scrollToText',
      description: 'Scroll to a text in the current page',
      function: actionFunction,
      paramSchema: z.object({ text: z.string() }),
    };
  }

  private async scrollToText(
    params: { text: string },
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      // Dispatch scroll to text event
      const event = browserSession.eventBus.dispatch(new ScrollToTextEvent({ text: params.text }));
      await event;
      
      // The handler returns None on success or raises an exception if text not found
      await event.eventResult();
      
      const memory = `Scrolled to text: ${params.text}`;
      const msg = `🔍 ${memory}`;
      console.log(msg);
      
      return new ActionResult({
        extractedContent: memory,
        includeInMemory: true,
        longTermMemory: memory,
      });
    } catch (e) {
      // Text not found
      const msg = `Text '${params.text}' not found or not visible on page`;
      console.log(msg);
      
      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
        longTermMemory: `Tried scrolling to text '${params.text}' but it was not found`,
      });
    }
  }

  private registerGetDropdownOptionsAction() {
    const actionFunction = async (
      params: z.infer<typeof GetDropdownOptionsActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.getDropdownOptions(params, { browserSession });
    };

    this.registry.actions['getDropdownOptions'] = {
      name: 'getDropdownOptions',
      description: 'Get list of option values exposed by a specific dropdown input field. Only works on dropdown-style form elements (<select>, Semantic UI/aria-labeled select, etc.).',
      function: actionFunction,
      paramSchema: GetDropdownOptionsActionSchema,
    };
  }

  private async getDropdownOptions(
    params: z.infer<typeof GetDropdownOptionsActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      // Look up the node from the selector map
      const node = await browserSession.getElementByIndex(params.index);
      if (node === null) {
        throw new Error(`Element index ${params.index} not found in DOM`);
      }

      // Dispatch GetDropdownOptionsEvent to the event handler
      const event = browserSession.eventBus.dispatch(new GetDropdownOptionsEvent({ node }));
      const dropdownData = await event.eventResult();

      if (!dropdownData) {
        throw new Error('Failed to get dropdown options - no data returned');
      }

      // Extract the message from the returned data
      const msg = dropdownData.message || '';
      const optionsStr = dropdownData.options || '[]';
      let optionsCount = 0;
      
      try {
        const options = JSON.parse(optionsStr);
        optionsCount = Array.isArray(options) ? options.length : 0;
      } catch {
        // If parsing fails, estimate from string length
        optionsCount = (optionsStr.match(/"/g) || []).length / 2;
      }

      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
        longTermMemory: `Found ${optionsCount} dropdown options for index ${params.index}`,
        includeExtractedContentOnlyOnce: true,
      });
    } catch (e) {
      console.error(`Failed to get dropdown options: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      return new ActionResult({ error: `Failed to get dropdown options for element ${params.index}: ${cleanMsg}` });
    }
  }

  private registerSelectDropdownOptionAction() {
    const actionFunction = async (
      params: z.infer<typeof SelectDropdownOptionActionSchema>,
      specialParams: Record<string, any>
    ): Promise<ActionResult> => {
      const browserSession = specialParams.browserSession as BrowserSession;
      return this.selectDropdownOption(params, { browserSession });
    };

    this.registry.actions['selectDropdownOption'] = {
      name: 'selectDropdownOption',
      description: 'Select dropdown option by exact text from any dropdown type (native <select>, ARIA menus, or custom dropdowns). Searches target element and children to find selectable options.',
      function: actionFunction,
      paramSchema: SelectDropdownOptionActionSchema,
    };
  }

  private async selectDropdownOption(
    params: z.infer<typeof SelectDropdownOptionActionSchema>,
    { browserSession }: { browserSession: BrowserSession }
  ): Promise<ActionResult> {
    try {
      // Look up the node from the selector map
      const node = await browserSession.getElementByIndex(params.index);
      if (node === null) {
        throw new Error(`Element index ${params.index} not found in DOM`);
      }

      // Dispatch SelectDropdownOptionEvent to the event handler
      const event = browserSession.eventBus.dispatch(new SelectDropdownOptionEvent({
        node,
        text: params.text,
      }));
      const selectionData = await event.eventResult();

      if (!selectionData) {
        throw new Error('Failed to select dropdown option - no data returned');
      }

      // Extract the message from the returned data
      const msg = selectionData.message || `Selected option: ${params.text}`;

      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
        longTermMemory: `Selected dropdown option '${params.text}' at index ${params.index}`,
      });
    } catch (e) {
      console.error(`Failed to select dropdown option: ${e}`);
      const cleanMsg = extractLlmErrorMessage(e as Error);
      return new ActionResult({ 
        error: `Failed to select dropdown option '${params.text}' for element ${params.index}: ${cleanMsg}` 
      });
    }
  }

  private registerWriteFileAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Write file action not yet implemented' });
    };
    this.registry.actions['writeFile'] = {
      name: 'writeFile',
      description: 'Write file to filesystem (not yet implemented)',
      function: actionFunction,
      paramSchema: z.object({ fileName: z.string(), content: z.string(), append: z.boolean().default(false) }),
    };
  }

  private registerReplaceFileStrAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Replace file string action not yet implemented' });
    };
    this.registry.actions['replaceFileStr'] = {
      name: 'replaceFileStr',
      description: 'Replace string in file (not yet implemented)',
      function: actionFunction,
      paramSchema: z.object({ fileName: z.string(), oldStr: z.string(), newStr: z.string() }),
    };
  }

  private registerReadFileAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Read file action not yet implemented' });
    };
    this.registry.actions['readFile'] = {
      name: 'readFile',
      description: 'Read file from filesystem (not yet implemented)',
      function: actionFunction,
      paramSchema: z.object({ fileName: z.string() }),
    };
  }

  private registerDoneAction(outputModel?: z.ZodType<any>) {
    if (outputModel) {
      const schema = StructuredOutputActionSchema(outputModel);
      const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
        const outputDict = params.data;
        
        // Convert enums to strings
        for (const [key, value] of Object.entries(outputDict)) {
          if (typeof value === 'object' && value !== null && 'value' in value) {
            outputDict[key] = (value as any).value;
          }
        }

        return new ActionResult({
          isDone: true,
          success: params.success,
          extractedContent: JSON.stringify(outputDict),
          longTermMemory: `Task completed. Success Status: ${params.success}`,
        });
      };

      this.registry.actions['done'] = {
        name: 'done',
        description: 'Complete task - with return text and if the task is finished (success=True) or not yet completely finished (success=False), because last step is reached',
        function: actionFunction,
        paramSchema: schema,
      };
    } else {
      const actionFunction = async (
        params: z.infer<typeof DoneActionSchema>,
        specialParams: Record<string, any>
      ): Promise<ActionResult> => {
        const fileSystem = specialParams.fileSystem as FileSystem;
        let userMessage = params.text;
        
        const lenText = params.text.length;
        const lenMaxMemory = 100;
        let memory = `Task completed: ${params.success} - ${params.text.substring(0, lenMaxMemory)}`;
        if (lenText > lenMaxMemory) {
          memory += ` - ${lenText - lenMaxMemory} more characters`;
        }

        const attachments: string[] = [];
        if (params.filesToDisplay) {
          if (this.displayFilesInDoneText) {
            let fileMsg = '';
            for (const fileName of params.filesToDisplay) {
              if (fileName === 'todo.md') {
                continue;
              }
              const fileContent = fileSystem.displayFile(fileName);
              if (fileContent) {
                fileMsg += `\n\n${fileName}:\n${fileContent}`;
                attachments.push(fileName);
              }
            }
            if (fileMsg) {
              userMessage += '\n\nAttachments:';
              userMessage += fileMsg;
            } else {
              console.warn('Agent wanted to display files but none were found');
            }
          } else {
            for (const fileName of params.filesToDisplay) {
              if (fileName === 'todo.md') {
                continue;
              }
              const fileContent = fileSystem.displayFile(fileName);
              if (fileContent) {
                attachments.push(fileName);
              }
            }
          }
        }

        const fullAttachmentPaths = attachments.map(fileName => 
          `${fileSystem.getDir()}/${fileName}`
        );

        return new ActionResult({
          isDone: true,
          success: params.success,
          extractedContent: userMessage,
          longTermMemory: memory,
          attachments: fullAttachmentPaths,
        });
      };

      this.registry.actions['done'] = {
        name: 'done',
        description: 'Complete task - provide a summary of results for the user. Set success=True if task completed successfully, false otherwise. Text should be your response to the user summarizing results. Include files you would like to display to the user in files_to_display.',
        function: actionFunction,
        paramSchema: DoneActionSchema,
      };
    }
  }

  public useStructuredOutputAction(outputModel: z.ZodType<any>) {
    this.registerDoneAction(outputModel);
  }

  // Registry access methods
  public action(description: string, options: Parameters<Registry<Context>['action']>[1] = {}) {
    return this.registry.action(description, options);
  }

  public async act(
    action: any, // ActionModel - will be properly typed later
    browserSession: BrowserSession,
    options: {
      pageExtractionLlm?: BaseChatModel;
      sensitiveData?: Record<string, string | Record<string, string>>;
      availableFilePaths?: string[];
      fileSystem?: FileSystem;
      context?: Context;
    } = {}
  ): Promise<ActionResult> {
    const {
      pageExtractionLlm,
      sensitiveData,
      availableFilePaths,
      fileSystem,
      context,
    } = options;

    // Find which action is being called
    for (const [actionName, params] of Object.entries(action)) {
      if (params !== null && params !== undefined) {
        try {
          const result = await this.registry.executeAction(actionName, params as Record<string, any>, {
            browserSession,
            pageExtractionLlm,
            fileSystem,
            sensitiveData,
            availableFilePaths,
            context,
          });

          if (typeof result === 'string') {
            return new ActionResult({ extractedContent: result });
          } else if (result instanceof ActionResult) {
            return result;
          } else if (result === null || result === undefined) {
            return new ActionResult();
          } else {
            throw new Error(`Invalid action result type: ${typeof result} of ${result}`);
          }
        } catch (error) {
          console.error(`Action '${actionName}' failed`);
          const cleanMsg = extractLlmErrorMessage(error as Error);
          return new ActionResult({ error: cleanMsg });
        }
      }
    }
    
    return new ActionResult();
  }
}