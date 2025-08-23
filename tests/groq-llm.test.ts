import { z } from 'zod';
import { ChatGroq } from '../src/llm/providers/groq';
import { BaseMessage, createUserMessage, createSystemMessage, createAssistantMessage, createContentPartText, createContentPartImage } from '../src/llm/messages';
import { ModelProviderError, ModelRateLimitError } from '../src/exceptions';

// Mock the groq-sdk module
const mockCreate = jest.fn();

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

const GroqMock = require('groq-sdk') as jest.Mock;

describe('ChatGroq', () => {
  let chatGroq: ChatGroq;

  beforeEach(() => {
    chatGroq = new ChatGroq({
      model: 'llama-3.1-8b-instant',
      api_key: 'test-key',
      temperature: 0.7,
      max_retries: 3
    });
    mockCreate.mockClear();
    GroqMock.mockClear();
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(chatGroq.model).toBe('llama-3.1-8b-instant');
      expect(chatGroq.provider).toBe('groq');
      // Basic validation that instance was created - detailed testing of SDK is not needed
    });

    it('should use environment variables when not provided', () => {
      const originalEnv = process.env.GROQ_API_KEY;
      process.env.GROQ_API_KEY = 'env-api-key';

      const llm = new ChatGroq({ model: 'llama-3.1-8b-instant' });
      expect(llm.model).toBe('llama-3.1-8b-instant');

      process.env.GROQ_API_KEY = originalEnv;
    });

    it('should use default max_retries', () => {
      const llm = new ChatGroq({ model: 'llama-3.1-8b-instant' });
      expect(llm.model).toBe('llama-3.1-8b-instant');
    });

    it('should use custom base URL', () => {
      const llm = new ChatGroq({ 
        model: 'llama-3.1-8b-instant',
        base_url: 'https://custom.groq.com'
      });
      expect(llm.model).toBe('llama-3.1-8b-instant');
    });
  });

  describe('ainvoke', () => {
    const messages: BaseMessage[] = [
      createUserMessage('Hello, world!')
    ];

    it('should make basic API call', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Hello! How can I help you?' },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      });

      const result = await chatGroq.ainvoke(messages);

      expect(result.completion).toBe('Hello! How can I help you?');
      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
        prompt_cached_tokens: undefined,
        prompt_cache_creation_tokens: undefined,
        prompt_image_tokens: undefined,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        temperature: 0.7,
        top_p: undefined,
        seed: undefined,
      });
    });

    it('should handle system messages', async () => {
      const messagesWithSystem: BaseMessage[] = [
        createSystemMessage('You are a helpful assistant.'),
        createUserMessage('Hello!')
      ];

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Hi there!' } }],
        usage: { prompt_tokens: 15, completion_tokens: 3, total_tokens: 18 }
      });

      await chatGroq.ainvoke(messagesWithSystem);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' }
          ],
        })
      );
    });

    it('should handle structured output with JSON schema', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: '{"name": "John", "age": 30}' },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
      });

      const result = await chatGroq.ainvoke(messages, schema);

      expect(result.completion).toEqual({ name: 'John', age: 30 });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama-3.1-8b-instant',
          response_format: expect.objectContaining({
            type: 'json_schema',
          }),
        })
      );
    });

    it('should handle structured output with tool calling for supported models', async () => {
      const toolCallingLlm = new ChatGroq({
        model: 'moonshotai/kimi-k2-instruct',
        api_key: 'test-key',
      });

      const schema = z.object({
        result: z.string(),
      });

      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'extract_information',
                    arguments: '{"result": "success"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 25, completion_tokens: 10, total_tokens: 35 },
      });

      const result = await toolCallingLlm.ainvoke(messages, schema);

      expect(result.completion).toEqual({ result: 'success' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              type: 'function',
              function: expect.objectContaining({
                name: 'extract_information',
              }),
            }),
          ]),
          tool_choice: 'required',
        })
      );
    });

    it('should handle image messages', async () => {
      const messagesWithImage: BaseMessage[] = [
        createUserMessage([
          createContentPartText('What do you see in this image?'),
          createContentPartImage('https://example.com/image.jpg', 'high')
        ])
      ];

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'I see a beautiful landscape.' } }],
        usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 }
      });

      await chatGroq.ainvoke(messagesWithImage);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What do you see in this image?' },
                {
                  type: 'image_url',
                  image_url: { url: 'https://example.com/image.jpg', detail: 'high' }
                }
              ]
            }
          ],
        })
      );
    });

    it('should handle assistant messages with tool calls', async () => {
      const messagesWithToolCalls: BaseMessage[] = [
        createUserMessage('Calculate 2+2'),
        createAssistantMessage(null, {
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'calculate',
                arguments: '{"operation": "add", "a": 2, "b": 2}',
              },
            },
          ],
        })
      ];

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'The result is 4.' } }],
        usage: { prompt_tokens: 40, completion_tokens: 5, total_tokens: 45 }
      });

      await chatGroq.ainvoke(messagesWithToolCalls);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'calculate',
                    arguments: '{"operation": "add", "a": 2, "b": 2}',
                  },
                },
              ],
            }),
          ]),
        })
      );
    });

    it('should retry on rate limiting', async () => {
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
      };

      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Success after retry' } }],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
        });

      const result = await chatGroq.ainvoke(messages);

      expect(result.completion).toBe('Success after retry');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
      };

      mockCreate.mockRejectedValue(rateLimitError);

      await expect(chatGroq.ainvoke(messages)).rejects.toThrow(ModelProviderError);
      expect(mockCreate).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should throw ModelRateLimitError on rate limit', async () => {
      const rateLimitError = new Error('rate limit exceeded');
      mockCreate.mockRejectedValueOnce(rateLimitError);

      await expect(chatGroq.ainvoke(messages)).rejects.toThrow(ModelRateLimitError);
    });

    it('should throw ModelProviderError on API errors', async () => {
      const apiError = {
        status: 400,
        message: 'Bad Request',
      };

      mockCreate.mockRejectedValueOnce(apiError);

      await expect(chatGroq.ainvoke(messages)).rejects.toThrow(ModelProviderError);
    });

    it('should handle empty response choices', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      });

      await expect(chatGroq.ainvoke(messages)).rejects.toThrow(ModelProviderError);
    });

    it('should handle missing usage in response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Response without usage' } }],
      });

      const result = await chatGroq.ainvoke(messages);

      expect(result.completion).toBe('Response without usage');
      expect(result.usage).toBeUndefined();
    });

    it('should handle failed generation fallback', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const failedGenerationError = Object.assign(new Error('Validation error'), {
        status: 422,
        body: {
          error: {
            failed_generation: '```json\n{"name": "Alice", "age": 25}\n```'
          }
        }
      });

      mockCreate.mockRejectedValueOnce(failedGenerationError);

      const result = await chatGroq.ainvoke(messages, schema);

      expect(result.completion).toEqual({ name: 'Alice', age: 25 });
      expect(result.usage).toBeUndefined();
    });

    it('should handle parsing errors gracefully for structured output', async () => {
      const schema = z.object({
        response: z.string(),
      });

      const parseError = Object.assign(new Error('Parse error'), {
        status: 400,
      });

      mockCreate.mockRejectedValueOnce(parseError);

      await expect(chatGroq.ainvoke(messages, schema)).rejects.toThrow(ModelProviderError);
    });
  });

  describe('configuration validation', () => {
    it('should validate temperature range', () => {
      expect(() => {
        new ChatGroq({ model: 'llama-3.1-8b-instant', temperature: -1 });
      }).toThrow();

      expect(() => {
        new ChatGroq({ model: 'llama-3.1-8b-instant', temperature: 3 });
      }).toThrow();
    });

    it('should validate top_p range', () => {
      expect(() => {
        new ChatGroq({ model: 'llama-3.1-8b-instant', top_p: -0.1 });
      }).toThrow();

      expect(() => {
        new ChatGroq({ model: 'llama-3.1-8b-instant', top_p: 1.1 });
      }).toThrow();
    });

    it('should accept valid configuration', () => {
      expect(() => {
        new ChatGroq({
          model: 'llama-3.1-8b-instant',
          temperature: 0.8,
          top_p: 0.9,
          seed: 42,
          service_tier: 'auto',
        });
      }).not.toThrow();
    });
  });
});