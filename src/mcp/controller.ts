/**
 * MCP (Model Context Protocol) tool wrapper for browser-use.
 *
 * This module provides integration between MCP tools and browser-use's action registry system.
 * MCP tools are dynamically discovered and registered as browser-use actions.
 */

import { EventEmitter } from 'events';
import { ZodSchema, z } from 'zod';
import { Registry } from '../controller/registry/service';
import { ActionResult } from '../agent/views';
import { createMCPLogger } from './logger';

// These types would be imported from the MCP SDK when available
interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface MCPTextContent {
  type: 'text';
  text: string;
}

interface MCPResult {
  content?: MCPTextContent[] | MCPTextContent | string;
}

interface MCPClientSession {
  initialize(): Promise<void>;
  listTools(): Promise<{ tools: MCPTool[] }>;
  callTool(name: string, arguments_: any): Promise<MCPResult>;
}

// Placeholder interfaces for MCP SDK types that would be imported
interface MCPStdioServerParameters {
  command: string;
  args: string[];
  env?: Record<string, string> | null;
}

let MCP_AVAILABLE = false;
let mcpClientSession: any;
let mcpStdioClient: any;

// Try to import MCP SDK
try {
  // This would be the actual import when MCP SDK is available
  // import { ClientSession, StdioServerParameters } from 'mcp';
  // import { stdio_client } from 'mcp/client/stdio';
  // MCP_AVAILABLE = true;
  console.warn('MCP SDK not installed. Install with: npm install @modelcontextprotocol/sdk');
} catch (error) {
  MCP_AVAILABLE = false;
}

export class MCPToolWrapper {
  private registry: Registry;
  private mcpCommand: string;
  private mcpArgs: string[];
  private session: MCPClientSession | null = null;
  private tools: Map<string, MCPTool> = new Map();
  private registeredActions: Set<string> = new Set();
  private shutdownEvent = new EventEmitter();
  private logger = createMCPLogger('MCPToolWrapper');

  constructor(registry: Registry, mcpCommand: string, mcpArgs: string[] = []) {
    if (!MCP_AVAILABLE) {
      throw new Error('MCP SDK not installed. Install with: npm install @modelcontextprotocol/sdk');
    }

    this.registry = registry;
    this.mcpCommand = mcpCommand;
    this.mcpArgs = mcpArgs;
  }

  async connect(): Promise<void> {
    if (this.session) {
      return; // Already connected
    }

    this.logger.info(`🔌 Connecting to MCP server: ${this.mcpCommand} ${this.mcpArgs.join(' ')}`);

    // Create server parameters
    const serverParams: MCPStdioServerParameters = {
      command: this.mcpCommand,
      args: this.mcpArgs,
      env: null,
    };

    try {
      // This would be the actual implementation when MCP SDK is available
      // const { read, write } = await mcpStdioClient(serverParams);
      // this.session = new mcpClientSession(read, write);
      
      // Initialize the connection
      // await this.session.initialize();

      // Discover available tools
      // const toolsResponse = await this.session.listTools();
      // this.tools = new Map(toolsResponse.tools.map(tool => [tool.name, tool]));

      // this.logger.info(`📦 Discovered ${this.tools.size} MCP tools: ${Array.from(this.tools.keys())}`);

      // Register all discovered tools as actions
      // for (const [toolName, tool] of this.tools) {
      //   this.registerToolAsAction(toolName, tool);
      // }

      // Keep session alive while tools are being used
      await this.keepSessionAlive();

    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      throw error;
    }
  }

  private async keepSessionAlive(): Promise<void> {
    // This will block until the session is closed
    return new Promise((resolve, reject) => {
      this.shutdownEvent.once('shutdown', resolve);
      this.shutdownEvent.once('error', reject);
    });
  }

  private registerToolAsAction(toolName: string, tool: MCPTool): void {
    if (this.registeredActions.has(toolName)) {
      return; // Already registered
    }

    // Parse tool parameters to create Zod schema
    const paramFields: Record<string, any> = {};

    if (tool.inputSchema?.properties) {
      const properties = tool.inputSchema.properties;
      const required = new Set(tool.inputSchema.required || []);

      for (const [paramName, paramSchema] of Object.entries(properties)) {
        // Convert JSON Schema type to Zod type
        const paramType = this.jsonSchemaToZodType(paramSchema as any);

        // Determine if field is required
        const isRequired = required.has(paramName);
        const zodField = isRequired ? paramType : paramType.optional();

        paramFields[paramName] = zodField;
      }
    }

    // Create Zod schema for the tool parameters
    const paramSchema = Object.keys(paramFields).length > 0 
      ? z.object(paramFields) 
      : z.object({});

    // Determine if this is a browser-specific tool
    const isBrowserTool = toolName.startsWith('browser_');
    const domains = undefined; // Could be configured based on tool metadata

    // Create wrapper function for the MCP tool
    const mcpActionWrapper = async (kwargs: any): Promise<ActionResult> => {
      if (!this.session) {
        throw new Error(`MCP session not connected for tool ${toolName}`);
      }

      // Extract parameters (excluding special injected params)
      const specialParams = new Set([
        'page',
        'browser_session',
        'context',
        'page_extraction_llm',
        'file_system',
        'available_file_paths',
        'has_sensitive_data',
        'browser',
        'browser_context',
      ]);

      const toolParams = Object.fromEntries(
        Object.entries(kwargs).filter(([k]) => !specialParams.has(k))
      );

      console.debug(`🔧 Calling MCP tool ${toolName} with params:`, toolParams);

      try {
        // Call the MCP tool
        const result = await this.session.callTool(toolName, toolParams);

        // Convert MCP result to ActionResult
        let extractedContent: string;

        if (result.content) {
          if (Array.isArray(result.content)) {
            // Multiple content items
            const contentParts = result.content.map(item => {
              if (typeof item === 'object' && 'text' in item) {
                return item.text;
              }
              return String(item);
            });
            extractedContent = contentParts.join('\n');
          } else if (typeof result.content === 'object' && 'text' in result.content) {
            extractedContent = result.content.text;
          } else {
            extractedContent = String(result.content);
          }
        } else {
          extractedContent = String(result);
        }

        return new ActionResult({ extracted_content: extractedContent });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ MCP tool ${toolName} failed:`, errorMessage);
        return new ActionResult({
          extracted_content: `MCP tool ${toolName} failed: ${errorMessage}`,
          error: errorMessage,
        });
      }
    };

    // Set function name for better debugging
    Object.defineProperty(mcpActionWrapper, 'name', { value: toolName });

    // Register the action with browser-use
    const description = tool.description || `MCP tool: ${toolName}`;

    // Register the action programmatically
    this.registry.registerAction(
      toolName,
      mcpActionWrapper,
      description,
      {
        paramSchema: paramSchema,
        domains: domains,
      }
    );

    this.registeredActions.add(toolName);
    this.logger.info(`✅ Registered MCP tool as action: ${toolName}`);
  }

  async disconnect(): Promise<void> {
    this.shutdownEvent.emit('shutdown');
    if (this.session) {
      // Session cleanup would be handled by the context manager in the actual implementation
      this.session = null;
    }
  }

  private jsonSchemaToZodType(schema: any): ZodSchema<any> {
    const jsonType = schema.type || 'string';

    const typeMapping: Record<string, () => ZodSchema<any>> = {
      string: () => z.string(),
      number: () => z.number(),
      integer: () => z.number().int(),
      boolean: () => z.boolean(),
      array: () => z.array(z.any()),
      object: () => z.record(z.any()),
    };

    const baseType = typeMapping[jsonType] || typeMapping['string'];
    let zodType = baseType();

    // Handle nullable types
    if (schema.nullable) {
      zodType = zodType.nullable();
    }

    // Handle default values
    if ('default' in schema) {
      zodType = zodType.default(schema.default);
    }

    return zodType;
  }
}

/**
 * Convenience function for easy integration
 */
export async function registerMCPTools(
  registry: Registry,
  mcpCommand: string,
  mcpArgs?: string[]
): Promise<MCPToolWrapper> {
  /**
   * Register MCP tools with a browser-use registry.
   *
   * @param registry - Browser-use action registry
   * @param mcpCommand - Command to start MCP server
   * @param mcpArgs - Arguments for MCP command
   * @returns MCPToolWrapper instance (connected)
   *
   * @example
   * ```typescript
   * import { Controller } from '../controller';
   * import { registerMCPTools } from './controller';
   *
   * const controller = new Controller();
   *
   * // Register Playwright MCP tools
   * const mcp = await registerMCPTools(controller.registry, 'npx', ['@playwright/mcp@latest', '--headless']);
   *
   * // Now all MCP tools are available as browser-use actions
   * ```
   */
  const wrapper = new MCPToolWrapper(registry, mcpCommand, mcpArgs || []);
  await wrapper.connect();
  return wrapper;
}