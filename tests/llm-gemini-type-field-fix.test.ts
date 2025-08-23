/**
 * Test to reproduce and verify fix for GitHub issue #2470:
 * "Python field with name 'type' handled differently between Gemini and OpenAI GPT"
 */

import { ChatGoogle } from '../src/llm/providers/google';
import { SchemaOptimizer } from '../src/llm/schema';
import { z } from 'zod';

describe('Gemini Type Field Handling', () => {
  let chatGoogle: ChatGoogle;
  let originalEnv: string | undefined;

  beforeAll(() => {
    // Save original env var
    originalEnv = process.env.GOOGLE_API_KEY;
    // Set a test API key
    process.env.GOOGLE_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    // Restore original env var
    if (originalEnv !== undefined) {
      process.env.GOOGLE_API_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
  });

  beforeEach(() => {
    // Create ChatGoogle instance
    chatGoogle = new ChatGoogle({
      model: 'gemini-2.0-flash-exp'
    });
  });

  test('gemini schema with dict type field', () => {
    /**
     * Test that Gemini schema processing handles dict 'type' field gracefully.
     * Reproduces the AttributeError: 'dict' object has no attribute 'upper'
     */
    
    // Schema with dict instead of string in type field
    const problematicSchema = {
      type: { malformed: 'dict_type' },
      properties: {}
    };

    // Access the private method using type assertion
    const result = (chatGoogle as any).fixGeminiSchema(problematicSchema);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result.type).toEqual({ malformed: 'dict_type' });
  });

  test('gemini schema with nested dict type field', () => {
    /**
     * Test that nested dict 'type' fields are handled gracefully.
     */
    
    // Schema with nested dict type field
    const problematicSchema = {
      type: 'object',
      properties: {
        nested_field: {
          type: { malformed: 'dict_instead_of_string' },
          properties: {}
        }
      }
    };

    const result = (chatGoogle as any).fixGeminiSchema(problematicSchema);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    
    const nestedType = result.properties.nested_field.type;
    expect(nestedType).toEqual({ malformed: 'dict_instead_of_string' });
  });

  test('gemini schema with none/null type field', () => {
    /**
     * Test handling of null type field.
     */
    
    const problematicSchema = {
      type: 'object',
      properties: {
        nested_field: {
          type: null,
          properties: {}
        }
      }
    };

    const result = (chatGoogle as any).fixGeminiSchema(problematicSchema);
    expect(result).toBeDefined();
  });

  test('gemini schema with valid string type', () => {
    /**
     * Test that valid string type fields work correctly.
     */
    
    const validSchema = {
      type: 'object',
      properties: {
        nested_field: {
          type: 'object',
          properties: {}
        }
      }
    };

    // Should work without issues
    const result = (chatGoogle as any).fixGeminiSchema(validSchema);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  test('gemini schema with empty properties object', () => {
    /**
     * Test handling of empty properties in object type.
     */
    
    const schemaWithEmptyProps = {
      type: 'object',
      properties: {
        empty_object: {
          type: 'object',
          properties: {} // Empty properties should get placeholder
        }
      }
    };

    const result = (chatGoogle as any).fixGeminiSchema(schemaWithEmptyProps);
    
    const nestedProps = result.properties.empty_object.properties;
    expect(nestedProps._placeholder).toBeDefined();
    expect(nestedProps._placeholder.type).toBe('string');
  });

  test('consistency between providers', () => {
    /**
     * Test that both Gemini and OpenAI handle schemas consistently.
     * The original issue was that Gemini would fail where OpenAI succeeded.
     */
    
    // Create a test schema that might have problematic fields
    const TestSchema = z.object({
      field_with_dict_type: z.record(z.string())
    });

    // OpenAI uses SchemaOptimizer directly
    const openaiSchema = SchemaOptimizer.createOptimizedJsonSchema(TestSchema);
    expect(openaiSchema).toBeDefined();

    // Gemini processes the schema through fixGeminiSchema
    const geminiResult = (chatGoogle as any).fixGeminiSchema(openaiSchema);
    expect(geminiResult).toBeDefined();

    // Both should handle the schema without errors
    // This demonstrates that the fix makes Gemini consistent with OpenAI
  });

  test('gemini schema handles anyOf correctly', () => {
    /**
     * Test that Gemini correctly processes schemas with anyOf
     */
    
    const schemaWithAnyOf = {
      type: 'object',
      properties: {
        union_field: {
          anyOf: [
            { type: 'string' },
            { type: 'number' }
          ]
        }
      }
    };

    const result = (chatGoogle as any).fixGeminiSchema(schemaWithAnyOf);
    
    expect(result).toBeDefined();
    expect(result.properties.union_field.anyOf).toBeDefined();
    expect(Array.isArray(result.properties.union_field.anyOf)).toBe(true);
  });

  test('gemini schema removes additionalProperties', () => {
    /**
     * Test that Gemini schema processing removes additionalProperties
     * as Gemini doesn't support it
     */
    
    const schemaWithAdditionalProps = {
      type: 'object',
      properties: {
        field1: { type: 'string' }
      },
      additionalProperties: false
    };

    const result = (chatGoogle as any).fixGeminiSchema(schemaWithAdditionalProps);
    
    expect(result).toBeDefined();
    expect(result.additionalProperties).toBeUndefined();
  });
});