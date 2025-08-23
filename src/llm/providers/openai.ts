/**
 * OpenAI chat model implementation
 */

import { z } from 'zod';
import OpenAI from 'openai';
import { AbstractChatModel } from '../base';
import { BaseMessage } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { LLMException } from '../../exceptions';

export const OpenAIChatModelSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.2),
  frequency_penalty: z.number().min(-2).max(2).default(0.3),
  seed: z.number().optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_completion_tokens: z.number().default(4096),
  api_key: z.string().optional(),
  organization: z.string().optional(),
  project: z.string().optional(),
  base_url: z.string().optional(),
  timeout: z.number().optional(),
  max_retries: z.number().default(5),
  add_schema_to_system_prompt: z.boolean().default(false),
});

type OpenAIChatModelConfig = z.infer<typeof OpenAIChatModelSchema>;

const REASONING_MODELS = [
  'o4-mini',
  'o3',
  'o3-mini', 
  'o1',
  'o1-pro',
  'o3-pro',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
];

export class ChatOpenAI extends AbstractChatModel {
  private config: OpenAIChatModelConfig;
  private client: OpenAI;

  constructor(config: Partial<OpenAIChatModelConfig> & { model: string }) {
    const validatedConfig = OpenAIChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: validatedConfig.api_key || process.env.OPENAI_API_KEY,
      organization: validatedConfig.organization,
      project: validatedConfig.project,
      baseURL: validatedConfig.base_url,
      timeout: validatedConfig.timeout,
      maxRetries: validatedConfig.max_retries,
    });
  }

  get provider(): string {
    return 'openai';
  }

  private serializeMessages(messages: BaseMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
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
                      url: part.image_url.url,
                      detail: part.image_url.detail
                    }
                  };
                }
                return null;
              }).filter(Boolean) || []
            };
          }
        
        case 'assistant':
          const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
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
    }) as OpenAI.Chat.ChatCompletionMessageParam[];
  }

  private getUsage(response: OpenAI.Chat.ChatCompletion): ChatInvokeUsage | undefined {
    if (!response.usage) {
      return undefined;
    }

    let completionTokens = response.usage.completion_tokens || 0;
    
    // Add reasoning tokens if available
    const completionDetails = (response.usage as any).completion_tokens_details;
    if (completionDetails?.reasoning_tokens) {
      completionTokens += completionDetails.reasoning_tokens;
    }

    return {
      prompt_tokens: response.usage.prompt_tokens || 0,
      prompt_cached_tokens: (response.usage as any).prompt_tokens_details?.cached_tokens,
      prompt_cache_creation_tokens: undefined,
      prompt_image_tokens: undefined,
      completion_tokens: completionTokens,
      total_tokens: response.usage.total_tokens || 0,
    };
  }

  private isReasoningModel(): boolean {
    return REASONING_MODELS.some(model => 
      this.model.toLowerCase().includes(model.toLowerCase())
    );
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    const openaiMessages = this.serializeMessages(messages);

    try {
      const modelParams: any = {};

      // Set basic parameters
      if (!this.isReasoningModel()) {
        if (this.config.temperature !== undefined) {
          modelParams.temperature = this.config.temperature;
        }
        if (this.config.frequency_penalty !== undefined) {
          modelParams.frequency_penalty = this.config.frequency_penalty;
        }
      }

      if (this.config.max_completion_tokens !== undefined) {
        modelParams.max_completion_tokens = this.config.max_completion_tokens;
      }

      if (this.config.top_p !== undefined) {
        modelParams.top_p = this.config.top_p;
      }

      if (this.config.seed !== undefined) {
        modelParams.seed = this.config.seed;
      }

      // Handle structured output
      if (outputFormat && !this.config.add_schema_to_system_prompt) {
        // Use OpenAI's response_format for structured output
        modelParams.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: this.zodToJsonSchema(outputFormat)
          }
        };
      }

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        ...modelParams,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = this.getUsage(response);

      if (outputFormat) {
        const parsed = this.parseStructuredOutput(content, outputFormat);
        return createCompletion(parsed as T, { usage });
      } else {
        return createCompletion(content as T, { usage });
      }

    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LLMException(error.status || 500, error.message);
      }
      throw error;
    }
  }

  private zodToJsonSchema(schema: z.ZodSchema): any {
    // Basic Zod to JSON Schema conversion
    // This is a simplified implementation - in production you'd want a proper library
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodSchema);
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string' };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number' };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element)
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    // Default fallback
    return { type: 'string' };
  }
}