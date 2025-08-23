import { z } from 'zod';
import { ChatOllama, OllamaChatModelSchema } from '../src/llm/providers/ollama';

// Mock the Ollama client
const mockChat = jest.fn();

jest.mock('ollama', () => {
  return {
    Ollama: jest.fn().mockImplementation(() => ({
      chat: mockChat,
    })),
  };
});

describe('ChatOllama', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      const config = {
        model: 'llama2',
        host: 'http://localhost:11434',
        temperature: 0.7,
      };

      const provider = new ChatOllama(config);
      expect(provider.model).toBe('llama2');
      expect(provider.provider).toBe('ollama');
      expect(provider.name).toBe('ollama/llama2');
    });

    it('should use default config when not provided', () => {
      const provider = new ChatOllama({ model: 'llama2' });
      expect(provider.model).toBe('llama2');
      expect(provider.provider).toBe('ollama');
    });

    it('should validate configuration with Zod schema', () => {
      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        temperature: 0.5,
        top_p: 0.9,
      })).not.toThrow();

      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        temperature: 3.0, // Invalid temperature
      })).toThrow();
    });
  });

  describe('ainvoke', () => {
    it('should make basic API call', async () => {
      const mockResponse = {
        message: {
          content: 'Hello, world!',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const provider = new ChatOllama({ model: 'llama2' });
      const result = await provider.ainvoke([{
        role: 'user' as const,
        content: 'Hello',
        cache: false,
      }]);

      expect(mockChat).toHaveBeenCalledWith({
        model: 'llama2',
        messages: [{
          role: 'user',
          content: 'Hello',
        }],
        options: {
          temperature: undefined,
          top_p: undefined,
          top_k: undefined,
          num_predict: undefined,
          repeat_penalty: undefined,
          seed: undefined,
        },
        keep_alive: undefined,
      });

      expect(result.completion).toBe('Hello, world!');
      expect(result.usage).toBeUndefined();
    });

    it('should handle system messages', async () => {
      const mockResponse = {
        message: {
          content: 'System acknowledged',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const provider = new ChatOllama({ model: 'llama2' });
      await provider.ainvoke([{
        role: 'system' as const,
        content: 'You are a helpful assistant',
        cache: false,
      }]);

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'system',
            content: 'You are a helpful assistant',
          }],
        })
      );
    });

    it('should handle structured output with JSON schema', async () => {
      const mockResponse = {
        message: {
          content: '{"name": "John", "age": 30}',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const provider = new ChatOllama({ model: 'llama2' });
      const result = await provider.ainvoke([{
        role: 'user' as const,
        content: 'Generate user data',
        cache: false,
      }], schema);

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.any(Object), // Schema object
        })
      );

      expect(result.completion).toEqual({ name: 'John', age: 30 });
    });

    it('should handle image messages', async () => {
      const mockResponse = {
        message: {
          content: 'I can see an image',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const provider = new ChatOllama({ model: 'llava' });
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

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'user',
            content: 'What do you see?',
            images: ['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='],
          }],
        })
      );
    });

    it('should handle assistant messages with tool calls', async () => {
      const mockResponse = {
        message: {
          content: 'Function called',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const provider = new ChatOllama({ model: 'llama2' });
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

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'assistant',
            content: 'I will call a function',
            tool_calls: [{
              function: {
                name: 'test_function',
                arguments: { param: 'value' },
              }
            }],
          }],
        })
      );
    });

    it('should handle custom model parameters', async () => {
      const mockResponse = {
        message: {
          content: 'Response with custom params',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const provider = new ChatOllama({ 
        model: 'llama2',
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40,
      });

      await provider.ainvoke([{
        role: 'user' as const,
        content: 'Test',
        cache: false,
      }]);

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            temperature: 0.8,
            top_p: 0.9,
            top_k: 40,
            num_predict: undefined,
            repeat_penalty: undefined,
            seed: undefined,
          },
        })
      );
    });

    it('should throw ModelProviderError on API errors', async () => {
      const apiError = new Error('Model not found');
      mockChat.mockRejectedValue(apiError);

      const provider = new ChatOllama({ model: 'nonexistent' });

      await expect(provider.ainvoke([{
        role: 'user' as const,
        content: 'Test',
        cache: false,
      }])).rejects.toThrow('Ollama API error: Error: Model not found');
    });

    it('should handle empty response content', async () => {
      const mockResponse = {
        message: {
          content: '',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const provider = new ChatOllama({ model: 'llama2' });
      const result = await provider.ainvoke([{
        role: 'user' as const,
        content: 'Test',
        cache: false,
      }]);

      expect(result.completion).toBe('');
    });

    it('should handle structured output parsing errors gracefully', async () => {
      const mockResponse = {
        message: {
          content: 'invalid json',
        },
      };

      mockChat.mockResolvedValue(mockResponse);

      const schema = z.object({
        name: z.string(),
      });

      const provider = new ChatOllama({ model: 'llama2' });

      await expect(provider.ainvoke([{
        role: 'user' as const,
        content: 'Generate JSON',
        cache: false,
      }], schema)).rejects.toThrow('Failed to parse structured output');
    });
  });

  describe('configuration validation', () => {
    it('should validate temperature range', () => {
      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        temperature: -1,
      })).toThrow();

      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        temperature: 3,
      })).toThrow();

      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        temperature: 1.0,
      })).not.toThrow();
    });

    it('should validate top_p range', () => {
      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        top_p: -0.1,
      })).toThrow();

      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        top_p: 1.1,
      })).toThrow();

      expect(() => OllamaChatModelSchema.parse({
        model: 'llama2',
        top_p: 0.9,
      })).not.toThrow();
    });

    it('should accept valid configuration', () => {
      const config = {
        model: 'llama2',
        host: 'http://localhost:11434',
        temperature: 0.7,
        top_p: 0.9,
        timeout: 30000,
      };

      expect(() => OllamaChatModelSchema.parse(config)).not.toThrow();
    });
  });
});