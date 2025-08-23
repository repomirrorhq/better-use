/**
 * Google/Gemini LLM Provider Tests
 */

import { z } from 'zod';
import { ChatGoogle } from '../src/llm/providers/google';
import { UserMessage, SystemMessage, BaseMessage } from '../src/llm/messages';

describe('Google LLM Provider Tests', () => {
  let googleChat: ChatGoogle;

  beforeEach(() => {
    // Create a mock Google provider (will skip API calls if no key)
    googleChat = new ChatGoogle({
      model: 'gemini-2.0-flash-exp',
      temperature: 0.7,
      api_key: 'test-key' // Mock key for testing
    });
  });

  describe('Provider Configuration', () => {
    it('should create Google provider with default settings', () => {
      expect(googleChat).toBeInstanceOf(ChatGoogle);
      expect(googleChat.provider).toBe('google');
    });

    it('should handle custom configuration', () => {
      const customProvider = new ChatGoogle({
        model: 'gemini-1.5-pro',
        temperature: 0.1,
        top_p: 0.9,
        api_key: 'test-key'
      });
      expect(customProvider.provider).toBe('google');
    });

    it('should throw error when no API key provided', () => {
      // Temporarily clear environment variables
      const originalKey = process.env.GOOGLE_API_KEY;
      const originalGeminiKey = process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;

      expect(() => {
        new ChatGoogle({ model: 'gemini-2.0-flash-exp' });
      }).toThrow('Google API key is required');

      // Restore environment variables
      if (originalKey) process.env.GOOGLE_API_KEY = originalKey;
      if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
    });
  });

  describe('Message Serialization', () => {
    it('should handle system messages', () => {
      const messages: BaseMessage[] = [
        { role: 'system', content: 'You are a helpful assistant', cache: false },
        { role: 'user', content: 'Hello', cache: false }
      ];

      // Test that serialization doesn't throw
      expect(() => {
        // Access private method for testing
        (googleChat as any).serializeMessages(messages);
      }).not.toThrow();
    });

    it('should handle user messages with text content', () => {
      const messages: BaseMessage[] = [
        { role: 'user', content: 'Hello, how are you?', cache: false }
      ];

      const { contents } = (googleChat as any).serializeMessages(messages);
      expect(contents).toHaveLength(1);
      expect(contents[0].role).toBe('user');
      expect(contents[0].parts).toHaveLength(1);
      expect(contents[0].parts[0].text).toBe('Hello, how are you?');
    });

    it('should handle complex message content', () => {
      const messages: BaseMessage[] = [
        { role: 'user', content: [
          { type: 'text', text: 'Here is some text' },
        ], cache: false}
      ];

      const { contents } = (googleChat as any).serializeMessages(messages);
      expect(contents).toHaveLength(1);
      expect(contents[0].parts).toHaveLength(1);
      expect(contents[0].parts[0].text).toBe('Here is some text');
    });
  });

  describe('Schema Fixing', () => {
    it('should fix Gemini schema by removing unsupported properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name', default: 'test' }
        },
        additionalProperties: false,
        title: 'TestSchema'
      };

      const fixed = (googleChat as any).fixGeminiSchema(schema);
      expect(fixed.additionalProperties).toBeUndefined();
      expect(fixed.title).toBeUndefined();
      expect(fixed.properties.name.title).toBeUndefined();
      expect(fixed.properties.name.default).toBeUndefined();
      expect(fixed.properties.name.type).toBe('string');
    });

    it('should handle empty object properties', () => {
      const schema = {
        type: 'object',
        properties: {}
      };

      const fixed = (googleChat as any).fixGeminiSchema(schema);
      expect(fixed.properties._placeholder).toBeDefined();
      expect(fixed.properties._placeholder.type).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should identify retryable errors', () => {
      const retryableErrors = [
        new Error('rate limit exceeded'),
        new Error('resource exhausted'),
        new Error('service unavailable'),
        new Error('network timeout')
      ];

      for (const error of retryableErrors) {
        const isRetryable = (googleChat as any).isRetryableError(error);
        expect(isRetryable).toBe(true);
      }
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        new Error('invalid api key'),
        new Error('model not found'),
        new Error('malformed request')
      ];

      for (const error of nonRetryableErrors) {
        const isRetryable = (googleChat as any).isRetryableError(error);
        expect(isRetryable).toBe(false);
      }
    });
  });

  // Note: We skip actual API tests to avoid requiring real API keys in CI
  describe('API Integration (Mocked)', () => {
    it('should handle structured output schema validation', () => {
      const outputSchema = z.object({
        name: z.string(),
        age: z.number()
      });

      // This would normally make an API call, but we're testing the setup
      expect(() => {
        // Test that the schema processing works
        const schema = (googleChat as any).fixGeminiSchema({
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          }
        });
        expect(schema).toBeDefined();
      }).not.toThrow();
    });
  });
});