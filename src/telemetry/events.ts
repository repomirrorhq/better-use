/**
 * Telemetry event factory functions
 */

import { 
  AgentCompleteEvent, 
  AgentStartEvent, 
  AgentStepEvent, 
  BrowserActionEvent, 
  LLMCallEvent, 
  MCPClientEvent,
  MCPServerEvent 
} from './types';

/**
 * Create an agent start event
 */
export function createAgentStartEvent(properties: {
  model: string;
  provider: string;
  maxSteps?: number;
  useVision?: boolean;
  sessionId?: string;
  userId?: string;
}): AgentStartEvent {
  return {
    name: 'agent_start',
    properties: {
      model: properties.model,
      provider: properties.provider,
      maxSteps: properties.maxSteps,
      useVision: properties.useVision,
    },
    timestamp: new Date(),
    sessionId: properties.sessionId,
    userId: properties.userId,
  };
}

/**
 * Create an agent step event
 */
export function createAgentStepEvent(properties: {
  stepNumber: number;
  action: string;
  success: boolean;
  duration: number;
  sessionId?: string;
  userId?: string;
}): AgentStepEvent {
  return {
    name: 'agent_step',
    properties: {
      stepNumber: properties.stepNumber,
      action: properties.action,
      success: properties.success,
      duration: properties.duration,
    },
    timestamp: new Date(),
    sessionId: properties.sessionId,
    userId: properties.userId,
  };
}

/**
 * Create an agent complete event
 */
export function createAgentCompleteEvent(properties: {
  totalSteps: number;
  success: boolean;
  duration: number;
  error?: string;
  sessionId?: string;
  userId?: string;
}): AgentCompleteEvent {
  return {
    name: 'agent_complete',
    properties: {
      totalSteps: properties.totalSteps,
      success: properties.success,
      duration: properties.duration,
      error: properties.error,
    },
    timestamp: new Date(),
    sessionId: properties.sessionId,
    userId: properties.userId,
  };
}

/**
 * Create a browser action event
 */
export function createBrowserActionEvent(properties: {
  action: string;
  url?: string;
  success: boolean;
  duration: number;
  error?: string;
  sessionId?: string;
  userId?: string;
}): BrowserActionEvent {
  return {
    name: 'browser_action',
    properties: {
      action: properties.action,
      url: properties.url,
      success: properties.success,
      duration: properties.duration,
      error: properties.error,
    },
    timestamp: new Date(),
    sessionId: properties.sessionId,
    userId: properties.userId,
  };
}

/**
 * Create an LLM call event
 */
export function createLLMCallEvent(properties: {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  duration: number;
  success: boolean;
  error?: string;
  sessionId?: string;
  userId?: string;
}): LLMCallEvent {
  return {
    name: 'llm_call',
    properties: {
      provider: properties.provider,
      model: properties.model,
      inputTokens: properties.inputTokens,
      outputTokens: properties.outputTokens,
      duration: properties.duration,
      success: properties.success,
      error: properties.error,
    },
    timestamp: new Date(),
    sessionId: properties.sessionId,
    userId: properties.userId,
  };
}

/**
 * Create an MCP client event
 */
export function createMCPClientEvent(properties: {
  serverName: string;
  action: string;
  toolName?: string;
  success: boolean;
  duration: number;
  error?: string;
  sessionId?: string;
  userId?: string;
}): MCPClientEvent {
  return {
    name: 'mcp_client',
    properties: {
      serverName: properties.serverName,
      action: properties.action,
      toolName: properties.toolName,
      success: properties.success,
      duration: properties.duration,
      error: properties.error,
    },
    timestamp: new Date(),
    sessionId: properties.sessionId,
    userId: properties.userId,
  };
}

/**
 * Create an MCP server event
 */
export function createMCPServerEvent(properties: {
  version: string;
  action: string;
  duration_seconds?: number;
  parent_process_cmdline?: string;
  sessionId?: string;
  userId?: string;
}): MCPServerEvent {
  return {
    name: 'mcp_server',
    properties: {
      version: properties.version,
      action: properties.action,
      duration_seconds: properties.duration_seconds,
      parent_process_cmdline: properties.parent_process_cmdline,
    },
    timestamp: new Date(),
    sessionId: properties.sessionId,
    userId: properties.userId,
  };
}

/**
 * MCP Server Telemetry Event class for backward compatibility
 */
export class MCPServerTelemetryEvent {
  constructor(private properties: {
    version: string;
    action: string;
    duration_seconds?: number;
    parent_process_cmdline?: string;
  }) {}

  toJSON(): MCPServerEvent {
    return createMCPServerEvent(this.properties);
  }
}