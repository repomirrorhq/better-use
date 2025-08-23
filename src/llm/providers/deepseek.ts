/**
 * Deepseek chat model implementation
 * Deepseek provides an OpenAI-compatible API with enhanced capabilities
 */

import { z } from 'zod';
import OpenAI from 'openai';
import type { ChatCompletionCreateParams, ChatCompletion } from 'openai/resources/chat/completions';
import { AbstractChatModel } from '../base';
import { BaseMessage } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { ModelProviderError } from '../../exceptions';
import { SchemaOptimizer } from '../schema';

export const DeepseekChatModelSchema = z.object({
  model: z.string().default('deepseek-chat'),
  temperature: z.number().min(0).max(2).default(0.2),
  max_completion_tokens: z.number().default(4096),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.number().optional(),
  api_key: z.string().optional(),
  base_url: z.string().default('https://api.deepseek.com/v1'),
  timeout: z.number().optional(),
  max_retries: z.number().default(5),
  add_schema_to_system_prompt: z.boolean().default(false),
});

type DeepseekChatModelConfig = z.infer<typeof DeepseekChatModelSchema>;

export class ChatDeeseek extends AbstractChatModel {
  private config: DeepseekChatModelConfig;
  private client: OpenAI;

  constructor(config: Partial<DeepseekChatModelConfig> & { model?: string } = {}) {
    const validatedConfig = DeepseekChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Initialize OpenAI-compatible client for Deepseek
    this.client = new OpenAI({
      apiKey: validatedConfig.api_key || process.env.DEEPSEEK_API_KEY,
      baseURL: validatedConfig.base_url,
      timeout: validatedConfig.timeout,
      maxRetries: validatedConfig.max_retries,
    });
  }

  get provider(): string {
    return 'deepseek';
  }

  private serializeMessages(messages: BaseMessage[]): any[] {
    return messages.map(message => {
      switch (message.role) {
        case 'system':
          return {
            role: 'system',
            content: typeof message.content === 'string' 
              ? message.content 
              : message.content?.map(part => ({
                  type: 'text',
                  text: part.text
                })).filter(Boolean) || []
          };
        
        case 'user':
          if (typeof message.content === 'string') {
            return {
              role: 'user',
              content: message.content
            };
          } else {
            return {
              role: 'user', 
              content: message.content?.map(part => {
                if (part.type === 'text') {
                  return {
                    type: 'text',
                    text: part.text
                  };
                } else if (part.type === 'image_url') {
                  return {
                    type: 'image_url',
                    image_url: {
                      url: part.image_url.url
                    }
                  };
                }
                return null;
              }).filter(Boolean) || []
            };
          }
        
        case 'assistant':
          const assistantMessage: any = {
            role: 'assistant',
            content: typeof message.content === 'string' 
              ? message.content 
              : null
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
    };
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>,
    max_retries: number = 3
  ): Promise<ChatInvokeCompletion<T>> {
    try {
      const serializedMessages = this.serializeMessages(messages);
      
      let requestBody: ChatCompletionCreateParams = {
        model: this.config.model,
        messages: serializedMessages,
        temperature: this.config.temperature,
        max_tokens: this.config.max_completion_tokens,
        top_p: this.config.top_p,
        seed: this.config.seed,
      };

      // Handle structured output
      if (outputFormat) {
        if (this.config.add_schema_to_system_prompt) {
          // Add schema to system prompt approach
          const systemPrompt = `You must respond with valid JSON that matches this schema: ${JSON.stringify(SchemaOptimizer.createOptimizedJsonSchema(outputFormat))}`;
          const systemMessage: any = {
            role: 'system',
            content: systemPrompt
          };
          requestBody.messages = [systemMessage, ...serializedMessages];
        } else {
          // Use function calling approach for structured output
          const jsonSchema = SchemaOptimizer.createOptimizedJsonSchema(outputFormat);
          const toolName = 'structured_response';
          
          requestBody.tools = [{
            type: 'function',
            function: {
              name: toolName,
              description: `Return a JSON object with the required structure`,
              parameters: jsonSchema
            }
          }];
          
          requestBody.tool_choice = {
            type: 'function',
            function: { name: toolName }
          };
        }
      }

      const response = await this.client.chat.completions.create(requestBody);
      
      if (!response.choices || response.choices.length === 0) {
        throw new ModelProviderError({
          message: 'No response choices received from Deepseek',
          model: this.name
        });
      }

      const choice = response.choices[0];
      let content: any;
      
      // Handle different response types
      if (outputFormat && !this.config.add_schema_to_system_prompt && choice.message.tool_calls) {
        // Function calling structured output
        const toolCall = choice.message.tool_calls[0];
        if (!toolCall) {
          throw new ModelProviderError({
            message: 'Expected tool call in structured output but got none',
            model: this.name
          });
        }
        
        const rawArgs = toolCall.function.arguments;
        const parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
        content = outputFormat.parse(parsed);
      } else {
        // Regular text or schema-in-prompt output
        const rawContent = choice.message.content || '';
        
        if (outputFormat) {
          // Try to parse as structured output
          content = this.parseStructuredOutput(rawContent, outputFormat);
        } else {
          content = rawContent;
        }
      }

      return createCompletion(content as T, {
        usage: this.getUsage(response)
      });

    } catch (error: any) {
      if (error.status === 429 && max_retries > 0) {
        const delay = Math.pow(2, 3 - max_retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.ainvoke(messages, outputFormat, max_retries - 1);
      }
      
      throw new ModelProviderError({
        message: `Deepseek API error: ${error.message}`,
        status_code: error.status,
        model: this.name
      });
    }
  }
}