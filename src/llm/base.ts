/**
 * Base interface and types for chat models
 */

import { z } from 'zod';
import { BaseMessage } from './messages';
import { ChatInvokeCompletion } from './views';

/**
 * Base interface for all chat models
 */
export interface BaseChatModel {
  _verified_api_keys?: boolean;
  model: string;

  readonly provider: string;
  readonly name: string;
  readonly model_name: string; // for legacy support

  /**
   * Invoke the chat model with messages
   */
  ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>>;
}

/**
 * Abstract base class for chat models
 */
export abstract class AbstractChatModel implements BaseChatModel {
  _verified_api_keys = false;
  
  constructor(public model: string) {}

  abstract get provider(): string;
  
  get name(): string {
    return `${this.provider}/${this.model}`;
  }
  
  get model_name(): string {
    return this.model;
  }

  abstract ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>>;

  protected parseStructuredOutput<T>(
    rawOutput: string,
    outputFormat?: z.ZodSchema<T>
  ): T | string {
    if (!outputFormat) {
      return rawOutput;
    }

    try {
      // Try to parse as JSON first
      const jsonData = JSON.parse(rawOutput);
      return outputFormat.parse(jsonData);
    } catch (error) {
      // If parsing fails, return the raw output
      console.warn(`Failed to parse structured output: ${error}`);
      return rawOutput as T;
    }
  }
}

/**
 * Type guard to check if an object implements BaseChatModel
 */
export function isBaseChatModel(obj: any): obj is BaseChatModel {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.model === 'string' &&
    typeof obj.provider === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.ainvoke === 'function'
  );
}