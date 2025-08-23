/**
 * A wrapper around LangChain BaseChatModel that implements the browser-use BaseChatModel protocol.
 * 
 * This class allows you to use any LangChain-compatible model with browser-use.
 */

import { BaseChatModel as LangChainBaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage as LangChainAIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AbstractChatModel } from '../../../src/llm/base.js';
import { BaseMessage } from '../../../src/llm/messages.js';
import { ChatInvokeCompletion, ChatInvokeUsage } from '../../../src/llm/views.js';
import { LangChainMessageSerializer } from './serializer.js';

export interface ChatLangChainConfig {
  chat: LangChainBaseChatModel;
}

export class ChatLangChain extends AbstractChatModel {
  private readonly chat: LangChainBaseChatModel;

  constructor(config: ChatLangChainConfig) {
    // Try to extract model name from the LangChain model
    const modelName = 
      (config.chat as any).model_name || 
      (config.chat as any).model ||
      config.chat.constructor.name;
    
    super(modelName);
    this.chat = config.chat;
  }

  get provider(): string {
    /**
     * Return the provider name based on the LangChain model class.
     */
    const modelClassName = this.chat.constructor.name.toLowerCase();
    
    if (modelClassName.includes('openai')) {
      return 'openai';
    } else if (modelClassName.includes('anthropic') || modelClassName.includes('claude')) {
      return 'anthropic';
    } else if (modelClassName.includes('google') || modelClassName.includes('gemini')) {
      return 'google';
    } else if (modelClassName.includes('groq')) {
      return 'groq';
    } else if (modelClassName.includes('ollama')) {
      return 'ollama';
    } else if (modelClassName.includes('deepseek')) {
      return 'deepseek';
    } else {
      return 'langchain';
    }
  }

  get name(): string {
    /**
     * Return the model name.
     */
    // Try to get model name from the LangChain model using various possible properties
    const modelName = 
      (this.chat as any).model_name ||
      (this.chat as any).model ||
      undefined;
    
    if (modelName) {
      return String(modelName);
    }

    return this.chat.constructor.name;
  }

  private getUsage(response: LangChainAIMessage): ChatInvokeUsage | undefined {
    /**
     * Extract usage information from LangChain response.
     */
    const usage = (response as any).usage_metadata;
    if (!usage) {
      return undefined;
    }

    const promptTokens = usage.input_tokens || 0;
    const completionTokens = usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || 0;

    const inputTokenDetails = usage.input_token_details;
    let promptCachedTokens: number | undefined;
    let promptCacheCreationTokens: number | undefined;

    if (inputTokenDetails) {
      promptCachedTokens = inputTokenDetails.cache_read || undefined;
      promptCacheCreationTokens = inputTokenDetails.cache_creation || undefined;
    }

    return {
      prompt_tokens: promptTokens,
      prompt_cached_tokens: promptCachedTokens,
      prompt_cache_creation_tokens: promptCacheCreationTokens,
      prompt_image_tokens: undefined,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    };
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    /**
     * Invoke the LangChain model with the given messages.
     */
    
    // Convert browser-use messages to LangChain messages
    const langchainMessages = LangChainMessageSerializer.serializeMessages(messages);

    try {
      if (!outputFormat) {
        // Return string response
        const response = await this.chat.invoke(langchainMessages);

        if (!(response instanceof LangChainAIMessage)) {
          throw new Error(`Response is not an AIMessage: ${typeof response}`);
        }

        // Extract content from LangChain response
        const content = response.content || '';

        const usage = this.getUsage(response);
        return {
          completion: String(content) as T,
          usage,
        };
      } else {
        // Use LangChain's structured output capability if available
        try {
          const structuredChat = (this.chat as any).withStructuredOutput?.(outputFormat.shape || outputFormat);
          
          if (structuredChat) {
            const parsedObject = await structuredChat.invoke(langchainMessages);
            
            // For structured output, usage metadata is typically not available
            // in the parsed object since it's a Pydantic model, not an AIMessage
            return {
              completion: parsedObject as T,
              usage: undefined,
            };
          } else {
            throw new Error('withStructuredOutput not available');
          }
        } catch (structuredError) {
          // Fall back to manual parsing if withStructuredOutput is not available
          const response = await this.chat.invoke(langchainMessages);

          if (!(response instanceof LangChainAIMessage)) {
            throw new Error(`Response is not an AIMessage: ${typeof response}`);
          }

          const content = response.content || '';

          try {
            let parsedObject: T;
            if (typeof content === 'string') {
              const parsedData = JSON.parse(content);
              if (typeof parsedData === 'object' && parsedData !== null) {
                parsedObject = outputFormat.parse(parsedData);
              } else {
                throw new Error('Parsed JSON is not an object');
              }
            } else {
              throw new Error('Content is not a string and structured output not supported');
            }

            const usage = this.getUsage(response);
            return {
              completion: parsedObject,
              usage,
            };
          } catch (parseError) {
            throw new Error(
              `Failed to parse response as structured output: ${parseError}`
            );
          }
        }
      }
    } catch (error) {
      // Convert any LangChain errors to a generic error
      throw new Error(`LangChain model error: ${error}`);
    }
  }
}