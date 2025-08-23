/**
 * OpenRouter chat model implementation
 * OpenRouter provides access to various LLM models through a unified OpenAI-compatible interface
 */

import { z } from 'zod';
import OpenAI from 'openai';
import type { 
  ChatCompletion, 
  ChatCompletionCreateParams,
  ChatCompletionTool,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';
import { AbstractChatModel } from '../base';
import { BaseMessage, SystemMessage, UserMessage, AssistantMessage, ToolCall } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { ModelProviderError, ModelRateLimitError } from '../../exceptions';
import { SchemaOptimizer } from '../schema';

// OpenRouter uses OpenAI-compatible format, so we can reuse OpenAI serialization logic
function serializeToolCalls(toolCalls: ToolCall[]): any[] {
  return toolCalls.map(toolCall => ({
    id: toolCall.id,
    type: toolCall.type,
    function: {
      name: toolCall.function.name,
      arguments: toolCall.function.arguments
    }
  }));
}

function serializeMessageContent(content: any): string | any[] {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content.map(part => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      } else if (part.type === 'image_url') {
        return {
          type: 'image_url',
          image_url: {
            url: part.image_url.url,
            detail: part.image_url.detail || 'auto'
          }
        };
      }
      return part;
    });
  }
  
  return content || '';
}

function serializeMessage(message: BaseMessage): ChatCompletionMessageParam {
  if (message.role === 'user') {
    const userMessage = message as UserMessage;
    return {
      role: 'user',
      content: serializeMessageContent(userMessage.content),
      name: userMessage.name
    };
  }

  if (message.role === 'system') {
    const systemMessage = message as SystemMessage;
    return {
      role: 'system',
      content: typeof systemMessage.content === 'string' 
        ? systemMessage.content 
        : JSON.stringify(systemMessage.content),
      name: systemMessage.name
    };
  }

  if (message.role === 'assistant') {
    const assistantMessage = message as AssistantMessage;
    const result: any = {
      role: 'assistant',
      content: serializeMessageContent(assistantMessage.content)
    };

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      result.tool_calls = serializeToolCalls(assistantMessage.tool_calls);
    }

    return result;
  }

  throw new Error(`Unknown message role: ${(message as any).role}`);
}

function serializeMessages(messages: BaseMessage[]): ChatCompletionMessageParam[] {
  return messages.map(serializeMessage);
}

export const OpenRouterChatModelSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.number().optional(),
  api_key: z.string().optional(),
  http_referer: z.string().optional(), // OpenRouter specific parameter for tracking
  base_url: z.string().default('https://openrouter.ai/api/v1'),
  timeout: z.number().optional(),
  max_retries: z.number().default(10),
  default_headers: z.record(z.string()).optional(),
});

type OpenRouterChatModelConfig = z.infer<typeof OpenRouterChatModelSchema>;

export class ChatOpenRouter extends AbstractChatModel {
  private config: OpenRouterChatModelConfig;
  private client: OpenAI;

  constructor(config: Partial<OpenRouterChatModelConfig> & { model: string }) {
    const validatedConfig = OpenRouterChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Create extra headers for OpenRouter
    const defaultHeaders: Record<string, string> = {
      ...validatedConfig.default_headers,
    };

    if (validatedConfig.http_referer) {
      defaultHeaders['HTTP-Referer'] = validatedConfig.http_referer;
    }

    // Initialize OpenAI client with OpenRouter base URL
    this.client = new OpenAI({
      apiKey: validatedConfig.api_key || process.env.OPENROUTER_API_KEY,
      baseURL: validatedConfig.base_url,
      timeout: validatedConfig.timeout,
      maxRetries: validatedConfig.max_retries,
      defaultHeaders,
    });
  }

  get provider(): string {
    return 'openrouter';
  }

  private extractUsage(response: ChatCompletion): ChatInvokeUsage | undefined {
    if (!response.usage) return undefined;

    // Extract cached tokens from prompt tokens details if available
    const promptDetails = (response.usage as any).prompt_tokens_details;
    const cachedTokens = promptDetails?.cached_tokens;

    return {
      prompt_tokens: response.usage.prompt_tokens,
      prompt_cached_tokens: cachedTokens || 0,
      prompt_cache_creation_tokens: 0, // OpenRouter doesn't provide this
      prompt_image_tokens: 0, // OpenRouter doesn't provide this
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
    };
  }

  private isRetryableError(error: any): boolean {
    // Check for rate limit errors
    if (error.status === 429) return true;
    if (error.type === 'rate_limit_error') return true;
    if (error.message?.toLowerCase().includes('rate limit')) return true;

    // Check for server errors (5xx)
    if (error.status >= 500 && error.status < 600) return true;

    // Check for timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') return true;

    return false;
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    const openrouterMessages = serializeMessages(messages);

    try {
      if (!outputFormat) {
        // Standard text completion
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: openrouterMessages,
          temperature: this.config.temperature,
          top_p: this.config.top_p,
          seed: this.config.seed,
        });

        const content = response.choices[0]?.message?.content || '';
        const usage = this.extractUsage(response);

        return createCompletion(content as T, { usage });
      } else {
        // Structured output with JSON schema
        const schema = SchemaOptimizer.createOptimizedJsonSchema(outputFormat as any);

        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: openrouterMessages,
          temperature: this.config.temperature,
          top_p: this.config.top_p,
          seed: this.config.seed,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'agent_output',
              strict: true,
              schema: schema,
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new ModelProviderError({
            message: 'Failed to parse structured output from model response',
            model: this.name,
          });
        }

        const usage = this.extractUsage(response);
        
        // Parse and validate the structured output
        let parsedContent: T;
        try {
          const jsonContent = JSON.parse(content);
          parsedContent = outputFormat.parse(jsonContent);
        } catch (parseError) {
          throw new ModelProviderError({
            message: `Failed to parse structured output: ${parseError}`,
            model: this.name,
          });
        }

        return createCompletion(parsedContent, { usage });
      }
    } catch (error: any) {
      // Handle rate limit errors
      if (error.status === 429 || error.type === 'rate_limit_error') {
        throw new ModelRateLimitError({ message: error.message, model: this.name });
      }

      // Handle API connection errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new ModelProviderError({
          message: `Connection error: ${error.message}`,
          model: this.name,
        });
      }

      // Handle API status errors
      if (error.status) {
        throw new ModelProviderError({
          message: error.message || 'API error',
          model: this.name,
        });
      }

      // Handle other provider errors
      if (error instanceof ModelProviderError || error instanceof ModelRateLimitError) {
        throw error;
      }

      // Generic error fallback
      throw new ModelProviderError({
        message: `OpenRouter API error: ${error.message || error}`,
        model: this.name,
      });
    }
  }
}