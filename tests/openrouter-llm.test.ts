import { z } from 'zod';
import { ChatOpenRouter, OpenRouterChatModelSchema } from '../src/llm/providers/openrouter';

// Mock the OpenAI client
const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('ChatOpenRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      const config = {
        model: 'openai/gpt-4o',
        api_key: 'test-key',
        http_referer: 'https://example.com',
        temperature: 0.7,
      };

      const provider = new ChatOpenRouter(config);
      expect(provider.model).toBe('openai/gpt-4o');
      expect(provider.provider).toBe('openrouter');
      expect(provider.name).toBe('openrouter/openai/gpt-4o');
    });

    it('should use environment variables when not provided', () => {
      process.env.OPENROUTER_API_KEY = 'env-key';
      
      const provider = new ChatOpenRouter({ model: 'anthropic/claude-3.5-sonnet' });
      expect(provider.model).toBe('anthropic/claude-3.5-sonnet');
      
      delete process.env.OPENROUTER_API_KEY;
    });

    it('should use default base URL', () => {
      const config = {
        model: 'openai/gpt-4o',
      };

      const provider = new ChatOpenRouter(config);
      expect(provider.model).toBe('openai/gpt-4o');
    });

    it('should handle custom base URL', () => {
      const config = {
        model: 'openai/gpt-4o',
        base_url: 'https://custom-openrouter.ai/api/v1',
      };

      const provider = new ChatOpenRouter(config);
      expect(provider.model).toBe('openai/gpt-4o');
    });
  });

  describe('ainvoke', () => {
    it('should make basic API call', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Hello, world!',
          },
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'test-key'
      });
      
      const result = await provider.ainvoke([{
        role: 'user' as const,
        content: 'Hello',
        cache: false,
      }]);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-4o',
        messages: [{
          role: 'user',
          content: 'Hello',
          name: undefined,
        }],
        temperature: undefined,
        top_p: undefined,
        seed: undefined,
      });

      expect(result.completion).toBe('Hello, world!');
      expect(result.usage).toEqual({
        prompt_tokens: 10,
        prompt_cached_tokens: 0,
        prompt_cache_creation_tokens: 0,
        prompt_image_tokens: 0,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it('should handle system messages', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'System acknowledged',
          },
        }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new ChatOpenRouter({ 
        model: 'anthropic/claude-3.5-sonnet',
        api_key: 'test-key'
      });
      
      await provider.ainvoke([{
        role: 'system' as const,
        content: 'You are a helpful assistant',
        cache: false,
      }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'system',
            content: 'You are a helpful assistant',
            name: undefined,
          }],
        })
      );
    });

    it('should handle structured output with JSON schema', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '{"name": "John", "age": 30}',
          },
        }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'test-key'
      });
      
      const result = await provider.ainvoke([{
        role: 'user' as const,
        content: 'Generate user data',
        cache: false,
      }], schema);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'agent_output',
              strict: true,
              schema: expect.any(Object),
            },
          },
        })
      );

      expect(result.completion).toEqual({ name: 'John', age: 30 });
    });

    it('should handle image messages', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'I can see an image',
          },
        }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'test-key'
      });
      
      await provider.ainvoke([{
        role: 'user' as const,
        content: [
          { type: 'text', text: 'What do you see?' },
          { 
            type: 'image_url', 
            image_url: { 
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
              detail: 'auto' as const,
              media_type: 'image/png' as const,
            }
          }
        ],
        cache: false,
      }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'What do you see?' },
              { 
                type: 'image_url', 
                image_url: { 
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                  detail: 'auto',
                }
              }
            ],
            name: undefined,
          }],
        })
      );
    });

    it('should handle assistant messages with tool calls', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Function called',
          },
        }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new ChatOpenRouter({ 
        model: 'anthropic/claude-3.5-sonnet',
        api_key: 'test-key'
      });
      
      await provider.ainvoke([{
        role: 'assistant' as const,
        content: 'I will call a function',
        tool_calls: [{
          id: 'call_123',
          type: 'function' as const,
          function: {
            name: 'test_function',
            arguments: '{"param": "value"}',
          },
        }],
        cache: false,
      }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'assistant',
            content: 'I will call a function',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'test_function',
                arguments: '{"param": "value"}',
              }
            }],
          }],
        })
      );
    });

    it('should handle custom model parameters', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Response with custom params',
          },
        }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new ChatOpenRouter({ 
        model: 'meta-llama/llama-3.1-8b-instruct',
        api_key: 'test-key',
        temperature: 0.8,
        top_p: 0.9,
        seed: 42,
      });

      await provider.ainvoke([{
        role: 'user' as const,
        content: 'Test',
        cache: false,
      }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          top_p: 0.9,
          seed: 42,
        })
      );
    });

    it('should throw ModelRateLimitError on rate limit', async () => {
      const rateError = new Error('Rate limit exceeded');
      (rateError as any).status = 429;
      (rateError as any).type = 'rate_limit_error';
      mockCreate.mockRejectedValue(rateError);

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'test-key'
      });

      await expect(provider.ainvoke([{
        role: 'user' as const,
        content: 'Test',
        cache: false,
      }])).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw ModelProviderError on API errors', async () => {
      const apiError = new Error('Invalid API key');
      (apiError as any).status = 401;
      mockCreate.mockRejectedValue(apiError);

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'invalid-key'
      });

      await expect(provider.ainvoke([{
        role: 'user' as const,
        content: 'Test',
        cache: false,
      }])).rejects.toThrow('Invalid API key');
    });

    it('should handle empty response content', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '',
          },
        }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'test-key'
      });
      
      const result = await provider.ainvoke([{
        role: 'user' as const,
        content: 'Test',
        cache: false,
      }]);

      expect(result.completion).toBe('');
    });

    it('should handle missing response content for structured output', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: null,
          },
        }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const schema = z.object({
        name: z.string(),
      });

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'test-key'
      });

      await expect(provider.ainvoke([{
        role: 'user' as const,
        content: 'Generate JSON',
        cache: false,
      }], schema)).rejects.toThrow('Failed to parse structured output from model response');
    });

    it('should handle structured output parsing errors gracefully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'invalid json',
          },
        }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const schema = z.object({
        name: z.string(),
      });

      const provider = new ChatOpenRouter({ 
        model: 'openai/gpt-4o',
        api_key: 'test-key'
      });

      await expect(provider.ainvoke([{
        role: 'user' as const,
        content: 'Generate JSON',
        cache: false,
      }], schema)).rejects.toThrow('Failed to parse structured output');
    });
  });

  describe('configuration validation', () => {
    it('should validate temperature range', () => {
      expect(() => OpenRouterChatModelSchema.parse({
        model: 'openai/gpt-4o',
        temperature: -1,
      })).toThrow();

      expect(() => OpenRouterChatModelSchema.parse({
        model: 'openai/gpt-4o',
        temperature: 3,
      })).toThrow();

      expect(() => OpenRouterChatModelSchema.parse({
        model: 'openai/gpt-4o',
        temperature: 1.0,
      })).not.toThrow();
    });

    it('should validate top_p range', () => {
      expect(() => OpenRouterChatModelSchema.parse({
        model: 'openai/gpt-4o',
        top_p: -0.1,
      })).toThrow();

      expect(() => OpenRouterChatModelSchema.parse({
        model: 'openai/gpt-4o',
        top_p: 1.1,
      })).toThrow();

      expect(() => OpenRouterChatModelSchema.parse({
        model: 'openai/gpt-4o',
        top_p: 0.9,
      })).not.toThrow();
    });

    it('should accept valid configuration', () => {
      const config = {
        model: 'anthropic/claude-3.5-sonnet',
        api_key: 'test-key',
        http_referer: 'https://example.com',
        temperature: 0.7,
        top_p: 0.9,
        max_retries: 5,
      };

      expect(() => OpenRouterChatModelSchema.parse(config)).not.toThrow();
    });

    it('should use default base URL when not provided', () => {
      const config = { model: 'openai/gpt-4o' };
      const parsed = OpenRouterChatModelSchema.parse(config);
      expect(parsed.base_url).toBe('https://openrouter.ai/api/v1');
    });

    it('should use default max_retries when not provided', () => {
      const config = { model: 'openai/gpt-4o' };
      const parsed = OpenRouterChatModelSchema.parse(config);
      expect(parsed.max_retries).toBe(10);
    });
  });
});