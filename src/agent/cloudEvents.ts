/**
 * Cloud events system for browser-use TypeScript
 * 
 * This module provides cloud integration events for:
 * - Agent task lifecycle management
 * - File uploads (GIFs, screenshots, etc.)
 * - Step tracking and analytics
 * - Session management
 * - Base64 file handling with size validation
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Constants for validation
const MAX_STRING_LENGTH = 100000; // 100K chars ~ 25k tokens
const MAX_URL_LENGTH = 100000;
const MAX_TASK_LENGTH = 100000;
const MAX_COMMENT_LENGTH = 2000;
const MAX_FILE_CONTENT_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Base event schema with common fields
 */
export const BaseEventSchema = z.object({
  id: z.string().default(() => uuidv4()),
  user_id: z.string().max(255).default(''), // To be filled by cloud handler
  device_id: z.string().max(255).nullable().default(null),
  created_at: z.date().default(() => new Date()),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

/**
 * Update Agent Task Event - Updates existing task status
 */
export const UpdateAgentTaskEventSchema = BaseEventSchema.extend({
  // Required fields for identification
  task_id: z.string(), // The task ID to update
  
  // Optional fields that can be updated
  stopped: z.boolean().optional(),
  paused: z.boolean().optional(),
  done_output: z.string().max(MAX_STRING_LENGTH).optional(),
  finished_at: z.date().optional(),
  agent_state: z.record(z.any()).optional(),
  user_feedback_type: z.string().max(10).optional(), // UserFeedbackType enum value as string
  user_comment: z.string().max(MAX_COMMENT_LENGTH).optional(),
  gif_url: z.string().max(MAX_URL_LENGTH).optional(),
});

export type UpdateAgentTaskEvent = z.infer<typeof UpdateAgentTaskEventSchema>;

/**
 * Create Agent Output File Event - For uploading files (GIFs, etc.)
 */
export const CreateAgentOutputFileEventSchema = BaseEventSchema.extend({
  task_id: z.string(),
  file_name: z.string().max(255),
  file_content: z.string().optional(), // Base64 encoded file content
  content_type: z.string().max(100).optional(), // MIME type for file uploads
});

export type CreateAgentOutputFileEvent = z.infer<typeof CreateAgentOutputFileEventSchema>;

/**
 * Validator for base64 file content size
 */
export function validateFileContentSize(content: string | undefined): string | undefined {
  if (content === undefined) {
    return content;
  }
  
  let base64Content = content;
  // Remove data URL prefix if present
  if (content.includes(',')) {
    base64Content = content.split(',')[1];
  }
  
  // Estimate decoded size (base64 is ~33% larger)
  const estimatedSize = base64Content.length * 3 / 4;
  if (estimatedSize > MAX_FILE_CONTENT_SIZE) {
    throw new Error(`File content exceeds maximum size of ${MAX_FILE_CONTENT_SIZE / 1024 / 1024}MB`);
  }
  
  return content;
}

/**
 * Create Agent Step Event - Tracks individual agent steps
 */
export const CreateAgentStepEventSchema = BaseEventSchema.extend({
  agent_task_id: z.string(),
  step: z.number(),
  evaluation_previous_goal: z.string().max(MAX_STRING_LENGTH),
  memory: z.string().max(MAX_STRING_LENGTH),
  next_goal: z.string().max(MAX_STRING_LENGTH),
  actions: z.array(z.record(z.any())),
  screenshot_url: z.string().max(MAX_FILE_CONTENT_SIZE).optional(), // ~50MB for base64 images
  url: z.string().max(MAX_URL_LENGTH).default(''),
});

export type CreateAgentStepEvent = z.infer<typeof CreateAgentStepEventSchema>;

/**
 * Validator for screenshot URL/base64 content size
 */
export function validateScreenshotSize(content: string | undefined): string | undefined {
  if (!content?.startsWith('data:')) {
    return content;
  }
  
  // It's base64 data, check size
  if (content.includes(',')) {
    const base64Part = content.split(',')[1];
    const estimatedSize = base64Part.length * 3 / 4;
    if (estimatedSize > MAX_FILE_CONTENT_SIZE) {
      throw new Error(`Screenshot content exceeds maximum size of ${MAX_FILE_CONTENT_SIZE / 1024 / 1024}MB`);
    }
  }
  
  return content;
}

/**
 * Create Agent Task Event - Creates new task records
 */
export const CreateAgentTaskEventSchema = BaseEventSchema.extend({
  agent_session_id: z.string(),
  llm_model: z.string().max(100), // LLMModel enum value as string
  stopped: z.boolean().default(false),
  paused: z.boolean().default(false),
  task: z.string().max(MAX_TASK_LENGTH),
  done_output: z.string().max(MAX_STRING_LENGTH).optional(),
  scheduled_task_id: z.string().optional(),
  started_at: z.date().default(() => new Date()),
  finished_at: z.date().optional(),
  agent_state: z.record(z.any()).default({}),
  user_feedback_type: z.string().max(10).optional(), // UserFeedbackType enum value as string
  user_comment: z.string().max(MAX_COMMENT_LENGTH).optional(),
  gif_url: z.string().max(MAX_URL_LENGTH).optional(),
});

export type CreateAgentTaskEvent = z.infer<typeof CreateAgentTaskEventSchema>;

/**
 * Create Agent Session Event - Session management
 */
export const CreateAgentSessionEventSchema = BaseEventSchema.extend({
  browser_session_id: z.string().max(255),
  browser_session_live_url: z.string().max(MAX_URL_LENGTH),
  browser_session_cdp_url: z.string().max(MAX_URL_LENGTH),
  browser_session_stopped: z.boolean().default(false),
  browser_session_stopped_at: z.date().optional(),
  is_source_api: z.boolean().optional(),
  browser_state: z.record(z.any()).default({}),
  browser_session_data: z.record(z.any()).optional(),
});

export type CreateAgentSessionEvent = z.infer<typeof CreateAgentSessionEventSchema>;

/**
 * Cloud Events Factory - Creates events from agent instances
 */
export class CloudEventsFactory {
  /**
   * Create UpdateAgentTaskEvent from agent instance
   */
  static createUpdateAgentTaskEvent(
    agent: any, // Placeholder for Agent type
    taskId: string,
    updates: Partial<Omit<UpdateAgentTaskEvent, 'id' | 'user_id' | 'device_id' | 'created_at' | 'task_id'>>
  ): UpdateAgentTaskEvent {
    const deviceId = agent.cloud_sync?.auth_client?.device_id || null;
    const doneOutput = agent.history?.final_result?.() || null;
    const agentState = agent.state?.model_dump?.() || {};
    const isFinished = agent.history?.is_done?.() || false;
    
    return UpdateAgentTaskEventSchema.parse({
      task_id: taskId,
      device_id: deviceId,
      stopped: agent.state?.stopped || false,
      paused: agent.state?.paused || false,
      done_output: doneOutput,
      finished_at: isFinished ? new Date() : undefined,
      agent_state: agentState,
      ...updates
    });
  }

  /**
   * Create CreateAgentOutputFileEvent from file path
   */
  static async createAgentOutputFileEvent(
    agent: any, // Placeholder for Agent type
    taskId: string,
    filePath: string
  ): Promise<CreateAgentOutputFileEvent> {
    const fullPath = path.resolve(filePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    const stats = fs.statSync(fullPath);
    const fileName = path.basename(fullPath);
    const deviceId = agent.cloud_sync?.auth_client?.device_id || null;
    
    // Read file content for base64 encoding if small enough
    let fileContent: string | undefined;
    if (stats.size < MAX_FILE_CONTENT_SIZE) {
      const buffer = fs.readFileSync(fullPath);
      fileContent = buffer.toString('base64');
    }

    // Determine content type based on file extension
    const ext = path.extname(fileName).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.txt') contentType = 'text/plain';

    return CreateAgentOutputFileEventSchema.parse({
      device_id: deviceId,
      task_id: taskId,
      file_name: fileName,
      file_content: fileContent,
      content_type: contentType,
    });
  }

  /**
   * Create CreateAgentStepEvent from agent step data
   */
  static createAgentStepEvent(
    agent: any, // Placeholder for Agent type
    modelOutput: any,
    actions: any[],
    browserStateSummary: any
  ): CreateAgentStepEvent {
    const deviceId = agent.cloud_sync?.auth_client?.device_id || null;
    const currentState = modelOutput.current_state || {};
    
    // Capture screenshot as base64 data URL if available
    let screenshotUrl: string | undefined;
    if (browserStateSummary.screenshot) {
      screenshotUrl = `data:image/png;base64,${browserStateSummary.screenshot}`;
      validateScreenshotSize(screenshotUrl);
    }

    // Convert actions to serializable format
    const actionsData = actions.map(action => ({
      type: action.constructor?.name || 'unknown',
      ...action
    }));

    return CreateAgentStepEventSchema.parse({
      device_id: deviceId,
      agent_task_id: agent.task_id?.toString() || '',
      step: agent.state?.n_steps || 0,
      evaluation_previous_goal: currentState.evaluation_previous_goal || '',
      memory: currentState.memory || '',
      next_goal: currentState.next_goal || '',
      actions: actionsData,
      url: browserStateSummary.url || '',
      screenshot_url: screenshotUrl,
    });
  }

  /**
   * Create CreateAgentTaskEvent from agent instance
   */
  static createAgentTaskEvent(
    agent: any, // Placeholder for Agent type
    task: string
  ): CreateAgentTaskEvent {
    const deviceId = agent.cloud_sync?.auth_client?.device_id || null;
    const taskStartTime = agent._task_start_time ? new Date(agent._task_start_time * 1000) : new Date();
    
    return CreateAgentTaskEventSchema.parse({
      device_id: deviceId,
      agent_session_id: agent.session_id?.toString() || '',
      task: task,
      llm_model: agent.llm?.model_name || 'unknown',
      agent_state: agent.state?.model_dump?.() || {},
      started_at: taskStartTime,
    });
  }

  /**
   * Create CreateAgentSessionEvent from agent instance
   */
  static createAgentSessionEvent(
    agent: any, // Placeholder for Agent type
    browserSession: any
  ): CreateAgentSessionEvent {
    const deviceId = agent.cloud_sync?.auth_client?.device_id || null;
    const browserProfile = agent.browser_profile || {};
    
    return CreateAgentSessionEventSchema.parse({
      device_id: deviceId,
      browser_session_id: browserSession.id || '',
      browser_session_live_url: '', // To be filled by cloud handler
      browser_session_cdp_url: '', // To be filled by cloud handler
      browser_state: {
        viewport: browserProfile.viewport || { width: 1280, height: 720 },
        user_agent: browserProfile.user_agent || null,
        headless: browserProfile.headless !== undefined ? browserProfile.headless : true,
        initial_url: null, // Will be updated during execution
        final_url: null, // Will be updated during execution
        total_pages_visited: 0, // Will be updated during execution
        session_duration_seconds: 0, // Will be updated during execution
      },
      browser_session_data: {
        cookies: [],
        secrets: {}, // TODO: Handle secrets safely for cloud replay
        allowed_domains: browserProfile.allowed_domains || [],
      },
    });
  }
}

/**
 * Cloud Events Manager - Handles event emission and processing
 */
export class CloudEventsManager {
  private events: BaseEvent[] = [];
  private listeners: Map<string, Function[]> = new Map();

  /**
   * Emit an event
   */
  emit(eventType: string, event: BaseEvent): void {
    this.events.push(event);
    
    const typeListeners = this.listeners.get(eventType) || [];
    for (const listener of typeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(`Error in event listener for ${eventType}:`, error);
      }
    }
  }

  /**
   * Add event listener
   */
  on(eventType: string, listener: Function): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off(eventType: string, listener: Function): void {
    const typeListeners = this.listeners.get(eventType) || [];
    const index = typeListeners.indexOf(listener);
    if (index > -1) {
      typeListeners.splice(index, 1);
    }
  }

  /**
   * Get all events
   */
  getEvents(): BaseEvent[] {
    return [...this.events];
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Export events as JSON
   */
  exportEvents(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

// Export a default instance
export const cloudEventsManager = new CloudEventsManager();