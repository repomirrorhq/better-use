/**
 * Tests for the functional MCP server implementation
 */

import { BrowserUseMCPServer } from '../src/mcp/server';
import { ChatOpenAI } from '../src/llm/providers/openai';

describe('BrowserUseMCPServer', () => {
  let server: BrowserUseMCPServer;
  
  beforeEach(() => {
    server = new BrowserUseMCPServer();
  });
  
  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
  });
  
  describe('Tool Discovery', () => {
    it('should provide all expected MCP tools', () => {
      const tools = server.getTools();
      
      const expectedTools = [
        'browser_navigate',
        'browser_click',
        'browser_type',
        'browser_get_state',
        'browser_extract_content',
        'browser_scroll',
        'browser_go_back',
        'browser_list_tabs',
        'browser_switch_tab',
        'browser_close_tab',
        'browser_close',
        'retry_with_browser_use_agent'
      ];
      
      const toolNames = tools.map(tool => tool.name);
      expectedTools.forEach(expectedTool => {
        expect(toolNames).toContain(expectedTool);
      });
      
      expect(tools.length).toBeGreaterThanOrEqual(expectedTools.length);
    });
    
    it('should have proper tool schemas', () => {
      const tools = server.getTools();
      
      tools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });
  });
  
  describe('Server Initialization', () => {
    it('should initialize successfully', async () => {
      const initPromise = server.initialize();
      await expect(initPromise).resolves.not.toThrow();
    });
    
    it('should emit ready event on initialization', async () => {
      const readyPromise = new Promise(resolve => {
        server.once('ready', resolve);
      });
      
      await server.initialize();
      await expect(readyPromise).resolves.toBeDefined();
    });
  });
  
  describe('Browser Navigation', () => {
    beforeEach(async () => {
      await server.initialize();
    });
    
    it('should handle navigation tool call', async () => {
      const result = await server.callTool('browser_navigate', {
        url: 'https://example.com'
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('message');
      expect(result.data).toHaveProperty('url', 'https://example.com');
    }, 10000);
    
    it('should handle get state tool call', async () => {
      // First navigate to a page
      await server.callTool('browser_navigate', { url: 'https://example.com' });
      
      const result = await server.callTool('browser_get_state', {
        useVision: false
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('message');
      expect(result.data).toHaveProperty('url');
      expect(result.data).toHaveProperty('state');
    }, 15000);
  });
  
  describe('Browser Control', () => {
    beforeEach(async () => {
      await server.initialize();
    });
    
    it('should handle scroll tool call', async () => {
      // First navigate to a page
      await server.callTool('browser_navigate', { url: 'https://example.com' });
      
      const result = await server.callTool('browser_scroll', {
        direction: 'down'
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('message');
      expect(result.data).toHaveProperty('direction', 'down');
    }, 10000);
    
    it('should handle go back tool call', async () => {
      // First navigate to a page
      await server.callTool('browser_navigate', { url: 'https://example.com' });
      await server.callTool('browser_navigate', { url: 'https://httpbin.org' });
      
      const result = await server.callTool('browser_go_back', {});
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('message');
    }, 15000);
    
    it('should handle list tabs tool call', async () => {
      await server.callTool('browser_navigate', { url: 'https://example.com' });
      
      const result = await server.callTool('browser_list_tabs', {});
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('tabs');
    }, 10000);
  });
  
  describe('Error Handling', () => {
    it('should handle unknown tool names', async () => {
      const result = await server.callTool('unknown_tool', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool \'unknown_tool\' not found');
    });
    
    it('should handle invalid arguments gracefully', async () => {
      await server.initialize();
      
      const result = await server.callTool('browser_navigate', {
        // Missing required url parameter
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('LLM Integration', () => {
    it('should work with provided LLM configuration', async () => {
      // Skip if no OpenAI API key available
      if (!process.env.OPENAI_API_KEY) {
        return;
      }
      
      const llm = new ChatOpenAI({
        model: 'gpt-4o-mini',
        api_key: process.env.OPENAI_API_KEY!,
        temperature: 0.1
      });
      
      const serverWithLLM = new BrowserUseMCPServer({ llm });
      await serverWithLLM.initialize();
      
      try {
        // Navigate to a simple page
        await serverWithLLM.callTool('browser_navigate', { 
          url: 'https://example.com' 
        });
        
        const result = await serverWithLLM.callTool('browser_extract_content', {
          instruction: 'Extract the main heading text from this page'
        });
        
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('extractedContent');
      } finally {
        await serverWithLLM.shutdown();
      }
    }, 20000);
  });
  
  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await server.initialize();
      
      const shutdownPromise = new Promise(resolve => {
        server.once('shutdown', resolve);
      });
      
      await server.shutdown();
      await expect(shutdownPromise).resolves.toBeDefined();
    });
  });
});