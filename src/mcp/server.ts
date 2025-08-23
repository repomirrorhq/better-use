/**
 * MCP Server for browser-use - exposes browser automation capabilities via Model Context Protocol.
 * 
 * This server provides tools for:
 * - Running autonomous browser tasks with an AI agent
 * - Direct browser control (navigation, clicking, typing, etc.)
 * - Content extraction from web pages
 * - File system operations
 * 
 * Usage:
 *   const server = new BrowserUseMCPServer();
 *   await server.initialize();
 *   const result = await server.callTool('browser_navigate', { url: 'https://example.com' });
 */

import { EventEmitter } from 'events';
import { Controller } from '../controller';
import { Agent } from '../agent';
import { BrowserSession } from '../browser';
import { MCPTool, MCPToolResult } from './types';
import { ChatOpenAI } from '../llm/providers/openai';
import { ChatAnthropic } from '../llm/providers/anthropic';
import { ChatGoogle } from '../llm/providers/google';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Browser-Use MCP Server implementation
 */
export class BrowserUseMCPServer extends EventEmitter {
  private controller: Controller;
  private agent: Agent | null = null;
  private browserSession: BrowserSession | null = null;
  private tools: Map<string, MCPTool> = new Map();
  private llm: any = null;
  private config: any = {};

  constructor(config?: { llm?: any; browserProfile?: any }) {
    super();
    this.config = config || {};
    this.controller = new Controller();
    this.llm = config?.llm;
    this.initializeTools();
  }

  /**
   * Initialize available tools for the MCP server
   */
  private initializeTools(): void {
    // Browser navigation tools
    this.tools.set('browser_navigate', {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the current tab or open a new tab',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to navigate to'
          },
          newTab: {
            type: 'boolean',
            description: 'Whether to open in a new tab',
            default: false
          }
        },
        required: ['url']
      }
    });

    this.tools.set('browser_click', {
      name: 'browser_click',
      description: 'Click on an element by its index from browser_get_state',
      inputSchema: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'Element index from browser_get_state'
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left',
            description: 'Mouse button to click'
          }
        },
        required: ['index']
      }
    });

    this.tools.set('browser_type', {
      name: 'browser_type',
      description: 'Type text into an input field identified by its index',
      inputSchema: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'Element index from browser_get_state'
          },
          text: {
            type: 'string',
            description: 'Text to type'
          }
        },
        required: ['index', 'text']
      }
    });

    this.tools.set('browser_get_state', {
      name: 'browser_get_state',
      description: 'Get the current page state including all interactive elements with their indices',
      inputSchema: {
        type: 'object',
        properties: {
          useVision: {
            type: 'boolean',
            description: 'Whether to use vision for page analysis',
            default: false
          }
        }
      }
    });

    this.tools.set('browser_extract_content', {
      name: 'browser_extract_content',
      description: 'Extract structured content from the page using AI',
      inputSchema: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: 'What to extract from the page'
          },
          schema: {
            type: 'object',
            description: 'Expected structure of the extracted data'
          }
        },
        required: ['instruction']
      }
    });

    this.tools.set('browser_scroll', {
      name: 'browser_scroll',
      description: 'Scroll the page up or down by one viewport height',
      inputSchema: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down'],
            description: 'Direction to scroll'
          },
          amount: {
            type: 'number',
            description: 'Amount to scroll (in pixels)',
            default: null
          }
        },
        required: ['direction']
      }
    });

    this.tools.set('retry_with_browser_use_agent', {
      name: 'retry_with_browser_use_agent',
      description: 'Execute a high-level task using the AI browser agent. Best for complex multi-step workflows',
      inputSchema: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'High-level task description'
          },
          maxSteps: {
            type: 'number',
            description: 'Maximum number of steps the agent can take',
            default: 10
          },
          useVision: {
            type: 'boolean',
            description: 'Whether to use vision capabilities',
            default: true
          },
          allowedDomains: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of allowed domains to restrict browsing',
            default: []
          }
        },
        required: ['task']
      }
    });
    
    // Additional tools from Python version
    this.tools.set('browser_go_back', {
      name: 'browser_go_back',
      description: 'Go back to the previous page in browser history',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });
    
    this.tools.set('browser_list_tabs', {
      name: 'browser_list_tabs',
      description: 'List all open browser tabs',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });
    
    this.tools.set('browser_switch_tab', {
      name: 'browser_switch_tab',
      description: 'Switch to a specific browser tab',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'ID of the tab to switch to'
          }
        },
        required: ['tabId']
      }
    });
    
    this.tools.set('browser_close_tab', {
      name: 'browser_close_tab',
      description: 'Close a specific browser tab',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'ID of the tab to close'
          }
        },
        required: ['tabId']
      }
    });
    
    this.tools.set('browser_close', {
      name: 'browser_close',
      description: 'Close the browser session',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });
  }

  /**
   * Get list of available tools
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Call a tool
   */
  async callTool(toolName: string, arguments_: Record<string, any>): Promise<MCPToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found`
      };
    }

    try {
      let result: any;

      switch (toolName) {
        case 'browser_navigate':
          result = await this.handleBrowserNavigate(arguments_);
          break;
        case 'browser_click':
          result = await this.handleBrowserClick(arguments_);
          break;
        case 'browser_type':
          result = await this.handleBrowserType(arguments_);
          break;
        case 'browser_get_state':
          result = await this.handleBrowserGetState(arguments_);
          break;
        case 'browser_extract_content':
          result = await this.handleBrowserExtractContent(arguments_);
          break;
        case 'browser_scroll':
          result = await this.handleBrowserScroll(arguments_);
          break;
        case 'retry_with_browser_use_agent':
          result = await this.handleRetryWithAgent(arguments_);
          break;
        case 'browser_go_back':
          result = await this.handleBrowserGoBack(arguments_);
          break;
        case 'browser_list_tabs':
          result = await this.handleBrowserListTabs(arguments_);
          break;
        case 'browser_switch_tab':
          result = await this.handleBrowserSwitchTab(arguments_);
          break;
        case 'browser_close_tab':
          result = await this.handleBrowserCloseTab(arguments_);
          break;
        case 'browser_close':
          result = await this.handleBrowserClose(arguments_);
          break;
        default:
          return {
            success: false,
            error: `Tool '${toolName}' not implemented`
          };
      }

      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Handle browser navigation
   */
  private async handleBrowserNavigate(args: any): Promise<any> {
    const { url, newTab = false } = args;
    
    await this.ensureBrowserSession();
    
    try {
      if (newTab) {
        await this.browserSession!.createNewPage(url);
      } else {
        const navigateEvent = { url, target_id: '' };
        await this.browserSession!.navigateToUrl(navigateEvent);
      }
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return { 
        success: true, 
        message: `Navigated to ${url}`,
        url,
        currentUrl: await this.browserSession!.getCurrentPageUrl()
      };
    } catch (error) {
      throw new Error(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle browser click
   */
  private async handleBrowserClick(args: any): Promise<any> {
    const { index, button = 'left' } = args;
    
    await this.ensureBrowserSession();
    
    try {
      // Use controller to perform click action
      const clickAction = {
        action: 'click',
        index,
        button: button === 'right' ? 'right' : 'left'
      };
      
      await this.controller.act([clickAction], this.browserSession!);
      
      return { 
        success: true, 
        message: `Clicked element at index ${index} with ${button} button`,
        index,
        button
      };
    } catch (error) {
      throw new Error(`Click failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle browser typing
   */
  private async handleBrowserType(args: any): Promise<any> {
    const { index, text } = args;
    
    await this.ensureBrowserSession();
    
    try {
      // Use controller to perform type action
      const typeAction = {
        action: 'input_text',
        index,
        text
      };
      
      await this.controller.act([typeAction], this.browserSession!);
      
      return { 
        success: true, 
        message: `Typed "${text}" into element at index ${index}`,
        index,
        text
      };
    } catch (error) {
      throw new Error(`Type failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle getting browser state
   */
  private async handleBrowserGetState(args: any): Promise<any> {
    const { useVision = false } = args;
    
    await this.ensureBrowserSession();
    
    try {
      // Get browser state directly from browser session
      const state = await this.browserSession!.getBrowserState();
      
      return {
        success: true,
        message: 'Browser state retrieved',
        url: await this.browserSession!.getCurrentPageUrl(),
        title: await this.browserSession!.getCurrentPageTitle(),
        state: state,
        useVision
      };
    } catch (error) {
      throw new Error(`Get state failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle content extraction
   */
  private async handleBrowserExtractContent(args: any): Promise<any> {
    const { instruction, schema } = args;
    
    await this.ensureBrowserSession();
    await this.ensureLLM();
    
    try {
      // Get page content directly from browser session
      const state = await this.browserSession!.getBrowserState();
      
      // Use LLM to extract content based on instruction
      const extractionPrompt = `
Extract the following information from the webpage DOM:

Instruction: ${instruction}
${schema ? `Expected schema: ${JSON.stringify(schema)}` : ''}

Page content:
${JSON.stringify(state, null, 2)}

Return the extracted information in JSON format.
      `;
      
      const result = await this.llm.callLLM([{ role: 'user', content: extractionPrompt }]);
      
      return {
        success: true,
        message: 'Content extracted successfully',
        instruction,
        schema,
        extractedContent: result
      };
    } catch (error) {
      throw new Error(`Content extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle scrolling
   */
  private async handleBrowserScroll(args: any): Promise<any> {
    const { direction, amount } = args;
    
    await this.ensureBrowserSession();
    
    try {
      // Use browser session to perform scroll action
      const scrollEvent = {
        down: direction === 'down',
        num_pages: 1
      };
      
      await this.browserSession!.scroll(scrollEvent);
      
      return { 
        success: true, 
        message: `Scrolled ${direction} by ${scrollEvent.num_pages} page${scrollEvent.num_pages !== 1 ? 's' : ''}`,
        direction,
        num_pages: scrollEvent.num_pages
      };
    } catch (error) {
      throw new Error(`Scroll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle agent retry
   */
  private async handleRetryWithAgent(args: any): Promise<any> {
    const { task, maxSteps = 10, useVision = true } = args;
    
    await this.ensureBrowserSession();
    await this.ensureLLM();
    
    try {
      // Create agent with current browser session and LLM
      const agent = new Agent({
        task,
        llm: this.llm,
        browserSession: this.browserSession!,
        settings: {
          use_vision: useVision,
          max_actions_per_step: maxSteps,
        }
      });
      
      // Run the agent
      const result = await agent.run();
      
      let responseData;
      if (result.isDone()) {
        if (result.isSuccessful()) {
          responseData = {
            success: true,
            completed: true,
            result: result.finalResult(),
            message: `Task completed successfully: ${task}`
          };
        } else {
          const errors = result.errors().filter(e => e !== null);
          responseData = {
            success: false,
            completed: true,
            error: errors.length > 0 ? errors[errors.length - 1] : 'Task failed',
            message: `Task failed: ${task}`
          };
        }
      } else {
        responseData = {
          success: false,
          completed: false,
          error: 'Task did not complete within step limit',
          message: `Task incomplete: ${task}`
        };
      }
      
      return responseData;
    } catch (error) {
      throw new Error(`Agent execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle going back in browser history
   */
  private async handleBrowserGoBack(args: any): Promise<any> {
    await this.ensureBrowserSession();
    
    try {
      await this.browserSession!.goBack();
      return {
        success: true,
        message: 'Navigated back in browser history'
      };
    } catch (error) {
      throw new Error(`Go back failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle listing browser tabs
   */
  private async handleBrowserListTabs(args: any): Promise<any> {
    await this.ensureBrowserSession();
    
    try {
      const tabs = await this.browserSession!.listTabs();
      return {
        success: true,
        message: 'Browser tabs retrieved',
        tabs
      };
    } catch (error) {
      throw new Error(`List tabs failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle switching browser tab
   */
  private async handleBrowserSwitchTab(args: any): Promise<any> {
    const { tabId } = args;
    await this.ensureBrowserSession();
    
    try {
      await this.browserSession!.switchTab(tabId);
      return {
        success: true,
        message: `Switched to tab ${tabId}`,
        tabId
      };
    } catch (error) {
      throw new Error(`Switch tab failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle closing a browser tab
   */
  private async handleBrowserCloseTab(args: any): Promise<any> {
    const { tabId } = args;
    await this.ensureBrowserSession();
    
    try {
      await this.browserSession!.closeTab(tabId);
      return {
        success: true,
        message: `Closed tab ${tabId}`,
        tabId
      };
    } catch (error) {
      throw new Error(`Close tab failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle closing the browser
   */
  private async handleBrowserClose(args: any): Promise<any> {
    if (this.browserSession) {
      try {
        await this.browserSession.stop();
        this.browserSession = null;
        return {
          success: true,
          message: 'Browser closed successfully'
        };
      } catch (error) {
        throw new Error(`Close browser failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return {
      success: true,
      message: 'Browser was not running'
    };
  }

  /**
   * Ensure browser session is initialized
   */
  private async ensureBrowserSession(): Promise<void> {
    if (!this.browserSession) {
      this.browserSession = new BrowserSession({
        headless: this.config.browserProfile?.headless ?? false
      });
      await this.browserSession.start();
    }
  }
  
  /**
   * Ensure LLM is configured
   */
  private async ensureLLM(): Promise<void> {
    if (!this.llm) {
      // Try to initialize a default LLM if environment variables are available
      if (process.env.OPENAI_API_KEY) {
        this.llm = new ChatOpenAI({
          model: 'gpt-4o-mini',
          api_key: process.env.OPENAI_API_KEY,
          temperature: 0.1
        });
      } else if (process.env.ANTHROPIC_API_KEY) {
        this.llm = new ChatAnthropic({
          model: 'claude-3-5-haiku-20241022',
          api_key: process.env.ANTHROPIC_API_KEY,
          temperature: 0.1
        });
      } else if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
        this.llm = new ChatGoogle({
          model: 'gemini-1.5-flash',
          api_key: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
          temperature: 0.1
        });
      } else {
        throw new Error('No LLM configured. Please provide an LLM instance or set environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY)');
      }
    }
  }

  /**
   * Initialize the MCP server
   */
  async initialize(): Promise<void> {
    // Initialize browser session if needed
    await this.ensureBrowserSession();
    
    // Try to initialize LLM if possible
    try {
      await this.ensureLLM();
    } catch (error) {
      // LLM initialization is optional for basic browser operations
      console.warn('LLM not initialized:', error);
    }

    this.emit('ready');
  }

  /**
   * Shutdown the MCP server
   */
  async shutdown(): Promise<void> {
    if (this.browserSession) {
      await this.browserSession.stop();
      this.browserSession = null;
    }

    this.emit('shutdown');
  }
}