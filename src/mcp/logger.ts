/**
 * MCP-aware logger that respects stdio mode.
 * 
 * When running in MCP stdio mode, stdout must contain only JSON-RPC messages.
 * All logging should be directed to stderr to avoid breaking MCP clients.
 */

/**
 * Check if we're running in MCP stdio mode
 */
export function isMCPStdioMode(): boolean {
  // Check for MCP environment variables or command-line arguments
  return process.env.MCP_MODE === 'stdio' || 
         process.argv.includes('--mcp') || 
         process.argv.includes('--mcp-stdio');
}

/**
 * Logger class that respects MCP stdio mode
 */
export class MCPLogger {
  private name: string;
  private enabled: boolean;

  constructor(name: string) {
    this.name = name;
    // Disable logging in MCP stdio mode unless explicitly enabled via env var
    this.enabled = !isMCPStdioMode() || process.env.MCP_DEBUG === 'true';
  }

  /**
   * Log informational messages
   */
  info(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    
    // Always use stderr for MCP to avoid polluting stdout
    console.error(`[${this.name}] INFO: ${message}`, ...args);
  }

  /**
   * Log warning messages
   */
  warn(message: string, ...args: any[]): void {
    if (!this.enabled) return;
    
    console.error(`[${this.name}] WARN: ${message}`, ...args);
  }

  /**
   * Log error messages (always shown even in MCP mode)
   */
  error(message: string, ...args: any[]): void {
    console.error(`[${this.name}] ERROR: ${message}`, ...args);
  }

  /**
   * Log debug messages (only shown if MCP_DEBUG is set)
   */
  debug(message: string, ...args: any[]): void {
    if (!this.enabled || process.env.MCP_DEBUG !== 'true') return;
    
    console.error(`[${this.name}] DEBUG: ${message}`, ...args);
  }
}

/**
 * Create a logger instance for a module
 */
export function createMCPLogger(name: string): MCPLogger {
  return new MCPLogger(name);
}