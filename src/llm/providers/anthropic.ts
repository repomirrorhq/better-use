/**
 * Anthropic chat model implementation
 */

import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { AbstractChatModel } from '../base';
import { BaseMessage } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { LLMException } from '../../exceptions';

export const AnthropicChatModelSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(1).default(0.2),
  max_tokens: z.number().default(4096),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  timeout: z.number().optional(),
  max_retries: z.number().default(5),
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
      baseURL: validatedConfig.base_url,
      timeout: validatedConfig.timeout,
      maxRetries: validatedConfig.max_retries,
    });
  }

  get provider(): string {
    return 'anthropic';
  }

  private serializeMessages(messages: BaseMessage[]): {
    system?: string;
    messages: Anthropic.MessageParam[];
  } {
    let systemMessage: string | undefined;
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Anthropic handles system messages separately
        systemMessage = typeof message.content === 'string' 
          ? message.content 
          : message.content?.map((part: any) => part.text).join('\n') || '';
      } else if (message.role === 'user') {
        if (typeof message.content === 'string') {
          anthropicMessages.push({
            role: 'user',
            content: message.content
          });
        } else {
          const content: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = message.content?.map((part: any) => {
            if (part.type === 'text') {
              return {
                type: 'text',
                text: part.text
              } as Anthropic.TextBlockParam;
            } else if (part.type === 'image_url') {
              // Convert image URL to Anthropic format
              return {
                type: 'image',
                source: {
                  type: part.image_url.url.startsWith('data:') ? 'base64' : 'url',
                  media_type: part.image_url.media_type || 'image/png',
                  data: part.image_url.url.startsWith('data:') 
                    ? part.image_url.url.split(',')[1] 
                    : part.image_url.url
                }
              } as Anthropic.ImageBlockParam;
            }
            return null;
          }).filter((item): item is Anthropic.TextBlockParam | Anthropic.ImageBlockParam => item !== null) || [];
          
          anthropicMessages.push({
            role: 'user',
            content
          });
        }
      } else if (message.role === 'assistant') {
        anthropicMessages.push({
          role: 'assistant',
          content: typeof message.content === 'string' 
            ? message.content 
            : message.content?.map((part: any) => part.text).join('\n') || ''
        });
      }
    }

    return { system: systemMessage, messages: anthropicMessages };
  }

  private getUsage(response: Anthropic.Message): ChatInvokeUsage | undefined {
    if (!response.usage) {
      return undefined;
    }

    return {
      prompt_tokens: response.usage.input_tokens || 0,
      prompt_cached_tokens: (response.usage as any).cache_creation_input_tokens,
      prompt_cache_creation_tokens: (response.usage as any).cache_read_input_tokens,
      prompt_image_tokens: undefined,
      completion_tokens: response.usage.output_tokens || 0,
      total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
    };
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    const { system, messages: anthropicMessages } = this.serializeMessages(messages);

    try {
      const params: Anthropic.MessageCreateParams = {
        model: this.model as Anthropic.Model,
        messages: anthropicMessages,
        max_tokens: this.config.max_tokens,
        temperature: this.config.temperature,
      };

      if (system) {
        params.system = system;
      }

      const response = await this.client.messages.create(params);
      
      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      const usage = this.getUsage(response);

      if (outputFormat) {
        const parsed = this.parseStructuredOutput(content, outputFormat);
        return createCompletion(parsed as T, { usage });
      } else {
        return createCompletion(content as T, { usage });
      }

    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new LLMException(error.status || 500, error.message || 'Unknown Anthropic API error');
      }
      throw error;
    }
  }
}