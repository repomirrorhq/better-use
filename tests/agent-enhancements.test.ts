/**
 * Tests for Agent service enhancements
 * 
 * Tests the new features added to the Agent service:
 * - Initial actions
 * - URL extraction from task
 * - Retry logic for LLM calls
 * - Enhanced postProcess logging
 * - registerDoneCallback
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Agent } from '../src/agent/service';
import { BaseChatModel } from '../src/llm/base';
import { BrowserSession } from '../src/browser/session';
import { createAgentSettings } from '../src/agent/views';

// Mock dependencies
jest.mock('../src/browser/session');
jest.mock('../src/llm/base');
jest.mock('../src/logging', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Agent Service Enhancements', () => {
  let mockLLM: jest.Mocked<BaseChatModel>;
  let mockBrowserSession: jest.Mocked<BrowserSession>;
  
  beforeEach(() => {
    // Create mock LLM
    mockLLM = {
      ainvoke: jest.fn(),
      invoke: jest.fn(),
      registerTokenCallback: jest.fn(),
      model: 'test-model',
    } as any;
    
    // Create mock browser session
    mockBrowserSession = {
      id: 'test-session-123',
      start: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      page: {
        goto: jest.fn(),
        evaluate: jest.fn(),
      },
    } as any;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('URL Extraction', () => {
    it('should extract URL from task string', () => {
      const agent = new Agent({
        task: 'Go to https://example.com and extract the title',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      // Access private method through any cast
      const extractedUrl = (agent as any).extractUrlFromTask(agent.task);
      expect(extractedUrl).toBe('https://example.com');
    });
    
    it('should default to Google for search tasks', () => {
      const agent = new Agent({
        task: 'Search for TypeScript tutorials',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      const extractedUrl = (agent as any).extractUrlFromTask(agent.task);
      expect(extractedUrl).toBe('https://google.com');
    });
    
    it('should return null for tasks without URLs', () => {
      const agent = new Agent({
        task: 'Click the submit button',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      const extractedUrl = (agent as any).extractUrlFromTask(agent.task);
      expect(extractedUrl).toBeNull();
    });
  });
  
  describe('Initial Actions', () => {
    it('should accept initial actions in constructor', () => {
      const initialActions = [
        { go_to_url: { url: 'https://test.com' } },
        { click: { index: 1 } }
      ];
      
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
        initialActions,
      });
      
      expect(agent.initialActions).toEqual(initialActions);
    });
    
    it('should respect preload setting', () => {
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
        preload: false,
      });
      
      expect(agent.preload).toBe(false);
    });
  });
  
  describe('Retry Logic', () => {
    it('should retry LLM calls on failure', async () => {
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      // Setup action models first
      (agent as any).setupActionModels();
      
      // Mock LLM to fail twice then succeed
      const mockResponse = {
        completion: {
          action: [{ action: 'done', text: 'Complete' }],
          thinking: null,
          evaluation_previous_goal: null,
          memory: 'Test memory',
          next_goal: 'Complete task',
        }
      };
      
      mockLLM.ainvoke
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(mockResponse);
      
      const result = await (agent as any).getModelOutputWithRetry([]);
      
      expect(mockLLM.ainvoke).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockResponse.completion);
    });
    
    it('should throw after max retries exceeded', async () => {
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      (agent as any).setupActionModels();
      
      // Mock LLM to always fail
      mockLLM.ainvoke.mockRejectedValue(new Error('Persistent error'));
      
      await expect(
        (agent as any).getModelOutputWithRetry([])
      ).rejects.toThrow('Persistent error');
      
      expect(mockLLM.ainvoke).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('Done Callback', () => {
    it('should accept and call registerDoneCallback', async () => {
      const doneCallback = jest.fn();
      
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
        registerDoneCallback: doneCallback,
      });
      
      expect(agent.registerDoneCallback).toBe(doneCallback);
      
      // Simulate completion
      (agent as any).history = [
        {
          model_output: { action: [{ action: 'done', text: 'Complete', success: true }] },
          result: [{ is_done: true, success: true }],
          state: {},
          metadata: {},
        }
      ];
      
      // Mock isDone to return true
      agent.isDone = jest.fn().mockReturnValue(true);
      
      // Simulate successful run completion
      await agent.run(1);
      
      // Verify callback was called
      expect(doneCallback).toHaveBeenCalled();
    });
  });
  
  describe('Enhanced Logging', () => {
    it('should log colored results for success', async () => {
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      // Mock the logger on the agent instance
      const mockLogger = {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      (agent as any).logger = mockLogger;
      
      // Set up successful result
      agent.state.last_result = [{
        is_done: true,
        success: true,
        extracted_content: 'Success content',
        attachments: ['file1.txt', 'file2.txt'],
      }];
      
      // Call postProcess
      await (agent as any).postProcess({
        url: 'https://test.com',
        title: 'Test',
        tabs: [],
        screenshot: null,
      });
      
      // Check for colored output (green for success)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('\x1b[32m')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attachment')
      );
    });
    
    it('should log colored results for failure', async () => {
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      // Mock the logger on the agent instance
      const mockLogger = {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      (agent as any).logger = mockLogger;
      
      // Set up failed result
      agent.state.last_result = [{
        is_done: true,
        success: false,
        extracted_content: 'Failure content',
      }];
      
      // Call postProcess
      await (agent as any).postProcess({
        url: 'https://test.com',
        title: 'Test',
        tabs: [],
        screenshot: null,
      });
      
      // Check for colored output (red for failure)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('\x1b[31m')
      );
    });
  });
  
  describe('Wait Until Resumed', () => {
    it('should wait while paused', async () => {
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      agent.state.paused = true;
      
      // Set up to unpause after 100ms
      setTimeout(() => {
        agent.state.paused = false;
      }, 100);
      
      const startTime = Date.now();
      await (agent as any).waitUntilResumed();
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
      expect(agent.state.paused).toBe(false);
    });
    
    it('should exit if stopped while paused', async () => {
      const agent = new Agent({
        task: 'Test task',
        llm: mockLLM,
        browserSession: mockBrowserSession,
      });
      
      agent.state.paused = true;
      
      // Set up to stop after 50ms
      setTimeout(() => {
        agent.state.stopped = true;
      }, 50);
      
      await (agent as any).waitUntilResumed();
      
      expect(agent.state.stopped).toBe(true);
    });
  });
});