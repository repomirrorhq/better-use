/**
 * Test for handling Anthropic 502 errors
 */

import { ChatAnthropic } from '../src/llm/providers/anthropic';
import { ModelProviderError } from '../src/exceptions';
import { BaseMessage } from '../src/llm/messages';

describe('Anthropic 502 Error Handling', () => {
  test('should properly handle 502 errors from the API', async () => {
    // Create a ChatAnthropic instance
    const chat = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20240620',
      apiKey: 'test-key',
    });

    // Create test messages
    const messages: BaseMessage[] = [{ role: 'user', content: 'Test message' }];

    // Mock the client's messages.create method to raise a 502 error
    const mockError = {
      status: 502,
      message: 'Bad Gateway',
      constructor: { name: 'APIStatusError' }
    };
    
    jest.spyOn(chat['client'].messages, 'create').mockRejectedValue(mockError);

    // Test that the error is properly caught and re-raised as ModelProviderError
    await expect(chat.ainvoke(messages)).rejects.toThrow(ModelProviderError);

    try {
      await chat.ainvoke(messages);
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        expect(error.message).toContain('Bad Gateway');
        expect(error.statusCode).toBe(502);
      }
    }
  });

  test('should handle unexpected response types gracefully', async () => {
    const chat = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20240620', 
      apiKey: 'test-key',
    });

    const messages: BaseMessage[] = [{ role: 'user', content: 'Test message' }];

    // Mock the client to return a string instead of a proper response
    jest.spyOn(chat['client'].messages, 'create').mockResolvedValue('Error: Bad Gateway' as any);

    // This should raise a ModelProviderError with a clear message
    await expect(chat.ainvoke(messages)).rejects.toThrow(ModelProviderError);

    try {
      await chat.ainvoke(messages);
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        // The error should be about unexpected response type
        expect(error.message).toContain('Unexpected response type');
        // Default statusCode is 500 for non-status errors
        expect(error.statusCode).toBe(500);
      }
    }
  });

  test('should handle network errors gracefully', async () => {
    const chat = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20240620',
      apiKey: 'test-key',
    });

    const messages: BaseMessage[] = [{ role: 'user', content: 'Test message' }];

    // Mock the client to throw a network error
    const networkError = new Error('Network error: Connection refused');
    (networkError as any).constructor = { name: 'APIConnectionError' };
    
    jest.spyOn(chat['client'].messages, 'create').mockRejectedValue(networkError);

    // Should throw ModelProviderError with appropriate message
    await expect(chat.ainvoke(messages)).rejects.toThrow(ModelProviderError);

    try {
      await chat.ainvoke(messages);
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        expect(error.message).toContain('Network error');
      }
    }
  });

  test('should handle rate limit errors properly', async () => {
    const chat = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20240620',
      apiKey: 'test-key',
    });

    const messages: BaseMessage[] = [{ role: 'user', content: 'Test message' }];

    // Mock the client to throw a rate limit error
    const rateLimitError = new Error('Rate limit exceeded');
    (rateLimitError as any).status = 429;
    (rateLimitError as any).constructor = { name: 'RateLimitError' };
    
    jest.spyOn(chat['client'].messages, 'create').mockRejectedValue(rateLimitError);

    // Should throw ModelRateLimitError
    await expect(chat.ainvoke(messages)).rejects.toThrow();

    try {
      await chat.ainvoke(messages);
    } catch (error: any) {
      expect(error.name).toBe('ModelRateLimitError');
      expect(error.statusCode).toBe(429);
      expect(error.message).toContain('Rate limit');
    }
  });

  test('should preserve usage information when response is successful', async () => {
    const chat = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20240620',
      apiKey: 'test-key',
    });

    const messages: BaseMessage[] = [{ role: 'user', content: 'Test message' }];

    // Mock a successful response
    const mockResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello! How can I help you?' }],
      usage: {
        input_tokens: 10,
        output_tokens: 7,
      }
    };
    
    jest.spyOn(chat['client'].messages, 'create').mockResolvedValue(mockResponse as any);

    const result = await chat.ainvoke(messages);
    
    // Result is a completion object with 'completion' property
    expect(result.completion).toBe('Hello! How can I help you?');
    expect(result.usage).toBeDefined();
    expect(result.usage?.prompt_tokens).toBe(10);
    expect(result.usage?.completion_tokens).toBe(7);
    expect(result.usage?.total_tokens).toBe(17);
  });
});