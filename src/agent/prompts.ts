import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { 
  SystemMessage, 
  UserMessage, 
  ContentPartTextParam, 
  ContentPartImageParam, 
  ImageURL,
  createUserMessage,
  createSystemMessage,
  createContentPartText,
  createContentPartImage,
  createImageURL
} from '../llm/messages';
import type { 
  AgentStepInfo 
} from './views';
import type { BrowserStateSummary } from '../browser/views';
import type { FileSystem } from '../filesystem/index';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SystemPromptConfig {
  actionDescription: string;
  maxActionsPerStep?: number;
  overrideSystemMessage?: string;
  extendSystemMessage?: string;
  useThinking?: boolean;
  flashMode?: boolean;
}

export class SystemPrompt {
  private defaultActionDescription: string;
  private maxActionsPerStep: number;
  private useThinking: boolean;
  private flashMode: boolean;
  private promptTemplate!: string;
  private systemMessage: SystemMessage;

  constructor(config: SystemPromptConfig) {
    this.defaultActionDescription = config.actionDescription;
    this.maxActionsPerStep = config.maxActionsPerStep ?? 10;
    this.useThinking = config.useThinking ?? true;
    this.flashMode = config.flashMode ?? false;

    let prompt = '';
    if (config.overrideSystemMessage) {
      prompt = config.overrideSystemMessage;
    } else {
      this.loadPromptTemplate();
      prompt = this.promptTemplate.replace('{max_actions}', this.maxActionsPerStep.toString());
    }

    if (config.extendSystemMessage) {
      prompt += `\n${config.extendSystemMessage}`;
    }

    this.systemMessage = createSystemMessage(prompt, {
      cache: true
    });
  }

  private loadPromptTemplate(): void {
    try {
      // Choose the appropriate template based on flash_mode and use_thinking settings
      let templateFilename: string;
      if (this.flashMode) {
        templateFilename = 'system_prompt_flash.md';
      } else if (this.useThinking) {
        templateFilename = 'system_prompt.md';
      } else {
        templateFilename = 'system_prompt_no_thinking.md';
      }

      const templatePath = join(__dirname, templateFilename);
      this.promptTemplate = readFileSync(templatePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load system prompt template: ${error}`);
    }
  }

  public getSystemMessage(): SystemMessage {
    return this.systemMessage;
  }
}

export interface AgentMessagePromptConfig {
  browserStateSummary: BrowserStateSummary;
  fileSystem: FileSystem | null;
  agentHistoryDescription?: string;
  readStateDescription?: string;
  task?: string;
  includeAttributes?: string[];
  stepInfo?: AgentStepInfo;
  pageFilteredActions?: string;
  maxClickableElementsLength?: number;
  sensitiveData?: string;
  availableFilePaths?: string[];
  screenshots?: string[];
  visionDetailLevel?: 'auto' | 'low' | 'high';
  includeRecentEvents?: boolean;
}

export class AgentMessagePrompt {
  private browserState: BrowserStateSummary;
  private fileSystem: FileSystem | null;
  private agentHistoryDescription: string | null;
  private readStateDescription: string | null;
  private task: string | null;
  private includeAttributes?: string[];
  private stepInfo?: AgentStepInfo;
  private pageFilteredActions: string | null;
  private maxClickableElementsLength: number;
  private sensitiveData: string | null;
  private availableFilePaths: string[];
  private screenshots: string[];
  public visionDetailLevel: 'auto' | 'low' | 'high';
  private includeRecentEvents: boolean;

  constructor(config: AgentMessagePromptConfig) {
    this.browserState = config.browserStateSummary;
    this.fileSystem = config.fileSystem;
    this.agentHistoryDescription = config.agentHistoryDescription ?? null;
    this.readStateDescription = config.readStateDescription ?? null;
    this.task = config.task ?? null;
    this.includeAttributes = config.includeAttributes;
    this.stepInfo = config.stepInfo;
    this.pageFilteredActions = config.pageFilteredActions ?? null;
    this.maxClickableElementsLength = config.maxClickableElementsLength ?? 40000;
    this.sensitiveData = config.sensitiveData ?? null;
    this.availableFilePaths = config.availableFilePaths ?? [];
    this.screenshots = config.screenshots ?? [];
    this.visionDetailLevel = config.visionDetailLevel ?? 'auto';
    this.includeRecentEvents = config.includeRecentEvents ?? false;

    if (!this.browserState) {
      throw new Error('browserState is required');
    }
  }

  private getBrowserStateDescription(): string {
    const elementsText = this.browserState.dom_state.llmRepresentation(
      this.includeAttributes
    );

    let truncatedElements: string;
    let truncatedText = '';
    
    if (elementsText.length > this.maxClickableElementsLength) {
      truncatedElements = elementsText.substring(0, this.maxClickableElementsLength);
      truncatedText = ` (truncated to ${this.maxClickableElementsLength} characters)`;
    } else {
      truncatedElements = elementsText;
    }

    const pixelsAbove = this.browserState.page_info?.scroll_y ?? 0;
    const pixelsBelow = Math.max(0, (this.browserState.page_info?.page_height ?? 0) - (this.browserState.page_info?.scroll_y ?? 0) - (this.browserState.page_info?.viewport_height ?? 0));
    const hasContentAbove = pixelsAbove > 0;
    const hasContentBelow = pixelsBelow > 0;

    // Enhanced page information for the model
    let pageInfoText = '';
    if (this.browserState.page_info) {
      const pi = this.browserState.page_info;
      // Compute page statistics dynamically  
      const pagesAbove = pi.viewport_height > 0 ? pi.scroll_y / pi.viewport_height : 0;
      const pagesBelow = pi.viewport_height > 0 ? (pi.page_height - pi.scroll_y - pi.viewport_height) / pi.viewport_height : 0;
      const totalPages = pi.viewport_height > 0 ? pi.page_height / pi.viewport_height : 0;
      const currentPagePosition = Math.max(pi.page_height - pi.viewport_height, 1) > 0 
        ? pi.scroll_y / Math.max(pi.page_height - pi.viewport_height, 1) 
        : 0;
      pageInfoText = `Page info: ${pi.viewport_width}x${pi.viewport_height}px viewport, ${pi.page_width}x${pi.page_height}px total page size, ${pagesAbove.toFixed(1)} pages above, ${pagesBelow.toFixed(1)} pages below, ${totalPages.toFixed(1)} total pages, at ${Math.round(currentPagePosition * 100)}% of page`;
    }

    let finalElementsText: string;
    if (truncatedElements !== '') {
      if (hasContentAbove) {
        if (this.browserState.page_info) {
          const pi = this.browserState.page_info;
          const pagesAbove = pi.viewport_height > 0 ? pi.scroll_y / pi.viewport_height : 0;
          finalElementsText = `... ${pixelsAbove} pixels above (${pagesAbove.toFixed(1)} pages) - scroll to see more or extract structured data if you are looking for specific information ...\n${truncatedElements}`;
        } else {
          finalElementsText = `... ${pixelsAbove} pixels above - scroll to see more or extract structured data if you are looking for specific information ...\n${truncatedElements}`;
        }
      } else {
        finalElementsText = `[Start of page]\n${truncatedElements}`;
      }
      
      if (hasContentBelow) {
        if (this.browserState.page_info) {
          const pi = this.browserState.page_info;
          const pagesBelow = pi.viewport_height > 0 ? pixelsBelow / pi.viewport_height : 0;
          finalElementsText = `${finalElementsText}\n... ${pixelsBelow} pixels below (${pagesBelow.toFixed(1)} pages) - scroll to see more or extract structured data if you are looking for specific information ...`;
        } else {
          finalElementsText = `${finalElementsText}\n... ${pixelsBelow} pixels below - scroll to see more or extract structured data if you are looking for specific information ...`;
        }
      } else {
        finalElementsText = `${finalElementsText}\n[End of page]`;
      }
    } else {
      finalElementsText = 'empty page';
    }

    let tabsText = '';
    const currentTabCandidates: string[] = [];

    // Find tabs that match both URL and title to identify current tab more reliably
    for (const tab of this.browserState.tabs) {
      if (tab.url === this.browserState.url && tab.title === this.browserState.title) {
        currentTabCandidates.push(tab.target_id);
      }
    }

    // If we have exactly one match, mark it as current
    // Otherwise, don't mark any tab as current to avoid confusion
    const currentTargetId = currentTabCandidates.length === 1 ? currentTabCandidates[0] : null;

    for (const tab of this.browserState.tabs) {
      tabsText += `Tab ${tab.target_id.slice(-4)}: ${tab.url} - ${tab.title.substring(0, 30)}\n`;
    }

    const currentTabText = currentTargetId !== null ? `Current tab: ${currentTargetId.slice(-4)}` : '';

    // Check if current page is a PDF viewer and add appropriate message
    let pdfMessage = '';
    if (this.browserState.isPdfViewer) {
      pdfMessage = 'PDF viewer cannot be rendered. In this page, DO NOT use the extract_structured_data action as PDF content cannot be rendered. Use the read_file action on the downloaded PDF in available_file_paths to read the full content.\n\n';
    }

    // Add recent events if available and requested
    let recentEventsText = '';
    if (this.includeRecentEvents && this.browserState.recent_events) {
      recentEventsText = `Recent browser events: ${this.browserState.recent_events}\n`;
    }

    const browserState = `${currentTabText}
Available tabs:
${tabsText}
${pageInfoText}
${recentEventsText}${pdfMessage}Interactive elements from top layer of the current page inside the viewport${truncatedText}:
${finalElementsText}
`;
    return browserState;
  }

  private getAgentStateDescription(): string {
    let stepInfoDescription = '';
    if (this.stepInfo) {
      stepInfoDescription = `Step ${this.stepInfo.step_number + 1} of ${this.stepInfo.max_steps} max possible steps\n`;
    }
    const timeStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    stepInfoDescription += `Current date and time: ${timeStr}`;

    const todoContents = this.fileSystem?.getTodoContents() ?? '';
    const finalTodoContents = todoContents.length > 0 
      ? todoContents 
      : '[Current todo.md is empty, fill it with your plan when applicable]';

    let agentState = `
<user_request>
${this.task}
</user_request>
<file_system>
${this.fileSystem?.describe() ?? 'No file system available'}
</file_system>
<todo_contents>
${finalTodoContents}
</todo_contents>`;

    if (this.sensitiveData) {
      agentState += `<sensitive_data>\n${this.sensitiveData}\n</sensitive_data>\n`;
    }

    agentState += `<step_info>\n${stepInfoDescription}\n</step_info>\n`;
    
    if (this.availableFilePaths.length > 0) {
      const availableFilePathsText = this.availableFilePaths.join('\n');
      agentState += `<available_file_paths>\n${availableFilePathsText}\nUse absolute full paths when referencing these files.\n</available_file_paths>\n`;
    }
    
    return agentState;
  }

  private isNewTabPage(url: string): boolean {
    return url === 'about:blank' || url === 'chrome://newtab/' || url === 'edge://newtab/';
  }

  public getUserMessage(useVision: boolean = true): UserMessage {
    // Don't pass screenshot to model if page is a new tab page, step is 0, and there's only one tab
    if (
      this.isNewTabPage(this.browserState.url) &&
      this.stepInfo !== undefined &&
      this.stepInfo.step_number === 0 &&
      this.browserState.tabs.length === 1
    ) {
      useVision = false;
    }

    // Build complete state description
    let stateDescription = '<agent_history>\n';
    if (this.agentHistoryDescription) {
      stateDescription += this.agentHistoryDescription.replace(/\n$/, '');
    }
    stateDescription += '\n</agent_history>\n';

    stateDescription += '<agent_state>\n' + this.getAgentStateDescription().replace(/\n$/, '') + '\n</agent_state>\n';
    stateDescription += '<browser_state>\n' + this.getBrowserStateDescription().replace(/\n$/, '') + '\n</browser_state>\n';
    
    // Only add read_state if it has content
    const readStateDescription = this.readStateDescription?.replace(/\n$/, '').trim() ?? '';
    if (readStateDescription) {
      stateDescription += '<read_state>\n' + readStateDescription + '\n</read_state>\n';
    }

    if (this.pageFilteredActions) {
      stateDescription += '<page_specific_actions>\n';
      stateDescription += this.pageFilteredActions + '\n';
      stateDescription += '</page_specific_actions>\n';
    }

    if (useVision && this.screenshots.length > 0) {
      // Start with text description
      const contentParts: (ContentPartTextParam | ContentPartImageParam)[] = [
        createContentPartText(stateDescription)
      ];

      // Add screenshots with labels
      for (let i = 0; i < this.screenshots.length; i++) {
        const screenshot = this.screenshots[i];
        let label: string;
        if (i === this.screenshots.length - 1) {
          label = 'Current screenshot:';
        } else {
          // Use simple, accurate labeling since we don't have actual step timing info
          label = 'Previous screenshot:';
        }

        // Add label as text content
        contentParts.push(createContentPartText(label));

        // Add the screenshot
        contentParts.push(
          createContentPartImage(
            `data:image/png;base64,${screenshot}`,
            this.visionDetailLevel,
            'image/png'
          )
        );
      }

      return createUserMessage(contentParts, { cache: true });
    }

    return createUserMessage(stateDescription, { cache: true });
  }
}