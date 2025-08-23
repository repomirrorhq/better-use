/**
 * Message Manager service for browser-use TypeScript
 * 
 * Manages message history, sensitive data filtering, and state message creation
 * for the Agent system.
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import {
  BaseMessage,
  SystemMessage,
  UserMessage,
  createUserMessage,
  createSystemMessage,
  ContentPartTextParam,
} from '../../llm/messages';
import { AgentMessagePrompt } from '../prompts';
import {
  MessageManagerState,
  MessageManagerStateSchema,
  HistoryItem,
  HistoryItemHelper,
  AgentOutput,
  AgentOutputHelper,
  ActionResult,
  AgentStepInfo,
  MessageHistory,
  MessageHistoryHelper,
} from '../views';
import { BrowserStateSummary } from '../../browser/views';
import { matchUrlWithDomainPattern } from '../../utils';

const logger = console; // Simple logger for now

// Vision detail levels
export type VisionDetailLevel = 'auto' | 'low' | 'high';

// Sensitive data types
export type SensitiveData = Record<string, string | Record<string, string>>;

/**
 * Message Manager handles message history and state for the Agent
 */
export class MessageManager {
  public task: string;
  public state: MessageManagerState;
  public systemPrompt: SystemMessage;
  public fileSystem: any; // FileSystem type to be defined later
  public sensitiveDataDescription: string = '';
  public useThinking: boolean;
  public maxHistoryItems: number | null;
  public visionDetailLevel: VisionDetailLevel;
  public includeToolCallExamples: boolean;
  public includeRecentEvents: boolean;
  public includeAttributes: string[];
  public sensitiveData?: SensitiveData;
  public lastInputMessages: BaseMessage[] = [];

  constructor(options: {
    task: string;
    systemMessage: SystemMessage;
    fileSystem: any; // FileSystem type to be defined later
    state?: MessageManagerState;
    useThinking?: boolean;
    includeAttributes?: string[] | null;
    sensitiveData?: SensitiveData | null;
    maxHistoryItems?: number | null;
    visionDetailLevel?: VisionDetailLevel;
    includeToolCallExamples?: boolean;
    includeRecentEvents?: boolean;
  }) {
    this.task = options.task;
    this.state = options.state || MessageManagerStateSchema.parse({});
    this.systemPrompt = options.systemMessage;
    this.fileSystem = options.fileSystem;
    this.useThinking = options.useThinking ?? true;
    this.maxHistoryItems = options.maxHistoryItems ?? null;
    this.visionDetailLevel = options.visionDetailLevel ?? 'auto';
    this.includeToolCallExamples = options.includeToolCallExamples ?? false;
    this.includeRecentEvents = options.includeRecentEvents ?? false;
    this.includeAttributes = options.includeAttributes ?? [];
    this.sensitiveData = options.sensitiveData ?? undefined;

    if (this.maxHistoryItems !== null && this.maxHistoryItems <= 5) {
      throw new Error('maxHistoryItems must be null or greater than 5');
    }

    // Only initialize messages if state is empty
    if (this.getMessages().length === 0) {
      this._setMessageWithType(this.systemPrompt, 'system');
    }
  }

  /**
   * Build agent history description from list of items, respecting max_history_items limit
   */
  get agentHistoryDescription(): string {
    if (this.maxHistoryItems === null) {
      // Include all items
      return this.state.agent_history_items
        .map(item => new HistoryItemHelper(item).toString())
        .join('\n');
    }

    const totalItems = this.state.agent_history_items.length;

    // If we have fewer items than the limit, just return all items
    if (totalItems <= this.maxHistoryItems) {
      return this.state.agent_history_items
        .map(item => new HistoryItemHelper(item).toString())
        .join('\n');
    }

    // We have more items than the limit, so we need to omit some
    const omittedCount = totalItems - this.maxHistoryItems;

    // Show first item + omitted message + most recent (max_history_items - 1) items
    // The omitted message doesn't count against the limit, only real history items do
    const recentItemsCount = this.maxHistoryItems - 1; // -1 for first item

    const itemsToInclude = [
      new HistoryItemHelper(this.state.agent_history_items[0]).toString(), // Keep first item (initialization)
      `<sys>[... ${omittedCount} previous steps omitted...]</sys>`,
    ];

    // Add most recent items
    itemsToInclude.push(
      ...this.state.agent_history_items
        .slice(-recentItemsCount)
        .map(item => new HistoryItemHelper(item).toString())
    );

    return itemsToInclude.join('\n');
  }

  /**
   * Add a new task to the message manager
   */
  addNewTask(newTask: string): void {
    this.task = newTask;
    const taskUpdateItem: HistoryItem = {
      step_number: null,
      evaluation_previous_goal: null,
      memory: null,
      next_goal: null,
      action_results: null,
      error: null,
      system_message: `User updated <user_request> to: ${newTask}`,
    };
    this.state.agent_history_items.push(taskUpdateItem);
  }

  /**
   * Update the agent history description
   */
  private _updateAgentHistoryDescription(
    modelOutput?: AgentOutput | null,
    result?: ActionResult[] | null,
    stepInfo?: AgentStepInfo | null
  ): void {
    if (!result) {
      result = [];
    }
    const stepNumber = stepInfo?.step_number ?? null;

    this.state.read_state_description = '';

    let actionResults = '';
    const resultLen = result.length;
    let readStateIdx = 0;

    for (let idx = 0; idx < result.length; idx++) {
      const actionResult = result[idx];

      if (actionResult.include_extracted_content_only_once && actionResult.extracted_content) {
        this.state.read_state_description += 
          `<read_state_${readStateIdx}>\n${actionResult.extracted_content}\n</read_state_${readStateIdx}>\n`;
        readStateIdx++;
        logger.debug?.(`Added extracted_content to read_state_description: ${actionResult.extracted_content}`);
      }

      if (actionResult.long_term_memory) {
        actionResults += `Action ${idx + 1}/${resultLen}: ${actionResult.long_term_memory}\n`;
        logger.debug?.(`Added long_term_memory to action_results: ${actionResult.long_term_memory}`);
      } else if (actionResult.extracted_content && !actionResult.include_extracted_content_only_once) {
        actionResults += `Action ${idx + 1}/${resultLen}: ${actionResult.extracted_content}\n`;
        logger.debug?.(`Added extracted_content to action_results: ${actionResult.extracted_content}`);
      }

      if (actionResult.error) {
        let errorText: string;
        if (actionResult.error.length > 200) {
          errorText = actionResult.error.slice(0, 100) + '......' + actionResult.error.slice(-100);
        } else {
          errorText = actionResult.error;
        }
        actionResults += `Action ${idx + 1}/${resultLen}: ${errorText}\n`;
        logger.debug?.(`Added error to action_results: ${errorText}`);
      }
    }

    this.state.read_state_description = this.state.read_state_description.replace(/\n+$/, '');

    if (actionResults) {
      actionResults = `Action Results:\n${actionResults}`;
    }
    actionResults = actionResults.replace(/\n+$/, '') || '';

    // Build the history item
    if (!modelOutput) {
      // Only add error history item if we have a valid step number
      if (stepNumber !== null && stepNumber > 0) {
        const historyItem: HistoryItem = {
          step_number: stepNumber,
          evaluation_previous_goal: null,
          memory: null,
          next_goal: null,
          action_results: null,
          error: 'Agent failed to output in the right format.',
          system_message: null,
        };
        this.state.agent_history_items.push(historyItem);
      }
    } else {
      const currentState = new AgentOutputHelper(modelOutput).currentState;
      const historyItem: HistoryItem = {
        step_number: stepNumber,
        evaluation_previous_goal: currentState.evaluation_previous_goal,
        memory: currentState.memory,
        next_goal: currentState.next_goal,
        action_results: actionResults || null,
        error: null,
        system_message: null,
      };
      this.state.agent_history_items.push(historyItem);
    }
  }

  /**
   * Get sensitive data description for the current page
   */
  private _getSensitiveDataDescription(currentPageUrl: string): string {
    const sensitiveData = this.sensitiveData;
    if (!sensitiveData) {
      return '';
    }

    // Collect placeholders for sensitive data
    const placeholders: Set<string> = new Set();

    for (const [key, value] of Object.entries(sensitiveData)) {
      if (typeof value === 'object' && value !== null) {
        // New format: {domain: {key: value}}
        if (matchUrlWithDomainPattern(currentPageUrl, key, true)) {
          Object.keys(value).forEach(k => placeholders.add(k));
        }
      } else {
        // Old format: {key: value}
        placeholders.add(key);
      }
    }

    if (placeholders.size > 0) {
      const placeholderList = Array.from(placeholders).sort();
      let info = `Here are placeholders for sensitive data:\n${JSON.stringify(placeholderList)}\n`;
      info += 'To use them, write <secret>the placeholder name</secret>';
      return info;
    }

    return '';
  }

  /**
   * Create state messages with all content
   */
  async createStateMessages(options: {
    browserStateSummary: BrowserStateSummary;
    modelOutput?: AgentOutput | null;
    result?: ActionResult[] | null;
    stepInfo?: AgentStepInfo | null;
    useVision?: boolean;
    pageFilteredActions?: string | null;
    sensitiveData?: SensitiveData | null;
    availableFilePaths?: string[] | null;
  }): Promise<void> {
    const {
      browserStateSummary,
      modelOutput,
      result,
      stepInfo,
      useVision = true,
      pageFilteredActions,
      sensitiveData,
      availableFilePaths,
    } = options;

    // Clear contextual messages from previous steps to prevent accumulation
    this.state.history.context_messages = [];

    // First, update the agent history items with the latest step results
    this._updateAgentHistoryDescription(modelOutput, result, stepInfo);
    
    if (sensitiveData) {
      this.sensitiveDataDescription = this._getSensitiveDataDescription(browserStateSummary.url);
    }

    // Use only the current screenshot
    const screenshots: string[] = [];
    if (browserStateSummary.screenshot) {
      screenshots.push(browserStateSummary.screenshot);
    }

    // Create single state message with all content using AgentMessagePrompt
    const agentMessagePrompt = new AgentMessagePrompt({
      browserStateSummary,
      fileSystem: this.fileSystem,
      agentHistoryDescription: this.agentHistoryDescription,
      readStateDescription: this.state.read_state_description,
      task: this.task,
      includeAttributes: this.includeAttributes,
      stepInfo: stepInfo || undefined,
      pageFilteredActions: pageFilteredActions || undefined,
      sensitiveData: this.sensitiveDataDescription || undefined,
      availableFilePaths: availableFilePaths || undefined,
      screenshots,
      visionDetailLevel: this.visionDetailLevel,
      includeRecentEvents: this.includeRecentEvents,
    });
    
    const stateMessage = agentMessagePrompt.getUserMessage(useVision);

    // Set the state message with caching enabled
    this._setMessageWithType(stateMessage, 'state');
  }

  // _createAgentMessagePrompt method removed - now using AgentMessagePrompt class directly

  /**
   * Get current message list
   */
  getMessages(): BaseMessage[] {
    // Log message history for debugging (simplified)
    logger.debug?.('Getting message history');
    
    const messageHistory = new MessageHistoryHelper(this.state.history);
    this.lastInputMessages = messageHistory.getMessages();
    return this.lastInputMessages;
  }

  /**
   * Replace a specific state message slot with a new message
   */
  private _setMessageWithType(message: BaseMessage, messageType: 'system' | 'state'): void {
    // Filter out sensitive data from the message
    if (this.sensitiveData) {
      message = this._filterSensitiveData(message);
    }

    if (messageType === 'system') {
      this.state.history.system_message = message;
    } else if (messageType === 'state') {
      this.state.history.state_message = message;
    } else {
      throw new Error(`Invalid state message type: ${messageType}`);
    }
  }

  /**
   * Add a contextual message specific to this step
   */
  private _addContextMessage(message: BaseMessage): void {
    // Filter out sensitive data from the message
    if (this.sensitiveData) {
      message = this._filterSensitiveData(message);
    }

    this.state.history.context_messages.push(message);
  }

  /**
   * Filter out sensitive data from the message
   */
  private _filterSensitiveData(message: BaseMessage): BaseMessage {
    const replaceSensitive = (value: string): string => {
      if (!this.sensitiveData) {
        return value;
      }

      // Collect all sensitive values, immediately converting old format to new format
      const sensitiveValues: Record<string, string> = {};

      // Process all sensitive data entries
      for (const [keyOrDomain, content] of Object.entries(this.sensitiveData)) {
        if (typeof content === 'object' && content !== null) {
          // Already in new format: {domain: {key: value}}
          for (const [key, val] of Object.entries(content)) {
            if (val) { // Skip empty values
              sensitiveValues[key] = val;
            }
          }
        } else if (typeof content === 'string' && content) { // Old format: {key: value} - convert to new format internally
          // We treat this as if it was {'http*://*': {key_or_domain: content}}
          sensitiveValues[keyOrDomain] = content;
        }
      }

      // If there are no valid sensitive data entries, just return the original value
      if (Object.keys(sensitiveValues).length === 0) {
        logger.warn?.('No valid entries found in sensitive_data dictionary');
        return value;
      }

      // Replace all valid sensitive data values with their placeholder tags
      let result = value;
      for (const [key, val] of Object.entries(sensitiveValues)) {
        result = result.replace(new RegExp(val, 'g'), `<secret>${key}</secret>`);
      }

      return result;
    };

    // Create a copy of the message to avoid mutating the original
    const filteredMessage = { ...message };

    if (typeof filteredMessage.content === 'string') {
      filteredMessage.content = replaceSensitive(filteredMessage.content);
    } else if (Array.isArray(filteredMessage.content)) {
      filteredMessage.content = filteredMessage.content.map(item => {
        if ('text' in item && typeof item.text === 'string') {
          return {
            ...item,
            text: replaceSensitive(item.text),
          };
        }
        return item;
      }) as any; // Type assertion to handle complex union types
    }

    return filteredMessage;
  }
}

/**
 * Helper functions for conversation saving
 */

/**
 * Save conversation history to file asynchronously
 */
export async function saveConversation(
  inputMessages: BaseMessage[],
  response: any,
  target: string,
  encoding: string = 'utf-8'
): Promise<void> {
  // Create folders if not exists
  const targetDir = dirname(target);
  await fs.mkdir(targetDir, { recursive: true });

  const content = await _formatConversation(inputMessages, response);
  await fs.writeFile(target, content, { encoding: encoding as BufferEncoding });
}

/**
 * Format the conversation including messages and response
 */
async function _formatConversation(messages: BaseMessage[], response: any): Promise<string> {
  const lines: string[] = [];

  // Format messages
  for (const message of messages) {
    lines.push(` ${message.role} `);
    
    // Get text content from message
    let text = '';
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .filter(part => 'text' in part)
        .map(part => (part as ContentPartTextParam).text)
        .join('\n');
    }
    
    lines.push(text);
    lines.push(''); // Empty line after each message
  }

  // Format response
  lines.push(' RESPONSE');
  lines.push(JSON.stringify(response, null, 2));

  return lines.join('\n');
}