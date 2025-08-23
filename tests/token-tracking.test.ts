/**
 * Test TokenCost integration in Agent
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Agent } from '../src/agent/service';
import { BaseChatModel } from '../src/llm/base';
import { ChatInvokeCompletion } from '../src/llm/views';

// Mock LLM for testing
const createMockLLM = (): BaseChatModel => ({
  provider: 'mock',
  model: 'test',
  name: 'MockLLM',
  model_name: 'test',

  async ainvoke(): Promise<ChatInvokeCompletion> {
    return {
      content: 'Mock response',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };
  },

  async chatCompletion(): Promise<ChatInvokeCompletion> {
    return this.ainvoke();
  },
});

describe('Token Cost Tracking', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      task: 'Test task',
      llm: createMockLLM(),
      settings: {
        calculate_cost: true, // Enable cost calculation
      },
    });
  });

  it('should initialize TokenCost service', () => {
    expect(agent.tokenCost).toBeDefined();
  });

  it('should register LLM with TokenCost service', () => {
    expect(agent.tokenCost).toBeDefined();
    // The LLM should be registered automatically in the constructor
  });

  it('should track usage when getHistory is called', async () => {
    const history = await agent.getHistory();
    
    expect(history.usage).toBeDefined();
    expect(typeof history.usage?.total_tokens).toBe('number');
    expect(typeof history.usage?.total_cost).toBe('number');
    expect(typeof history.usage?.entry_count).toBe('number');
  });

  it('should create usage summary with proper structure', async () => {
    const usage = await agent.tokenCost.getUsageSummary();
    
    expect(usage).toHaveProperty('total_prompt_tokens');
    expect(usage).toHaveProperty('total_completion_tokens');
    expect(usage).toHaveProperty('total_tokens');
    expect(usage).toHaveProperty('total_cost');
    expect(usage).toHaveProperty('entry_count');
    expect(usage).toHaveProperty('by_model');
    
    expect(typeof usage.total_tokens).toBe('number');
    expect(typeof usage.total_cost).toBe('number');
  });

  it('should handle cost calculation disabled', () => {
    const agentNoCost = new Agent({
      task: 'Test task',
      llm: createMockLLM(),
      settings: {
        calculate_cost: false,
      },
    });

    expect(agentNoCost.tokenCost).toBeDefined();
  });
});