/**
 * Google/Gemini chat model implementation
 */

import { z } from 'zod';
import { GoogleGenerativeAI, GenerativeModel, Part, Content, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { AbstractChatModel } from '../base';
import { BaseMessage, SystemMessage, UserMessage, AssistantMessage } from '../messages';
import { ChatInvokeCompletion, ChatInvokeUsage, createCompletion } from '../views';
import { ModelProviderError, ModelRateLimitError } from '../../exceptions';
import { SchemaOptimizer } from '../schema';

export const GoogleChatModelSchema = z.object({
  model: z.string().default('gemini-2.0-flash-exp'),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().optional(),
  max_output_tokens: z.number().optional(),
  candidate_count: z.number().default(1),
  stop_sequences: z.array(z.string()).optional(),
  api_key: z.string().optional(),
  safety_settings: z.array(z.object({
    category: z.nativeEnum(HarmCategory),
    threshold: z.nativeEnum(HarmBlockThreshold)
  })).optional(),
  generation_config: z.any().optional(),
});

type GoogleChatModelConfig = z.infer<typeof GoogleChatModelSchema>;

// Mapping of verified Gemini models 
const VERIFIED_GEMINI_MODELS = [
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.0-pro'
] as const;

type VerifiedGeminiModel = typeof VERIFIED_GEMINI_MODELS[number];

export class ChatGoogle extends AbstractChatModel {
  private config: GoogleChatModelConfig;
  private client: GoogleGenerativeAI;
  private genModel: GenerativeModel;

  constructor(config: Partial<GoogleChatModelConfig> & { model?: string; api_key?: string }) {
    const validatedConfig = GoogleChatModelSchema.parse(config);
    super(validatedConfig.model);
    this.config = validatedConfig;
    
    // Initialize Google Generative AI client
    const apiKey = validatedConfig.api_key || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ModelProviderError({
        message: 'Google API key is required. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable or pass api_key parameter.',
        model: validatedConfig.model,
      });
    }

    this.client = new GoogleGenerativeAI(apiKey);
    
    // Create model with configuration
    const modelConfig: any = {};
    
    if (validatedConfig.temperature !== undefined) {
      modelConfig.temperature = validatedConfig.temperature;
    }
    if (validatedConfig.top_p !== undefined) {
      modelConfig.topP = validatedConfig.top_p;
    }
    if (validatedConfig.top_k !== undefined) {
      modelConfig.topK = validatedConfig.top_k;
    }
    if (validatedConfig.max_output_tokens !== undefined) {
      modelConfig.maxOutputTokens = validatedConfig.max_output_tokens;
    }
    if (validatedConfig.candidate_count !== undefined) {
      modelConfig.candidateCount = validatedConfig.candidate_count;
    }
    if (validatedConfig.stop_sequences !== undefined) {
      modelConfig.stopSequences = validatedConfig.stop_sequences;
    }

    this.genModel = this.client.getGenerativeModel({
      model: validatedConfig.model,
      generationConfig: validatedConfig.generation_config || modelConfig,
      safetySettings: validatedConfig.safety_settings,
    });
  }

  get provider(): string {
    return 'google';
  }

  private serializeMessages(messages: BaseMessage[]): {
    systemInstruction?: string;
    contents: Content[];
  } {
    let systemInstruction: string | undefined;
    const contents: Content[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        systemInstruction = this.serializeSystemMessage(message as SystemMessage);
      } else if (message.role === 'user') {
        contents.push(this.serializeUserMessage(message as UserMessage));
      } else if (message.role === 'assistant') {
        contents.push(this.serializeAssistantMessage(message as AssistantMessage));
      }
    }

    return { systemInstruction, contents };
  }

  private serializeSystemMessage(message: SystemMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    const textParts: string[] = [];
    for (const part of message.content) {
      if (part.type === 'text') {
        textParts.push(part.text);
      }
    }
    return textParts.join('\n');
  }

  private serializeUserMessage(message: UserMessage): Content {
    if (typeof message.content === 'string') {
      return {
        role: 'user',
        parts: [{ text: message.content }]
      };
    }

    const parts: Part[] = [];
    for (const part of message.content) {
      if (part.type === 'text') {
        parts.push({ text: part.text });
      } else if (part.type === 'image_url') {
        const url = part.image_url.url;
        if (url.startsWith('data:')) {
          // Handle base64 encoded images
          const [header, data] = url.split(',', 2);
          const mimeType = header.split(';')[0].replace('data:', '') || 'image/png';
          
          parts.push({
            inlineData: {
              mimeType,
              data
            }
          });
        } else {
          // For URL images, we need to fetch and convert to base64
          // This is a limitation of the current Google AI SDK
          console.warn('URL-based images are not directly supported. Consider converting to base64.');
          parts.push({ text: `[Image URL: ${url}]` });
        }
      }
    }

    return {
      role: 'user',
      parts
    };
  }

  private serializeAssistantMessage(message: AssistantMessage): Content {
    const parts: Part[] = [];

    // Add content parts if present
    if (message.content !== null) {
      if (typeof message.content === 'string') {
        parts.push({ text: message.content });
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          }
          // Skip refusal blocks - Google doesn't have this concept
        }
      }
    }

    // Google doesn't support tool calls in the same way, so we convert them to text
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        parts.push({ 
          text: `[Tool Call] ${toolCall.function.name}: ${toolCall.function.arguments}` 
        });
      }
    }

    // If no content, add empty text
    if (parts.length === 0) {
      parts.push({ text: '' });
    }

    return {
      role: 'model', // Google uses 'model' instead of 'assistant'
      parts
    };
  }

  private getUsage(response: any): ChatInvokeUsage | undefined {
    if (!response.response?.usageMetadata) {
      return undefined;
    }

    const usage = response.response.usageMetadata;
    
    return {
      prompt_tokens: usage.promptTokenCount || 0,
      completion_tokens: usage.candidatesTokenCount || 0,
      total_tokens: usage.totalTokenCount || 0,
      prompt_cached_tokens: usage.cachedContentTokenCount || undefined,
      prompt_cache_creation_tokens: undefined,
      prompt_image_tokens: undefined,
    };
  }

  private fixGeminiSchema(schema: any): any {
    /**
     * Convert a Zod-generated schema to be compatible with Gemini's requirements.
     * This removes unsupported properties and resolves references.
     */

    // Handle $defs and $ref resolution
    if (schema.$defs) {
      const defs = schema.$defs;
      delete schema.$defs;

      const resolveRefs = (obj: any): any => {
        if (typeof obj === 'object' && obj !== null) {
          if (Array.isArray(obj)) {
            return obj.map(resolveRefs);
          }
          
          if (obj.$ref) {
            const refName = obj.$ref.split('/').pop();
            if (refName && defs[refName]) {
              const resolved = { ...defs[refName] };
              // Merge any additional properties
              Object.keys(obj).forEach(key => {
                if (key !== '$ref') {
                  resolved[key] = obj[key];
                }
              });
              return resolveRefs(resolved);
            }
          }
          
          const result: any = {};
          Object.keys(obj).forEach(key => {
            result[key] = resolveRefs(obj[key]);
          });
          return result;
        }
        return obj;
      };

      schema = resolveRefs(schema);
    }

    // Remove unsupported properties
    const cleanSchema = (obj: any): any => {
      if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
          return obj.map(cleanSchema);
        }
        
        const cleaned: any = {};
        Object.keys(obj).forEach(key => {
          if (!['additionalProperties', 'title', 'default'].includes(key)) {
            cleaned[key] = cleanSchema(obj[key]);
          }
        });

        // Handle empty object properties - Gemini doesn't allow empty OBJECT types
        if (cleaned.type === 'object' && cleaned.properties && Object.keys(cleaned.properties).length === 0) {
          cleaned.properties = { _placeholder: { type: 'string' } };
        }

        return cleaned;
      }
      return obj;
    };

    return cleanSchema(schema);
  }

  private isRetryableError(error: any): boolean {
    const errorMsg = String(error).toLowerCase();
    
    const retryablePatterns = [
      'rate limit', 'resource exhausted', 'quota exceeded', 'too many requests', '429',
      'service unavailable', 'internal server error', 'bad gateway', '503', '502', '500',
      'connection', 'timeout', 'network', 'unreachable'
    ];
    
    return retryablePatterns.some(pattern => errorMsg.includes(pattern));
  }

  async ainvoke<T = string>(
    messages: BaseMessage[],
    outputFormat?: z.ZodSchema<T>
  ): Promise<ChatInvokeCompletion<T>> {
    const { systemInstruction, contents } = this.serializeMessages(messages);

    const makeApiCall = async () => {
      if (!outputFormat) {
        // Regular text generation
        const chat = this.genModel.startChat({
          history: contents.slice(0, -1), // All but the last message
          systemInstruction,
        });

        const lastMessage = contents[contents.length - 1];
        const prompt = lastMessage?.parts?.map(p => 'text' in p ? p.text : '').join('') || '';

        const result = await chat.sendMessage(prompt);
        const response = result.response;
        const text = response.text() || '';
        const usage = this.getUsage(result);

        return createCompletion(text as T, { usage });
      } else {
        // Structured output using JSON schema
        const schema = SchemaOptimizer.createOptimizedJsonSchema(outputFormat);
        const geminiSchema = this.fixGeminiSchema(schema);

        // Create a new model instance with JSON response configuration
        const modelWithSchema = this.client.getGenerativeModel({
          model: this.config.model,
          generationConfig: {
            ...this.genModel.generationConfig,
            responseMimeType: 'application/json',
            responseSchema: geminiSchema,
          },
          safetySettings: this.genModel.safetySettings,
          systemInstruction,
        });

        const chat = modelWithSchema.startChat({
          history: contents.slice(0, -1),
        });

        const lastMessage = contents[contents.length - 1];
        const prompt = lastMessage?.parts?.map(p => 'text' in p ? p.text : '').join('') || '';

        const result = await chat.sendMessage(prompt);
        const response = result.response;
        const text = response.text() || '';
        const usage = this.getUsage(result);

        try {
          const parsed = JSON.parse(text);
          const validated = outputFormat.parse(parsed);
          return createCompletion(validated as T, { usage });
        } catch (e) {
          throw new ModelProviderError({
            message: `Failed to parse or validate response: ${e instanceof Error ? e.message : String(e)}`,
            status_code: 500,
            model: this.name,
          });
        }
      }
    };

    try {
      // Retry logic with exponential backoff
      let lastError: any;
      
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          return await makeApiCall();
        } catch (error: any) {
          lastError = error;
          
          if (!this.isRetryableError(error) || attempt === 9) {
            break;
          }

          // Exponential backoff with jitter
          const delay = Math.min(60000, 1000 * Math.pow(2, attempt));
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError;
    } catch (error: any) {
      // Handle specific Google API errors
      const errorMessage = error.message || String(error);
      let statusCode: number | undefined;

      if (errorMessage.toLowerCase().includes('api key')) {
        statusCode = 401;
      } else if (this.isRetryableError(error)) {
        statusCode = error.status || 429;
      } else if (error.status) {
        statusCode = error.status;
      }

      if (statusCode === 429) {
        throw new ModelRateLimitError({
          message: errorMessage,
          status_code: statusCode,
          model: this.name,
        });
      } else {
        throw new ModelProviderError({
          message: errorMessage,
          status_code: statusCode || 502,
          model: this.name,
        });
      }
    }
  }
}