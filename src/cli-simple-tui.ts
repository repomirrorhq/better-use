#!/usr/bin/env node

/**
 * Browser-Use TypeScript Simple TUI
 * Streamlined terminal interface with real-time updates
 */

import { Command } from 'commander';
const chalk = require('chalk');
import * as readline from 'readline';
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

function getBrowserLogo() {
  return `
${chalk.white('                   ++++++   +++++++++                                   ')}
${chalk.white('                 +++     +++++     +++                                ')}
${chalk.white('                 ++    ++++   ++    ++                                ')}
${chalk.white('                 ++  +++       +++  ++                                ')}
${chalk.white('                   ++++          +++                                  ')}
${chalk.white('                  +++             +++                                 ')}
${chalk.white('                 +++               +++                                ')}
${chalk.white('                 ++   +++      +++  ++                                ')}
${chalk.white('                 ++    ++++   ++    ++                                ')}
${chalk.white('                 +++     ++++++    +++                                ')}
${chalk.white('                   ++++++    +++++++                                  ')}

${chalk.blue('██████╗ ██████╗  ██████╗ ██╗    ██╗███████╗███████╗██████╗')}     ${chalk.yellow('██╗   ██╗███████╗███████╗')}
${chalk.blue('██╔══██╗██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔════╝██╔══██╗')}    ${chalk.yellow('██║   ██║██╔════╝██╔════╝')}
${chalk.blue('██████╔╝██████╔╝██║   ██║██║ █╗ ██║███████╗█████╗  ██████╔╝')}    ${chalk.yellow('██║   ██║███████╗█████╗')}  
${chalk.blue('██╔══██╗██╔══██╗██║   ██║██║███╗██║╚════██║██╔══╝  ██╔══██╗')}    ${chalk.yellow('██║   ██║╚════██║██╔══╝')}  
${chalk.blue('██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝███████║███████╗██║  ██║')}    ${chalk.yellow('╚██████╔╝███████║███████╗')}
${chalk.blue('╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝╚═╝  ╚═╝')}     ${chalk.yellow('╚═════╝ ╚══════╝╚══════╝')}
`;
}

const LINKS_INFO = [
  { label: 'Documentation:        📚', url: 'https://docs.browser-use.com' },
  { label: 'Discord Community:    🚀', url: 'https://discord.gg/ESAUZAdxXY' },
  { label: 'Awesome Prompts:      🦸', url: 'https://github.com/browser-use/awesome-prompts' },
  { label: 'Report Issues:        🐛', url: 'https://github.com/browser-use/browser-use/issues' }
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

export class SimpleTUI extends EventEmitter {
  private config: CLIConfig;
  private llm: any;
  private browserSession?: BrowserSession;
  private agent?: Agent;
  private rl: readline.Interface;
  
  // State
  private taskHistory: TaskHistory[] = [];
  private isRunningTask = false;
  private currentTask?: string;
  private statusTimer?: NodeJS.Timeout;
  
  constructor(config: CLIConfig) {
    super();
    this.config = config;
    
    // Setup readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('🔍 Task: ')
    });
    
    this.setupReadlineHandlers();
  }
  
  private setupReadlineHandlers(): void {
    this.rl.on('line', async (input: string) => {
      const task = input.trim();
      if (task) {
        if (task.toLowerCase() === 'exit' || task.toLowerCase() === 'quit') {
          await this.quit();
          return;
        }
        if (task.toLowerCase() === 'help') {
          this.showHelp();
          this.rl.prompt();
          return;
        }
        if (task.toLowerCase() === 'status') {
          this.showStatus();
          this.rl.prompt();
          return;
        }
        if (task.toLowerCase() === 'history') {
          this.showHistory();
          this.rl.prompt();
          return;
        }
        
        await this.runTask(task);
      }
      this.rl.prompt();
    });
    
    this.rl.on('SIGINT', async () => {
      console.log('\n' + chalk.yellow('Received interrupt signal. Shutting down...'));
      await this.quit();
    });
  }
  
  private displayHeader(): void {
    // Clear screen
    console.clear();
    
    console.log(getBrowserLogo());
    console.log(chalk.gray(`Browser automation powered by AI - TypeScript Edition v${getBrowserUseVersion()}\n`));
    
    // Display links
    console.log(chalk.blue.bold('┌─ Resources & Links ───────────────────────────────────────────────┐'));
    LINKS_INFO.forEach(link => {
      console.log(chalk.blue('│ ') + chalk.white(link.label) + ' ' + chalk.cyan(link.url) + chalk.blue('│'.padStart(80 - link.label.length - link.url.length - 3)));
    });
    console.log(chalk.blue('└───────────────────────────────────────────────────────────────────┘\n'));
    
    // Display paths
    console.log(chalk.green.bold('📁 Project Information'));
    console.log(chalk.gray(`   Settings would be saved to: ~/.browser-use/config.yaml`));
    console.log(chalk.gray(`   Outputs & recordings saved to: ${process.cwd().replace(os.homedir(), '~')}`));
    console.log();
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
    this.displayHeader();
    
    console.log(chalk.green.bold('🚀 Initializing Browser-Use TUI...\n'));
    
    // Initialize LLM
    console.log(chalk.yellow('⏳ Setting up LLM provider...'));
    this.llm = this.createLLMProvider();
    console.log(chalk.green(`✓ LLM provider initialized: ${this.config.provider} ${this.config.model}`));
    
    // Initialize browser session
    console.log(chalk.yellow('⏳ Starting browser session...'));
    this.browserSession = new BrowserSession({ 
      headless: this.config.headless 
    });
    
    try {
      await this.browserSession.start();
      console.log(chalk.green(`✓ Browser session started (headless: ${this.config.headless})`));
    } catch (error) {
      console.log(chalk.red(`✗ Failed to start browser: ${error instanceof Error ? error.message : String(error)}`));
      throw error;
    }
    
    this.loadHistory();
    
    console.log(chalk.green.bold('\n🎉 Browser-Use TUI initialized successfully!'));
    console.log(chalk.cyan('🔍 Enter your task below or type "help" for available commands\n'));
    
    this.showQuickStatus();
    this.startStatusUpdates();
  }
  
  private showQuickStatus(): void {
    console.log(chalk.blue.bold('┌─ Current Status ──────────────────────────────────────────────────┐'));
    console.log(chalk.blue('│ ') + chalk.white('Browser:') + ` ${this.browserSession ? chalk.green('Ready') : chalk.red('Not Started')}` + 
                chalk.blue('                                              │'));
    console.log(chalk.blue('│ ') + chalk.white('LLM:') + ` ${this.llm ? chalk.green(`${this.config.provider} ${this.config.model}`) : chalk.red('Not Initialized')}` + 
                chalk.blue(`${'│'.padStart(50 - this.config.provider.length - this.config.model.length)}`));
    console.log(chalk.blue('│ ') + chalk.white('Vision:') + ` ${this.config.useVision ? chalk.green('Enabled') : chalk.red('Disabled')}` + 
                chalk.blue('                                           │'));
    console.log(chalk.blue('│ ') + chalk.white('Tasks Completed:') + ` ${chalk.yellow(this.taskHistory.length.toString())}` + 
                chalk.blue(`${'│'.padStart(45 - this.taskHistory.length.toString().length)}`));
    console.log(chalk.blue('└───────────────────────────────────────────────────────────────────┘\n'));
  }
  
  private startStatusUpdates(): void {
    this.statusTimer = setInterval(() => {
      if (this.isRunningTask && this.currentTask) {
        // Show periodic status during task execution
        process.stdout.write(chalk.yellow(`⚡ Working on: ${this.currentTask.slice(0, 50)}${'...'.repeat(3)}\r`));
      }
    }, 2000);
  }
  
  private async runTask(task: string): Promise<void> {
    if (this.isRunningTask) {
      console.log(chalk.yellow('⚠️  Task already running. Please wait...'));
      return;
    }
    
    if (!this.browserSession || !this.llm) {
      console.log(chalk.red('✗ Browser or LLM not initialized'));
      return;
    }
    
    this.isRunningTask = true;
    this.currentTask = task;
    
    console.log(chalk.cyan(`\n🤖 Starting task: ${task}`));
    console.log(chalk.gray('──────────────────────────────────────────────────────────────────'));
    
    const startTime = Date.now();
    
    try {
      // Create agent
      this.agent = new Agent({
        task,
        llm: this.llm,
        browserSession: this.browserSession,
        agentDirectory: process.cwd(), // Initialize in current working directory
        settings: {
          use_vision: this.config.useVision,
          max_actions_per_step: this.config.maxSteps,
        }
      });
      
      // Setup agent event listeners
      this.agent.on('step', (step: any) => {
        console.log(chalk.blue(`📝 Agent Step: ${step.action || 'Unknown action'}`));
      });
      
      this.agent.on('error', (error: any) => {
        console.log(chalk.red(`❌ Agent Error: ${error}`));
      });
      
      // Run the agent
      const result = await this.agent.run();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log(chalk.gray('──────────────────────────────────────────────────────────────────'));
      
      if (result.isDone() && result.isSuccessful()) {
        console.log(chalk.green(`✅ Task completed successfully in ${duration}s`));
        const finalResult = result.finalResult();
        if (finalResult) {
          console.log(chalk.gray(`📋 Result: ${finalResult}`));
        }
        
        this.taskHistory.push({
          task,
          timestamp: Date.now(),
          result: finalResult || 'Success',
          success: true
        });
      } else if (result.hasErrors()) {
        const errors = result.errors().filter(e => e !== null);
        const errorMsg = errors.length > 0 ? errors[errors.length - 1] : 'Unknown error';
        console.log(chalk.red(`❌ Task failed in ${duration}s: ${errorMsg}`));
        
        this.taskHistory.push({
          task,
          timestamp: Date.now(),
          result: errorMsg,
          success: false
        });
      } else {
        console.log(chalk.yellow(`⚠️  Task incomplete after ${duration}s (reached step limit)`));
        
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
      console.log(chalk.red(`❌ Task error in ${duration}s: ${errorMsg}`));
      
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
      console.log();
    }
  }
  
  private showHelp(): void {
    console.log(chalk.blue.bold('\n📖 Available Commands:'));
    console.log(chalk.gray('───────────────────────────────────────'));
    console.log(chalk.white('  help') + chalk.gray('     - Show this help message'));
    console.log(chalk.white('  status') + chalk.gray('   - Show current system status'));  
    console.log(chalk.white('  history') + chalk.gray('  - Show task history'));
    console.log(chalk.white('  exit/quit') + chalk.gray('- Exit the TUI'));
    console.log(chalk.gray('───────────────────────────────────────'));
    console.log(chalk.cyan('💡 Just type your task to get started!\n'));
  }
  
  private showStatus(): void {
    console.log(chalk.blue.bold('\n📊 System Status:'));
    console.log(chalk.gray('───────────────────────────────────────'));
    console.log(chalk.white('Browser Status:') + ` ${this.browserSession ? chalk.green('Connected') : chalk.red('Disconnected')}`);
    console.log(chalk.white('LLM Provider:') + ` ${chalk.yellow(this.config.provider)} ${chalk.cyan(this.config.model)}`);
    console.log(chalk.white('Vision:') + ` ${this.config.useVision ? chalk.green('Enabled') : chalk.red('Disabled')}`);
    console.log(chalk.white('Max Steps:') + ` ${chalk.yellow(this.config.maxSteps.toString())}`);
    console.log(chalk.white('Headless Mode:') + ` ${this.config.headless ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(chalk.white('Debug Mode:') + ` ${this.config.debug ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(chalk.white('Task Status:') + ` ${this.isRunningTask ? chalk.yellow('Running') : chalk.green('Ready')}`);
    if (this.currentTask) {
      console.log(chalk.white('Current Task:') + ` ${chalk.cyan(this.currentTask)}`);
    }
    console.log(chalk.gray('───────────────────────────────────────\n'));
  }
  
  private showHistory(): void {
    console.log(chalk.blue.bold('\n📝 Task History:'));
    console.log(chalk.gray('───────────────────────────────────────'));
    
    if (this.taskHistory.length === 0) {
      console.log(chalk.gray('  No tasks completed yet'));
    } else {
      const recentTasks = this.taskHistory.slice(-10).reverse();
      recentTasks.forEach((task, index) => {
        const time = new Date(task.timestamp).toLocaleTimeString();
        const status = task.success ? chalk.green('✓') : chalk.red('✗');
        const taskPreview = task.task.length > 40 ? task.task.slice(0, 40) + '...' : task.task;
        console.log(`  ${status} [${chalk.gray(time)}] ${taskPreview}`);
        
        if (index === 0 && task.result) {
          console.log(chalk.gray(`      → ${task.result.slice(0, 60)}...`));
        }
      });
      
      if (this.taskHistory.length > 10) {
        console.log(chalk.gray(`  ... and ${this.taskHistory.length - 10} more tasks`));
      }
    }
    console.log(chalk.gray('───────────────────────────────────────\n'));
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
  
  private async quit(): Promise<void> {
    console.log(chalk.yellow('\n🔄 Shutting down Browser-Use TUI...'));
    
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
    }
    
    if (this.browserSession) {
      try {
        await this.browserSession.stop();
        console.log(chalk.green('✅ Browser session stopped'));
      } catch (error) {
        console.log(chalk.red(`❌ Error stopping browser: ${error}`));
      }
    }
    
    this.saveHistory();
    console.log(chalk.green('✅ History saved'));
    console.log(chalk.gray('Goodbye! 👋\n'));
    
    this.rl.close();
    process.exit(0);
  }
  
  async run(): Promise<void> {
    await this.initialize();
    this.rl.prompt();
  }
}

// CLI command handler
export async function runSimpleTUI(config: CLIConfig): Promise<void> {
  const tui = new SimpleTUI(config);
  await tui.run();
}

export default SimpleTUI;