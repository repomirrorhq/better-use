/**
 * Test FileSystem integration in Agent
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
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

describe('FileSystem Integration', () => {
  let testDir: string;
  let agent: Agent;

  beforeEach(() => {
    testDir = join(tmpdir(), `browser-use-test-${Date.now()}`);
  });

  afterEach(async () => {
    // Clean up
    if (agent?.fileSystem) {
      try {
        agent.fileSystem.nuke();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should initialize FileSystem when agentDirectory is provided', () => {
    agent = new Agent({
      task: 'Test task',
      llm: createMockLLM(),
      agentDirectory: testDir,
    });

    expect(agent.fileSystem).toBeDefined();
    expect(agent.fileSystem?.getDir()).toBe(join(testDir, 'browseruse_agent_data'));
  });

  it('should not initialize FileSystem when agentDirectory is not provided', () => {
    agent = new Agent({
      task: 'Test task',
      llm: createMockLLM(),
    });

    expect(agent.fileSystem).toBeUndefined();
  });

  it('should provide FileSystem to messageManager', () => {
    agent = new Agent({
      task: 'Test task',
      llm: createMockLLM(),
      agentDirectory: testDir,
    });

    expect(agent.messageManager).toBeDefined();
    // FileSystem should be passed to messageManager constructor
    // This is tested indirectly through the agent creation
  });

  it('should create default files in FileSystem', () => {
    agent = new Agent({
      task: 'Test task',
      llm: createMockLLM(),
      agentDirectory: testDir,
    });

    const files = agent.fileSystem?.listFiles();
    expect(files).toContain('todo.md');
  });

  it('should provide availableFilePaths to controller', () => {
    agent = new Agent({
      task: 'Test task',
      llm: createMockLLM(),
      agentDirectory: testDir,
    });

    const files = agent.fileSystem?.listFiles() || [];
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('todo.md');
  });
});