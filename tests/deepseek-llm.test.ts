/**
 * Tests for Deepseek LLM provider
 */

import { z } from 'zod';
import { ChatDeepseek } from '../src/llm/providers/deepseek';
import { BaseMessage, createUserMessage, createSystemMessage, createAssistantMessage } from '../src/llm/messages';

// Mock the OpenAI client (Deepseek uses OpenAI-compatible API)
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

import OpenAI from 'openai';

describe('ChatDeepseek', () => {
  let deepseekChat: ChatDeepseek;
  let mockClient: jest.Mocked<OpenAI>;

  beforeEach(() => {
    deepseekChat = new ChatDeepseek({
      model: 'deepseek-chat',
      api_key: 'test-api-key',
      base_url: 'https://api.deepseek.com/v1'
    });
    
    mockClient = (deepseekChat as any).client;
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(deepseekChat.provider).toBe('deepseek');
      expect(deepseekChat.model_name).toBe('deepseek-chat');
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://api.deepseek.com/v1',
        timeout: undefined,
        maxRetries: 5,
      });
    });

    it('should use environment variables when not provided', () => {
      process.env.DEEPSEEK_API_KEY = 'env-api-key';

      const envChat = new ChatDeepseek();

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'env-api-key',
        baseURL: 'https://api.deepseek.com/v1',
        timeout: undefined,
        maxRetries: 5,
      });

      delete process.env.DEEPSEEK_API_KEY;
    });

    it('should use default model when not specified', () => {
      const defaultChat = new ChatDeepseek({
        api_key: 'test-key'
      });

      expect(defaultChat.model_name).toBe('deepseek-chat');
    });

    it('should use custom base URL', () => {
      const customChat = new ChatDeepseek({
        api_key: 'test-key',
        base_url: 'https://custom.deepseek.com/v1'
      });

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.deepseek.com/v1'
        })
      );
    });
  });

  describe('ainvoke', () => {
    const mockResponse = {
      id: 'chatcmpl-test',
      choices: [{
        message: {
          content: 'Test response',
          role: 'assistant'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    };

    beforeEach(() => {
      mockClient.chat.completions.create = jest.fn().mockResolvedValue(mockResponse as any);
    });

    it('should make basic API call', async () => {
      const messages: BaseMessage[] = [
        createUserMessage('Hello')
      ];

      const result = await deepseekChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.2,
        max_tokens: 4096,
        top_p: undefined,
        seed: undefined
      });

      expect(result.completion).toBe('Test response');
      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      });
    });

    it('should handle system messages', async () => {
      const messages: BaseMessage[] = [
        createSystemMessage('You are a helpful assistant'),
        createUserMessage('Hello')
      ];

      await deepseekChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' }
          ]
        })
      );
    });

    it('should handle custom model parameters', async () => {
      const customChat = new ChatDeepseek({
        model: 'deepseek-coder',
        api_key: 'test-key',
        temperature: 0.7,
        max_completion_tokens: 2048,
        top_p: 0.95,
        seed: 12345
      });
      (customChat as any).client = mockClient;

      const messages: BaseMessage[] = [
        createUserMessage('Generate code')
      ];

      await customChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-coder',
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 0.95,
          seed: 12345
        })
      );
    });

    it('should handle structured output with function calling', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      const structuredResponse = {
        ...mockResponse,
        choices: [{
          message: {
            content: null,
            role: 'assistant',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'structured_response',
                arguments: '{"name": "John", "age": 25}'
              }
            }]
          },
          finish_reason: 'tool_calls'
        }]
      };

      mockClient.chat.completions.create = jest.fn().mockResolvedValue(structuredResponse as any);

      const messages: BaseMessage[] = [
        createUserMessage('Generate a person')
      ];

      const result = await deepseekChat.ainvoke(messages, schema);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [{
            type: 'function',
            function: {
              name: 'structured_response',
              description: 'Return a JSON object with the required structure',
              parameters: expect.any(Object)
            }
          }],
          tool_choice: {
            type: 'function',
            function: { name: 'structured_response' }
          }
        })
      );

      expect(result.completion).toEqual({
        name: "John", 
        age: 25
      });
    });

    it('should handle structured output with system prompt', async () => {
      const schemaChat = new ChatDeepseek({
        model: 'deepseek-chat',
        api_key: 'test-key',
        add_schema_to_system_prompt: true
      });
      (schemaChat as any).client = mockClient;

      const schema = z.object({
        answer: z.string()
      });

      const structuredResponse = {
        ...mockResponse,
        choices: [{
          message: {
            content: '{"answer": "42"}',
            role: 'assistant'
          },
          finish_reason: 'stop'
        }]
      };

      mockClient.chat.completions.create = jest.fn().mockResolvedValue(structuredResponse as any);

      const messages: BaseMessage[] = [
        createUserMessage('What is the answer?')
      ];

      const result = await schemaChat.ainvoke(messages, schema);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('You must respond with valid JSON')
            }),
            { role: 'user', content: 'What is the answer?' }
          ]
        })
      );

      expect(result.completion).toEqual({
        answer: "42"
      });
    });

    it('should handle image messages', async () => {
      const messages: BaseMessage[] = [
        createUserMessage([
          { type: 'text', text: 'What is in this image?' },
          { 
            type: 'image_url', 
            image_url: { 
              url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
              detail: 'high',
              media_type: 'image/jpeg'
            } 
          }
        ])
      ];

      await deepseekChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...'
                }
              }
            ]
          }]
        })
      );
    });

    it('should handle assistant messages with tool calls', async () => {
      const messages: BaseMessage[] = [
        createUserMessage('Hello'),
        createAssistantMessage(null, {
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: {
              name: 'test_function',
              arguments: '{"param": "value"}'
            }
          }]
        })
      ];

      await deepseekChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{"param": "value"}'
                }
              }]
            }
          ]
        })
      );
    });

    it('should retry on rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      mockClient.chat.completions.create = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockResponse as any);

      const messages: BaseMessage[] = [
        createUserMessage('Hello')
      ];

      const result = await deepseekChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(3);
      expect(result.completion).toBe('Test response');
    });

    it('should throw error after max retries', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      mockClient.chat.completions.create = jest.fn().mockRejectedValue(rateLimitError);

      const messages: BaseMessage[] = [
        createUserMessage('Hello')
      ];

      await expect(deepseekChat.ainvoke(messages)).rejects.toThrow('Rate limit exceeded');
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(4); // 1 + 3 retries
    });

    it('should throw ModelProviderError on API errors', async () => {
      const apiError = new Error('Invalid request');
      (apiError as any).status = 400;

      mockClient.chat.completions.create = jest.fn().mockRejectedValue(apiError);

      const messages: BaseMessage[] = [
        createUserMessage('Hello')
      ];

      await expect(deepseekChat.ainvoke(messages)).rejects.toThrow('Deepseek API error: Invalid request');
    });

    it('should handle empty response choices', async () => {
      const emptyResponse = {
        ...mockResponse,
        choices: []
      };

      mockClient.chat.completions.create = jest.fn().mockResolvedValue(emptyResponse as any);

      const messages: BaseMessage[] = [
        createUserMessage('Hello')
      ];

      await expect(deepseekChat.ainvoke(messages)).rejects.toThrow('No response choices received from Deepseek');
    });

    it('should handle missing tool call in structured output', async () => {
      const schema = z.object({
        name: z.string()
      });

      const responseWithoutToolCall = {
        ...mockResponse,
        choices: [{
          message: {
            content: null,
            role: 'assistant',
            tool_calls: []
          },
          finish_reason: 'tool_calls'
        }]
      };

      mockClient.chat.completions.create = jest.fn().mockResolvedValue(responseWithoutToolCall as any);

      const messages: BaseMessage[] = [
        createUserMessage('Generate something')
      ];

      await expect(deepseekChat.ainvoke(messages, schema)).rejects.toThrow('Expected tool call in structured output but got none');
    });
  });

  describe('configuration validation', () => {
    it('should validate temperature range', () => {
      expect(() => new ChatDeepseek({
        model: 'deepseek-chat',
        temperature: -1,
        api_key: 'test'
      })).toThrow();

      expect(() => new ChatDeepseek({
        model: 'deepseek-chat', 
        temperature: 3,
        api_key: 'test'
      })).toThrow();
    });

    it('should validate top_p range', () => {
      expect(() => new ChatDeepseek({
        model: 'deepseek-chat',
        top_p: -0.1,
        api_key: 'test'
      })).toThrow();

      expect(() => new ChatDeepseek({
        model: 'deepseek-chat',
        top_p: 1.1,
        api_key: 'test'
      })).toThrow();
    });

    it('should accept valid configuration', () => {
      expect(() => new ChatDeepseek({
        model: 'deepseek-coder',
        temperature: 0.7,
        max_completion_tokens: 2048,
        top_p: 0.95,
        seed: 12345,
        api_key: 'test-key',
        base_url: 'https://custom.deepseek.com/v1',
        timeout: 30000,
        max_retries: 3
      })).not.toThrow();
    });
  });
});