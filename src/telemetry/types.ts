/**
 * Type definitions for telemetry events
 */

import { z } from 'zod';

// Base telemetry event schema
export const BaseTelemetryEventSchema = z.object({
  name: z.string(),
  properties: z.record(z.any()).default({}),
  timestamp: z.date().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
});

export type BaseTelemetryEvent = z.infer<typeof BaseTelemetryEventSchema>;

// Telemetry configuration schema
export const TelemetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  debug: z.boolean().default(false),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  flushInterval: z.number().default(30000), // 30 seconds
  maxBatchSize: z.number().default(100),
});

export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

// Agent telemetry events
export const AgentStartEventSchema = BaseTelemetryEventSchema.extend({
  name: z.literal('agent_start'),
  properties: z.object({
    model: z.string(),
    provider: z.string(),
    maxSteps: z.number().optional(),
    useVision: z.boolean().optional(),
  }),
});

export type AgentStartEvent = z.infer<typeof AgentStartEventSchema>;

export const AgentStepEventSchema = BaseTelemetryEventSchema.extend({
  name: z.literal('agent_step'),
  properties: z.object({
    stepNumber: z.number(),
    action: z.string(),
    success: z.boolean(),
    duration: z.number(),
  }),
});

export type AgentStepEvent = z.infer<typeof AgentStepEventSchema>;

export const AgentCompleteEventSchema = BaseTelemetryEventSchema.extend({
  name: z.literal('agent_complete'),
  properties: z.object({
    totalSteps: z.number(),
    success: z.boolean(),
    duration: z.number(),
    error: z.string().optional(),
  }),
});

export type AgentCompleteEvent = z.infer<typeof AgentCompleteEventSchema>;

// Browser telemetry events
export const BrowserActionEventSchema = BaseTelemetryEventSchema.extend({
  name: z.literal('browser_action'),
  properties: z.object({
    action: z.string(),
    url: z.string().optional(),
    success: z.boolean(),
    duration: z.number(),
    error: z.string().optional(),
  }),
});

export type BrowserActionEvent = z.infer<typeof BrowserActionEventSchema>;

// LLM telemetry events
export const LLMCallEventSchema = BaseTelemetryEventSchema.extend({
  name: z.literal('llm_call'),
  properties: z.object({
    provider: z.string(),
    model: z.string(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    duration: z.number(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
});

export type LLMCallEvent = z.infer<typeof LLMCallEventSchema>;

// MCP telemetry events
export const MCPClientEventSchema = BaseTelemetryEventSchema.extend({
  name: z.literal('mcp_client'),
  properties: z.object({
    serverName: z.string(),
    action: z.string(), // 'connect', 'disconnect', 'tool_call'
    toolName: z.string().optional(),
    success: z.boolean(),
    duration: z.number(),
    error: z.string().optional(),
  }),
});

export type MCPClientEvent = z.infer<typeof MCPClientEventSchema>;

export const MCPServerEventSchema = BaseTelemetryEventSchema.extend({
  name: z.literal('mcp_server'),
  properties: z.object({
    version: z.string(),
    action: z.string(), // 'start', 'stop'
    duration_seconds: z.number().optional(),
    parent_process_cmdline: z.string().optional(),
  }),
});

export type MCPServerEvent = z.infer<typeof MCPServerEventSchema>;

// Union type for all telemetry events
export type TelemetryEvent = 
  | AgentStartEvent
  | AgentStepEvent
  | AgentCompleteEvent
  | BrowserActionEvent
  | LLMCallEvent
  | MCPClientEvent
  | MCPServerEvent;