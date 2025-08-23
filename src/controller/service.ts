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
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Click element action not yet implemented' });
    };
    this.registry.actions['clickElement'] = {
      name: 'clickElement',
      description: 'Click element by index (not yet implemented)',
      function: actionFunction,
      paramSchema: ClickElementActionSchema,
    };
  }

  private registerInputTextAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Input text action not yet implemented' });
    };
    this.registry.actions['inputText'] = {
      name: 'inputText',
      description: 'Input text into element (not yet implemented)',
      function: actionFunction,
      paramSchema: InputTextActionSchema,
    };
  }

  private registerUploadFileAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Upload file action not yet implemented' });
    };
    this.registry.actions['uploadFile'] = {
      name: 'uploadFile',
      description: 'Upload file to element (not yet implemented)',
      function: actionFunction,
      paramSchema: UploadFileActionSchema,
    };
  }

  private registerSwitchTabAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Switch tab action not yet implemented' });
    };
    this.registry.actions['switchTab'] = {
      name: 'switchTab',
      description: 'Switch to different tab (not yet implemented)',
      function: actionFunction,
      paramSchema: SwitchTabActionSchema,
    };
  }

  private registerCloseTabAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Close tab action not yet implemented' });
    };
    this.registry.actions['closeTab'] = {
      name: 'closeTab',
      description: 'Close tab (not yet implemented)',
      function: actionFunction,
      paramSchema: CloseTabActionSchema,
    };
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
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Scroll action not yet implemented' });
    };
    this.registry.actions['scroll'] = {
      name: 'scroll',
      description: 'Scroll page (not yet implemented)',
      function: actionFunction,
      paramSchema: ScrollActionSchema,
    };
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
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Scroll to text action not yet implemented' });
    };
    this.registry.actions['scrollToText'] = {
      name: 'scrollToText',
      description: 'Scroll to specific text (not yet implemented)',
      function: actionFunction,
      paramSchema: z.object({ text: z.string() }),
    };
  }

  private registerGetDropdownOptionsAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Get dropdown options action not yet implemented' });
    };
    this.registry.actions['getDropdownOptions'] = {
      name: 'getDropdownOptions',
      description: 'Get dropdown options (not yet implemented)',
      function: actionFunction,
      paramSchema: GetDropdownOptionsActionSchema,
    };
  }

  private registerSelectDropdownOptionAction() {
    const actionFunction = async (params: any, specialParams: Record<string, any>): Promise<ActionResult> => {
      return new ActionResult({ error: 'Select dropdown option action not yet implemented' });
    };
    this.registry.actions['selectDropdownOption'] = {
      name: 'selectDropdownOption',
      description: 'Select dropdown option (not yet implemented)',
      function: actionFunction,
      paramSchema: SelectDropdownOptionActionSchema,
    };
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