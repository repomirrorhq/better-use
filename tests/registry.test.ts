/**
 * Comprehensive tests for the action registry system to ensure backward compatibility
 * and proper parameter handling for all existing patterns.
 *
 * Tests cover:
 * 1. Existing parameter patterns (individual params, pydantic models)
 * 2. Special parameter injection (browser_session, page_extraction_llm, etc.)
 * 3. Action-to-action calling scenarios
 * 4. Mixed parameter patterns
 * 5. Registry execution edge cases
 */

import { ActionResult } from '../src/agent/views';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { Registry } from '../src/controller/registry/service';
import { ActionModel } from '../src/controller/registry/views';
import {
  ClickElementAction,
  InputTextAction,
  NoParamsAction,
  SearchGoogleAction,
} from '../src/controller/views';
import { UserMessage } from '../src/llm/messages';
import { createMockLLM } from './test-utils/mockLLM';
import { NavigateToUrlEvent } from '../src/browser/events';
import { BaseChatModel } from '../src/llm/base';

// Configure logging
const logger = console;

class TestContext {
  // Simple context for testing
}

// Test parameter models
class SimpleParams extends ActionModel {
  value: string;
  
  constructor(data: { value: string }) {
    super();
    this.value = data.value;
  }
}

class ComplexParams extends ActionModel {
  text: string;
  number: number = 42;
  optional_flag: boolean = false;
  
  constructor(data: { text: string; number?: number; optional_flag?: boolean }) {
    super();
    this.text = data.text;
    this.number = data.number ?? 42;
    this.optional_flag = data.optional_flag ?? false;
  }
}

// Test server setup
let testServerPort: number;
let baseUrl: string;

beforeAll(() => {
  // Mock HTTP server behavior
  testServerPort = 3000 + Math.floor(Math.random() * 1000);
  baseUrl = `http://localhost:${testServerPort}`;
});

// Create mock LLM
const mockLLM = createMockLLM();

// Create registry
function createRegistry() {
  return new Registry<TestContext>();
}

// Create browser session
async function createBrowserSession() {
  const browserSession = new BrowserSession({
    profile: new BrowserProfile({
      headless: true,
      userDataDir: undefined,
      keepAlive: true,
    })
  });
  await browserSession.start();
  browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/test` }));
  await new Promise(resolve => setTimeout(resolve, 500)); // Wait for navigation
  return browserSession;
}

describe('TestActionRegistryParameterPatterns', () => {
  test('individual parameters no browser', async () => {
    const registry = createRegistry();
    
    registry.action('Simple action with individual params')(
      async (text: string, number: number = 10) => {
        return new ActionResult({ extractedContent: `Text: ${text}, Number: ${number}` });
      }
    );
    
    const result = await registry.executeAction('simple_action', { text: 'hello', number: 42 });
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Text: hello, Number: 42');
  });
  
  test('individual parameters with browser', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    registry.action('Action with individual params and browser')(
      async (text: string, browserSession: BrowserSession) => {
        const url = await browserSession.getCurrentPageUrl();
        return new ActionResult({ extractedContent: `Text: ${text}, URL: ${url}` });
      }
    );
    
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/test`, newTab: true }));
    await event;
    
    const result = await registry.executeAction('action_with_browser', { text: 'hello' }, browserSession);
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Text: hello, URL:');
    expect(result.extractedContent).toContain(baseUrl);
    
    await browserSession.kill();
  });
  
  test('pydantic model parameters', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    registry.action('Action with pydantic model', ComplexParams)(
      async (params: ComplexParams, browserSession: BrowserSession) => {
        const url = await browserSession.getCurrentPageUrl();
        return new ActionResult({
          extractedContent: `Text: ${params.text}, Number: ${params.number}, Flag: ${params.optional_flag}, URL: ${url}`
        });
      }
    );
    
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/test`, newTab: true }));
    await event;
    
    const result = await registry.executeAction(
      'pydantic_action',
      { text: 'test', number: 100, optional_flag: true },
      browserSession
    );
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Text: test, Number: 100, Flag: true');
    expect(result.extractedContent).toContain(baseUrl);
    
    await browserSession.kill();
  });
  
  test('mixed special parameters', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    registry.action('Action with multiple special params')(
      async (
        text: string,
        browserSession: BrowserSession,
        pageExtractionLlm: BaseChatModel,
        availableFilePaths: string[]
      ) => {
        const llmResponse = await pageExtractionLlm.ainvoke([new UserMessage({ content: 'test' })]);
        const files = availableFilePaths || [];
        const url = await browserSession.getCurrentPageUrl();
        
        return new ActionResult({
          extractedContent: `Text: ${text}, URL: ${url}, LLM: ${llmResponse.completion}, Files: ${files.length}`
        });
      }
    );
    
    const event = browserSession.eventBus.dispatch(new NavigateToUrlEvent({ url: `${baseUrl}/test`, newTab: true }));
    await event;
    
    const result = await registry.executeAction(
      'multi_special_action',
      { text: 'hello' },
      browserSession,
      mockLLM,
      ['file1.txt', 'file2.txt']
    );
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Text: hello');
    expect(result.extractedContent).toContain(baseUrl);
    expect(result.extractedContent).toContain('"Task completed successfully"');
    expect(result.extractedContent).toContain('Files: 2');
    
    await browserSession.kill();
  });
  
  test('no params action', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    registry.action('No params action', NoParamsAction)(
      async (params: NoParamsAction, browserSession: BrowserSession) => {
        const url = await browserSession.getCurrentPageUrl();
        return new ActionResult({ extractedContent: `No params action executed on ${url}` });
      }
    );
    
    const result = await registry.executeAction(
      'no_params_action',
      { random: 'data', should: 'be', ignored: true },
      browserSession
    );
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('No params action executed on');
    expect(result.extractedContent).toContain('/test');
    
    await browserSession.kill();
  });
});

describe('TestActionToActionCalling', () => {
  test('action calling action with kwargs', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    // Helper function that actions can call
    async function helperFunction(browserSession: BrowserSession, data: string) {
      const url = await browserSession.getCurrentPageUrl();
      return `Helper processed: ${data} on ${url}`;
    }
    
    registry.action('First action')(
      async (text: string, browserSession: BrowserSession) => {
        const result = await helperFunction(browserSession, text);
        return new ActionResult({ extractedContent: `First: ${result}` });
      }
    );
    
    registry.action('Calling action')(
      async (message: string, browserSession: BrowserSession) => {
        const intermediateResult = await registry.executeAction(
          'first_action',
          { text: message },
          browserSession
        );
        return new ActionResult({ extractedContent: `Called result: ${intermediateResult.extractedContent}` });
      }
    );
    
    const result = await registry.executeAction('calling_action', { message: 'test' }, browserSession);
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Called result: First: Helper processed: test on');
    expect(result.extractedContent).toContain('/test');
    
    await browserSession.kill();
  });
  
  test('complex action chain', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    registry.action('Base action')(
      async (value: string, browserSession: BrowserSession) => {
        const url = await browserSession.getCurrentPageUrl();
        return new ActionResult({ extractedContent: `Base: ${value} on ${url}` });
      }
    );
    
    registry.action('Middle action')(
      async (inputVal: string, browserSession: BrowserSession) => {
        const baseResult = await registry.executeAction(
          'base_action',
          { value: `processed-${inputVal}` },
          browserSession
        );
        return new ActionResult({ extractedContent: `Middle: ${baseResult.extractedContent}` });
      }
    );
    
    registry.action('Top action')(
      async (original: string, browserSession: BrowserSession) => {
        const middleResult = await registry.executeAction(
          'middle_action',
          { input_val: `enhanced-${original}` },
          browserSession
        );
        return new ActionResult({ extractedContent: `Top: ${middleResult.extractedContent}` });
      }
    );
    
    const result = await registry.executeAction('top_action', { original: 'test' }, browserSession);
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Top: Middle: Base: processed-enhanced-test on');
    expect(result.extractedContent).toContain('/test');
    
    await browserSession.kill();
  });
});

describe('TestRegistryEdgeCases', () => {
  test('missing required browser session', async () => {
    const registry = createRegistry();
    
    registry.action('Requires browser')(
      async (text: string, browserSession: BrowserSession) => {
        const url = await browserSession.getCurrentPageUrl();
        return new ActionResult({ extractedContent: `Text: ${text}, URL: ${url}` });
      }
    );
    
    await expect(
      registry.executeAction('requires_browser', { text: 'test' })
    ).rejects.toThrow('requires browser_session but none provided');
  });
  
  test('missing required llm', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    registry.action('Requires LLM')(
      async (text: string, browserSession: BrowserSession, pageExtractionLlm: BaseChatModel) => {
        const url = await browserSession.getCurrentPageUrl();
        const llmResponse = await pageExtractionLlm.ainvoke([new UserMessage({ content: 'test' })]);
        return new ActionResult({ extractedContent: `Text: ${text}, LLM: ${llmResponse.completion}` });
      }
    );
    
    await expect(
      registry.executeAction('requires_llm', { text: 'test' }, browserSession)
    ).rejects.toThrow('requires page_extraction_llm but none provided');
    
    await browserSession.kill();
  });
  
  test('nonexistent action', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    await expect(
      registry.executeAction('nonexistent_action', { param: 'value' }, browserSession)
    ).rejects.toThrow('Action nonexistent_action not found');
    
    await browserSession.kill();
  });
  
  test('excluded actions', async () => {
    const browserSession = await createBrowserSession();
    const registryWithExclusions = new Registry<TestContext>(['excluded_action']);
    
    registryWithExclusions.action('Excluded action')(
      async (text: string) => {
        return new ActionResult({ extractedContent: `Should not execute: ${text}` });
      }
    );
    
    registryWithExclusions.action('Included action')(
      async (text: string) => {
        return new ActionResult({ extractedContent: `Should execute: ${text}` });
      }
    );
    
    expect(registryWithExclusions.registry.actions['excluded_action']).toBeUndefined();
    expect(registryWithExclusions.registry.actions['included_action']).toBeDefined();
    
    await expect(
      registryWithExclusions.executeAction('excluded_action', { text: 'test' })
    ).rejects.toThrow('Action excluded_action not found');
    
    const result = await registryWithExclusions.executeAction('included_action', { text: 'test' });
    expect(result.extractedContent).toBeTruthy();
    expect(result.extractedContent).toContain('Should execute: test');
    
    await browserSession.kill();
  });
});

describe('TestExistingControllerActions', () => {
  test('existing action models', async () => {
    const registry = createRegistry();
    const browserSession = await createBrowserSession();
    
    registry.action('Test search', SearchGoogleAction)(
      async (params: SearchGoogleAction, browserSession: BrowserSession) => {
        return new ActionResult({ extractedContent: `Searched for: ${params.query}` });
      }
    );
    
    registry.action('Test click', ClickElementAction)(
      async (params: ClickElementAction, browserSession: BrowserSession) => {
        return new ActionResult({ extractedContent: `Clicked element: ${params.index}` });
      }
    );
    
    registry.action('Test input', InputTextAction)(
      async (params: InputTextAction, browserSession: BrowserSession) => {
        return new ActionResult({ extractedContent: `Input text: ${params.text} at index: ${params.index}` });
      }
    );
    
    const result1 = await registry.executeAction('test_search', { query: 'python testing' }, browserSession);
    expect(result1.extractedContent).toBeTruthy();
    expect(result1.extractedContent).toContain('Searched for: python testing');
    
    const result2 = await registry.executeAction('test_click', { index: 42 }, browserSession);
    expect(result2.extractedContent).toBeTruthy();
    expect(result2.extractedContent).toContain('Clicked element: 42');
    
    const result3 = await registry.executeAction('test_input', { index: 5, text: 'test input' }, browserSession);
    expect(result3.extractedContent).toBeTruthy();
    expect(result3.extractedContent).toContain('Input text: test input at index: 5');
    
    await browserSession.kill();
  });
});