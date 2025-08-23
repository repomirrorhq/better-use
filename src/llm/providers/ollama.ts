/**
 * Ollama chat model implementation for local models
 */

import { z } from 'zod';
import { Ollama, type Message } from 'ollama';
import { AbstractChatModel } from '../base';
import { BaseMessage, SystemMessage, UserMessage, AssistantMessage, ToolCall } from '../messages';
import { ChatInvokeCompletion, createCompletion } from '../views';
import { ModelProviderError } from '../../exceptions';

export const OllamaChatModelSchema = z.object({
  model: z.string(),
  host: z.string().optional(),
  timeout: z.number().optional(),
  keep_alive: z.string().optional(),
  // Model parameters
  num_predict: z.number().optional(),
  top_k: z.number().optional(),
  top_p: z.number().min(0).max(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  repeat_penalty: z.number().optional(),
  seed: z.number().optional(),
  // Client initialization params
  client_params: z.record(z.any()).optional(),
});

type OllamaChatModelConfig = z.infer<typeof OllamaChatModelSchema>;

export class ChatOllama extends AbstractChatModel {
  private config: OllamaChatModelConfig;
  private client: Ollama;

  constructor(config: Partial<OllamaChatModelConfig> & { model: string }) {
    const validatedConfig = OllamaChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Initialize Ollama client
    this.client = new Ollama({
      host: validatedConfig.host,
      ...validatedConfig.client_params,
    });
  }

  get provider(): string {
    return 'ollama';
  }

  /**
   * Extract text content from message content, ignoring images
   */
  private extractTextContent(content: any): string {
    if (content === null || content === undefined) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }

    const textParts: string[] = [];
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'text') {
          textParts.push(part.text);
        } else if (part.type === 'refusal') {
          textParts.push(`[Refusal] ${part.refusal}`);
        }
        // Skip image parts as they're handled separately
      }
    }

    return textParts.join('\n');
  }

  /**
   * Extract images from message content
   */
  private extractImages(content: any): string[] {
    if (content === null || content === undefined || typeof content === 'string') {
      return [];
    }

    const images: string[] = [];
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            // Handle base64 encoded images
            // Format: data:image/png;base64,<data>
            const [, data] = url.split(',', 2);
            if (data) {
              // For Ollama, we can pass the base64 data directly
              images.push(data);
            }
          } else {
            // Handle URL images (Ollama will download them)
            images.push(url);
          }
        }
      }
    }

    return images;
  }

  /**
   * Convert browser-use ToolCalls to Ollama ToolCalls
   */
  private serializeToolCalls(toolCalls: ToolCall[]) {
    return toolCalls.map(toolCall => {
      // Parse arguments from JSON string to object for Ollama
      let argumentsObj: Record<string, any>;
      try {
        argumentsObj = JSON.parse(toolCall.function.arguments);
      } catch (error) {
        // If parsing fails, wrap in a dict
        argumentsObj = { arguments: toolCall.function.arguments };
      }

      return {
        function: {
          name: toolCall.function.name,
          arguments: argumentsObj,
        }
      };
    });
  }

  /**
   * Serialize a browser-use message to an Ollama Message
   */
  private serializeMessage(message: BaseMessage): Message {
    if (message.role === 'user') {
      const userMessage = message as UserMessage;
      const textContent = this.extractTextContent(userMessage.content);
      const images = this.extractImages(userMessage.content);
      
      const ollamaMessage: Message = {
        role: 'user',
        content: textContent || '',
      };

      if (images.length > 0) {
        ollamaMessage.images = images;
      }

      return ollamaMessage;
    }

    if (message.role === 'system') {
      const systemMessage = message as SystemMessage;
      return {
        role: 'system',
        content: this.extractTextContent(systemMessage.content) || '',
      };
    }

    if (message.role === 'assistant') {
      const assistantMessage = message as AssistantMessage;
      
      const ollamaMessage: Message = {
        role: 'assistant',
        content: this.extractTextContent(assistantMessage.content) || '',
      };

      // Handle tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        ollamaMessage.tool_calls = this.serializeToolCalls(assistantMessage.tool_calls);
      }

      return ollamaMessage;
    }

    throw new Error(`Unknown message type: ${(message as any).role}`);
  }

  /**
   * Serialize a list of browser-use messages to Ollama Messages
   */
  private serializeMessages(messages: BaseMessage[]): Message[] {
    return messages.map(message => this.serializeMessage(message));
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    const ollamaMessages = this.serializeMessages(messages);

    try {
      if (!outputFormat) {
        // Standard text completion
        const response = await this.client.chat({
          model: this.config.model,
          messages: ollamaMessages,
          options: {
            temperature: this.config.temperature,
            top_p: this.config.top_p,
            top_k: this.config.top_k,
            num_predict: this.config.num_predict,
            repeat_penalty: this.config.repeat_penalty,
            seed: this.config.seed,
          },
          keep_alive: this.config.keep_alive,
        });

        return createCompletion(response.message.content || '' as any, {
          // Ollama doesn't provide detailed usage statistics
          usage: undefined,
        });
      } else {
        // Structured output with JSON schema
        const schema = outputFormat.safeParse({}).success 
          ? (outputFormat as any)._def?.schema || {}
          : {};

        const response = await this.client.chat({
          model: this.config.model,
          messages: ollamaMessages,
          format: schema,
          options: {
            temperature: this.config.temperature,
            top_p: this.config.top_p,
            top_k: this.config.top_k,
            num_predict: this.config.num_predict,
            repeat_penalty: this.config.repeat_penalty,
            seed: this.config.seed,
          },
          keep_alive: this.config.keep_alive,
        });

        const content = response.message.content || '';
        
        // Parse the structured output
        let parsedContent: T;
        try {
          parsedContent = outputFormat.parse(JSON.parse(content));
        } catch (parseError) {
          // If parsing fails, try to parse as is
          try {
            parsedContent = outputFormat.parse(content);
          } catch (error) {
            throw new ModelProviderError({ 
              message: `Failed to parse structured output: ${error}`, 
              model: this.name 
            });
          }
        }

        return createCompletion(parsedContent, {
          usage: undefined,
        });
      }
    } catch (error) {
      if (error instanceof ModelProviderError) {
        throw error;
      }
      throw new ModelProviderError({ 
        message: `Ollama API error: ${error}`, 
        model: this.name 
      });
    }
  }
}