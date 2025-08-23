import { Registry } from '../src/controller/registry/service';
import { z } from 'zod';
import { ActionResult } from '../src/agent/views';

describe('MCP Registration', () => {
  it('should register MCP tools programmatically', async () => {
    const registry = new Registry();
    
    // Define a test MCP tool function
    const testToolFunction = async (params: any): Promise<ActionResult> => {
      return new ActionResult({
        extracted_content: `Test tool executed with params: ${JSON.stringify(params)}`
      });
    };
    
    // Define parameter schema
    const paramSchema = z.object({
      query: z.string(),
      count: z.number().optional()
    });
    
    // Register the tool programmatically
    registry.registerAction(
      'test_mcp_tool',
      testToolFunction,
      'Test MCP tool for verification',
      {
        paramSchema: paramSchema,
        domains: ['example.com']
      }
    );
    
    // Verify the tool was registered
    expect(registry.actions['test_mcp_tool']).toBeDefined();
    expect(registry.actions['test_mcp_tool'].name).toBe('test_mcp_tool');
    expect(registry.actions['test_mcp_tool'].description).toBe('Test MCP tool for verification');
    expect(registry.actions['test_mcp_tool'].domains).toEqual(['example.com']);
    
    // Test executing the registered action
    const result = await registry.actions['test_mcp_tool'].function(
      { query: 'test', count: 5 },
      {}
    );
    
    expect(result).toBeInstanceOf(ActionResult);
    expect(result.extracted_content).toContain('Test tool executed');
    expect(result.extracted_content).toContain('"query":"test"');
    expect(result.extracted_content).toContain('"count":5');
  });
  
  it('should skip registration for excluded actions', () => {
    const registry = new Registry({
      excludeActions: ['excluded_tool']
    });
    
    const testFunction = async (): Promise<ActionResult> => {
      return new ActionResult({ extracted_content: 'Should not be called' });
    };
    
    // Try to register an excluded action
    registry.registerAction(
      'excluded_tool',
      testFunction,
      'This should be excluded',
      {}
    );
    
    // Verify the tool was NOT registered
    expect(registry.actions['excluded_tool']).toBeUndefined();
  });
});