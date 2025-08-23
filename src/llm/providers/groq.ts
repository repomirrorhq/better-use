/**
 * Groq chat model implementation
 */

import { z } from 'zod';
import Groq from 'groq-sdk';
import type { 
  ChatCompletion, 
  ChatCompletionCreateParams,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption
} from 'groq-sdk/resources/chat/completions';
import { AbstractChatModel } from '../base';
import { BaseMessage } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { ModelProviderError, ModelRateLimitError } from '../../exceptions';
import { SchemaOptimizer } from '../schema';
import { tryParseGroqFailedGeneration } from './groq/parser';

export type GroqVerifiedModels = 
  | 'meta-llama/llama-4-maverick-17b-128e-instruct'
  | 'meta-llama/llama-4-scout-17b-16e-instruct'
  | 'qwen/qwen3-32b'
  | 'moonshotai/kimi-k2-instruct'
  | 'openai/gpt-oss-20b'
  | 'openai/gpt-oss-120b'
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant'
  | 'llama-3.1-70b-versatile'
  | 'mixtral-8x7b-32768'
  | 'gemma2-9b-it';

const JSON_SCHEMA_MODELS = [
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
];

const TOOL_CALLING_MODELS = [
  'moonshotai/kimi-k2-instruct',
];

export const GroqChatModelSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.number().optional(),
  service_tier: z.enum(['auto', 'on_demand', 'flex']).optional(),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  timeout: z.number().optional(),
  max_retries: z.number().default(10),
});

type GroqChatModelConfig = z.infer<typeof GroqChatModelSchema>;

export class ChatGroq extends AbstractChatModel {
  private config: GroqChatModelConfig;
  private client: Groq;

  constructor(config: Partial<GroqChatModelConfig> & { model: string }) {
    const validatedConfig = GroqChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Initialize Groq client
    this.client = new Groq({
      apiKey: validatedConfig.api_key || process.env.GROQ_API_KEY,
      baseURL: validatedConfig.base_url,
      timeout: validatedConfig.timeout,
      maxRetries: validatedConfig.max_retries,
    });
  }

  get provider(): string {
    return 'groq';
  }

  private serializeMessages(messages: BaseMessage[]): any[] {
    return messages.map(message => {
      switch (message.role) {
        case 'system':
          return {
            role: 'system',
            content: typeof message.content === 'string' 
              ? message.content 
              : message.content?.map(part => part.text).join('\n') || '',
            ...(message.name && { name: message.name })
          };
        
        case 'user':
          if (typeof message.content === 'string') {
            return {
              role: 'user',
              content: message.content,
              ...(message.name && { name: message.name })
            };
          } else {
            const content = message.content?.map(part => {
              if (part.type === 'text') {
                return {
                  type: 'text',
                  text: part.text
                };
              } else if (part.type === 'image_url') {
                return {
                  type: 'image_url',
                  image_url: {
                    url: part.image_url.url,
                    detail: part.image_url.detail
                  }
                };
              }
              return null;
            }).filter(Boolean) || [];
            
            return {
              role: 'user',
              content,
              ...(message.name && { name: message.name })
            };
          }
        
        case 'assistant':
          const assistantMessage: any = {
            role: 'assistant',
            content: typeof message.content === 'string' 
              ? message.content 
              : message.content?.map(part => 
                  part.type === 'text' ? part.text : part.refusal
                ).join('\n') || null,
            ...(message.name && { name: message.name })
          };
          
          if (message.tool_calls && message.tool_calls.length > 0) {
            assistantMessage.tool_calls = message.tool_calls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments
              }
            }));
          }
          
          return assistantMessage;
        
        default:
          throw new Error(`Unsupported message role: ${(message as any).role}`);
      }
    }) as any[];
  }

  private getUsage(response: ChatCompletion): ChatInvokeUsage | undefined {
    if (!response.usage) {
      return undefined;
    }

    return {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
      // Groq doesn't support cached tokens
      prompt_cached_tokens: undefined,
      prompt_cache_creation_tokens: undefined,
      prompt_image_tokens: undefined,
    };
  }

  private async invokeRegularCompletion(
    serializedMessages: any[]
  ): Promise<ChatInvokeCompletion<string>> {
    const requestParams: ChatCompletionCreateParams = {
      model: this.config.model,
      messages: serializedMessages,
      temperature: this.config.temperature,
      top_p: this.config.top_p,
      seed: this.config.seed,
    };

    const response = await this.client.chat.completions.create(requestParams);
    
    if (!response.choices || response.choices.length === 0) {
      throw new ModelProviderError({
        message: 'No response choices received from Groq',
        model: this.name
      });
    }

    const choice = response.choices[0];
    const content = choice.message.content || '';
    const usage = this.getUsage(response);

    return createCompletion(content, { usage });
  }

  private async invokeWithToolCalling<T>(
    serializedMessages: any[],
    outputFormat: z.ZodSchema<T>,
    schema: any
  ): Promise<ChatCompletion> {
    const tool: ChatCompletionTool = {
      type: 'function',
      function: {
        name: 'extract_information',
        description: 'Extract information in the specified format',
        parameters: schema,
      },
    };

    const toolChoice: ChatCompletionToolChoiceOption = 'required';

    return await this.client.chat.completions.create({
      model: this.config.model,
      messages: serializedMessages,
      temperature: this.config.temperature,
      top_p: this.config.top_p,
      seed: this.config.seed,
      tools: [tool],
      tool_choice: toolChoice,
    });
  }

  private async invokeWithJsonSchema<T>(
    serializedMessages: any[],
    outputFormat: z.ZodSchema<T>,
    schema: any
  ): Promise<ChatCompletion> {
    return await this.client.chat.completions.create({
      model: this.config.model,
      messages: serializedMessages,
      temperature: this.config.temperature,
      top_p: this.config.top_p,
      seed: this.config.seed,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          description: 'Model output schema',
          schema: schema,
        },
      },
    });
  }

  private async invokeStructuredOutput<T>(
    serializedMessages: any[],
    outputFormat: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    const schema = SchemaOptimizer.createOptimizedJsonSchema(outputFormat);

    let response: ChatCompletion;
    
    if (TOOL_CALLING_MODELS.includes(this.config.model)) {
      response = await this.invokeWithToolCalling(serializedMessages, outputFormat, schema);
    } else {
      response = await this.invokeWithJsonSchema(serializedMessages, outputFormat, schema);
    }

    if (!response.choices || response.choices.length === 0) {
      throw new ModelProviderError({
        message: 'No response choices received from Groq',
        model: this.name
      });
    }

    const choice = response.choices[0];
    let content = choice.message.content || '';
    
    // Handle tool calls for structured output
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      content = choice.message.tool_calls[0].function.arguments;
    }

    if (!content) {
      throw new ModelProviderError({
        message: 'No content in response',
        model: this.name
      });
    }

    // Parse structured output
    const parsedContent = this.parseStructuredOutput(content, outputFormat);
    const usage = this.getUsage(response);

    return createCompletion(parsedContent as T, { usage });
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>,
    maxRetries: number = 3
  ): Promise<ChatInvokeCompletion<T>> {
    try {
      const serializedMessages = this.serializeMessages(messages);

      if (!outputFormat) {
        const result = await this.invokeRegularCompletion(serializedMessages);
        return result as ChatInvokeCompletion<T>;
      } else {
        return await this.invokeStructuredOutput(serializedMessages, outputFormat);
      }

    } catch (error: any) {
      // Handle rate limiting
      if (error.status === 429 && maxRetries > 0) {
        const delay = Math.pow(2, 3 - maxRetries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.ainvoke(messages, outputFormat, maxRetries - 1);
      }

      // Handle rate limit errors
      if (error instanceof Error && error.message.includes('rate limit')) {
        throw new ModelRateLimitError({
          message: error.message,
          status_code: (error as any).status || 429,
          model: this.name
        });
      }

      // Handle API errors for structured output with fallback parsing
      if (outputFormat && (error as any).status && (error as any).body?.error?.failed_generation) {
        try {
          const parsedContent = tryParseGroqFailedGeneration(error as any, outputFormat);
          return createCompletion(parsedContent as T, { usage: undefined });
        } catch (parseError) {
          // If parsing fails, throw original error
        }
      }
      
      throw new ModelProviderError({
        message: `Groq API error: ${error.message}`,
        status_code: (error as any).status,
        model: this.name
      });
    }
  }

  /**
   * Parse failed generation from Groq API error
   * This is a fallback mechanism when Groq fails to parse structured output
   */
  private parseFailedGeneration<T>(content: string, outputFormat: z.ZodSchema<T>): T {
    try {
      // Clean up the content similar to Python implementation
      let cleanContent = content;

      // Handle code block wrapped JSON
      if (cleanContent.includes('```')) {
        const parts = cleanContent.split('```');
        if (parts.length >= 2) {
          cleanContent = parts[1];
          // Remove language identifier if present
          if (cleanContent.includes('\n')) {
            cleanContent = cleanContent.split('\n').slice(1).join('\n');
          }
        }
      }

      // Remove HTML-like tags before first { if content doesn't start with {
      if (!cleanContent.trim().startsWith('{')) {
        cleanContent = cleanContent.replace(/^.*?(?=\{)/s, '');
      }

      // Remove HTML-like tags after the last }
      cleanContent = cleanContent.replace(/\}(\s*<[^>]*>.*?$)/s, '}');
      cleanContent = cleanContent.replace(/\}(\s*<\|[^|]*\|>.*?$)/s, '}');

      cleanContent = cleanContent.trim();

      // Try to find valid JSON by counting braces
      if (cleanContent.endsWith('}')) {
        try {
          JSON.parse(cleanContent);
        } catch {
          // Find the correct end of JSON by counting braces
          let braceCount = 0;
          let lastValidPos = -1;
          
          for (let i = 0; i < cleanContent.length; i++) {
            const char = cleanContent[i];
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                lastValidPos = i + 1;
                break;
              }
            }
          }
          
          if (lastValidPos > 0) {
            cleanContent = cleanContent.substring(0, lastValidPos);
          }
        }
      }

      // Parse JSON
      const jsonData = JSON.parse(cleanContent);
      
      // Handle case where response is a list with one dict
      const finalData = Array.isArray(jsonData) && jsonData.length === 1 && typeof jsonData[0] === 'object' 
        ? jsonData[0] 
        : jsonData;

      return outputFormat.parse(finalData);
    } catch (error) {
      throw new Error(`Failed to parse Groq failed generation: ${error}`);
    }
  }
}