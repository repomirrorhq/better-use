/**
 * Azure OpenAI chat model implementation
 */

import { z } from 'zod';
import { AzureOpenAI } from 'openai';
import type { ChatCompletionCreateParams, ChatCompletion } from 'openai/resources/chat/completions';
import { AbstractChatModel } from '../base';
import { BaseMessage } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { ModelProviderError } from '../../exceptions';
import { SchemaOptimizer } from '../schema';

export const AzureOpenAIChatModelSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.2),
  frequency_penalty: z.number().min(-2).max(2).default(0.3),
  seed: z.number().optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_completion_tokens: z.number().default(4096),
  api_key: z.string().optional(),
  api_version: z.string().default('2024-12-01-preview'),
  azure_endpoint: z.string().optional(),
  azure_deployment: z.string().optional(),
  azure_ad_token: z.string().optional(),
  timeout: z.number().optional(),
  max_retries: z.number().default(5),
  add_schema_to_system_prompt: z.boolean().default(false),
});

type AzureOpenAIChatModelConfig = z.infer<typeof AzureOpenAIChatModelSchema>;

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

export class ChatAzureOpenAI extends AbstractChatModel {
  private config: AzureOpenAIChatModelConfig;
  private client: AzureOpenAI;

  constructor(config: Partial<AzureOpenAIChatModelConfig> & { model: string }) {
    const validatedConfig = AzureOpenAIChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Initialize Azure OpenAI client
    this.client = new AzureOpenAI({
      apiKey: validatedConfig.api_key || process.env.AZURE_OPENAI_API_KEY,
      apiVersion: validatedConfig.api_version,
      azureADTokenProvider: validatedConfig.azure_ad_token ? 
        async () => validatedConfig.azure_ad_token! : undefined,
      endpoint: validatedConfig.azure_endpoint || process.env.AZURE_OPENAI_ENDPOINT,
      deployment: validatedConfig.azure_deployment || process.env.AZURE_OPENAI_DEPLOYMENT,
      timeout: validatedConfig.timeout,
      maxRetries: validatedConfig.max_retries,
    });
  }

  get provider(): string {
    return 'azure';
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

    let completionTokens = response.usage.completion_tokens || 0;
    
    // Add reasoning tokens if available
    const completionDetails = (response.usage as any).completion_tokens_details;
    if (completionDetails?.reasoning_tokens) {
      completionTokens += completionDetails.reasoning_tokens;
    }

    return {
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: completionTokens,
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
        frequency_penalty: this.config.frequency_penalty,
        top_p: this.config.top_p,
        max_tokens: this.config.max_completion_tokens,
        seed: this.config.seed,
      };

      // Handle structured output
      if (outputFormat) {
        const isReasoningModel = REASONING_MODELS.some(model => 
          this.config.model.toLowerCase().includes(model.toLowerCase())
        );
        
        if (isReasoningModel) {
          // For reasoning models, add schema to system prompt
          const systemPrompt = `You must respond with valid JSON that matches this schema: ${JSON.stringify(SchemaOptimizer.createOptimizedJsonSchema(outputFormat))}`;
          const systemMessage: any = {
            role: 'system',
            content: systemPrompt
          };
          requestBody.messages = [systemMessage, ...serializedMessages];
        } else {
          // For regular models, use response_format
          const jsonSchema = SchemaOptimizer.createOptimizedJsonSchema(outputFormat);
          requestBody.response_format = {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              schema: jsonSchema,
              strict: true
            }
          };
        }
      }

      const response = await this.client.chat.completions.create(requestBody);
      
      if (!response.choices || response.choices.length === 0) {
        throw new ModelProviderError({
          message: 'No response choices received from Azure OpenAI',
          model: this.name
        });
      }

      const choice = response.choices[0];
      const content = choice.message.content || '';
      
      // Parse structured output if schema provided
      const parsedContent = this.parseStructuredOutput(content, outputFormat);

      return createCompletion(parsedContent as T, {
        usage: this.getUsage(response)
      });

    } catch (error: any) {
      if (error.status === 429 && max_retries > 0) {
        const delay = Math.pow(2, 3 - max_retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.ainvoke(messages, outputFormat, max_retries - 1);
      }
      
      throw new ModelProviderError({
        message: `Azure OpenAI API error: ${error.message}`,
        status_code: error.status,
        model: this.name
      });
    }
  }
}