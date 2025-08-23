/**
 * Views and response types for LLM interactions
 */

import { z } from 'zod';

export const ChatInvokeUsageSchema = z.object({
  prompt_tokens: z.number().describe('The number of tokens in the prompt (includes cached tokens)'),
  prompt_cached_tokens: z.number().optional().describe('The number of cached tokens'),
  prompt_cache_creation_tokens: z.number().optional().describe('Anthropic only: tokens used to create cache'),
  prompt_image_tokens: z.number().optional().describe('Google only: tokens in images'),
  completion_tokens: z.number().describe('The number of tokens in the completion'),
  total_tokens: z.number().describe('The total number of tokens in the response'),
});

export type ChatInvokeUsage = z.infer<typeof ChatInvokeUsageSchema>;

export interface ChatInvokeCompletion<T = string> {
  completion: T;
  thinking?: string;
  redacted_thinking?: string;
  usage?: ChatInvokeUsage;
}

// Legacy alias for backward compatibility
export interface ChatInvokeResponse<T = string> {
  content: T;
  usage?: ChatInvokeUsage;
  usage_metadata?: Record<string, any>;
}

export const ChatInvokeCompletionSchema = <T extends z.ZodTypeAny>(completionSchema: T) => z.object({
  completion: completionSchema,
  thinking: z.string().optional(),
  redacted_thinking: z.string().optional(),
  usage: ChatInvokeUsageSchema.optional(),
});

// Helper function to create a completion response
export function createCompletion<T>(
  completion: T,
  options?: {
    thinking?: string;
    redacted_thinking?: string;
    usage?: ChatInvokeUsage;
  }
): ChatInvokeCompletion<T> {
  return {
    completion,
    ...options,
  };
}