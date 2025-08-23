import { ZodSchema } from 'zod';

interface GroqAPIError extends Error {
  status?: number;
  response?: {
    body?: any;
    text?: string;
  };
}

export class ParseFailedGenerationError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'ParseFailedGenerationError';
  }
}

export function tryParseGroqFailedGeneration<T>(
  error: GroqAPIError,
  outputFormat: ZodSchema<T>
): T {
  try {
    // Extract content from error body
    const failedGeneration = error.response?.body?.error?.failed_generation;
    if (!failedGeneration) {
      throw new ParseFailedGenerationError('No failed_generation in error body', error);
    }

    let content = failedGeneration as string;

    // If content is wrapped in code blocks, extract just the JSON part
    if (content.includes('```')) {
      const parts = content.split('```');
      if (parts.length >= 2) {
        content = parts[1];
        // Remove language identifier if present (e.g., 'json\n')
        if (content.includes('\n')) {
          const lines = content.split('\n');
          if (lines[0].trim().match(/^(json|javascript|js)$/i)) {
            content = lines.slice(1).join('\n');
          }
        }
      }
    }

    // Remove HTML-like tags before the first { and after the last }
    // Only remove content before { if content doesn't already start with {
    if (!content.trim().startsWith('{')) {
      content = content.replace(/^.*?(?=\{)/s, '');
    }

    // Remove common HTML-like tags and patterns at the end
    content = content.replace(/\}(\s*<[^>]*>.*?$)/s, '}');
    content = content.replace(/\}(\s*<\|[^|]*\|>.*?$)/s, '}');

    // Handle extra characters after the JSON
    content = content.trim();

    if (content.endsWith('}')) {
      // Try to parse and see if we get valid JSON
      try {
        JSON.parse(content);
      } catch (jsonError) {
        // If parsing fails, try to find the correct end of the JSON
        // by counting braces and removing anything after the balanced JSON
        let braceCount = 0;
        let lastValidPos = -1;
        
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              lastValidPos = i + 1;
              break;
            }
          }
        }

        if (lastValidPos > 0) {
          content = content.substring(0, lastValidPos);
        }
      }
    }

    // Fix control characters in JSON strings before parsing
    content = fixControlCharactersInJson(content);

    // Parse the cleaned content
    const resultDict = JSON.parse(content);

    // Some models occasionally respond with a list containing one dict
    let finalResult = resultDict;
    if (Array.isArray(resultDict) && resultDict.length === 1 && typeof resultDict[0] === 'object') {
      finalResult = resultDict[0];
    }

    console.debug(`Successfully parsed model output: ${JSON.stringify(finalResult)}`);
    return outputFormat.parse(finalResult);

  } catch (error) {
    if (error instanceof ParseFailedGenerationError) {
      throw error;
    }
    
    if (error instanceof SyntaxError) {
      console.warn(`Failed to parse model output: ${error.message}`);
      throw new Error(`Could not parse response. ${error.message}`);
    }

    throw new ParseFailedGenerationError(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error : undefined
    );
  }
}

function fixControlCharactersInJson(content: string): string {
  try {
    // First try to parse as-is to see if it's already valid
    JSON.parse(content);
    return content;
  } catch {
    // Continue with fixing
  }

  // More sophisticated approach: only escape control characters inside string values
  // while preserving JSON structure formatting
  const result: string[] = [];
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < content.length) {
    const char = content[i];

    if (!inString) {
      // Outside of string - check if we're entering a string
      if (char === '"') {
        inString = true;
      }
      result.push(char);
    } else {
      // Inside string - handle escaping and control characters
      if (escaped) {
        // Previous character was backslash, so this character is escaped
        result.push(char);
        escaped = false;
      } else if (char === '\\') {
        // This is an escape character
        result.push(char);
        escaped = true;
      } else if (char === '"') {
        // End of string
        result.push(char);
        inString = false;
      } else if (char === '\n') {
        // Literal newline inside string - escape it
        result.push('\\n');
      } else if (char === '\r') {
        // Literal carriage return inside string - escape it
        result.push('\\r');
      } else if (char === '\t') {
        // Literal tab inside string - escape it
        result.push('\\t');
      } else if (char === '\b') {
        // Literal backspace inside string - escape it
        result.push('\\b');
      } else if (char === '\f') {
        // Literal form feed inside string - escape it
        result.push('\\f');
      } else if (char.charCodeAt(0) < 32) {
        // Other control characters inside string - convert to unicode escape
        result.push(`\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
      } else {
        // Normal character inside string
        result.push(char);
      }
    }

    i++;
  }

  return result.join('');
}