import { Agent } from '../src/agent';
import { BrowserProfile, BrowserSession } from '../src/browser';
import { Worker } from 'worker_threads';
import { fork } from 'child_process';
import path from 'path';
import { createMockLLM } from './test-utils/mockLLM';

jest.setTimeout(60000);

describe('Agent Concurrency and Multiprocessing Tests', () => {
  test('one event loop with asyncio.run and one task', async () => {
    const mockLLM = createMockLLM();
    
    const agent = new Agent({
      task: 'Test task',
      llm: mockLLM,
      enableMemory: false,
      browserProfile: new BrowserProfile({ headless: true, userDataDir: undefined })
    });
    
    const result = await agent.run();
    
    expect(result).toBeDefined();
    expect(result.history.length).toBeGreaterThan(0);
    
    const lastHistory = result.history[result.history.length - 1];
    if (lastHistory.model_output?.action) {
      const hasDone = lastHistory.model_output.action.some((action: any) => 'done' in action);
      expect(hasDone).toBe(true);
    }
  });

  test.skip('one event loop two parallel agents', async () => {
    const mockLLM = createMockLLM();
    
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true
      })
    });
    
    try {
      await browserSession.start();
      
      const agent1 = new Agent({
        task: 'First parallel task',
        llm: mockLLM,
        browserSession,
        enableMemory: false
      });
      
      const agent2 = new Agent({
        task: 'Second parallel task',
        llm: mockLLM,
        browserSession,
        enableMemory: false
      });
      
      const results = await Promise.all([agent1.run(), agent2.run()]);
      
      expect(results.length).toBe(2);
      for (const result of results) {
        expect(result.history.length).toBeGreaterThan(0);
        const lastHistory = result.history[result.history.length - 1];
        if (lastHistory.model_output?.action) {
          const hasDone = lastHistory.model_output.action.some((action: any) => 'done' in action);
          expect(hasDone).toBe(true);
        }
      }
      
      expect(agent1.browserSession).toBe(agent2.browserSession);
      expect(agent1.browserSession).toBe(browserSession);
    } finally {
      await browserSession.stop();
    }
  });

  test.skip('one event loop two sequential agents', async () => {
    const mockLLM = createMockLLM();
    
    const browserSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true
      })
    });
    
    try {
      await browserSession.start();
      
      const agent1 = new Agent({
        task: 'First sequential task',
        llm: mockLLM,
        browserSession,
        enableMemory: false
      });
      const result1 = await agent1.run();
      
      const agent2 = new Agent({
        task: 'Second sequential task',
        llm: mockLLM,
        browserSession,
        enableMemory: false
      });
      const result2 = await agent2.run();
      
      for (const result of [result1, result2]) {
        expect(result.history.length).toBeGreaterThan(0);
        const lastHistory = result.history[result.history.length - 1];
        if (lastHistory.model_output?.action) {
          const hasDone = lastHistory.model_output.action.some((action: any) => 'done' in action);
          expect(hasDone).toBe(true);
        }
      }
      
      expect(agent1.browserSession).toBe(agent2.browserSession);
      expect(agent1.browserSession).toBe(browserSession);
    } finally {
      await browserSession.stop();
    }
  });

  test('two event loops sequential', async () => {
    const mockLLM = createMockLLM();
    
    const agent1 = new Agent({
      task: 'First loop task',
      llm: mockLLM,
      enableMemory: false,
      browserProfile: new BrowserProfile({ headless: true, userDataDir: undefined })
    });
    const result1 = await agent1.run();
    
    const agent2 = new Agent({
      task: 'Second loop task',
      llm: mockLLM,
      enableMemory: false,
      browserProfile: new BrowserProfile({ headless: true, userDataDir: undefined })
    });
    const result2 = await agent2.run();
    
    for (const result of [result1, result2]) {
      expect(result.history.length).toBeGreaterThan(0);
      const lastHistory = result.history[result.history.length - 1];
      if (lastHistory.model_output?.action) {
        const hasDone = lastHistory.model_output.action.some((action: any) => 'done' in action);
        expect(hasDone).toBe(true);
      }
    }
  });

  test('two event loops one per thread using worker threads', async () => {
    const results: any[] = [];
    
    const runWorker = (taskDescription: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        const workerScript = `
          const { parentPort } = require('worker_threads');
          const { Agent } = require('../dist/agent');
          const { BrowserProfile } = require('../dist/browser');
          const { createMockLLM } = require('../dist/tests/test-utils/mockLLM');
          
          (async () => {
            try {
              const mockLLM = createMockLLM();
              const agent = new Agent({
                task: '${taskDescription}',
                llm: mockLLM,
                enableMemory: false,
                browserProfile: new BrowserProfile({ headless: true, userDataDir: undefined })
              });
              const result = await agent.run();
              
              const lastHistory = result.history[result.history.length - 1];
              const hasDone = lastHistory.model_output?.action?.some(action => 'done' in action) || false;
              
              parentPort.postMessage({ success: hasDone, error: null });
            } catch (error) {
              parentPort.postMessage({ success: false, error: error.message });
            }
          })();
        `;
        
        const worker = new Worker(workerScript, { eval: true });
        
        worker.on('message', (result) => {
          resolve(result);
        });
        
        worker.on('error', reject);
      });
    };
    
    const [result1, result2] = await Promise.all([
      runWorker('Thread 1 task'),
      runWorker('Thread 2 task')
    ]);
    
    results.push(result1, result2);
    
    expect(results.length).toBe(2);
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.success).toBe(true);
    }
  });

  test('two subprocesses one agent per subprocess', async () => {
    const runSubprocess = (taskDescription: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        const subprocess = fork(path.join(__dirname, 'agent-subprocess-worker.js'), [taskDescription]);
        
        subprocess.on('message', (result) => {
          resolve(result);
        });
        
        subprocess.on('error', reject);
      });
    };
    
    const [result1, result2] = await Promise.all([
      runSubprocess('Subprocess 1 task'),
      runSubprocess('Subprocess 2 task')
    ]);
    
    const results = [result1, result2];
    
    expect(results.length).toBe(2);
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.success).toBe(true);
    }
  });

  test.skip('shared browser session multiple tabs', async () => {
    const tabAction = {
      thinking: 'null',
      evaluation_previous_goal: 'Starting task',
      memory: 'Need new tab',
      next_goal: 'Create new tab',
      action: [
        {
          go_to_url: {
            url: 'https://example.com',
            new_tab: true
          }
        }
      ]
    };
    
    const doneAction = {
      thinking: 'null',
      evaluation_previous_goal: 'Tab created',
      memory: 'Task done',
      next_goal: 'Complete',
      action: [
        {
          done: {
            text: 'Task completed',
            success: true
          }
        }
      ]
    };
    
    const mockLLM1 = createMockLLM([JSON.stringify(tabAction), JSON.stringify(doneAction)]);
    const mockLLM2 = createMockLLM([JSON.stringify(tabAction), JSON.stringify(doneAction)]);
    
    const sharedSession = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true
      })
    });
    
    try {
      await sharedSession.start();
      
      const agent1 = new Agent({
        task: 'Task in tab 1',
        llm: mockLLM1,
        browserSession: sharedSession,
        enableMemory: false
      });
      
      const agent2 = new Agent({
        task: 'Task in tab 2',
        llm: mockLLM2,
        browserSession: sharedSession,
        enableMemory: false
      });
      
      const results = await Promise.all([agent1.run(), agent2.run()]);
      
      for (const result of results) {
        expect(result.history.length).toBeGreaterThan(0);
        const lastHistory = result.history[result.history.length - 1];
        if (lastHistory.model_output?.action) {
          const hasDone = lastHistory.model_output.action.some((action: any) => 'done' in action);
          expect(hasDone).toBe(true);
        }
      }
      
      const tabs = await sharedSession.getTabs();
      expect(tabs.length).toBeGreaterThanOrEqual(2);
      
      expect(agent1.browserSession).toBe(agent2.browserSession);
      expect(agent1.browserSession).toBe(sharedSession);
    } finally {
      await new Promise(resolve => setTimeout(resolve, 100));
      await sharedSession.stop();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  test.skip('reuse browser session sequentially', async () => {
    const mockLLM = createMockLLM();
    
    const session = new BrowserSession({
      profile: new BrowserProfile({
        headless: true,
        userDataDir: undefined,
        keepAlive: true
      })
    });
    
    try {
      await session.start();
      
      const agent1 = new Agent({
        task: 'First task',
        llm: mockLLM,
        browserSession: session,
        enableMemory: false
      });
      const result1 = await agent1.run();
      
      const agent2 = new Agent({
        task: 'Second task',
        llm: mockLLM,
        browserSession: session,
        enableMemory: false
      });
      const result2 = await agent2.run();
      
      for (const result of [result1, result2]) {
        expect(result.history.length).toBeGreaterThan(0);
        const lastHistory = result.history[result.history.length - 1];
        if (lastHistory.model_output?.action) {
          const hasDone = lastHistory.model_output.action.some((action: any) => 'done' in action);
          expect(hasDone).toBe(true);
        }
      }
    } finally {
      await session.stop();
    }
  });
});