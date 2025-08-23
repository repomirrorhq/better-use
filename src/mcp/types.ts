/**
 * Type definitions for MCP integration
 */

import { z } from 'zod';

// MCP Tool Schema
export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.any()).optional(),
});

export type MCPTool = z.infer<typeof MCPToolSchema>;

// MCP Server Configuration
export const MCPServerConfigSchema = z.object({
  serverName: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

// MCP Client Configuration
export const MCPClientConfigSchema = z.object({
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  debug: z.boolean().default(false),
});

export type MCPClientConfig = z.infer<typeof MCPClientConfigSchema>;

// MCP Tool Call Result
export const MCPToolResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type MCPToolResult = z.infer<typeof MCPToolResultSchema>;