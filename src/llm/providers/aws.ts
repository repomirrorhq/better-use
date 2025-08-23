/**
 * AWS Bedrock chat model supporting multiple providers (Anthropic, Meta, etc.).
 * 
 * This class provides access to various models via AWS Bedrock,
 * supporting both text generation and structured output via tool calling.
 * 
 * To use this model, you need to either:
 * 1. Set the following environment variables:
 *    - AWS_ACCESS_KEY_ID
 *    - AWS_SECRET_ACCESS_KEY  
 *    - AWS_REGION
 * 2. Or provide AWS credentials through other standard methods
 * 3. Or use AWS SSO authentication
 */

import { 
  BedrockRuntimeClient, 
  ConverseCommand,
  ConverseCommandInput,
  ConverseCommandOutput 
} from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import { AbstractChatModel } from '../base';
import { BaseMessage, ContentPartTextParam, ContentPartImageParam } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { ModelProviderError, ModelRateLimitError } from '../../exceptions';
import { SchemaOptimizer } from '../schema';

export const AWSBedrockChatModelSchema = z.object({
  model: z.string().default('anthropic.claude-3-5-sonnet-20240620-v1:0'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  seed: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  awsRegion: z.string().optional(),
  requestParams: z.record(z.any()).optional(),
});

type AWSBedrockConfig = z.infer<typeof AWSBedrockChatModelSchema>;

export class ChatAWSBedrock extends AbstractChatModel {
  private client: BedrockRuntimeClient;
  private config: AWSBedrockConfig;

  constructor(config: Partial<AWSBedrockConfig> & { model?: string }) {
    const validatedConfig = AWSBedrockChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;

    // Initialize AWS client
    const clientConfig: any = {};
    
    if (this.config.awsRegion || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) {
      clientConfig.region = this.config.awsRegion || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    }
    
    if (this.config.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID) {
      clientConfig.credentials = {
        accessKeyId: this.config.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: this.config.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY!,
      };
    }

    this.client = new BedrockRuntimeClient(clientConfig);
  }

  get provider(): string {
    return 'aws_bedrock';
  }

  private parseBase64Url(url: string): { format: string; bytes: Buffer } {
    if (!url.startsWith('data:')) {
      throw new Error(`Invalid base64 URL: ${url}`);
    }

    const [header, data] = url.split(',', 2);
    
    // Extract format from mime type
    const mimeMatch = header.match(/image\/(\w+)/);
    const formatName = mimeMatch?.[1]?.toLowerCase() || 'jpeg';
    
    // Map common formats
    const formatMapping: Record<string, string> = {
      'jpg': 'jpeg',
      'jpeg': 'jpeg', 
      'png': 'png',
      'gif': 'gif',
      'webp': 'webp'
    };
    
    const format = formatMapping[formatName] || 'jpeg';
    
    try {
      const bytes = Buffer.from(data, 'base64');
      return { format, bytes };
    } catch (error) {
      throw new Error(`Failed to decode base64 image data: ${error}`);
    }
  }

  private async downloadImage(url: string): Promise<{ format: string; bytes: Buffer }> {
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(url, { 
        responseType: 'arraybuffer',
        timeout: 30000 
      });
      
      // Detect format from content type or URL
      const contentType = response.headers['content-type']?.toLowerCase() || '';
      let format = 'jpeg';
      
      if (contentType.includes('jpeg') || url.toLowerCase().endsWith('.jpg') || url.toLowerCase().endsWith('.jpeg')) {
        format = 'jpeg';
      } else if (contentType.includes('png') || url.toLowerCase().endsWith('.png')) {
        format = 'png';
      } else if (contentType.includes('gif') || url.toLowerCase().endsWith('.gif')) {
        format = 'gif';
      } else if (contentType.includes('webp') || url.toLowerCase().endsWith('.webp')) {
        format = 'webp';
      }
      
      return { format, bytes: Buffer.from(response.data) };
    } catch (error) {
      throw new Error(`Failed to download image from ${url}: ${error}`);
    }
  }

  private async serializeImageContent(part: ContentPartImageParam): Promise<any> {
    const url = part.image_url.url;
    
    let format: string;
    let bytes: Buffer;
    
    if (url.startsWith('data:image/')) {
      const parsed = this.parseBase64Url(url);
      format = parsed.format;
      bytes = parsed.bytes;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      const downloaded = await this.downloadImage(url);
      format = downloaded.format;
      bytes = downloaded.bytes;
    } else {
      throw new Error(`Unsupported image URL format: ${url}`);
    }

    return {
      image: {
        format,
        source: {
          bytes,
        },
      },
    };
  }

  private async serializeUserContent(content: string | Array<ContentPartTextParam | ContentPartImageParam>): Promise<any[]> {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    const contentBlocks = [];
    for (const part of content) {
      if (part.type === 'text') {
        contentBlocks.push({ text: part.text });
      } else if (part.type === 'image_url') {
        contentBlocks.push(await this.serializeImageContent(part));
      }
    }
    
    return contentBlocks;
  }

  private serializeAssistantContent(content: string | Array<ContentPartTextParam | any> | null): any[] {
    if (!content) return [];
    if (typeof content === 'string') return [{ text: content }];
    
    return content
      .filter(part => part.type === 'text')
      .map(part => ({
        text: part.text
      }));
  }

  private async serializeMessages(messages: BaseMessage[]): Promise<{ bedrockMessages: any[]; systemMessage?: any[] }> {
    const bedrockMessages = [];
    let systemMessage: any[] | undefined;

    for (const message of messages) {
      if (message.role === 'system') {
        if (typeof message.content === 'string') {
          systemMessage = [{ text: message.content }];
        } else if (message.content) {
          systemMessage = message.content.map(part => ({ text: part.text }));
        }
      } else if (message.role === 'user') {
        bedrockMessages.push({
          role: 'user',
          content: await this.serializeUserContent(message.content!),
        });
      } else if (message.role === 'assistant') {
        const contentBlocks = this.serializeAssistantContent(message.content);
        
        // Add tool use blocks if present
        if ('tool_calls' in message && message.tool_calls) {
          for (const toolCall of message.tool_calls) {
            let arguments_: any;
            try {
              arguments_ = JSON.parse(toolCall.function.arguments);
            } catch {
              arguments_ = { arguments: toolCall.function.arguments };
            }
            
            contentBlocks.push({
              toolUse: {
                toolUseId: toolCall.id,
                name: toolCall.function.name,
                input: arguments_,
              },
            });
          }
        }

        if (contentBlocks.length === 0) {
          contentBlocks.push({ text: '' });
        }

        bedrockMessages.push({
          role: 'assistant',
          content: contentBlocks,
        });
      }
    }

    return { bedrockMessages, systemMessage };
  }

  private getInferenceConfig(): any {
    const config: any = {};
    
    if (this.config.maxTokens !== undefined) {
      config.maxTokens = this.config.maxTokens;
    }
    if (this.config.temperature !== undefined) {
      config.temperature = this.config.temperature;
    }
    if (this.config.topP !== undefined) {
      config.topP = this.config.topP;
    }
    if (this.config.stopSequences !== undefined) {
      config.stopSequences = this.config.stopSequences;
    }
    if (this.config.seed !== undefined) {
      config.seed = this.config.seed;
    }
    
    return Object.keys(config).length > 0 ? config : undefined;
  }

  private formatToolsForRequest<T extends z.ZodType>(outputFormat: T): any[] {
    const schema = SchemaOptimizer.createOptimizedJsonSchema(outputFormat);
    
    // AWS Bedrock tool format
    return [
      {
        toolSpec: {
          name: `extract_${schema.title?.toLowerCase() || 'data'}`,
          description: `Extract information in the specified format`,
          inputSchema: {
            json: schema,
          },
        },
      },
    ];
  }

  private parseUsage(response: ConverseCommandOutput): ChatInvokeUsage | undefined {
    if (!response.usage) return undefined;

    return {
      prompt_tokens: response.usage.inputTokens || 0,
      completion_tokens: response.usage.outputTokens || 0,
      total_tokens: response.usage.totalTokens || 0,
      prompt_cached_tokens: undefined,
      prompt_cache_creation_tokens: undefined,
      prompt_image_tokens: undefined,
    };
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    try {
      const { bedrockMessages, systemMessage } = await this.serializeMessages(messages);
      
      // Prepare the request body
      const input: ConverseCommandInput = {
        modelId: this.config.model,
        messages: bedrockMessages,
      };

      if (systemMessage) {
        input.system = systemMessage;
      }

      const inferenceConfig = this.getInferenceConfig();
      if (inferenceConfig) {
        input.inferenceConfig = inferenceConfig;
      }

      // Handle structured output via tool calling
      if (outputFormat) {
        const tools = this.formatToolsForRequest(outputFormat);
        input.toolConfig = { tools };
      }

      // Add any additional request parameters
      if (this.config.requestParams) {
        Object.assign(input, this.config.requestParams);
      }

      // Make the API call
      const command = new ConverseCommand(input);
      const response = await this.client.send(command);

      const usage = this.parseUsage(response);

      // Extract the response content
      if (response.output?.message?.content) {
        const content = response.output.message.content;

        if (!outputFormat) {
          // Return text response
          const textContent = content
            .filter((item): item is any => 'text' in item)
            .map(item => item.text);

          const responseText = textContent.join('\n');
          return createCompletion(responseText as T, { usage });
        } else {
          // Handle structured output from tool calls
          for (const item of content) {
            if ('toolUse' in item && item.toolUse) {
              const toolUse = item.toolUse;
              const toolInput = toolUse.input;

              try {
                // Validate and return the structured output
                const parsed = outputFormat.parse(toolInput);
                return createCompletion(parsed, { usage });
              } catch (error) {
                // If validation fails, try to parse as JSON first
                if (typeof toolInput === 'string') {
                  try {
                    const data = JSON.parse(toolInput);
                    const parsed = outputFormat.parse(data);
                    return createCompletion(parsed, { usage });
                  } catch {
                    // Continue to throw original error
                  }
                }
                throw new ModelProviderError({ message: `Failed to validate structured output: ${error}`, model: this.name });
              }
            }
          }

          throw new ModelProviderError({ message: 'Expected structured output but no tool use found in response', model: this.name });
        }
      }

      // If no valid content found
      if (!outputFormat) {
        return createCompletion('' as T, { usage });
      } else {
        throw new ModelProviderError({ message: 'No valid content found in response', model: this.name });
      }

    } catch (error: any) {
      // Handle AWS-specific errors
      if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException') {
        throw new ModelRateLimitError({ message: error.message, model: this.name });
      }
      
      if (error instanceof ModelProviderError || error instanceof ModelRateLimitError) {
        throw error;
      }
      
      throw new ModelProviderError({ message: `AWS Bedrock error: ${error.message}`, model: this.name });
    }
  }
}