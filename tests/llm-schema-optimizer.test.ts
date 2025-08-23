/**
 * Tests for the SchemaOptimizer to ensure it correctly processes and
 * optimizes the schemas for agent actions without losing information.
 */

import { z } from 'zod';
import { SchemaOptimizer } from '../src/llm/schema';

describe('SchemaOptimizer', () => {
  /**
   * Sample structured output model with multiple fields.
   * Equivalent to the ProductInfo model in Python tests.
   */
  const ProductInfoSchema = z.object({
    price: z.string(),
    title: z.string(),
    rating: z.number().nullable().optional()
  });

  test('optimizer preserves all fields in structured done action', () => {
    /**
     * Ensures the SchemaOptimizer does not drop fields from a custom structured
     * output model when creating the schema for the 'done' action.
     *
     * This test specifically checks for a bug where fields were being lost
     * during the optimization process.
     */
    
    // 1. Create a StructuredOutputActionSchema directly (as done in Controller)
    const StructuredOutputActionSchema = z.object({
      success: z.boolean().describe('Success status'),
      data: ProductInfoSchema.describe('Structured output data')
    });

    // 2. Run the schema optimizer on the structured output schema
    const optimizedSchema = SchemaOptimizer.createOptimizedJsonSchema(StructuredOutputActionSchema);

    // 3. Navigate to the data properties
    const dataSchema = optimizedSchema?.properties?.data || {};
    const finalProperties = dataSchema?.properties || {};

    // 4. Assert that the set of fields in the optimized schema matches the original model's fields.
    const originalFields = new Set(['price', 'title', 'rating']);
    const optimizedFields = new Set(Object.keys(finalProperties));

    // Check that all original fields are present
    if (optimizedFields.size === 0) {
      // If we didn't find the fields in the expected location, 
      // the test structure might be different - log for debugging
      console.log('Optimized schema structure:', JSON.stringify(optimizedSchema, null, 2));
      console.log('Data schema:', JSON.stringify(dataSchema, null, 2));
    }
    
    for (const field of originalFields) {
      expect(optimizedFields.has(field)).toBeTruthy();
    }

    // Check that no extra fields were added
    expect(optimizedFields.size).toBe(originalFields.size);
  });

  test('optimizer handles basic types correctly', () => {
    /**
     * Test that the optimizer correctly handles basic Zod types
     */
    const BasicSchema = z.object({
      stringField: z.string(),
      numberField: z.number(),
      booleanField: z.boolean(),
      optionalField: z.string().optional(),
      nullableField: z.string().nullable(),
      arrayField: z.array(z.string()),
      enumField: z.enum(['option1', 'option2', 'option3'])
    });

    const optimized = SchemaOptimizer.createOptimizedJsonSchema(BasicSchema);

    // Check that all fields are present
    expect(optimized.type).toBe('object');
    expect(optimized.properties).toBeDefined();
    expect(optimized.properties.stringField.type).toBe('string');
    expect(optimized.properties.numberField.type).toBe('number');
    expect(optimized.properties.booleanField.type).toBe('boolean');
    expect(optimized.properties.arrayField.type).toBe('array');
    expect(optimized.properties.arrayField.items.type).toBe('string');
    expect(optimized.properties.enumField.enum).toEqual(['option1', 'option2', 'option3']);
    
    // Check nullable field is handled with anyOf
    expect(optimized.properties.nullableField.anyOf).toBeDefined();
    expect(optimized.properties.nullableField.anyOf).toHaveLength(2);
    
    // Check required fields - Note: makeStrictCompatible makes ALL fields required for strict mode
    // This is expected behavior for OpenAI strict mode compatibility
    expect(optimized.required).toContain('stringField');
    expect(optimized.required).toContain('numberField');
    // In strict mode, even optional fields become required
    expect(optimized.required).toContain('optionalField');
    
    // Check additionalProperties is false (strict mode)
    expect(optimized.additionalProperties).toBe(false);
  });

  test('optimizer ensures strict mode compatibility', () => {
    /**
     * Test that the optimizer properly sets additionalProperties: false
     * for OpenAI strict mode compatibility
     */
    const NestedSchema = z.object({
      outer: z.object({
        inner: z.object({
          value: z.string()
        }),
        anotherValue: z.number()
      })
    });

    const optimized = SchemaOptimizer.createOptimizedJsonSchema(NestedSchema);

    // Check that all nested objects have additionalProperties: false
    expect(optimized.additionalProperties).toBe(false);
    expect(optimized.properties.outer.additionalProperties).toBe(false);
    expect(optimized.properties.outer.properties.inner.additionalProperties).toBe(false);
  });
});