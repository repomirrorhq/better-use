/**
 * MCP (Model Context Protocol) client integration for browser-use.
 * 
 * This module provides integration between external MCP servers and browser-use's action registry.
 * MCP tools are dynamically discovered and registered as browser-use actions.
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { MCPClientConfig, MCPServerConfig, MCPTool, MCPToolResult } from './types';

/**
 * Basic MCP Client implementation for TypeScript
 */
export class MCPClient extends EventEmitter {
  private serverConfig: MCPServerConfig;
  private clientConfig: MCPClientConfig;
  private serverProcess: ChildProcess | null = null;
  private connected = false;
  private tools: Map<string, MCPTool> = new Map();
  private messageId = 0;
  private pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(serverConfig: MCPServerConfig, clientConfig: Partial<MCPClientConfig> = {}) {
    super();
    this.serverConfig = serverConfig;
    this.clientConfig = {
      timeout: 30000,
      retries: 3,
      debug: false,
      ...clientConfig,
    };
  }

  /**
   * Connect to the MCP server and discover available tools
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      this.serverProcess = spawn(this.serverConfig.command, this.serverConfig.args, {
        env: { ...process.env, ...this.serverConfig.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.serverProcess.stdin || !this.serverProcess.stdout) {
        throw new Error('Failed to establish stdio connection with MCP server');
      }

      // Handle server process events
      this.serverProcess.on('error', (error) => {
        this.emit('error', error);
      });

      this.serverProcess.on('exit', (code, signal) => {
        this.connected = false;
        this.emit('disconnect', { code, signal });
      });

      // Set up JSON-RPC communication
      this.setupJsonRpcCommunication();

      // Send initialization request
      await this.initialize();

      // List available tools
      await this.listTools();

      this.connected = true;
      this.emit('connect');

    } catch (error) {
      throw new Error(`Failed to connect to MCP server: ${error}`);
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    this.connected = false;
    this.tools.clear();
    this.pendingRequests.clear();
    this.emit('disconnect');
  }

  /**
   * Get list of available tools
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, arguments_: Record<string, any> = {}): Promise<MCPToolResult> {
    if (!this.connected) {
      throw new Error('MCP client is not connected');
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    try {
      const response = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: arguments_,
      });

      return {
        success: true,
        data: response.content,
        metadata: {
          toolName,
          responseId: response.id,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          toolName,
        },
      };
    }
  }

  /**
   * Set up JSON-RPC communication with the server
   */
  private setupJsonRpcCommunication(): void {
    if (!this.serverProcess?.stdout) {
      return;
    }

    let buffer = '';
    
    this.serverProcess.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      
      // Process complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            if (this.clientConfig.debug) {
              console.error('Failed to parse JSON-RPC message:', error);
            }
          }
        }
      }
    });
  }

  /**
   * Handle incoming messages from the server
   */
  private handleMessage(message: any): void {
    if (message.id && this.pendingRequests.has(message.id)) {
      const request = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        request.reject(new Error(message.error.message || 'MCP server error'));
      } else {
        request.resolve(message.result);
      }
    } else if (message.method) {
      // Handle notifications from server
      this.emit('notification', message);
    }
  }

  /**
   * Send a JSON-RPC request to the server
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.serverProcess?.stdin) {
      throw new Error('Server process stdin not available');
    }

    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.clientConfig.timeout);

      this.pendingRequests.set(id, { 
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.serverProcess!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Initialize the MCP session
   */
  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'browser-use-ts',
        version: '1.0.0',
      },
    });
  }

  /**
   * List available tools from the server
   */
  private async listTools(): Promise<void> {
    const response = await this.sendRequest('tools/list');
    
    this.tools.clear();
    
    if (response.tools) {
      for (const tool of response.tools) {
        this.tools.set(tool.name, {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
  }
}