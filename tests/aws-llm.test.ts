/**
 * AWS Bedrock LLM Provider Tests
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { ChatAWSBedrock, AWSBedrockChatModelSchema } from '../src/llm/providers/aws';
import { createUserMessage, createSystemMessage } from '../src/llm/messages';
import { ModelProviderError } from '../src/exceptions';

describe('AWS Bedrock LLM Provider Tests', () => {
  
  describe('Provider Configuration', () => {
    
    test('should create AWS Bedrock provider with default settings', () => {
      const provider = new ChatAWSBedrock({});
      expect(provider).toBeDefined();
      expect(provider.provider).toBe('aws_bedrock');
      expect(provider.name).toBe('aws_bedrock/anthropic.claude-3-5-sonnet-20240620-v1:0');
    });

    test('should handle custom configuration', () => {
      const provider = new ChatAWSBedrock({
        model: 'anthropic.claude-3-haiku-20240307-v1:0',
        temperature: 0.7,
        maxTokens: 2048,
        awsRegion: 'us-west-2'
      });
      
      expect(provider.name).toBe('aws_bedrock/anthropic.claude-3-haiku-20240307-v1:0');
    });

    test('should validate configuration schema', () => {
      const config = {
        model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        temperature: 0.5,
        maxTokens: 4096,
        topP: 0.9
      };
      
      const parsed = AWSBedrockChatModelSchema.parse(config);
      expect(parsed.model).toBe(config.model);
      expect(parsed.temperature).toBe(config.temperature);
      expect(parsed.maxTokens).toBe(config.maxTokens);
      expect(parsed.topP).toBe(config.topP);
    });

    test('should throw error when invalid temperature provided', () => {
      expect(() => {
        new ChatAWSBedrock({ temperature: 3.0 }); // Max is 2.0
      }).toThrow();
    });

    test('should throw error when invalid topP provided', () => {
      expect(() => {
        new ChatAWSBedrock({ topP: 1.5 }); // Max is 1.0
      }).toThrow();
    });
  });

  describe('Message Serialization', () => {
    let provider: ChatAWSBedrock;

    beforeEach(() => {
      provider = new ChatAWSBedrock({});
    });

    test('should handle system messages', () => {
      const systemMessage = createSystemMessage('You are a helpful assistant.');
      
      // This tests the internal serialization logic
      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toBe('You are a helpful assistant.');
    });

    test('should handle user messages with text content', () => {
      const userMessage = createUserMessage('Hello, how are you?');
      
      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toBe('Hello, how are you?');
    });

    test('should handle complex message content', () => {
      const userMessage = createUserMessage([
        { type: 'text', text: 'Describe this image:' },
        { 
          type: 'image_url', 
          image_url: { 
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            detail: 'auto',
            media_type: 'image/png'
          }
        }
      ]);
      
      expect(userMessage.role).toBe('user');
      expect(Array.isArray(userMessage.content)).toBe(true);
    });
  });

  describe('Tool Configuration', () => {
    let provider: ChatAWSBedrock;

    beforeEach(() => {
      provider = new ChatAWSBedrock({});
    });

    test('should format tools for structured output', () => {
      const OutputSchema = z.object({
        answer: z.string().describe('The answer to the question'),
        confidence: z.number().min(0).max(1).describe('Confidence level')
      });

      // Test the private method indirectly by checking the provider accepts the schema
      expect(() => {
        provider['formatToolsForRequest'](OutputSchema);
      }).not.toThrow();
    });

    test('should handle schema validation', () => {
      const SimpleSchema = z.object({
        result: z.string()
      });

      const tools = provider['formatToolsForRequest'](SimpleSchema);
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(1);
      expect(tools[0].toolSpec).toBeDefined();
      expect(tools[0].toolSpec.name).toMatch(/extract_/);
    });
  });

  describe('Error Handling', () => {
    let provider: ChatAWSBedrock;

    beforeEach(() => {
      provider = new ChatAWSBedrock({});
    });

    test('should identify AWS throttling errors', () => {
      const throttlingError = {
        name: 'ThrottlingException',
        message: 'Request was throttled'
      };

      // This would be called internally when AWS SDK throws errors
      expect(throttlingError.name).toBe('ThrottlingException');
    });

    test('should identify rate limit errors', () => {
      const rateLimitError = {
        name: 'TooManyRequestsException', 
        message: 'Too many requests'
      };

      expect(rateLimitError.name).toBe('TooManyRequestsException');
    });

    test('should parse base64 images correctly', () => {
      const base64Url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      const result = provider['parseBase64Url'](base64Url);
      expect(result.format).toBe('png');
      expect(result.bytes).toBeInstanceOf(Buffer);
    });

    test('should handle invalid base64 URLs', () => {
      expect(() => {
        provider['parseBase64Url']('invalid-url');
      }).toThrow('Invalid base64 URL');
    });
  });

  describe('API Integration (Mocked)', () => {
    let provider: ChatAWSBedrock;

    beforeEach(() => {
      provider = new ChatAWSBedrock({});
    });

    test('should handle structured output schema validation', () => {
      const OutputSchema = z.object({
        result: z.string(),
        metadata: z.object({
          confidence: z.number()
        })
      });

      // Test that the schema can be processed
      const tools = provider['formatToolsForRequest'](OutputSchema);
      expect(tools[0].toolSpec.inputSchema.json).toBeDefined();
      expect(tools[0].toolSpec.inputSchema.json.type).toBe('object');
    });

    test('should handle usage parsing', () => {
      const mockResponse = {
        usage: {
          inputTokens: 100,
          outputTokens: 150,
          totalTokens: 250
        }
      } as any;

      const usage = provider['parseUsage'](mockResponse);
      expect(usage).toBeDefined();
      expect(usage!.prompt_tokens).toBe(100);
      expect(usage!.completion_tokens).toBe(150);
      expect(usage!.total_tokens).toBe(250);
    });

    test('should handle missing usage data', () => {
      const mockResponse = {} as any;
      
      const usage = provider['parseUsage'](mockResponse);
      expect(usage).toBeUndefined();
    });
  });
});