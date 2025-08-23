/**
 * MCP (Model Context Protocol) support for browser-use.
 * 
 * This module provides integration with MCP servers and clients for browser automation.
 */

export * from './client';
export * from './server';
export * from './controller';
export * from './types';

import { BrowserUseMCPServer } from './server';
import { TelemetryService } from '../telemetry';
import { MCPServerTelemetryEvent } from '../telemetry/events';
import { getBetterUseVersion } from '../utils';

/**
 * Run the MCP server in stdio mode for integration with Claude Desktop and other MCP clients
 */
export async function runMCPServer(): Promise<void> {
  // Initialize telemetry
  const telemetry = TelemetryService.getInstance();
  
  // Capture telemetry for MCP server start
  const startEvent = new MCPServerTelemetryEvent({
    version: getBetterUseVersion(),
    action: 'start',
    parent_process_cmdline: process.argv.join(' ')
  });
  telemetry.capture(startEvent.toJSON());
  
  const startTime = Date.now();
  
  try {
    // Check if MCP SDK is available
    try {
      require('@modelcontextprotocol/sdk');
    } catch (error) {
      process.stderr.write('MCP SDK is required. Install with: npm install @modelcontextprotocol/sdk\n');
      process.exit(1);
    }
    
    // Create and run MCP server
    const server = new BrowserUseMCPServer();
    
    // Setup stdio transport for JSON-RPC communication
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    
    // Create MCP server with stdio transport
    const transport = new StdioServerTransport();
    const mcpServer = new Server({
      name: 'better-use',
      version: getBetterUseVersion()
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    // Register tools with MCP server
    mcpServer.setRequestHandler('tools/list', async () => {
      return {
        tools: Array.from(server['tools'].values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });
    
    mcpServer.setRequestHandler('tools/call', async (request: any) => {
      const { name, arguments: args } = request.params;
      return await server.callTool(name, args);
    });
    
    // Connect and run
    await mcpServer.connect(transport);
    
    // Keep the server running
    process.stdin.resume();
  } catch (error) {
    process.stderr.write(`MCP server error: ${error}\n`);
    
    // Capture telemetry for MCP server stop with error
    const duration = (Date.now() - startTime) / 1000;
    const stopEvent = new MCPServerTelemetryEvent({
      version: getBetterUseVersion(),
      action: 'stop',
      duration_seconds: duration,
      parent_process_cmdline: process.argv.join(' ')
    });
    telemetry.capture(stopEvent.toJSON());
    telemetry.flush();
    
    process.exit(1);
  }
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    const duration = (Date.now() - startTime) / 1000;
    const stopEvent = new MCPServerTelemetryEvent({
      version: getBetterUseVersion(),
      action: 'stop',
      duration_seconds: duration,
      parent_process_cmdline: process.argv.join(' ')
    });
    telemetry.capture(stopEvent.toJSON());
    telemetry.flush();
    process.exit(0);
  });
}