/**
 * OpenAI-like chat model implementation
 * A class for interacting with any provider using the OpenAI API schema
 */

import { z } from 'zod';
import { ChatOpenAI, OpenAIChatModelSchema } from './openai';

export const OpenAILikeChatModelSchema = OpenAIChatModelSchema.extend({
  model: z.string(), // Allow any model string for OpenAI-like providers
  base_url: z.string(), // Make base_url required for OpenAI-like providers
});

type OpenAILikeChatModelConfig = z.infer<typeof OpenAILikeChatModelSchema>;

export class ChatOpenAILike extends ChatOpenAI {
  constructor(config: Partial<OpenAILikeChatModelConfig> & { model: string; base_url: string }) {
    // Validate the config with the extended schema
    const validatedConfig = OpenAILikeChatModelSchema.parse(config);
    
    // Call the parent constructor with the validated config
    super(validatedConfig);
  }
}