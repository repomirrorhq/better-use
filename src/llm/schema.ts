/**
 * Schema optimization utilities for LLM usage
 * TypeScript port of the Python SchemaOptimizer
 */

import { z } from 'zod';

export class SchemaOptimizer {
  /**
   * Convert a Zod schema to an optimized JSON schema for OpenAI strict mode
   * 
   * @param schema - The Zod schema to convert
   * @returns Optimized JSON schema with all $refs resolved
   */
  static createOptimizedJsonSchema(schema: z.ZodSchema): Record<string, any> {
    const jsonSchema = this.zodToJsonSchema(schema);
    
    // Optimize the schema by flattening $refs and making it strict-mode compatible
    const optimized = this.optimizeSchema(jsonSchema);
    
    // Ensure all objects have additionalProperties: false for OpenAI strict mode
    this.ensureAdditionalPropertiesFalse(optimized);
    this.makeStrictCompatible(optimized);
    
    return optimized;
  }

  /**
   * Convert a Zod schema to JSON Schema
   */
  private static zodToJsonSchema(schema: z.ZodSchema): any {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodSchema);
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false
      };
    }

    if (schema instanceof z.ZodString) {
      const baseSchema: any = { type: 'string' };
      
      // Check for string constraints
      if (schema._def.checks) {
        for (const check of schema._def.checks) {
          switch (check.kind) {
            case 'min':
              baseSchema.minLength = check.value;
              break;
            case 'max':
              baseSchema.maxLength = check.value;
              break;
            case 'regex':
              baseSchema.pattern = check.regex.source;
              break;
          }
        }
      }
      
      return baseSchema;
    }

    if (schema instanceof z.ZodNumber) {
      const baseSchema: any = { type: 'number' };
      
      // Check for number constraints
      if (schema._def.checks) {
        for (const check of schema._def.checks) {
          switch (check.kind) {
            case 'min':
              baseSchema.minimum = check.value;
              break;
            case 'max':
              baseSchema.maximum = check.value;
              break;
            case 'int':
              baseSchema.type = 'integer';
              break;
          }
        }
      }
      
      return baseSchema;
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element)
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToJsonSchema(schema.unwrap());
    }

    if (schema instanceof z.ZodNullable) {
      const innerSchema = this.zodToJsonSchema(schema.unwrap());
      return {
        anyOf: [
          innerSchema,
          { type: 'null' }
        ]
      };
    }

    if (schema instanceof z.ZodUnion) {
      const options = schema._def.options;
      return {
        anyOf: options.map((option: z.ZodSchema) => this.zodToJsonSchema(option))
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema._def.values
      };
    }

    if (schema instanceof z.ZodLiteral) {
      return {
        type: typeof schema._def.value,
        enum: [schema._def.value]
      };
    }

    if (schema instanceof z.ZodRecord) {
      return {
        type: 'object',
        additionalProperties: this.zodToJsonSchema(schema._def.valueType),
      };
    }

    if (schema instanceof z.ZodDefault) {
      const innerSchema = this.zodToJsonSchema(schema._def.innerType);
      return {
        ...innerSchema,
        default: schema._def.defaultValue()
      };
    }

    // Default fallback
    return { type: 'string' };
  }

  /**
   * Optimize schema by flattening $refs and removing unnecessary fields
   */
  private static optimizeSchema(obj: any, defs?: Record<string, any>): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.optimizeSchema(item, defs));
    }

    if (obj && typeof obj === 'object') {
      const optimized: any = {};

      for (const [key, value] of Object.entries(obj)) {
        // Skip unnecessary fields
        if (key === '$defs') {
          continue;
        }

        // Handle $ref by inlining the definition
        if (key === '$ref' && defs) {
          const refPath = (value as string).split('/').pop();
          if (refPath && defs[refPath]) {
            return this.optimizeSchema(defs[refPath], defs);
          }
        }

        // Recursively optimize nested structures
        if (typeof value === 'object' && value !== null) {
          optimized[key] = this.optimizeSchema(value, defs);
        } else {
          optimized[key] = value;
        }
      }

      return optimized;
    }

    return obj;
  }

  /**
   * Ensure all objects have additionalProperties: false for OpenAI strict mode
   */
  private static ensureAdditionalPropertiesFalse(obj: any): void {
    if (Array.isArray(obj)) {
      obj.forEach(item => this.ensureAdditionalPropertiesFalse(item));
    } else if (obj && typeof obj === 'object') {
      if (obj.type === 'object' && obj.additionalProperties === undefined) {
        obj.additionalProperties = false;
      }

      Object.values(obj).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          this.ensureAdditionalPropertiesFalse(value);
        }
      });
    }
  }

  /**
   * Make schema strict-mode compatible by ensuring all properties are required
   */
  private static makeStrictCompatible(schema: any): void {
    if (Array.isArray(schema)) {
      schema.forEach(item => this.makeStrictCompatible(item));
    } else if (schema && typeof schema === 'object') {
      // Recursively apply to nested objects first
      Object.entries(schema).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && key !== 'required') {
          this.makeStrictCompatible(value);
        }
      });

      // For objects with properties, make all properties required
      if (schema.type === 'object' && schema.properties) {
        const allProps = Object.keys(schema.properties);
        schema.required = allProps;
      }
    }
  }
}