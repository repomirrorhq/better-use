/**
 * Type definitions for sync and cloud functionality
 */

import { z } from 'zod';

// Sync configuration schema
export const SyncConfigSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  userId: z.string().optional(),
  syncInterval: z.number().default(300000), // 5 minutes
  maxRetries: z.number().default(3),
  debug: z.boolean().default(false),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

// Authentication schema
export const AuthInfoSchema = z.object({
  userId: z.string(),
  token: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.date().optional(),
  scopes: z.array(z.string()).default([]),
});

export type AuthInfo = z.infer<typeof AuthInfoSchema>;

// Sync data types
export const SyncDataTypeSchema = z.enum([
  'browser_session',
  'agent_history',
  'user_preferences', 
  'custom_actions',
  'screenshots',
  'telemetry_events',
]);

export type SyncDataType = z.infer<typeof SyncDataTypeSchema>;

// Sync item schema
export const SyncItemSchema = z.object({
  id: z.string(),
  type: SyncDataTypeSchema,
  data: z.record(z.any()),
  timestamp: z.date(),
  checksum: z.string().optional(),
  version: z.number().default(1),
  userId: z.string(),
});

export type SyncItem = z.infer<typeof SyncItemSchema>;

// Sync operation schema
export const SyncOperationSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  item: SyncItemSchema,
  timestamp: z.date(),
});

export type SyncOperation = z.infer<typeof SyncOperationSchema>;

// Sync status schema
export const SyncStatusSchema = z.object({
  enabled: z.boolean(),
  connected: z.boolean(),
  lastSyncTime: z.date().optional(),
  pendingOperations: z.number().default(0),
  failedOperations: z.number().default(0),
  error: z.string().optional(),
});

export type SyncStatus = z.infer<typeof SyncStatusSchema>;