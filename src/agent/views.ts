/**
 * Agent views and data structures for browser-use TypeScript
 * 
 * This module contains TypeScript equivalents of the Python agent views,
 * using Zod schemas for validation and TypeScript types for safety.
 */

import { z } from 'zod';
import { v7 as uuid7 } from 'uuid';
import { BaseMessage, BaseMessageSchema } from '../llm/messages';
import { DEFAULT_INCLUDE_ATTRIBUTES, type DOMInteractedElement, DOMInteractedElementSchema } from '../dom/views';
import { type TabInfo, TabInfoSchema } from '../browser/views';

// Agent Settings schema
export const AgentSettingsSchema = z.object({
  use_vision: z.boolean().default(true),
  vision_detail_level: z.enum(['auto', 'low', 'high']).default('auto'),
  use_vision_for_planner: z.boolean().default(false),
  save_conversation_path: z.union([z.string(), z.null()]).default(null),
  save_conversation_path_encoding: z.string().nullable().default('utf-8'),
  max_failures: z.number().int().default(3),
  retry_delay: z.number().int().default(10),
  validate_output: z.boolean().default(false),
  generate_gif: z.union([z.boolean(), z.string()]).default(false),
  override_system_message: z.string().nullable().default(null),
  extend_system_message: z.string().nullable().default(null),
  include_attributes: z.array(z.string()).nullable().default(() => [...DEFAULT_INCLUDE_ATTRIBUTES]),
  max_actions_per_step: z.number().int().default(10),
  use_thinking: z.boolean().default(true),
  flash_mode: z.boolean().default(false), // If enabled, disables evaluation_previous_goal and next_goal, and sets use_thinking = false
  max_history_items: z.number().int().nullable().default(null),
  
  // LLM settings
  page_extraction_llm: z.any().nullable().default(null), // BaseChatModel | null
  planner_llm: z.any().nullable().default(null), // BaseChatModel | null
  planner_interval: z.number().int().default(1), // Run planner every N steps
  is_planner_reasoning: z.boolean().default(false),
  extend_planner_system_message: z.string().nullable().default(null),
  calculate_cost: z.boolean().default(false),
  include_tool_call_examples: z.boolean().default(false),
  llm_timeout: z.number().int().default(60), // Timeout in seconds for LLM calls
  step_timeout: z.number().int().default(180), // Timeout in seconds for each step
});

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

// Message Manager State schemas
export const HistoryItemSchema = z.object({
  step_number: z.number().int().nullable().default(null),
  evaluation_previous_goal: z.string().nullable().default(null),
  memory: z.string().nullable().default(null),
  next_goal: z.string().nullable().default(null),
  action_results: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  system_message: z.string().nullable().default(null),
}).refine((data) => {
  // Ensure that error and system_message are not both provided
  return !(data.error !== null && data.system_message !== null);
}, {
  message: "Cannot have both error and system_message at the same time",
});

export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const MessageHistorySchema = z.object({
  system_message: BaseMessageSchema.nullable().default(null),
  state_message: BaseMessageSchema.nullable().default(null),
  context_messages: z.array(BaseMessageSchema).default([]),
});

export type MessageHistory = z.infer<typeof MessageHistorySchema>;

export const MessageManagerStateSchema = z.object({
  history: MessageHistorySchema.default(() => ({ 
    system_message: null, 
    state_message: null, 
    context_messages: [] 
  })),
  tool_id: z.number().int().default(1),
  agent_history_items: z.array(HistoryItemSchema).default([
    { step_number: 0, system_message: 'Agent initialized', evaluation_previous_goal: null, memory: null, next_goal: null, action_results: null, error: null }
  ]),
  read_state_description: z.string().default(''),
});

export type MessageManagerState = z.infer<typeof MessageManagerStateSchema>;

// Action Model (simplified for now, will be extended by controller)
export const ActionModelSchema = z.object({}).passthrough();

export type ActionModel = z.infer<typeof ActionModelSchema>;

// Agent State schema
export const AgentStateSchema = z.object({
  agent_id: z.string().default(() => uuid7()),
  n_steps: z.number().int().default(1),
  consecutive_failures: z.number().int().default(0),
  last_result: z.array(z.any()).nullable().default(null), // ActionResult array
  last_plan: z.string().nullable().default(null),
  last_model_output: z.any().nullable().default(null), // AgentOutput
  paused: z.boolean().default(false),
  stopped: z.boolean().default(false),
  session_initialized: z.boolean().default(false), // Track if session events have been dispatched
  
  message_manager_state: MessageManagerStateSchema.default(() => ({
    history: { system_message: null, state_message: null, context_messages: [] },
    tool_id: 1,
    agent_history_items: [{ step_number: 0, system_message: 'Agent initialized', evaluation_previous_goal: null, memory: null, next_goal: null, action_results: null, error: null }],
    read_state_description: '',
  })),
  file_system_state: z.any().nullable().default(null), // FileSystemState | null
});

export type AgentState = z.infer<typeof AgentStateSchema>;

// Agent Step Info 
export const AgentStepInfoSchema = z.object({
  step_number: z.number().int(),
  max_steps: z.number().int(),
});

export type AgentStepInfo = z.infer<typeof AgentStepInfoSchema>;

// Action Result schema
export const ActionResultSchema = z.object({
  // For done action
  is_done: z.boolean().nullable().default(false),
  success: z.boolean().nullable().default(null),
  
  // Error handling - always include in long term memory
  error: z.string().nullable().default(null),
  
  // Files
  attachments: z.array(z.string()).nullable().default(null), // Files to display in the done message
  
  // Always include in long term memory
  long_term_memory: z.string().nullable().default(null), // Memory of this action
  
  // if include_extracted_content_only_once is True we add the extracted_content to the agent context only once for the next step
  // if include_extracted_content_only_once is False we add the extracted_content to the agent long term memory if no long_term_memory is provided
  extracted_content: z.string().nullable().default(null),
  include_extracted_content_only_once: z.boolean().default(false), // Whether the extracted content should be used to update the read_state
  
  // Metadata for observability (e.g., click coordinates)
  metadata: z.record(z.any()).nullable().default(null),
  
  // Deprecated
  include_in_memory: z.boolean().default(false), // whether to include in extracted_content inside long_term_memory
}).refine((data) => {
  // Ensure success=True can only be set when is_done=True
  if (data.success === true && data.is_done !== true) {
    throw new Error(
      'success=True can only be set when is_done=True. ' +
      'For regular actions that succeed, leave success as null. ' +
      'Use success=False only for actions that fail.'
    );
  }
  return true;
});

export type ActionResultType = z.infer<typeof ActionResultSchema>;

// ActionResult class for creating instances
export class ActionResult {
  public is_done: boolean | null;
  public success: boolean | null;
  public error: string | null;
  public attachments: string[] | null;
  public long_term_memory: string | null;
  public extracted_content: string | null;
  public include_extracted_content_only_once: boolean;
  public metadata: Record<string, any> | null;
  public include_in_memory: boolean;

  constructor(data: Partial<ActionResultType> = {}) {
    const validated = ActionResultSchema.parse({
      is_done: false,
      success: null,
      error: null,
      attachments: null,
      long_term_memory: null,
      extracted_content: null,
      include_extracted_content_only_once: false,
      metadata: null,
      include_in_memory: false,
      ...data
    });

    this.is_done = validated.is_done;
    this.success = validated.success;
    this.error = validated.error;
    this.attachments = validated.attachments;
    this.long_term_memory = validated.long_term_memory;
    this.extracted_content = validated.extracted_content;
    this.include_extracted_content_only_once = validated.include_extracted_content_only_once;
    this.metadata = validated.metadata;
    this.include_in_memory = validated.include_in_memory;
  }
}

// Step Metadata schema
export const StepMetadataSchema = z.object({
  step_start_time: z.number(),
  step_end_time: z.number(),
  step_number: z.number().int(),
});

export type StepMetadata = z.infer<typeof StepMetadataSchema>;

// Agent Brain schema
export const AgentBrainSchema = z.object({
  thinking: z.string().nullable().default(null),
  evaluation_previous_goal: z.string(),
  memory: z.string(),
  next_goal: z.string(),
});

export type AgentBrain = z.infer<typeof AgentBrainSchema>;

// Agent Output schema
export const AgentOutputSchema = z.object({
  thinking: z.string().nullable().default(null),
  evaluation_previous_goal: z.string().nullable().default(null),
  memory: z.string().nullable().default(null),
  next_goal: z.string().nullable().default(null),
  action: z.array(ActionModelSchema).min(1, 'At least one action is required'),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// Browser State History (simplified version of the Python equivalent)
// TabInfo is imported from ../browser/views to avoid duplication

export const BrowserStateHistorySchema = z.object({
  url: z.string(),
  title: z.string(),
  tabs: z.array(TabInfoSchema),
  interacted_element: z.array(DOMInteractedElementSchema.nullable()),
  screenshot_path: z.string().nullable().default(null),
});

export type BrowserStateHistory = z.infer<typeof BrowserStateHistorySchema>;

// Agent History schema
export const AgentHistorySchema = z.object({
  model_output: AgentOutputSchema.nullable().default(null),
  result: z.array(ActionResultSchema),
  state: BrowserStateHistorySchema,
  metadata: StepMetadataSchema.nullable().default(null),
});

export type AgentHistory = z.infer<typeof AgentHistorySchema>;

// Usage Summary schema (placeholder)
export const UsageSummarySchema = z.object({
  total_cost: z.number().default(0),
  total_tokens: z.number().int().default(0),
  // Add more fields as needed from tokens/views.py
});

export type UsageSummary = z.infer<typeof UsageSummarySchema>;

// Agent History List schema
export const AgentHistoryListSchema = z.object({
  history: z.array(AgentHistorySchema),
  usage: UsageSummarySchema.nullable().default(null),
});

export type AgentHistoryList = z.infer<typeof AgentHistoryListSchema>;

// Helper classes with methods
export class HistoryItemHelper implements HistoryItem {
  step_number: number | null;
  evaluation_previous_goal: string | null;
  memory: string | null;
  next_goal: string | null;
  action_results: string | null;
  error: string | null;
  system_message: string | null;

  constructor(data: HistoryItem) {
    this.step_number = data.step_number;
    this.evaluation_previous_goal = data.evaluation_previous_goal;
    this.memory = data.memory;
    this.next_goal = data.next_goal;
    this.action_results = data.action_results;
    this.error = data.error;
    this.system_message = data.system_message;
  }

  toString(): string {
    const stepStr = this.step_number !== null ? `step_${this.step_number}` : 'step_unknown';

    if (this.error) {
      return `<${stepStr}>\n${this.error}\n</${stepStr}>`;
    } else if (this.system_message) {
      return `<sys>\n${this.system_message}\n</sys>`;
    } else {
      const contentParts: string[] = [];

      // Only include evaluation_previous_goal if it's not null/empty
      if (this.evaluation_previous_goal) {
        contentParts.push(`Evaluation of Previous Step: ${this.evaluation_previous_goal}`);
      }

      // Always include memory
      if (this.memory) {
        contentParts.push(`Memory: ${this.memory}`);
      }

      // Only include next_goal if it's not null/empty
      if (this.next_goal) {
        contentParts.push(`Next Goal: ${this.next_goal}`);
      }

      if (this.action_results) {
        contentParts.push(this.action_results);
      }

      const content = contentParts.join('\n');
      return `<${stepStr}>\n${content}\n</${stepStr}>`;
    }
  }
}

export class MessageHistoryHelper implements MessageHistory {
  system_message: BaseMessage | null;
  state_message: BaseMessage | null;
  context_messages: BaseMessage[];

  constructor(data: MessageHistory) {
    this.system_message = data.system_message;
    this.state_message = data.state_message;
    this.context_messages = data.context_messages;
  }

  getMessages(): BaseMessage[] {
    const messages: BaseMessage[] = [];
    if (this.system_message) {
      messages.push(this.system_message);
    }
    if (this.state_message) {
      messages.push(this.state_message);
    }
    messages.push(...this.context_messages);
    return messages;
  }
}

export class AgentStepInfoHelper implements AgentStepInfo {
  step_number: number;
  max_steps: number;

  constructor(step_number: number, max_steps: number) {
    this.step_number = step_number;
    this.max_steps = max_steps;
  }

  isLastStep(): boolean {
    return this.step_number >= this.max_steps - 1;
  }
}

export class StepMetadataHelper implements StepMetadata {
  step_start_time: number;
  step_end_time: number;
  step_number: number;

  constructor(data: StepMetadata) {
    this.step_start_time = data.step_start_time;
    this.step_end_time = data.step_end_time;
    this.step_number = data.step_number;
  }

  get durationSeconds(): number {
    return this.step_end_time - this.step_start_time;
  }
}

export class AgentOutputHelper implements AgentOutput {
  thinking: string | null;
  evaluation_previous_goal: string | null;
  memory: string | null;
  next_goal: string | null;
  action: ActionModel[];

  constructor(data: AgentOutput) {
    this.thinking = data.thinking;
    this.evaluation_previous_goal = data.evaluation_previous_goal;
    this.memory = data.memory;
    this.next_goal = data.next_goal;
    this.action = data.action;
  }

  get currentState(): AgentBrain {
    return {
      thinking: this.thinking,
      evaluation_previous_goal: this.evaluation_previous_goal || '',
      memory: this.memory || '',
      next_goal: this.next_goal || '',
    };
  }
}

export class AgentHistoryListHelper implements AgentHistoryList {
  history: AgentHistory[];
  usage: UsageSummary | null;

  constructor(data: AgentHistoryList) {
    this.history = data.history;
    this.usage = data.usage;
  }

  totalDurationSeconds(): number {
    let total = 0;
    for (const h of this.history) {
      if (h.metadata) {
        total += new StepMetadataHelper(h.metadata).durationSeconds;
      }
    }
    return total;
  }

  get length(): number {
    return this.history.length;
  }

  toString(): string {
    return `AgentHistoryList(all_results=${JSON.stringify(this.actionResults())}, all_model_outputs=${JSON.stringify(this.modelActions())})`;
  }

  addItem(historyItem: AgentHistory): void {
    this.history.push(historyItem);
  }

  isDone(): boolean {
    if (this.history.length > 0 && this.history[this.history.length - 1].result.length > 0) {
      const lastResult = this.history[this.history.length - 1].result[this.history[this.history.length - 1].result.length - 1];
      return lastResult.is_done === true;
    }
    return false;
  }

  isSuccessful(): boolean | null {
    if (this.history.length > 0 && this.history[this.history.length - 1].result.length > 0) {
      const lastResult = this.history[this.history.length - 1].result[this.history[this.history.length - 1].result.length - 1];
      if (lastResult.is_done === true) {
        return lastResult.success;
      }
    }
    return null;
  }

  hasErrors(): boolean {
    return this.errors().some(error => error !== null);
  }

  errors(): (string | null)[] {
    const errors: (string | null)[] = [];
    for (const h of this.history) {
      const stepErrors = h.result.map(r => r.error).filter(e => e !== null);
      // each step can have only one error
      errors.push(stepErrors.length > 0 ? stepErrors[0] : null);
    }
    return errors;
  }

  finalResult(): string | null {
    if (this.history.length > 0 && this.history[this.history.length - 1].result[this.history[this.history.length - 1].result.length - 1].extracted_content) {
      return this.history[this.history.length - 1].result[this.history[this.history.length - 1].result.length - 1].extracted_content;
    }
    return null;
  }

  urls(): (string | null)[] {
    return this.history.map(h => h.state.url || null);
  }

  screenshotPaths(nLast?: number, returnNoneIfNotScreenshot: boolean = true): (string | null)[] {
    if (nLast === 0) {
      return [];
    }
    
    const historyItems = nLast === undefined ? this.history : this.history.slice(-nLast);
    
    if (returnNoneIfNotScreenshot) {
      return historyItems.map(h => h.state.screenshot_path || null);
    } else {
      return historyItems.map(h => h.state.screenshot_path).filter(path => path !== null) as string[];
    }
  }

  actionNames(): string[] {
    const actionNames: string[] = [];
    for (const action of this.modelActions()) {
      const keys = Object.keys(action);
      if (keys.length > 0) {
        actionNames.push(keys[0]);
      }
    }
    return actionNames;
  }

  modelThoughts(): AgentBrain[] {
    return this.history
      .filter(h => h.model_output !== null)
      .map(h => new AgentOutputHelper(h.model_output!).currentState);
  }

  modelOutputs(): AgentOutput[] {
    return this.history
      .filter(h => h.model_output !== null)
      .map(h => h.model_output!);
  }

  modelActions(): Record<string, any>[] {
    const outputs: Record<string, any>[] = [];
    
    for (const h of this.history) {
      if (h.model_output) {
        const interactedElements = h.state.interacted_element || Array(h.model_output.action.length).fill(null);
        for (let i = 0; i < h.model_output.action.length; i++) {
          const action = h.model_output.action[i];
          const interactedElement = interactedElements[i];
          const output = { ...action };
          output.interacted_element = interactedElement;
          outputs.push(output);
        }
      }
    }
    return outputs;
  }

  actionResults(): ActionResult[] {
    const results: ActionResult[] = [];
    for (const h of this.history) {
      results.push(...h.result.filter(r => r !== null));
    }
    return results;
  }

  extractedContent(): string[] {
    const content: string[] = [];
    for (const h of this.history) {
      content.push(...h.result.map(r => r.extracted_content).filter(c => c !== null) as string[]);
    }
    return content;
  }

  numberOfSteps(): number {
    return this.history.length;
  }
}

// Agent Error utility class
export class AgentError {
  static readonly VALIDATION_ERROR = 'Invalid model output format. Please follow the correct schema.';
  static readonly RATE_LIMIT_ERROR = 'Rate limit reached. Waiting before retry.';
  static readonly NO_VALID_ACTION = 'No valid action found';

  static formatError(error: Error, includeTrace: boolean = false): string {
    if (error.name === 'ValidationError' || error.name === 'ZodError') {
      return `${AgentError.VALIDATION_ERROR}\nDetails: ${error.message}`;
    }
    
    // Check for rate limit errors (you may need to adjust this based on actual error types)
    if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
      return AgentError.RATE_LIMIT_ERROR;
    }
    
    if (includeTrace) {
      return `${error.message}\nStacktrace:\n${error.stack}`;
    }
    
    return error.message;
  }
}

// Factory functions
export function createAgentSettings(options?: Partial<AgentSettings>): AgentSettings {
  return AgentSettingsSchema.parse(options || {});
}

export function createAgentState(options?: Partial<AgentState>): AgentState {
  return AgentStateSchema.parse(options || {});
}

export function createActionResult(options?: Partial<ActionResult>): ActionResult {
  return ActionResultSchema.parse(options || {});
}

export function createAgentStepInfo(step_number: number, max_steps: number): AgentStepInfo {
  return new AgentStepInfoHelper(step_number, max_steps);
}

export function createStepMetadata(
  step_start_time: number,
  step_end_time: number,
  step_number: number
): StepMetadata {
  return StepMetadataSchema.parse({
    step_start_time,
    step_end_time,
    step_number,
  });
}

export function createAgentOutput(
  action: ActionModel[],
  options?: Partial<Omit<AgentOutput, 'action'>>
): AgentOutput {
  return AgentOutputSchema.parse({
    action,
    ...options,
  });
}

export function createAgentHistory(
  result: ActionResult[],
  state: BrowserStateHistory,
  options?: Partial<Omit<AgentHistory, 'result' | 'state'>>
): AgentHistory {
  return AgentHistorySchema.parse({
    result,
    state,
    ...options,
  });
}

export function createAgentHistoryList(
  history: AgentHistory[],
  options?: Partial<Omit<AgentHistoryList, 'history'>>
): AgentHistoryList {
  return new AgentHistoryListHelper(AgentHistoryListSchema.parse({
    history,
    ...options,
  }));
}