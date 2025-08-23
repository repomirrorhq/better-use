/**
 * Token cost service that tracks LLM token usage and costs.
 * 
 * Fetches pricing data from LiteLLM repository and caches it for 1 day.
 * Automatically tracks token usage when LLMs are registered and invoked.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { 
  CachedPricingData,
  ModelPricing,
  ModelUsageStats,
  ModelUsageTokens,
  TokenCostCalculated,
  TokenCostCalculatedHelper,
  TokenUsageEntry,
  UsageSummary,
  createModelUsageStats,
  createTokenUsageEntry,
  createUsageSummary,
} from './views';
import { BaseChatModel } from '../llm/base';
import { ChatInvokeCompletion, ChatInvokeUsage } from '../llm/views';

const logger = console; // Simple logger for now
const costLogger = console; // Cost logging

/**
 * Get XDG cache directory
 */
function xdgCacheHome(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  if (xdgCache && path.isAbsolute(xdgCache)) {
    return xdgCache;
  }
  return path.join(os.homedir(), '.cache');
}

/**
 * Service for tracking token usage and calculating costs
 */
export class TokenCost {
  private static readonly CACHE_DIR_NAME = 'browser_use/token_cost';
  private static readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day in milliseconds
  private static readonly PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

  private include_cost: boolean;
  private usage_history: TokenUsageEntry[] = [];
  private registered_llms: Map<string, BaseChatModel> = new Map();
  private pricing_data: Record<string, any> | null = null;
  private initialized: boolean = false;
  private cache_dir: string;

  constructor(include_cost: boolean = false) {
    this.include_cost = include_cost || 
                       process.env.BROWSER_USE_CALCULATE_COST?.toLowerCase() === 'true';
    this.cache_dir = path.join(xdgCacheHome(), TokenCost.CACHE_DIR_NAME);
  }

  /**
   * Initialize the service by loading pricing data
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      if (this.include_cost) {
        await this.loadPricingData();
      }
      this.initialized = true;
    }
  }

  /**
   * Load pricing data from cache or fetch from GitHub
   */
  private async loadPricingData(): Promise<void> {
    // Try to find a valid cache file
    const cacheFile = await this.findValidCache();

    if (cacheFile) {
      await this.loadFromCache(cacheFile);
    } else {
      await this.fetchAndCachePricingData();
    }
  }

  /**
   * Find the most recent valid cache file
   */
  private async findValidCache(): Promise<string | null> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cache_dir, { recursive: true });

      // List all JSON files in the cache directory
      const files = await fs.readdir(this.cache_dir);
      const cacheFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(this.cache_dir, file));

      if (cacheFiles.length === 0) {
        return null;
      }

      // Sort by modification time (most recent first)
      const filesWithStats = await Promise.all(
        cacheFiles.map(async (file) => {
          try {
            const stats = await fs.stat(file);
            return { file, mtime: stats.mtime };
          } catch {
            return null;
          }
        })
      );

      const validFiles = filesWithStats
        .filter(item => item !== null)
        .sort((a, b) => b!.mtime.getTime() - a!.mtime.getTime());

      // Check each file until we find a valid one
      for (const fileInfo of validFiles) {
        if (fileInfo && await this.isCacheValid(fileInfo.file)) {
          return fileInfo.file;
        } else if (fileInfo) {
          // Clean up old cache files
          try {
            await fs.unlink(fileInfo.file);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a specific cache file is valid and not expired
   */
  private async isCacheValid(cacheFile: string): Promise<boolean> {
    try {
      // Check if file exists  
      await fs.stat(cacheFile);
      
      // Read the cached data
      const content = await fs.readFile(cacheFile, 'utf-8');
      const cached: CachedPricingData = JSON.parse(content);
      
      // Parse timestamp
      const timestamp = new Date(cached.timestamp);
      
      // Check if cache is still valid
      return (Date.now() - timestamp.getTime()) < TokenCost.CACHE_DURATION_MS;
    } catch {
      return false;
    }
  }

  /**
   * Load pricing data from a specific cache file
   */
  private async loadFromCache(cacheFile: string): Promise<void> {
    try {
      const content = await fs.readFile(cacheFile, 'utf-8');
      const cached: CachedPricingData = JSON.parse(content);
      this.pricing_data = cached.data;
    } catch (error) {
      logger.debug(`Error loading cached pricing data from ${cacheFile}: ${error}`);
      // Fall back to fetching
      await this.fetchAndCachePricingData();
    }
  }

  /**
   * Fetch pricing data from LiteLLM GitHub and cache it with timestamp
   */
  private async fetchAndCachePricingData(): Promise<void> {
    try {
      const response = await axios.get(TokenCost.PRICING_URL, { timeout: 30000 });
      this.pricing_data = response.data;

      // Create cache object with timestamp
      const cached: CachedPricingData = {
        timestamp: new Date(),
        data: this.pricing_data || {},
      };

      // Ensure cache directory exists
      await fs.mkdir(this.cache_dir, { recursive: true });

      // Create cache file with timestamp in filename
      const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
      const cacheFile = path.join(this.cache_dir, `pricing_${timestampStr}.json`);

      await fs.writeFile(cacheFile, JSON.stringify(cached, null, 2));
    } catch (error) {
      logger.debug(`Error fetching pricing data: ${error}`);
      // Fall back to empty pricing data
      this.pricing_data = {};
    }
  }

  /**
   * Get pricing information for a specific model
   */
  async getModelPricing(modelName: string): Promise<ModelPricing | null> {
    // Ensure we're initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.pricing_data || !(modelName in this.pricing_data)) {
      return null;
    }

    const data = this.pricing_data[modelName];
    return {
      model: modelName,
      input_cost_per_token: data.input_cost_per_token,
      output_cost_per_token: data.output_cost_per_token,
      max_tokens: data.max_tokens,
      max_input_tokens: data.max_input_tokens,
      max_output_tokens: data.max_output_tokens,
      cache_read_input_token_cost: data.cache_read_input_token_cost,
      cache_creation_input_token_cost: data.cache_creation_input_token_cost,
    };
  }

  /**
   * Calculate cost for a specific model and usage
   */
  async calculateCost(model: string, usage: ChatInvokeUsage): Promise<TokenCostCalculatedHelper | null> {
    if (!this.include_cost) {
      return null;
    }

    const pricing = await this.getModelPricing(model);
    if (pricing === null) {
      return null;
    }

    const uncachedPromptTokens = usage.prompt_tokens - (usage.prompt_cached_tokens || 0);

    const costData: TokenCostCalculated = {
      new_prompt_tokens: usage.prompt_tokens,
      new_prompt_cost: uncachedPromptTokens * (pricing.input_cost_per_token || 0),
      
      // Cached tokens
      prompt_read_cached_tokens: usage.prompt_cached_tokens,
      prompt_read_cached_cost: usage.prompt_cached_tokens && pricing.cache_read_input_token_cost
        ? usage.prompt_cached_tokens * pricing.cache_read_input_token_cost
        : undefined,
      
      // Cache creation tokens
      prompt_cached_creation_tokens: usage.prompt_cache_creation_tokens,
      prompt_cache_creation_cost: usage.prompt_cache_creation_tokens && pricing.cache_creation_input_token_cost
        ? usage.prompt_cache_creation_tokens * pricing.cache_creation_input_token_cost
        : undefined,
      
      // Completion tokens
      completion_tokens: usage.completion_tokens,
      completion_cost: usage.completion_tokens * (pricing.output_cost_per_token || 0),
    };

    return new TokenCostCalculatedHelper(costData);
  }

  /**
   * Add token usage entry to history (without calculating cost)
   */
  addUsage(model: string, usage: ChatInvokeUsage): TokenUsageEntry {
    const entry = createTokenUsageEntry({
      model,
      usage,
    });

    this.usage_history.push(entry);
    return entry;
  }

  /**
   * Log usage to the logger with colors
   */
  private async logUsage(model: string, usage: TokenUsageEntry): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // ANSI color codes
    const C_CYAN = '\x1b[96m';
    // const C_YELLOW = '\x1b[93m'; // TODO: Use if needed
    const C_GREEN = '\x1b[92m';
    // const C_BLUE = '\x1b[94m'; // TODO: Use if needed
    const C_RESET = '\x1b[0m';

    // Always get cost breakdown for token details (even if not showing costs)
    const usageWithTotal = {
      ...usage.usage,
      total_tokens: (usage.usage as any).total_tokens ?? (usage.usage.prompt_tokens + usage.usage.completion_tokens)
    };
    const cost = await this.calculateCost(model, usageWithTotal);

    // Build input tokens breakdown
    const inputPart = this.buildInputTokensDisplay(usageWithTotal, cost);

    // Build output tokens display
    const completionTokensFmt = this.formatTokens(usage.usage.completion_tokens);
    const outputPart = this.include_cost && cost && cost.completion_cost > 0
      ? `📤 ${C_GREEN}${completionTokensFmt} ($${cost.completion_cost.toFixed(4)})${C_RESET}`
      : `📤 ${C_GREEN}${completionTokensFmt}${C_RESET}`;

    costLogger.debug(`🧠 ${C_CYAN}${model}${C_RESET} | ${inputPart} | ${outputPart}`);
  }

  /**
   * Build a clear display of input tokens breakdown with emojis and optional costs
   */
  private buildInputTokensDisplay(usage: ChatInvokeUsage, cost: TokenCostCalculatedHelper | null): string {
    const C_YELLOW = '\x1b[93m';
    const C_BLUE = '\x1b[94m';
    const C_RESET = '\x1b[0m';

    const parts: string[] = [];

    // Always show token breakdown if we have cache information, regardless of cost tracking
    if (usage.prompt_cached_tokens || usage.prompt_cache_creation_tokens) {
      // Calculate actual new tokens (non-cached)
      const newTokens = usage.prompt_tokens - (usage.prompt_cached_tokens || 0);

      if (newTokens > 0) {
        const newTokensFmt = this.formatTokens(newTokens);
        if (this.include_cost && cost && cost.new_prompt_cost > 0) {
          parts.push(`🆕 ${C_YELLOW}${newTokensFmt} ($${cost.new_prompt_cost.toFixed(4)})${C_RESET}`);
        } else {
          parts.push(`🆕 ${C_YELLOW}${newTokensFmt}${C_RESET}`);
        }
      }

      if (usage.prompt_cached_tokens) {
        const cachedTokensFmt = this.formatTokens(usage.prompt_cached_tokens);
        if (this.include_cost && cost?.prompt_read_cached_cost) {
          parts.push(`💾 ${C_BLUE}${cachedTokensFmt} ($${cost.prompt_read_cached_cost.toFixed(4)})${C_RESET}`);
        } else {
          parts.push(`💾 ${C_BLUE}${cachedTokensFmt}${C_RESET}`);
        }
      }

      if (usage.prompt_cache_creation_tokens) {
        const creationTokensFmt = this.formatTokens(usage.prompt_cache_creation_tokens);
        if (this.include_cost && cost?.prompt_cache_creation_cost) {
          parts.push(`🔧 ${C_BLUE}${creationTokensFmt} ($${cost.prompt_cache_creation_cost.toFixed(4)})${C_RESET}`);
        } else {
          parts.push(`🔧 ${C_BLUE}${creationTokensFmt}${C_RESET}`);
        }
      }
    }

    if (parts.length === 0) {
      // Fallback to simple display when no cache information available
      const totalTokensFmt = this.formatTokens(usage.prompt_tokens);
      if (this.include_cost && cost && cost.new_prompt_cost > 0) {
        parts.push(`📥 ${C_YELLOW}${totalTokensFmt} ($${cost.new_prompt_cost.toFixed(4)})${C_RESET}`);
      } else {
        parts.push(`📥 ${C_YELLOW}${totalTokensFmt}${C_RESET}`);
      }
    }

    return parts.join(' + ');
  }

  /**
   * Register an LLM to automatically track its token usage
   * 
   * Guarantees that the same instance is not registered multiple times
   */
  registerLlm(llm: BaseChatModel): BaseChatModel {
    // Use instance ID as key to avoid collisions between multiple instances
    const instanceId = String(this.getObjectId(llm));

    // Check if this exact instance is already registered
    if (this.registered_llms.has(instanceId)) {
      logger.debug(`LLM instance ${instanceId} (${llm.provider}_${llm.model}) is already registered`);
      return llm;
    }

    this.registered_llms.set(instanceId, llm);

    // Store the original method
    const originalAinvoke = llm.ainvoke.bind(llm);
    // Store reference to self for use in the closure
    const tokenCostService = this;

    // Create a wrapped version that tracks usage
    const trackedAinvoke = async function(
      messages: any[], 
      outputFormat?: any
    ): Promise<ChatInvokeCompletion> {
      // Call the original method
      const result = await originalAinvoke(messages, outputFormat);

      // Track usage if available
      if (result.usage) {
        const usage = tokenCostService.addUsage(llm.model, result.usage);
        logger.debug(`Token cost service: ${JSON.stringify(usage)}`);
        
        // Log usage asynchronously (don't await to avoid blocking)
        tokenCostService.logUsage(llm.model, usage).catch(() => {
          // Ignore logging errors
        });
      }

      return result;
    };

    // Replace the method with our tracked version
    (llm as any).ainvoke = trackedAinvoke;

    return llm;
  }

  /**
   * Get a unique ID for an object (simple hash of object properties)
   */
  private getObjectId(obj: any): number {
    return Object.keys(obj).reduce((hash, key) => {
      const char = key.charCodeAt(0);
      return ((hash << 5) - hash) + char;
    }, 0);
  }

  /**
   * Get usage tokens for a specific model
   */
  getUsageTokensForModel(model: string): ModelUsageTokens {
    const filteredUsage = this.usage_history.filter(u => u.model === model);

    return {
      model,
      prompt_tokens: filteredUsage.reduce((sum, u) => sum + u.usage.prompt_tokens, 0),
      prompt_cached_tokens: filteredUsage.reduce((sum, u) => sum + (u.usage.prompt_cached_tokens || 0), 0),
      completion_tokens: filteredUsage.reduce((sum, u) => sum + u.usage.completion_tokens, 0),
      total_tokens: filteredUsage.reduce((sum, u) => sum + u.usage.prompt_tokens + u.usage.completion_tokens, 0),
    };
  }

  /**
   * Get summary of token usage and costs (costs calculated on-the-fly)
   */
  async getUsageSummary(model?: string, since?: Date): Promise<UsageSummary> {
    let filteredUsage = this.usage_history;

    if (model) {
      filteredUsage = filteredUsage.filter(u => u.model === model);
    }

    if (since) {
      filteredUsage = filteredUsage.filter(u => u.timestamp >= since);
    }

    if (filteredUsage.length === 0) {
      return createUsageSummary({});
    }

    // Calculate totals
    const totalPrompt = filteredUsage.reduce((sum, u) => sum + u.usage.prompt_tokens, 0);
    const totalCompletion = filteredUsage.reduce((sum, u) => sum + u.usage.completion_tokens, 0);
    const totalTokens = totalPrompt + totalCompletion;
    const totalPromptCached = filteredUsage.reduce((sum, u) => sum + (u.usage.prompt_cached_tokens || 0), 0);

    // Calculate per-model stats with record-by-record cost calculation
    const modelStats: Record<string, ModelUsageStats> = {};
    let totalPromptCost = 0.0;
    let totalCompletionCost = 0.0;
    let totalPromptCachedCost = 0.0;

    for (const entry of filteredUsage) {
      if (!(entry.model in modelStats)) {
        modelStats[entry.model] = createModelUsageStats({ model: entry.model });
      }

      const stats = modelStats[entry.model];
      stats.prompt_tokens += entry.usage.prompt_tokens;
      stats.completion_tokens += entry.usage.completion_tokens;
      stats.total_tokens += entry.usage.prompt_tokens + entry.usage.completion_tokens;
      stats.invocations += 1;

      if (this.include_cost) {
        // Calculate cost record by record
        const usageWithTotal = {
          ...entry.usage,
          total_tokens: (entry.usage as any).total_tokens ?? (entry.usage.prompt_tokens + entry.usage.completion_tokens)
        };
        const cost = await this.calculateCost(entry.model, usageWithTotal);
        if (cost) {
          stats.cost += cost.total_cost;
          totalPromptCost += cost.prompt_cost;
          totalCompletionCost += cost.completion_cost;
          totalPromptCachedCost += cost.prompt_read_cached_cost || 0;
        }
      }
    }

    // Calculate averages
    for (const stats of Object.values(modelStats)) {
      if (stats.invocations > 0) {
        stats.average_tokens_per_invocation = stats.total_tokens / stats.invocations;
      }
    }

    return createUsageSummary({
      total_prompt_tokens: totalPrompt,
      total_prompt_cost: totalPromptCost,
      total_prompt_cached_tokens: totalPromptCached,
      total_prompt_cached_cost: totalPromptCachedCost,
      total_completion_tokens: totalCompletion,
      total_completion_cost: totalCompletionCost,
      total_tokens: totalTokens,
      total_cost: totalPromptCost + totalCompletionCost + totalPromptCachedCost,
      entry_count: filteredUsage.length,
      by_model: modelStats,
    });
  }

  /**
   * Format token count with k suffix for thousands
   */
  private formatTokens(tokens: number): string {
    if (tokens >= 1000000000) {
      return `${(tokens / 1000000000).toFixed(1)}B`;
    }
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return String(tokens);
  }

  /**
   * Log a comprehensive usage summary per model with colors and nice formatting
   */
  async logUsageSummary(): Promise<void> {
    if (this.usage_history.length === 0) {
      return;
    }

    const summary = await this.getUsageSummary();

    if (summary.entry_count === 0) {
      return;
    }

    // ANSI color codes
    const C_CYAN = '\x1b[96m';
    const C_YELLOW = '\x1b[93m';
    const C_GREEN = '\x1b[92m';
    const C_BLUE = '\x1b[94m';
    const C_MAGENTA = '\x1b[95m';
    const C_RESET = '\x1b[0m';
    const C_BOLD = '\x1b[1m';

    // Log overall summary
    const totalTokensFmt = this.formatTokens(summary.total_tokens);
    const promptTokensFmt = this.formatTokens(summary.total_prompt_tokens);
    const completionTokensFmt = this.formatTokens(summary.total_completion_tokens);

    // Format cost breakdowns for input and output (only if cost tracking is enabled)
    const totalCostPart = this.include_cost && summary.total_cost > 0
      ? ` ($${C_MAGENTA}${summary.total_cost.toFixed(4)}${C_RESET})`
      : '';
    const promptCostPart = this.include_cost ? ` ($${summary.total_prompt_cost.toFixed(4)})` : '';
    const completionCostPart = this.include_cost ? ` ($${summary.total_completion_cost.toFixed(4)})` : '';

    const modelCount = Object.keys(summary.by_model).length;
    if (modelCount > 1) {
      costLogger.debug(
        `💲 ${C_BOLD}Total Usage Summary${C_RESET}: ${C_BLUE}${totalTokensFmt} tokens${C_RESET}${totalCostPart} | ` +
        `⬅️ ${C_YELLOW}${promptTokensFmt}${promptCostPart}${C_RESET} | ➡️ ${C_GREEN}${completionTokensFmt}${completionCostPart}${C_RESET}`
      );
    }

    // Log per-model breakdown
    costLogger.debug(`📊 ${C_BOLD}Per-Model Usage Breakdown${C_RESET}:`);

    for (const [modelName, stats] of Object.entries(summary.by_model)) {
      // Format tokens
      const modelTotalFmt = this.formatTokens(stats.total_tokens);
      const modelPromptFmt = this.formatTokens(stats.prompt_tokens);
      const modelCompletionFmt = this.formatTokens(stats.completion_tokens);
      const avgTokensFmt = this.formatTokens(Math.floor(stats.average_tokens_per_invocation));

      // Format cost display (only if cost tracking is enabled)
      let costPart = '';
      let promptPart = `${C_YELLOW}${modelPromptFmt}${C_RESET}`;
      let completionPart = `${C_GREEN}${modelCompletionFmt}${C_RESET}`;

      if (this.include_cost && stats.cost > 0) {
        costPart = ` ($${C_MAGENTA}${stats.cost.toFixed(4)}${C_RESET})`;
        
        // Calculate per-model costs on-the-fly
        let modelPromptCost = 0.0;
        let modelCompletionCost = 0.0;

        for (const entry of this.usage_history) {
          if (entry.model === modelName) {
            const usageWithTotal = {
              ...entry.usage,
              total_tokens: (entry.usage as any).total_tokens ?? (entry.usage.prompt_tokens + entry.usage.completion_tokens)
            };
            const cost = await this.calculateCost(entry.model, usageWithTotal);
            if (cost) {
              modelPromptCost += cost.prompt_cost;
              modelCompletionCost += cost.completion_cost;
            }
          }
        }

        if (modelPromptCost > 0) {
          promptPart = `${C_YELLOW}${modelPromptFmt} ($${modelPromptCost.toFixed(4)})${C_RESET}`;
        }
        if (modelCompletionCost > 0) {
          completionPart = `${C_GREEN}${modelCompletionFmt} ($${modelCompletionCost.toFixed(4)})${C_RESET}`;
        }
      }

      costLogger.debug(
        `  🤖 ${C_CYAN}${modelName}${C_RESET}: ${C_BLUE}${modelTotalFmt} tokens${C_RESET}${costPart} | ` +
        `⬅️ ${promptPart} | ➡️ ${completionPart} | ` +
        `📞 ${stats.invocations} calls | 📈 ${avgTokensFmt}/call`
      );
    }
  }

  /**
   * Get cost breakdown by model
   */
  async getCostByModel(): Promise<Record<string, ModelUsageStats>> {
    const summary = await this.getUsageSummary();
    return summary.by_model;
  }

  /**
   * Clear usage history
   */
  clearHistory(): void {
    this.usage_history = [];
  }

  /**
   * Force refresh of pricing data from GitHub
   */
  async refreshPricingData(): Promise<void> {
    if (this.include_cost) {
      await this.fetchAndCachePricingData();
    }
  }

  /**
   * Clean up old cache files, keeping only the most recent ones
   */
  async cleanOldCaches(keepCount: number = 3): Promise<void> {
    try {
      // List all JSON files in the cache directory
      const files = await fs.readdir(this.cache_dir);
      const cacheFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(this.cache_dir, file));

      if (cacheFiles.length <= keepCount) {
        return;
      }

      // Get file stats and sort by modification time (oldest first)
      const filesWithStats = await Promise.all(
        cacheFiles.map(async (file) => {
          try {
            const stats = await fs.stat(file);
            return { file, mtime: stats.mtime };
          } catch {
            return null;
          }
        })
      );

      const validFiles = filesWithStats
        .filter(item => item !== null)
        .sort((a, b) => a!.mtime.getTime() - b!.mtime.getTime());

      // Remove all but the most recent files
      const filesToRemove = validFiles.slice(0, -keepCount);
      for (const fileInfo of filesToRemove) {
        if (fileInfo) {
          try {
            await fs.unlink(fileInfo.file);
          } catch {
            // Ignore deletion errors
          }
        }
      }
    } catch (error) {
      logger.debug(`Error cleaning old cache files: ${error}`);
    }
  }

  /**
   * Ensure pricing data is loaded in the background
   */
  async ensurePricingLoaded(): Promise<void> {
    if (!this.initialized && this.include_cost) {
      // This will run in the background and won't block
      await this.initialize();
    }
  }
}