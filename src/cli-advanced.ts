#!/usr/bin/env node

/**
 * Browser-Use TypeScript Advanced CLI/TUI
 * Sophisticated terminal user interface matching Python Textual implementation
 */

const blessed = require('neo-blessed');
import { Agent } from './agent/service';
import { BrowserSession } from './browser';
import { ChatOpenAI } from './llm/providers/openai';
import { ChatAnthropic } from './llm/providers/anthropic';
import { ChatGoogle } from './llm/providers/google';
import { ChatAWSBedrock } from './llm/providers/aws';
import { ChatAzureOpenAI } from './llm/providers/azure';
import { ChatDeepseek } from './llm/providers/deepseek';
import { ChatGroq } from './llm/providers/groq';
import { ChatOllama } from './llm/providers/ollama';
import { ChatOpenRouter } from './llm/providers/openrouter';
import { getBrowserUseVersion } from './utils';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Logo and styling constants
const BROWSER_LOGO = `
                   {white-fg}   ++++++   +++++++++   {/}                                
                   {white-fg} +++     +++++     +++  {/}                                
                   {white-fg} ++    ++++   ++    ++  {/}                                
                   {white-fg} ++  +++       +++  ++  {/}                                
                   {white-fg}   ++++          +++    {/}                                
                   {white-fg}  +++             +++   {/}                                
                   {white-fg} +++               +++  {/}                                
                   {white-fg} ++   +++      +++  ++  {/}                                
                   {white-fg} ++    ++++   ++    ++  {/}                                
                   {white-fg} +++     ++++++    +++  {/}                                
                   {white-fg}   ++++++    +++++++    {/}                                

{white-fg}██████╗ ██████╗  ██████╗ ██╗    ██╗███████╗███████╗██████╗{/}     {yellow-fg}██╗   ██╗███████╗███████╗{/}
{white-fg}██╔══██╗██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔════╝██╔══██╗{/}    {yellow-fg}██║   ██║██╔════╝██╔════╝{/}
{white-fg}██████╔╝██████╔╝██║   ██║██║ █╗ ██║███████╗█████╗  ██████╔╝{/}    {yellow-fg}██║   ██║███████╗█████╗{/}  
{white-fg}██╔══██╗██╔══██╗██║   ██║██║███╗██║╚════██║██╔══╝  ██╔══██╗{/}    {yellow-fg}██║   ██║╚════██║██╔══╝{/}  
{white-fg}██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝███████║███████╗██║  ██║{/}    {yellow-fg}╚██████╔╝███████║███████╗{/}
{white-fg}╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝╚═╝  ╚═╝{/}     {yellow-fg}╚═════╝ ╚══════╝╚══════╝{/}
`;

const LINKS_INFO = [
  { label: 'Documentation:        📚 ', url: 'https://docs.browser-use.com', color: 'cyan' },
  { label: 'Chat & share on Discord:  🚀 ', url: 'https://discord.gg/ESAUZAdxXY', color: 'magenta' },
  { label: 'Get prompt inspiration:   🦸 ', url: 'https://github.com/browser-use/awesome-prompts', color: 'magenta' },
  { label: '{dim}Report any issues:{/}        🐛 ', url: 'https://github.com/browser-use/browser-use/issues', color: 'green' }
];

interface CLIConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'aws' | 'azure' | 'deepseek' | 'groq' | 'ollama' | 'openrouter';
  model: string;
  apiKey?: string;
  temperature: number;
  headless: boolean;
  useVision: boolean;
  maxSteps: number;
  debug: boolean;
}

interface TaskHistory {
  task: string;
  timestamp: number;
  result?: string;
  success?: boolean;
}

export class BrowserUseTUI extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private config: CLIConfig;
  private llm: any;
  private browserSession?: BrowserSession;
  private agent?: Agent;
  
  // UI Elements
  private logoBox!: blessed.Widgets.BoxElement;
  private linksBox!: blessed.Widgets.BoxElement;
  private pathsBox!: blessed.Widgets.BoxElement;
  private browserPanel!: blessed.Widgets.BoxElement;
  private modelPanel!: blessed.Widgets.BoxElement;
  private tasksPanel!: blessed.Widgets.BoxElement;
  private mainOutputLog!: blessed.Widgets.Log;
  private eventsLog!: blessed.Widgets.Log;
  private cdpLog!: blessed.Widgets.Log;
  private taskInput!: blessed.Widgets.Textbox;
  
  // State
  private taskHistory: TaskHistory[] = [];
  private isRunningTask = false;
  private currentTask?: string;
  private updateTimer?: NodeJS.Timeout;
  
  constructor(config: CLIConfig) {
    super();
    this.config = config;
    
    // Initialize blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Browser-Use TypeScript TUI',
      debug: config.debug,
      dockBorders: true,
      cursor: {
        artificial: true,
        shape: 'line',
        blink: true
      }
    });
    
    // Setup screen event handlers
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.quit();
    });
    
    this.screen.key(['f1'], () => {
      this.toggleDebugMode();
    });
    
    this.initializeUI();
    this.loadHistory();
  }
  
  private initializeUI(): void {
    // Logo panel (top-left)
    this.logoBox = blessed.box({
      parent: this.screen,
      label: ' Browser-Use ',
      top: 0,
      left: 0,
      width: '50%',
      height: 18,
      content: BROWSER_LOGO,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'blue'
        }
      }
    });
    
    // Links panel (top-right)
    this.linksBox = blessed.box({
      parent: this.screen,
      label: ' Links & Resources ',
      top: 0,
      left: '50%',
      width: '50%',
      height: 13,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'blue'
        }
      }
    });
    
    // Add links content
    let linksContent = '';
    LINKS_INFO.forEach(link => {
      linksContent += `${link.label}{${link.color}-fg}${link.url}{/}\n`;
    });
    this.linksBox.setContent(linksContent);
    
    // Paths panel (below links)
    this.pathsBox = blessed.box({
      parent: this.screen,
      label: ' Paths ',
      top: 13,
      left: '50%',
      width: '50%',
      height: 5,
      content: ` ⚙️  Settings would be saved to:     ~/.browser-use/config.yaml\n 📁 Outputs & recordings saved to:  ${process.cwd().replace(os.homedir(), '~')}`,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'blue'
        }
      }
    });
    
    // Browser info panel (below logo)
    this.browserPanel = blessed.box({
      parent: this.screen,
      label: ' Browser Status ',
      top: 18,
      left: 0,
      width: '25%',
      height: 8,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'yellow'
        }
      }
    });
    
    // Model info panel (next to browser)
    this.modelPanel = blessed.box({
      parent: this.screen,
      label: ' LLM Status ',
      top: 18,
      left: '25%',
      width: '25%',
      height: 8,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'yellow'
        }
      }
    });
    
    // Tasks panel (right side)
    this.tasksPanel = blessed.box({
      parent: this.screen,
      label: ' Task History ',
      top: 18,
      left: '50%',
      width: '50%',
      height: 8,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'yellow'
        }
      }
    });
    
    // Main output log (left column)
    this.mainOutputLog = blessed.log({
      parent: this.screen,
      label: ' Main Output ',
      top: 26,
      left: 0,
      width: '33%',
      height: '70%-14',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'green'
        }
      }
    });
    
    // Events log (middle column)
    this.eventsLog = blessed.log({
      parent: this.screen,
      label: ' Agent Events ',
      top: 26,
      left: '33%',
      width: '34%',
      height: '70%-14',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan'
        }
      }
    });
    
    // CDP log (right column)
    this.cdpLog = blessed.log({
      parent: this.screen,
      label: ' Browser Events ',
      top: 26,
      left: '67%',
      width: '33%',
      height: '70%-14',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'magenta'
        }
      }
    });
    
    // Task input (bottom)
    this.taskInput = blessed.textbox({
      parent: this.screen,
      label: ' 🔍 What would you like me to do on the web? ',
      bottom: 3,
      left: 0,
      width: '100%',
      height: 3,
      inputOnFocus: true,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'orange'
        },
        focus: {
          border: {
            fg: 'yellow'
          }
        }
      }
    });
    
    // Setup input handlers
    this.taskInput.on('submit', (task: string) => {
      if (task.trim() && !this.isRunningTask) {
        this.runTask(task.trim());
      }
      this.taskInput.clearValue();
      this.taskInput.focus();
    });
    
    // Status bar (bottom)
    const statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: ` {bold}Browser-Use TypeScript v${getBrowserUseVersion()}{/} | ESC/Q: Quit | F1: Toggle Debug | Enter: Submit Task`,
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });
    
    // Focus input initially
    this.taskInput.focus();
  }
  
  private createLLMProvider(): any {
    switch (this.config.provider) {
      case 'openai':
        return new ChatOpenAI({
          model: this.config.model,
          api_key: this.config.apiKey || process.env.OPENAI_API_KEY,
          temperature: this.config.temperature,
        });
      case 'anthropic':
        return new ChatAnthropic({
          model: this.config.model,
          api_key: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
          temperature: this.config.temperature,
        });
      case 'google':
        return new ChatGoogle({
          model: this.config.model,
          api_key: this.config.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
          temperature: this.config.temperature,
        });
      case 'aws':
        return new ChatAWSBedrock({
          model: this.config.model,
          temperature: this.config.temperature,
        });
      case 'azure':
        return new ChatAzureOpenAI({
          model: this.config.model,
          api_key: this.config.apiKey || process.env.AZURE_OPENAI_API_KEY,
          azure_endpoint: process.env.AZURE_OPENAI_ENDPOINT,
          azure_deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
          temperature: this.config.temperature,
        });
      case 'deepseek':
        return new ChatDeepseek({
          model: this.config.model,
          api_key: this.config.apiKey || process.env.DEEPSEEK_API_KEY,
          temperature: this.config.temperature,
        });
      case 'groq':
        return new ChatGroq({
          model: this.config.model,
          api_key: this.config.apiKey || process.env.GROQ_API_KEY,
          temperature: this.config.temperature,
        });
      case 'ollama':
        return new ChatOllama({
          model: this.config.model,
          host: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          temperature: this.config.temperature,
        });
      case 'openrouter':
        return new ChatOpenRouter({
          model: this.config.model,
          api_key: this.config.apiKey || process.env.OPENROUTER_API_KEY,
          temperature: this.config.temperature,
        });
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }
  
  private async initialize(): Promise<void> {
    // Initialize LLM
    this.llm = this.createLLMProvider();
    this.log('main', `{green-fg}✓ LLM provider initialized: ${this.config.provider} ${this.config.model}{/}`);
    
    // Initialize browser session
    this.browserSession = new BrowserSession({ 
      headless: this.config.headless 
    });
    
    try {
      await this.browserSession.start();
      this.log('main', `{green-fg}✓ Browser session started (headless: ${this.config.headless}){/}`);
      
      // Setup browser event listeners
      this.setupBrowserEventListeners();
    } catch (error) {
      this.log('main', `{red-fg}✗ Failed to start browser: ${error instanceof Error ? error.message : String(error)}{/}`);
    }
    
    // Start periodic updates
    this.startPeriodicUpdates();
    
    this.log('main', '{cyan-fg}🚀 Browser-Use TUI initialized. Enter your task below!{/}');
  }
  
  private setupBrowserEventListeners(): void {
    if (!this.browserSession) return;
    
    // Listen for browser events
    this.browserSession.on('browser-event', (event: any) => {
      this.log('cdp', `{yellow-fg}Browser Event:{/} ${JSON.stringify(event, null, 2)}`);
    });
    
    // Listen for page events
    this.browserSession.on('page-event', (event: any) => {
      this.log('cdp', `{blue-fg}Page Event:{/} ${JSON.stringify(event, null, 2)}`);
    });
  }
  
  private log(channel: 'main' | 'events' | 'cdp', message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    
    switch (channel) {
      case 'main':
        this.mainOutputLog.log(logMessage);
        break;
      case 'events':
        this.eventsLog.log(logMessage);
        break;
      case 'cdp':
        this.cdpLog.log(logMessage);
        break;
    }
    
    this.screen.render();
  }
  
  private async runTask(task: string): Promise<void> {
    if (this.isRunningTask) {
      this.log('main', '{yellow-fg}⚠️ Task already running. Please wait...{/}');
      return;
    }
    
    if (!this.browserSession || !this.llm) {
      this.log('main', '{red-fg}✗ Browser or LLM not initialized{/}');
      return;
    }
    
    this.isRunningTask = true;
    this.currentTask = task;
    
    this.log('main', `{cyan-fg}🤖 Starting task:{/} ${task}`);
    this.log('events', `{green-fg}Task Started:{/} ${task}`);
    
    const startTime = Date.now();
    
    try {
      // Create agent
      this.agent = new Agent({
        task,
        llm: this.llm,
        browserSession: this.browserSession,
        settings: {
          use_vision: this.config.useVision || false,
          max_action_history: this.config.maxSteps || 50,
        }
      });
      
      // Setup agent event listeners
      this.agent.on('step', (step: any) => {
        this.log('events', `{blue-fg}Agent Step:{/} ${step.action || 'Unknown action'}`);
      });
      
      this.agent.on('error', (error: any) => {
        this.log('events', `{red-fg}Agent Error:{/} ${error}`);
      });
      
      // Run the agent
      const result = await this.agent.run();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (result.isDone() && result.isSuccessful()) {
        this.log('main', `{green-fg}✓ Task completed successfully in ${duration}s{/}`);
        const finalResult = result.finalResult();
        if (finalResult) {
          this.log('main', `{gray-fg}Result: ${finalResult}{/}`);
        }
        
        // Save to history
        this.taskHistory.push({
          task,
          timestamp: Date.now(),
          result: finalResult || 'Success',
          success: true
        });
      } else if (result.hasErrors()) {
        const errors = result.errors().filter(e => e !== null);
        const errorMsg = errors.length > 0 ? errors[errors.length - 1] : 'Unknown error';
        this.log('main', `{red-fg}✗ Task failed in ${duration}s: ${errorMsg}{/}`);
        
        // Save to history
        this.taskHistory.push({
          task,
          timestamp: Date.now(),
          result: errorMsg,
          success: false
        });
      } else {
        this.log('main', `{yellow-fg}⚠️ Task incomplete after ${duration}s (reached step limit){/}`);
        
        // Save to history
        this.taskHistory.push({
          task,
          timestamp: Date.now(),
          result: 'Incomplete - step limit reached',
          success: false
        });
      }
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('main', `{red-fg}✗ Task error in ${duration}s: ${errorMsg}{/}`);
      this.log('events', `{red-fg}Task Exception:{/} ${errorMsg}`);
      
      // Save to history
      this.taskHistory.push({
        task,
        timestamp: Date.now(),
        result: errorMsg,
        success: false
      });
    } finally {
      this.isRunningTask = false;
      this.currentTask = undefined;
      this.saveHistory();
      this.updatePanels();
    }
  }
  
  private startPeriodicUpdates(): void {
    this.updatePanels();
    this.updateTimer = setInterval(() => {
      this.updatePanels();
    }, 1000);
  }
  
  private updatePanels(): void {
    this.updateBrowserPanel();
    this.updateModelPanel();
    this.updateTasksPanel();
    this.screen.render();
  }
  
  private updateBrowserPanel(): void {
    let content = '';
    
    if (this.browserSession) {
      const status = this.isRunningTask ? '{green-fg}Running{/}' : '{yellow-fg}Ready{/}';
      content += `{bold cyan}Chromium{/} Browser (${status})\n`;
      content += `Type: {yellow-fg}playwright{/} ${this.config.headless ? '{red-fg}(headless){/}' : ''}\n`;
      content += `PID: {dim}N/A{/}\n`;
      content += `Status: Connected\n`;
      
      if (this.currentTask) {
        content += `{green-fg}Current Task:{/}\n{dim}${this.currentTask.slice(0, 30)}...{/}`;
      }
    } else {
      content = '{red-fg}Browser not initialized{/}';
    }
    
    this.browserPanel.setContent(content);
  }
  
  private updateModelPanel(): void {
    let content = '';
    
    if (this.llm) {
      const modelName = this.config.model;
      const tempStr = this.config.temperature !== 0 ? `${this.config.temperature}°C ` : '';
      const visionStr = this.config.useVision ? '+ vision ' : '';
      
      content += `{white-fg}LLM:{/} {blue-fg}${this.config.provider}{/} {yellow-fg}${modelName}{/} ${tempStr}${visionStr}\n`;
      
      // Show task statistics
      const totalTasks = this.taskHistory.length;
      const successfulTasks = this.taskHistory.filter(t => t.success).length;
      const successRate = totalTasks > 0 ? Math.round((successfulTasks / totalTasks) * 100) : 0;
      
      content += `\nTasks: {green-fg}${successfulTasks}{/}/{dim}${totalTasks}{/} (${successRate}%)\n`;
      content += `Max Steps: {yellow-fg}${this.config.maxSteps}{/}`;
    } else {
      content = '{red-fg}LLM not initialized{/}';
    }
    
    this.modelPanel.setContent(content);
  }
  
  private updateTasksPanel(): void {
    let content = '';
    
    const recentTasks = this.taskHistory.slice(-5).reverse();
    recentTasks.forEach((task, index) => {
      const time = new Date(task.timestamp).toLocaleTimeString();
      const status = task.success ? '{green-fg}✓{/}' : '{red-fg}✗{/}';
      const taskPreview = task.task.length > 25 ? task.task.slice(0, 25) + '...' : task.task;
      
      content += `${status} [${time}] ${taskPreview}\n`;
      if (task.result && index === 0) { // Show result for most recent task
        content += `  {dim}→ ${task.result.slice(0, 40)}...{/}\n`;
      }
    });
    
    if (recentTasks.length === 0) {
      content = '{dim}No tasks completed yet{/}';
    }
    
    this.tasksPanel.setContent(content);
  }
  
  private loadHistory(): void {
    try {
      const historyFile = path.join(os.homedir(), '.browser-use', 'tui-history.json');
      if (fs.existsSync(historyFile)) {
        const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        this.taskHistory = data.tasks || [];
      }
    } catch (error) {
      // Ignore loading errors
    }
  }
  
  private saveHistory(): void {
    try {
      const historyDir = path.join(os.homedir(), '.browser-use');
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }
      
      const historyFile = path.join(historyDir, 'tui-history.json');
      const data = {
        tasks: this.taskHistory.slice(-100) // Keep last 100 tasks
      };
      fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
    } catch (error) {
      // Ignore save errors
    }
  }
  
  private toggleDebugMode(): void {
    this.config.debug = !this.config.debug;
    this.log('main', `{yellow-fg}Debug mode: ${this.config.debug ? 'ON' : 'OFF'}{/}`);
  }
  
  private async quit(): Promise<void> {
    this.log('main', '{yellow-fg}Shutting down...{/}');
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    if (this.browserSession) {
      try {
        await this.browserSession.stop();
        this.log('main', '{green-fg}✓ Browser session stopped{/}');
      } catch (error) {
        this.log('main', `{red-fg}Error stopping browser: ${error}{/}`);
      }
    }
    
    this.saveHistory();
    this.screen.destroy();
    process.exit(0);
  }
  
  async run(): Promise<void> {
    await this.initialize();
    this.screen.render();
  }
}

// CLI command handlers
export async function runAdvancedTUI(config: CLIConfig): Promise<void> {
  const tui = new BrowserUseTUI(config);
  await tui.run();
}

// Export for use in main CLI
export default BrowserUseTUI;