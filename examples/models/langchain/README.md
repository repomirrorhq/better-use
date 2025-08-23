# LangChain Integration for Browser-Use

This directory contains the LangChain integration for browser-use, allowing you to use any LangChain-compatible model with the browser-use TypeScript library.

## Overview

The integration consists of three main components:

1. **`chat.ts`** - The main `ChatLangChain` class that wraps LangChain models
2. **`serializer.ts`** - Message serialization between browser-use and LangChain formats
3. **`example.ts`** - A complete example showing how to use the integration

## Installation

First, install the required LangChain dependencies:

```bash
npm install @langchain/core @langchain/openai
# Or for other providers:
# npm install @langchain/anthropic
# npm install @langchain/google-genai
# npm install @langchain/groq
```

## Usage

### Basic Usage

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { Agent } from '../../src/agent';
import { ChatLangChain } from './chat';

// Create a LangChain model
const langchainModel = new ChatOpenAI({
  model: 'gpt-4.1-mini',
  temperature: 0.1,
  apiKey: process.env.OPENAI_API_KEY,
});

// Wrap it with ChatLangChain
const llm = new ChatLangChain({ chat: langchainModel });

// Use with browser-use Agent
const agent = new Agent({
  task: 'Navigate to example.com and extract the main heading',
  llm,
});

const result = await agent.run();
console.log(result.extractedContent);
```

### Supported LangChain Models

The integration automatically detects the provider based on the LangChain model class name:

- **OpenAI**: `ChatOpenAI`, etc.
- **Anthropic**: `ChatAnthropic`, etc.
- **Google**: `ChatGoogleGenerativeAI`, etc.
- **Groq**: `ChatGroq`, etc.
- **Ollama**: `ChatOllama`, etc.
- **DeepSeek**: `ChatDeepSeek`, etc.

### Structured Output Support

The integration supports structured output when the underlying LangChain model supports it:

```typescript
import { z } from 'zod';

const schema = z.object({
  title: z.string(),
  description: z.string(),
  links: z.array(z.string()),
});

const result = await llm.ainvoke(messages, schema);
// result.completion is typed as the schema type
```

## Features

- **Automatic Provider Detection**: Automatically detects the provider based on LangChain model class
- **Message Serialization**: Handles conversion between browser-use and LangChain message formats
- **Usage Tracking**: Extracts token usage and cost information when available
- **Error Handling**: Proper error handling and conversion between formats
- **Structured Output**: Support for structured output when available

## Limitations

- Tool calls are not currently serialized (for simplicity)
- Some LangChain-specific features may not be fully supported
- Usage metadata availability depends on the underlying LangChain model

## Running the Example

```bash
# Set your API key
export OPENAI_API_KEY="your-api-key"

# Run the example
npm run build
node dist/examples/models/langchain/example.js
```

## Advanced Usage

### Using Different Providers

```typescript
// Anthropic
import { ChatAnthropic } from '@langchain/anthropic';
const anthropicModel = new ChatAnthropic({
  model: 'claude-3-sonnet-20240229',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const llm = new ChatLangChain({ chat: anthropicModel });

// Google Gemini
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
const geminiModel = new ChatGoogleGenerativeAI({
  model: 'gemini-pro',
  apiKey: process.env.GOOGLE_API_KEY,
});
const llm = new ChatLangChain({ chat: geminiModel });
```

### Custom Configuration

```typescript
const langchainModel = new ChatOpenAI({
  model: 'gpt-4.1-mini',
  temperature: 0.1,
  maxTokens: 2000,
  timeout: 60000,
  apiKey: process.env.OPENAI_API_KEY,
});

const llm = new ChatLangChain({ chat: langchainModel });
```

## Contributing

When adding support for new LangChain providers:

1. Update the `provider` getter in `chat.ts` to recognize the new model class
2. Test the integration with the new provider
3. Add example usage to this README
4. Consider any provider-specific serialization needs in `serializer.ts`