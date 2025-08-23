/**
 * Serializer for converting between browser-use message types and LangChain message types.
 */

import {
  AIMessage,
  BaseMessage as LangChainBaseMessage,
  HumanMessage,
  SystemMessage,
  ToolCall as LangChainToolCall,
} from '@langchain/core/messages';
import {
  AssistantMessage,
  BaseMessage,
  ContentPartImageParam,
  ContentPartRefusalParam,
  ContentPartTextParam,
  SystemMessage as BrowserUseSystemMessage,
  ToolCall,
  UserMessage,
} from '../../../src/llm/messages.js';

export class LangChainMessageSerializer {
  /**
   * Convert user message content for LangChain compatibility.
   */
  private static serializeUserContent(
    content: string | Array<ContentPartTextParam | ContentPartImageParam>
  ): string | Array<string | Record<string, any>> {
    if (typeof content === 'string') {
      return content;
    }

    const serializedParts: Array<Record<string, any>> = [];
    for (const part of content) {
      if (part.type === 'text') {
        serializedParts.push({
          type: 'text',
          text: part.text,
        });
      } else if (part.type === 'image_url') {
        // LangChain format for images
        serializedParts.push({
          type: 'image_url',
          image_url: {
            url: part.image_url.url,
            detail: part.image_url.detail,
          },
        });
      }
    }

    return serializedParts;
  }

  /**
   * Convert system message content to text string for LangChain compatibility.
   */
  private static serializeSystemContent(
    content: string | Array<ContentPartTextParam>
  ): string {
    if (typeof content === 'string') {
      return content;
    }

    const textParts: string[] = [];
    for (const part of content) {
      if (part.type === 'text') {
        textParts.push(part.text);
      }
    }

    return textParts.join('\n');
  }

  /**
   * Convert assistant message content to text string for LangChain compatibility.
   */
  private static serializeAssistantContent(
    content: string | Array<ContentPartTextParam | ContentPartRefusalParam> | null
  ): string {
    if (content === null) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }

    const textParts: string[] = [];
    for (const part of content) {
      if (part.type === 'text') {
        textParts.push(part.text);
      }
      // Refusal parts could be included as text if needed
      // else if (part.type === 'refusal') {
      //   textParts.push(`[Refusal: ${part.refusal}]`);
      // }
    }

    return textParts.join('\n');
  }

  /**
   * Convert browser-use ToolCall to LangChain ToolCall.
   */
  private static serializeToolCall(toolCall: ToolCall): LangChainToolCall {
    // Parse the arguments string to a dict for LangChain
    let argsDict: Record<string, any>;
    try {
      argsDict = JSON.parse(toolCall.function.arguments);
    } catch {
      // If parsing fails, wrap in a dict
      argsDict = { arguments: toolCall.function.arguments };
    }

    return new LangChainToolCall({
      name: toolCall.function.name,
      args: argsDict,
      id: toolCall.id,
    });
  }

  /**
   * Serialize a browser-use message to a LangChain message.
   */
  static serialize(message: BaseMessage): LangChainBaseMessage {
    if (message.role === 'user') {
      const userMessage = message as UserMessage;
      const content = this.serializeUserContent(userMessage.content);
      return new HumanMessage({
        content,
        name: userMessage.name,
      });
    } else if (message.role === 'system') {
      const systemMessage = message as BrowserUseSystemMessage;
      const content = this.serializeSystemContent(systemMessage.content);
      return new SystemMessage({
        content,
        name: systemMessage.name,
      });
    } else if (message.role === 'assistant') {
      const assistantMessage = message as AssistantMessage;
      // Handle content
      const content = this.serializeAssistantContent(assistantMessage.content);

      // For simplicity, we'll ignore tool calls in LangChain integration for now
      // as the TypeScript LangChain ecosystem may handle them differently
      return new AIMessage({
        content,
        name: assistantMessage.name,
      });
    } else {
      throw new Error(`Unknown message type: ${(message as any).role}`);
    }
  }

  /**
   * Serialize a list of browser-use messages to LangChain messages.
   */
  static serializeMessages(messages: BaseMessage[]): LangChainBaseMessage[] {
    return messages.map(message => this.serialize(message));
  }
}