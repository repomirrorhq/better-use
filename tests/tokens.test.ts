import { TokenCost } from '../src/tokens';
import { 
  TokenUsageEntry,
  ModelUsageTokens, 
  UsageSummary,
  createTokenUsageEntry,
  TokenCostCalculatedHelper
} from '../src/tokens/views';
import { AbstractChatModel } from '../src/llm/base';
import { ChatInvokeResponse, ChatInvokeUsage } from '../src/llm/views';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Token Cost Service Tests', () => {
  let tokenCost: TokenCost;
  const testCacheDir = path.join(os.tmpdir(), 'browser-use-test-tokens');
  
  // Mock LLM class for testing
  class MockLLM extends AbstractChatModel {
    constructor(model: string = 'test-model') {
      super(model);
    }
    
    get provider(): string {
      return 'test';
    }

    async ainvoke(messages: any[], outputFormat?: any): Promise<ChatInvokeResponse> {
      return {
        content: 'test response',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_cached_tokens: 0,
          prompt_cache_creation_tokens: 0,
        },
        usage_metadata: {},
      };
    }
  }

  beforeEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist, ignore error
    }

    // Override XDG_CACHE_HOME for testing
    process.env.XDG_CACHE_HOME = path.dirname(testCacheDir);
    
    tokenCost = new TokenCost(false); // Start without cost calculation
    
    // Clear axios mocks
    mockedAxios.get.mockClear();
  });

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Service Initialization', () => {
    it('should initialize without cost calculation by default', async () => {
      const service = new TokenCost();
      await service.initialize();
      
      // Should not have made any network requests
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should initialize with cost calculation when enabled', async () => {
      // Mock successful API response
      const mockPricingData = {
        'test-model': {
          input_cost_per_token: 0.001,
          output_cost_per_token: 0.002,
        },
      };
      mockedAxios.get.mockResolvedValueOnce({ data: mockPricingData });

      const service = new TokenCost(true);
      await service.initialize();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
        { timeout: 30000 }
      );
    });

    it('should handle network errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const service = new TokenCost(true);
      await service.initialize();

      // Should not throw, and should fall back to empty pricing data
      const pricing = await service.getModelPricing('test-model');
      expect(pricing).toBeNull();
    });
  });

  describe('Usage Tracking', () => {
    it('should add usage entries to history', () => {
      const usage: ChatInvokeUsage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        prompt_cached_tokens: 0,
        prompt_cache_creation_tokens: 0,
      };

      const entry = tokenCost.addUsage('test-model', usage);

      expect(entry.model).toBe('test-model');
      expect(entry.usage).toEqual(usage);
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it('should get usage tokens for specific model', () => {
      // Add usage for multiple models
      const usage1: ChatInvokeUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      const usage2: ChatInvokeUsage = { prompt_tokens: 200, completion_tokens: 75, total_tokens: 275 };
      const usage3: ChatInvokeUsage = { prompt_tokens: 150, completion_tokens: 25, total_tokens: 175 };

      tokenCost.addUsage('model-1', usage1);
      tokenCost.addUsage('model-2', usage2);
      tokenCost.addUsage('model-1', usage3); // Another entry for model-1

      const model1Tokens = tokenCost.getUsageTokensForModel('model-1');
      const model2Tokens = tokenCost.getUsageTokensForModel('model-2');

      expect(model1Tokens).toEqual({
        model: 'model-1',
        prompt_tokens: 250, // 100 + 150
        completion_tokens: 75, // 50 + 25
        prompt_cached_tokens: 0,
        total_tokens: 325, // 250 + 75
      });

      expect(model2Tokens).toEqual({
        model: 'model-2',
        prompt_tokens: 200,
        completion_tokens: 75,
        prompt_cached_tokens: 0,
        total_tokens: 275,
      });
    });

    it('should handle cached tokens correctly', () => {
      const usage: ChatInvokeUsage = {
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
        prompt_cached_tokens: 300,
        prompt_cache_creation_tokens: 50,
      };

      tokenCost.addUsage('cached-model', usage);
      const tokens = tokenCost.getUsageTokensForModel('cached-model');

      expect(tokens.prompt_cached_tokens).toBe(300);
      expect(tokens.total_tokens).toBe(1200); // prompt + completion
    });
  });

  describe('LLM Registration', () => {
    it('should register LLM and track its usage automatically', async () => {
      const llm = new MockLLM('registered-model');
      const registeredLlm = tokenCost.registerLlm(llm);

      expect(registeredLlm).toBe(llm); // Should return the same instance

      // Call the LLM method - usage should be tracked automatically
      const result = await registeredLlm.ainvoke(['test message']);

      expect(result.content).toBe('test response');
      
      // Check that usage was recorded
      const tokens = tokenCost.getUsageTokensForModel('registered-model');
      expect(tokens.prompt_tokens).toBe(100);
      expect(tokens.completion_tokens).toBe(50);
    });

    it('should not register the same LLM instance twice', () => {
      const llm = new MockLLM();
      
      const first = tokenCost.registerLlm(llm);
      const second = tokenCost.registerLlm(llm);

      expect(first).toBe(llm);
      expect(second).toBe(llm);
    });

    it('should register different LLM instances separately', () => {
      const llm1 = new MockLLM('model-1');
      const llm2 = new MockLLM('model-2');

      const registered1 = tokenCost.registerLlm(llm1);
      const registered2 = tokenCost.registerLlm(llm2);

      expect(registered1).toBe(llm1);
      expect(registered2).toBe(llm2);
    });
  });

  describe('Cost Calculation', () => {
    beforeEach(async () => {
      // Mock pricing data for cost calculation tests
      const mockPricingData = {
        'expensive-model': {
          input_cost_per_token: 0.001,
          output_cost_per_token: 0.002,
          cache_read_input_token_cost: 0.0001,
          cache_creation_input_token_cost: 0.0005,
        },
        'cheap-model': {
          input_cost_per_token: 0.0001,
          output_cost_per_token: 0.0002,
        },
      };
      mockedAxios.get.mockResolvedValueOnce({ data: mockPricingData });

      tokenCost = new TokenCost(true); // Enable cost calculation
      await tokenCost.initialize();
    });

    it('should calculate basic costs correctly', async () => {
      const usage: ChatInvokeUsage = {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      };

      const cost = await tokenCost.calculateCost('expensive-model', usage);

      expect(cost).not.toBeNull();
      expect(cost!.new_prompt_tokens).toBe(1000);
      expect(cost!.new_prompt_cost).toBe(1.0); // 1000 * 0.001
      expect(cost!.completion_tokens).toBe(500);
      expect(cost!.completion_cost).toBe(1.0); // 500 * 0.002
      expect(cost!.total_cost).toBe(2.0);
    });

    it('should handle cached tokens in cost calculation', async () => {
      const usage: ChatInvokeUsage = {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        prompt_cached_tokens: 300,
        prompt_cache_creation_tokens: 100,
      };

      const cost = await tokenCost.calculateCost('expensive-model', usage);

      expect(cost).not.toBeNull();
      
      // New prompt cost should be for uncached tokens only (1000 - 300 = 700)
      expect(cost!.new_prompt_cost).toBe(0.7); // 700 * 0.001
      expect(cost!.prompt_read_cached_cost).toBe(0.03); // 300 * 0.0001
      expect(cost!.prompt_cache_creation_cost).toBe(0.05); // 100 * 0.0005
      expect(cost!.completion_cost).toBe(1.0); // 500 * 0.002
      
      // Total should include all costs
      expect(cost!.total_cost).toBe(1.78); // 0.7 + 0.03 + 0.05 + 1.0
    });

    it('should return null for unknown models', async () => {
      const usage: ChatInvokeUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      const cost = await tokenCost.calculateCost('unknown-model', usage);
      
      expect(cost).toBeNull();
    });

    it('should return null when cost calculation is disabled', async () => {
      const noCostService = new TokenCost(false);
      const usage: ChatInvokeUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      
      const cost = await noCostService.calculateCost('expensive-model', usage);
      expect(cost).toBeNull();
    });
  });

  describe('Usage Summary', () => {
    beforeEach(async () => {
      // Add some test usage data
      const usage1: ChatInvokeUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      const usage2: ChatInvokeUsage = { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 };
      const usage3: ChatInvokeUsage = { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 };

      tokenCost.addUsage('model-1', usage1);
      tokenCost.addUsage('model-1', usage2);
      tokenCost.addUsage('model-2', usage3);
    });

    it('should generate comprehensive usage summary', async () => {
      const summary = await tokenCost.getUsageSummary();

      expect(summary.total_prompt_tokens).toBe(450); // 100 + 200 + 150
      expect(summary.total_completion_tokens).toBe(225); // 50 + 100 + 75
      expect(summary.total_tokens).toBe(675);
      expect(summary.entry_count).toBe(3);

      // Check per-model breakdown
      expect(summary.by_model['model-1']).toEqual({
        model: 'model-1',
        prompt_tokens: 300,
        completion_tokens: 150,
        total_tokens: 450,
        cost: 0,
        invocations: 2,
        average_tokens_per_invocation: 225,
      });

      expect(summary.by_model['model-2']).toEqual({
        model: 'model-2',
        prompt_tokens: 150,
        completion_tokens: 75,
        total_tokens: 225,
        cost: 0,
        invocations: 1,
        average_tokens_per_invocation: 225,
      });
    });

    it('should filter summary by model', async () => {
      const summary = await tokenCost.getUsageSummary('model-1');

      expect(summary.total_prompt_tokens).toBe(300);
      expect(summary.total_completion_tokens).toBe(150);
      expect(summary.entry_count).toBe(2);
      expect(Object.keys(summary.by_model)).toEqual(['model-1']);
    });

    it('should filter summary by time', async () => {
      const cutoffTime = new Date();
      
      // Add more recent usage
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const recentUsage: ChatInvokeUsage = { prompt_tokens: 500, completion_tokens: 250, total_tokens: 750 };
      tokenCost.addUsage('model-3', recentUsage);

      const summary = await tokenCost.getUsageSummary(undefined, cutoffTime);

      expect(summary.entry_count).toBe(1);
      expect(summary.total_prompt_tokens).toBe(500);
      expect(summary.total_completion_tokens).toBe(250);
    });

    it('should return empty summary for no usage', async () => {
      const emptyService = new TokenCost();
      const summary = await emptyService.getUsageSummary();

      expect(summary).toEqual({
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
      });
    });
  });

  describe('History Management', () => {
    it('should clear usage history', () => {
      // Add some usage
      const usage: ChatInvokeUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      tokenCost.addUsage('test-model', usage);

      expect(tokenCost.getUsageTokensForModel('test-model').total_tokens).toBe(150);

      // Clear history
      tokenCost.clearHistory();

      expect(tokenCost.getUsageTokensForModel('test-model').total_tokens).toBe(0);
    });
  });

  describe('Token Formatting', () => {
    it('should format large numbers correctly via usage display', async () => {
      // Add usage with large token counts
      const largeUsage: ChatInvokeUsage = {
        prompt_tokens: 1500000, // 1.5M
        completion_tokens: 2500000, // 2.5M
        total_tokens: 4000000, // 4M
      };

      tokenCost.addUsage('large-model', largeUsage);

      // The formatting is internal, but we can verify the summary calculation works
      const summary = await tokenCost.getUsageSummary();
      expect(summary.total_tokens).toBe(4000000);
    });
  });

  describe('Cache Management', () => {
    it('should handle cache directory creation', async () => {
      const serviceWithCost = new TokenCost(true);
      
      // Mock successful pricing fetch
      mockedAxios.get.mockResolvedValueOnce({ 
        data: { 'test-model': { input_cost_per_token: 0.001 } }
      });

      await serviceWithCost.initialize();

      // Should not throw errors even if cache directory doesn't exist initially
      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it('should refresh pricing data', async () => {
      const serviceWithCost = new TokenCost(true);
      
      mockedAxios.get.mockResolvedValue({ 
        data: { 'updated-model': { input_cost_per_token: 0.002 } }
      });

      await serviceWithCost.refreshPricingData();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
        { timeout: 30000 }
      );
    });
  });

  describe('Async Operations', () => {
    it('should handle log usage summary without errors', async () => {
      // Add some usage data
      const usage: ChatInvokeUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      tokenCost.addUsage('test-model', usage);

      // This should not throw
      await expect(tokenCost.logUsageSummary()).resolves.toBeUndefined();
    });

    it('should handle empty usage in log summary', async () => {
      // Should not throw for empty usage
      await expect(tokenCost.logUsageSummary()).resolves.toBeUndefined();
    });
  });
});