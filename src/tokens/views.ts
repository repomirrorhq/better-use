/**
 * Token usage and cost tracking views and types
 */

import { z } from 'zod';
import { ChatInvokeUsage } from '../llm/views';

/**
 * Single token usage entry
 */
export const TokenUsageEntrySchema = z.object({
  model: z.string(),
  timestamp: z.date(),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    prompt_cached_tokens: z.number().optional(),
    prompt_cache_creation_tokens: z.number().optional(),
  }),
});

export type TokenUsageEntry = z.infer<typeof TokenUsageEntrySchema>;

/**
 * Token cost calculation result
 */
export const TokenCostCalculatedSchema = z.object({
  new_prompt_tokens: z.number(),
  new_prompt_cost: z.number(),
  
  prompt_read_cached_tokens: z.number().optional(),
  prompt_read_cached_cost: z.number().optional(),
  
  /** Anthropic only: The cost of creating the cache */
  prompt_cached_creation_tokens: z.number().optional(),
  prompt_cache_creation_cost: z.number().optional(),
  
  completion_tokens: z.number(),
  completion_cost: z.number(),
});

export type TokenCostCalculated = z.infer<typeof TokenCostCalculatedSchema>;

/**
 * Helper class for TokenCostCalculated with computed properties
 */
export class TokenCostCalculatedHelper implements TokenCostCalculated {
  new_prompt_tokens: number;
  new_prompt_cost: number;
  prompt_read_cached_tokens?: number;
  prompt_read_cached_cost?: number;
  prompt_cached_creation_tokens?: number;
  prompt_cache_creation_cost?: number;
  completion_tokens: number;
  completion_cost: number;

  constructor(data: TokenCostCalculated) {
    this.new_prompt_tokens = data.new_prompt_tokens;
    this.new_prompt_cost = data.new_prompt_cost;
    this.prompt_read_cached_tokens = data.prompt_read_cached_tokens;
    this.prompt_read_cached_cost = data.prompt_read_cached_cost;
    this.prompt_cached_creation_tokens = data.prompt_cached_creation_tokens;
    this.prompt_cache_creation_cost = data.prompt_cache_creation_cost;
    this.completion_tokens = data.completion_tokens;
    this.completion_cost = data.completion_cost;
  }

  get prompt_cost(): number {
    return this.new_prompt_cost + 
           (this.prompt_read_cached_cost || 0) + 
           (this.prompt_cache_creation_cost || 0);
  }

  get total_cost(): number {
    return this.new_prompt_cost +
           (this.prompt_read_cached_cost || 0) +
           (this.prompt_cache_creation_cost || 0) +
           this.completion_cost;
  }
}

/**
 * Pricing information for a model
 */
export const ModelPricingSchema = z.object({
  model: z.string(),
  input_cost_per_token: z.number().optional(),
  output_cost_per_token: z.number().optional(),
  
  cache_read_input_token_cost: z.number().optional(),
  cache_creation_input_token_cost: z.number().optional(),
  
  max_tokens: z.number().optional(),
  max_input_tokens: z.number().optional(),
  max_output_tokens: z.number().optional(),
});

export type ModelPricing = z.infer<typeof ModelPricingSchema>;

/**
 * Cached pricing data with timestamp
 */
export const CachedPricingDataSchema = z.object({
  timestamp: z.date(),
  data: z.record(z.any()),
});

export type CachedPricingData = z.infer<typeof CachedPricingDataSchema>;

/**
 * Usage statistics for a single model
 */
export const ModelUsageStatsSchema = z.object({
  model: z.string(),
  prompt_tokens: z.number().default(0),
  completion_tokens: z.number().default(0),
  total_tokens: z.number().default(0),
  cost: z.number().default(0.0),
  invocations: z.number().default(0),
  average_tokens_per_invocation: z.number().default(0.0),
});

export type ModelUsageStats = z.infer<typeof ModelUsageStatsSchema>;

/**
 * Usage tokens for a single model
 */
export const ModelUsageTokensSchema = z.object({
  model: z.string(),
  prompt_tokens: z.number(),
  prompt_cached_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

export type ModelUsageTokens = z.infer<typeof ModelUsageTokensSchema>;

/**
 * Summary of token usage and costs
 */
export const UsageSummarySchema = z.object({
  total_prompt_tokens: z.number(),
  total_prompt_cost: z.number(),
  
  total_prompt_cached_tokens: z.number(),
  total_prompt_cached_cost: z.number(),
  
  total_completion_tokens: z.number(),
  total_completion_cost: z.number(),
  total_tokens: z.number(),
  total_cost: z.number(),
  entry_count: z.number(),
  
  by_model: z.record(ModelUsageStatsSchema).default({}),
});

export type UsageSummary = z.infer<typeof UsageSummarySchema>;

/**
 * Helper functions to create instances
 */
export function createTokenUsageEntry(data: {
  model: string;
  timestamp?: Date;
  usage: ChatInvokeUsage;
}): TokenUsageEntry {
  return {
    model: data.model,
    timestamp: data.timestamp || new Date(),
    usage: data.usage,
  };
}

export function createModelUsageStats(data: Partial<ModelUsageStats> & { model: string }): ModelUsageStats {
  return ModelUsageStatsSchema.parse(data);
}

export function createUsageSummary(data: Partial<UsageSummary>): UsageSummary {
  return UsageSummarySchema.parse({
    total_prompt_tokens: 0,
    total_prompt_cost: 0,
    total_prompt_cached_tokens: 0,
    total_prompt_cached_cost: 0,
    total_completion_tokens: 0,
    total_completion_cost: 0,
    total_tokens: 0,
    total_cost: 0,
    entry_count: 0,
    by_model: {},
    ...data,
  });
}