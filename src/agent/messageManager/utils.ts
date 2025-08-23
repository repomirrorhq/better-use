/**
 * Utility functions for message manager
 */

import { promises as fs } from 'fs';
import { dirname } from 'path';
import { BaseMessage, ContentPartTextParam } from '../../llm/messages';

/**
 * Save conversation history to file asynchronously
 */
export async function saveConversation(
  inputMessages: BaseMessage[],
  response: any,
  target: string,
  encoding: string = 'utf-8'
): Promise<void> {
  // Create folders if not exists
  const targetDir = dirname(target);
  await fs.mkdir(targetDir, { recursive: true });

  const content = await formatConversation(inputMessages, response);
  await fs.writeFile(target, content, { encoding: encoding as BufferEncoding });
}

/**
 * Format the conversation including messages and response
 */
export async function formatConversation(messages: BaseMessage[], response: any): Promise<string> {
  const lines: string[] = [];

  // Format messages
  for (const message of messages) {
    lines.push(` ${message.role} `);
    
    // Get text content from message
    let text = '';
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .filter(part => 'text' in part)
        .map(part => (part as ContentPartTextParam).text)
        .join('\n');
    }
    
    lines.push(text);
    lines.push(''); // Empty line after each message
  }

  // Format response
  lines.push(' RESPONSE');
  lines.push(JSON.stringify(response, null, 2));

  return lines.join('\n');
}