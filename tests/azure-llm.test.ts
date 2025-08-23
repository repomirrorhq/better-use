/**
 * Tests for Azure OpenAI LLM provider
 */

import { z } from 'zod';
import { ChatAzureOpenAI } from '../src/llm/providers/azure';
import { BaseMessage, createUserMessage, createSystemMessage, createAssistantMessage } from '../src/llm/messages';

// Mock the Azure OpenAI client
jest.mock('openai', () => ({
  AzureOpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

import { AzureOpenAI } from 'openai';

describe('ChatAzureOpenAI', () => {
  let azureChat: ChatAzureOpenAI;
  let mockClient: jest.Mocked<AzureOpenAI>;

  beforeEach(() => {
    azureChat = new ChatAzureOpenAI({
      model: 'gpt-4',
      api_key: 'test-api-key',
      azure_endpoint: 'https://test.openai.azure.com',
      azure_deployment: 'test-deployment'
    });
    
    mockClient = (azureChat as any).client;
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(azureChat.provider).toBe('azure');
      expect(azureChat.model_name).toBe('gpt-4');
      expect(AzureOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        apiVersion: '2024-12-01-preview',
        azureADTokenProvider: undefined,
        endpoint: 'https://test.openai.azure.com',
        deployment: 'test-deployment',
        timeout: undefined,
        maxRetries: 5,
      });
    });

    it('should use environment variables when not provided', () => {
      process.env.AZURE_OPENAI_API_KEY = 'env-api-key';
      process.env.AZURE_OPENAI_ENDPOINT = 'https://env.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'env-deployment';

      const envChat = new ChatAzureOpenAI({
        model: 'gpt-35-turbo'
      });

      expect(AzureOpenAI).toHaveBeenCalledWith({
        apiKey: 'env-api-key',
        apiVersion: '2024-12-01-preview',
        azureADTokenProvider: undefined,
        endpoint: 'https://env.openai.azure.com',
        deployment: 'env-deployment',
        timeout: undefined,
        maxRetries: 5,
      });

      delete process.env.AZURE_OPENAI_API_KEY;
      delete process.env.AZURE_OPENAI_ENDPOINT;
      delete process.env.AZURE_OPENAI_DEPLOYMENT;
    });

    it('should use custom api_version', () => {
      const customChat = new ChatAzureOpenAI({
        model: 'gpt-4',
        api_version: '2023-12-01-preview',
        api_key: 'test-key',
        azure_endpoint: 'https://test.openai.azure.com'
      });

      expect(AzureOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiVersion: '2023-12-01-preview'
        })
      );
    });
  });

  describe('invoke', () => {
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

      const result = await azureChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.2,
        frequency_penalty: 0.3,
        top_p: undefined,
        max_tokens: 4096,
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

      await azureChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' }
          ]
        })
      );
    });

    it('should handle structured output with response_format', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      const structuredResponse = {
        ...mockResponse,
        choices: [{
          message: {
            content: '{"name": "John", "age": 25}',
            role: 'assistant'
          },
          finish_reason: 'stop'
        }]
      };

      mockClient.chat.completions.create = jest.fn().mockResolvedValue(structuredResponse as any);

      const messages: BaseMessage[] = [
        createUserMessage('Generate a person')
      ];

      const result = await azureChat.ainvoke(messages, schema);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              schema: expect.any(Object),
              strict: true
            }
          }
        })
      );

      expect(result.completion).toEqual({
        name: "John", 
        age: 25
      });
    });

    it('should handle reasoning models with system prompt', async () => {
      const reasoningChat = new ChatAzureOpenAI({
        model: 'o1-preview',
        api_key: 'test-key',
        azure_endpoint: 'https://test.openai.azure.com'
      });
      (reasoningChat as any).client = mockClient;

      const schema = z.object({
        answer: z.string()
      });

      const messages: BaseMessage[] = [
        createUserMessage('Solve this problem')
      ];

      await reasoningChat.ainvoke(messages, schema);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('You must respond with valid JSON')
            }),
            { role: 'user', content: 'Solve this problem' }
          ]
        })
      );
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

      await azureChat.ainvoke(messages);

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
                  detail: 'high'
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

      await azureChat.ainvoke(messages);

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

      const result = await azureChat.ainvoke(messages);

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

      await expect(azureChat.ainvoke(messages)).rejects.toThrow('Rate limit exceeded');
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(4); // 1 + 3 retries
    });

    it('should throw ModelProviderError on API errors', async () => {
      const apiError = new Error('Invalid request');
      (apiError as any).status = 400;

      mockClient.chat.completions.create = jest.fn().mockRejectedValue(apiError);

      const messages: BaseMessage[] = [
        createUserMessage('Hello')
      ];

      await expect(azureChat.ainvoke(messages)).rejects.toThrow('Azure OpenAI API error: Invalid request');
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

      await expect(azureChat.ainvoke(messages)).rejects.toThrow('No response choices received from Azure OpenAI');
    });

    it('should include reasoning tokens in usage', async () => {
      const responseWithReasoning = {
        ...mockResponse,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 20,
          completion_tokens_details: {
            reasoning_tokens: 5
          }
        }
      };

      mockClient.chat.completions.create = jest.fn().mockResolvedValue(responseWithReasoning as any);

      const messages: BaseMessage[] = [
        createUserMessage('Hello')
      ];

      const result = await azureChat.ainvoke(messages);

      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 10, // 5 completion + 5 reasoning
        total_tokens: 20
      });
    });
  });

  describe('configuration validation', () => {
    it('should validate temperature range', () => {
      expect(() => new ChatAzureOpenAI({
        model: 'gpt-4',
        temperature: -1,
        api_key: 'test'
      })).toThrow();

      expect(() => new ChatAzureOpenAI({
        model: 'gpt-4', 
        temperature: 3,
        api_key: 'test'
      })).toThrow();
    });

    it('should validate frequency_penalty range', () => {
      expect(() => new ChatAzureOpenAI({
        model: 'gpt-4',
        frequency_penalty: -3,
        api_key: 'test'
      })).toThrow();

      expect(() => new ChatAzureOpenAI({
        model: 'gpt-4',
        frequency_penalty: 3,
        api_key: 'test'
      })).toThrow();
    });

    it('should validate top_p range', () => {
      expect(() => new ChatAzureOpenAI({
        model: 'gpt-4',
        top_p: -0.1,
        api_key: 'test'
      })).toThrow();

      expect(() => new ChatAzureOpenAI({
        model: 'gpt-4',
        top_p: 1.1,
        api_key: 'test'
      })).toThrow();
    });
  });
});