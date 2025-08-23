/**
 * Anthropic chat model implementation
 */

import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { AbstractChatModel } from '../base';
import { BaseMessage, SystemMessage, UserMessage, AssistantMessage } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { ModelProviderError, ModelRateLimitError } from '../../exceptions';
import { SchemaOptimizer } from '../schema';

export const AnthropicChatModelSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(1).optional(),
  max_tokens: z.number().default(8192),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.number().optional(),
  api_key: z.string().optional(),
  auth_token: z.string().optional(),
  base_url: z.string().optional(),
  timeout: z.number().optional(),
  max_retries: z.number().default(10),
});

type AnthropicChatModelConfig = z.infer<typeof AnthropicChatModelSchema>;

export class ChatAnthropic extends AbstractChatModel {
  private config: AnthropicChatModelConfig;
  private client: Anthropic;

  constructor(config: Partial<AnthropicChatModelConfig> & { model: string }) {
    const validatedConfig = AnthropicChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: validatedConfig.api_key || process.env.ANTHROPIC_API_KEY,
      authToken: validatedConfig.auth_token,
      baseURL: validatedConfig.base_url,
      timeout: validatedConfig.timeout,
      maxRetries: validatedConfig.max_retries,
    });
  }

  get provider(): string {
    return 'anthropic';
  }

  private serializeMessages(messages: BaseMessage[]): {
    system?: string | any[];
    messages: Anthropic.MessageParam[];
  } {
    let systemMessage: string | any[] | undefined;
    const anthropicMessages: Anthropic.MessageParam[] = [];

    // Clean cache messages so only the last cache=True message remains cached
    const cleanedMessages = this.cleanCacheMessages(messages);

    for (const message of cleanedMessages) {
      if (message.role === 'system') {
        systemMessage = this.serializeSystemMessage(message as SystemMessage);
      } else if (message.role === 'user') {
        anthropicMessages.push(this.serializeUserMessage(message as UserMessage));
      } else if (message.role === 'assistant') {
        anthropicMessages.push(this.serializeAssistantMessage(message as AssistantMessage));
      }
    }

    return { system: systemMessage, messages: anthropicMessages };
  }

  private cleanCacheMessages(messages: BaseMessage[]): BaseMessage[] {
    const cleaned = [...messages];
    
    // Find the last message with cache=true
    let lastCacheIndex = -1;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (cleaned[i].cache) {
        lastCacheIndex = i;
        break;
      }
    }

    // If we found a cached message, disable cache for all others
    if (lastCacheIndex !== -1) {
      for (let i = 0; i < cleaned.length; i++) {
        if (i !== lastCacheIndex && cleaned[i].cache) {
          cleaned[i] = { ...cleaned[i], cache: false };
        }
      }
    }

    return cleaned;
  }

  private serializeSystemMessage(message: SystemMessage): string | any[] {
    if (typeof message.content === 'string') {
      if (message.cache) {
        return [{
          text: message.content,
          type: 'text' as const,
          cache_control: { type: 'ephemeral' }
        }];
      } else {
        return message.content;
      }
    }

    const blocks: any[] = [];
    for (const part of message.content) {
      if (part.type === 'text') {
        const block: any = {
          text: part.text,
          type: 'text' as const
        };
        if (message.cache) {
          block.cache_control = { type: 'ephemeral' };
        }
        blocks.push(block);
      }
    }
    return blocks;
  }

  private serializeUserMessage(message: UserMessage): Anthropic.MessageParam {
    if (typeof message.content === 'string') {
      return {
        role: 'user',
        content: message.content
      };
    }

    const content: any[] = [];
    for (const part of message.content) {
      if (part.type === 'text') {
        const block: any = {
          type: 'text',
          text: part.text
        };
        if (message.cache) {
          block.cache_control = { type: 'ephemeral' };
        }
        content.push(block);
      } else if (part.type === 'image_url') {
        content.push(this.serializeImageBlock(part));
      }
    }

    return {
      role: 'user',
      content
    };
  }

  private serializeImageBlock(part: any): any {
    const url = part.image_url.url;
    
    if (url.startsWith('data:')) {
      // Handle base64 encoded images
      const [header, data] = url.split(',', 2);
      const mediaType = header.split(';')[0].replace('data:', '') || 'image/png';
      
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: data
        }
      };
    } else {
      // Handle URL images  
      return {
        type: 'image',
        source: {
          type: 'url',
          url: url
        }
      };
    }
  }

  private serializeAssistantMessage(message: AssistantMessage): Anthropic.MessageParam {
    const blocks: any[] = [];

    // Add content blocks if present
    if (message.content !== null) {
      if (typeof message.content === 'string') {
        const block: any = {
          text: message.content,
          type: 'text'
        };
        if (message.cache) {
          block.cache_control = { type: 'ephemeral' };
        }
        blocks.push(block);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            const block: any = {
              text: part.text,
              type: 'text'
            };
            if (message.cache) {
              block.cache_control = { type: 'ephemeral' };
            }
            blocks.push(block);
          }
          // Note: Anthropic doesn't have refusal blocks, so we skip them
        }
      }
    }

    // Add tool use blocks if present
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        let input: any;
        try {
          input = JSON.parse(toolCall.function.arguments);
        } catch {
          input = { arguments: toolCall.function.arguments };
        }

        const block: any = {
          id: toolCall.id,
          input: input,
          name: toolCall.function.name,
          type: 'tool_use'
        };
        if (message.cache) {
          block.cache_control = { type: 'ephemeral' };
        }
        blocks.push(block);
      }
    }

    // If no content or tool calls, add empty text block
    if (blocks.length === 0) {
      const block: any = {
        text: '',
        type: 'text'
      };
      if (message.cache) {
        block.cache_control = { type: 'ephemeral' };
      }
      blocks.push(block);
    }

    // Simplify single text blocks to plain string if no caching
    let content: string | any[];
    if (!message.cache && blocks.length === 1 && blocks[0].type === 'text' && !blocks[0].cache_control) {
      content = blocks[0].text;
    } else {
      content = blocks;
    }

    return {
      role: 'assistant',
      content
    };
  }

  private getUsage(response: Anthropic.Message): ChatInvokeUsage | undefined {
    if (!response.usage) {
      return undefined;
    }

    const usage = response.usage as any;
    
    return {
      prompt_tokens: response.usage.input_tokens + (usage.cache_read_input_tokens || 0),
      prompt_cached_tokens: usage.cache_read_input_tokens,
      prompt_cache_creation_tokens: usage.cache_creation_input_tokens,
      prompt_image_tokens: undefined,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    const { system, messages: anthropicMessages } = this.serializeMessages(messages);

    try {
      if (!outputFormat) {
        // Normal completion without structured output
        const params: Anthropic.MessageCreateParams = {
          model: this.model as Anthropic.Model,
          messages: anthropicMessages,
          max_tokens: this.config.max_tokens,
        };

        if (this.config.temperature !== undefined) {
          params.temperature = this.config.temperature;
        }
        if (this.config.top_p !== undefined) {
          params.top_p = this.config.top_p;
        }
        // Note: seed is not supported in current Anthropic SDK
        if (system) {
          params.system = system;
        }

        const response = await this.client.messages.create(params);

        if (!(response instanceof Object) || !('content' in response)) {
          throw new ModelProviderError({
            message: `Unexpected response type from Anthropic API: ${typeof response}. Response: ${String(response).slice(0, 200)}`,
            status_code: 502,
            model: this.name,
          });
        }

        const usage = this.getUsage(response);

        // Extract text from the first content block
        const firstContent = response.content[0];
        const responseText = firstContent && 'text' in firstContent 
          ? firstContent.text 
          : String(firstContent);

        return createCompletion(responseText as T, { usage });
      } else {
        // Use tool calling for structured output
        const toolName = 'extract_information';
        const schema = SchemaOptimizer.createOptimizedJsonSchema(outputFormat);

        // Remove title from schema if present (Anthropic doesn't like it in parameters)
        if ('title' in schema) {
          delete schema.title;
        }

        const tool: any = {
          name: toolName,
          description: `Extract information in the specified format`,
          input_schema: { ...schema, type: 'object' },
          cache_control: { type: 'ephemeral' }
        };

        // Force the model to use this tool
        const toolChoice: any = {
          type: 'tool',
          name: toolName
        };

        const params: Anthropic.MessageCreateParams = {
          model: this.model as Anthropic.Model,
          messages: anthropicMessages,
          tools: [tool],
          tool_choice: toolChoice,
          max_tokens: this.config.max_tokens,
        };

        if (this.config.temperature !== undefined) {
          params.temperature = this.config.temperature;
        }
        if (this.config.top_p !== undefined) {
          params.top_p = this.config.top_p;
        }
        // Note: seed is not supported in current Anthropic SDK
        if (system) {
          params.system = system;
        }

        const response = await this.client.messages.create(params);

        if (!(response instanceof Object) || !('content' in response)) {
          throw new ModelProviderError({
            message: `Unexpected response type from Anthropic API: ${typeof response}. Response: ${String(response).slice(0, 200)}`,
            status_code: 502,
            model: this.name,
          });
        }

        const usage = this.getUsage(response);

        // Extract the tool use block
        for (const contentBlock of response.content) {
          if (contentBlock.type === 'tool_use') {
            try {
              const parsed = outputFormat.parse(contentBlock.input);
              return createCompletion(parsed as T, { usage });
            } catch (e) {
              // If validation fails, try to parse it as JSON first
              if (typeof contentBlock.input === 'string') {
                const data = JSON.parse(contentBlock.input);
                const parsed = outputFormat.parse(data);
                return createCompletion(parsed as T, { usage });
              }
              throw e;
            }
          }
        }

        // If no tool use block found, raise an error
        throw new Error('Expected tool use in response but none found');
      }
    } catch (error: any) {
      if (error?.constructor?.name === 'APIConnectionError') {
        throw new ModelProviderError({
          message: error.message || String(error),
          model: this.name,
        });
      } else if (error?.constructor?.name === 'RateLimitError') {
        throw new ModelRateLimitError({
          message: error.message || String(error),
          status_code: error.status || 429,
          model: this.name,
        });
      } else if (error?.status) {
        // General API error with status
        throw new ModelProviderError({
          message: error.message || String(error),
          status_code: error.status,
          model: this.name,
        });
      }
      
      throw new ModelProviderError({
        message: error instanceof Error ? error.message : String(error),
        model: this.name,
      });
    }
  }
}