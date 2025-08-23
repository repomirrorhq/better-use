#!/usr/bin/env node

/**
 * Browser-Use TypeScript CLI
 * Simple command-line interface for browser automation
 */

import { Command } from 'commander';
const chalk = require('chalk');
import inquirer from 'inquirer';
import { Agent } from './agent/service';
import { BrowserSession } from './browser';
import { ChatOpenAI } from './llm/providers/openai';
import { ChatAnthropic } from './llm/providers/anthropic';
import { ChatGoogle } from './llm/providers/google';
import { ChatAWSBedrock } from './llm/providers/aws';
import { ChatAzureOpenAI } from './llm/providers/azure';
import { ChatDeepseek } from './llm/providers/deepseek';
import { getBrowserUseVersion } from './utils';

const program = new Command();

// ASCII Logo
const LOGO = `
${chalk.blue('██████╗ ██████╗  ██████╗ ██╗    ██╗███████╗███████╗██████╗')}     ${chalk.yellow('████████╗███████╗')}
${chalk.blue('██╔══██╗██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔════╝██╔══██╗')}    ${chalk.yellow('╚══██╔══╝██╔════╝')}
${chalk.blue('██████╔╝██████╔╝██║   ██║██║ █╗ ██║███████╗█████╗  ██████╔╝')}       ${chalk.yellow('██║   ███████╗')}
${chalk.blue('██╔══██╗██╔══██╗██║   ██║██║███╗██║╚════██║██╔══╝  ██╔══██╗')}       ${chalk.yellow('██║   ╚════██║')}
${chalk.blue('██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝███████║███████╗██║  ██║')}       ${chalk.yellow('██║   ███████║')}
${chalk.blue('╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝╚═╝  ╚═╝')}       ${chalk.yellow('╚═╝   ╚══════╝')}

${chalk.gray('Browser automation powered by AI - TypeScript Edition')}
`;

interface CLIConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'aws' | 'azure' | 'deepseek';
  model: string;
  apiKey?: string;
  temperature: number;
  headless: boolean;
}

function displayLogo() {
  console.log(LOGO);
  console.log(chalk.gray(`v${getBrowserUseVersion()}\n`));
}

function createLLMProvider(config: CLIConfig) {
  switch (config.provider) {
    case 'openai':
      return new ChatOpenAI({
        model: config.model,
        api_key: config.apiKey || process.env.OPENAI_API_KEY,
        temperature: config.temperature,
      });
    case 'anthropic':
      return new ChatAnthropic({
        model: config.model,
        api_key: config.apiKey || process.env.ANTHROPIC_API_KEY,
        temperature: config.temperature,
      });
    case 'google':
      return new ChatGoogle({
        model: config.model,
        api_key: config.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
        temperature: config.temperature,
      });
    case 'aws':
      return new ChatAWSBedrock({
        model: config.model,
        temperature: config.temperature,
      });
    case 'azure':
      return new ChatAzureOpenAI({
        model: config.model,
        api_key: config.apiKey || process.env.AZURE_OPENAI_API_KEY,
        azure_endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        azure_deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
        temperature: config.temperature,
      });
    case 'deepseek':
      return new ChatDeepseek({
        model: config.model,
        api_key: config.apiKey || process.env.DEEPSEEK_API_KEY,
        temperature: config.temperature,
      });
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

async function runInteractiveSession(config: CLIConfig) {
  displayLogo();
  
  console.log(chalk.green('Starting interactive browser automation session...\n'));
  
  // Create LLM provider
  const llm = createLLMProvider(config);
  
  // Create browser session
  const browser = new BrowserSession({ 
    headless: config.headless 
  });
  await browser.start();
  
  console.log(chalk.green(`✓ Browser session started (headless: ${config.headless})`));
  console.log(chalk.green(`✓ Using ${config.provider} ${config.model}\n`));
  
  try {
    while (true) {
      const { command } = await inquirer.prompt([
        {
          type: 'input',
          name: 'command',
          message: chalk.blue('Enter your command (or "exit" to quit):'),
        }
      ]);
      
      if (command.toLowerCase() === 'exit' || command.toLowerCase() === 'quit') {
        break;
      }
      
      if (!command.trim()) {
        continue;
      }
      
      console.log(chalk.yellow('\n🤖 Processing your request...\n'));
      
      try {
        // Create agent for this task
        const agent = new Agent({
          task: command,
          llm,
          browserSession: browser,
        });
        
        const result = await agent.run();
        
        if (result.isDone() && result.isSuccessful()) {
          console.log(chalk.green('\n✓ Task completed successfully!'));
          const finalResult = result.finalResult();
          if (finalResult) {
            console.log(chalk.gray(finalResult));
          }
        } else if (result.hasErrors()) {
          console.log(chalk.red('\n✗ Task failed:'));
          const errors = result.errors().filter(e => e !== null);
          if (errors.length > 0) {
            console.log(chalk.red(errors[errors.length - 1]));
          } else {
            console.log(chalk.red('Unknown error occurred'));
          }
        } else {
          console.log(chalk.yellow('\n⚠️ Task incomplete'));
          console.log(chalk.yellow('The agent did not finish the task within the step limit'));
        }
      } catch (error) {
        console.log(chalk.red('\n✗ Error executing command:'));
        console.log(chalk.red(error instanceof Error ? error.message : String(error)));
      }
      
      console.log(); // Add spacing
    }
  } finally {
    console.log(chalk.yellow('\nShutting down browser session...'));
    await browser.stop();
    console.log(chalk.green('✓ Browser session stopped'));
    console.log(chalk.gray('Goodbye! 👋'));
  }
}

async function runSingleCommand(task: string, config: CLIConfig) {
  // Create LLM provider
  const llm = createLLMProvider(config);
  
  // Create browser session
  const browser = new BrowserSession({ 
    headless: config.headless 
  });
  await browser.start();
  
  try {
    console.log(chalk.yellow('🤖 Processing your request...\n'));
    
    // Create agent for this task
    const agent = new Agent({
      task,
      llm,
      browserSession: browser,
    });
    
    const result = await agent.run();
    
    if (result.isDone() && result.isSuccessful()) {
      console.log(chalk.green('✓ Task completed successfully!'));
      const finalResult = result.finalResult();
      if (finalResult) {
        console.log(finalResult);
      }
    } else if (result.hasErrors()) {
      console.log(chalk.red('✗ Task failed:'));
      const errors = result.errors().filter(e => e !== null);
      if (errors.length > 0) {
        console.log(chalk.red(errors[errors.length - 1]));
      } else {
        console.log(chalk.red('Unknown error occurred'));
      }
      process.exit(1);
    } else {
      console.log(chalk.yellow('⚠️ Task incomplete'));
      console.log(chalk.yellow('The agent did not finish the task within the step limit'));
      process.exit(1);
    }
  } finally {
    await browser.stop();
  }
}

program
  .name('browser-use')
  .description('AI-powered browser automation')
  .version(getBrowserUseVersion());

program
  .command('run')
  .description('Run browser automation in interactive mode')
  .option('-p, --provider <provider>', 'LLM provider (openai, anthropic, google, aws, azure, deepseek)', 'openai')
  .option('-m, --model <model>', 'Model name', 'gpt-4o')
  .option('-k, --api-key <key>', 'API key (can also use environment variables)')
  .option('-t, --temperature <temp>', 'Temperature for LLM', parseFloat, 0.2)
  .option('--headless', 'Run browser in headless mode', false)
  .option('--no-headless', 'Run browser with GUI (default)')
  .action(async (options) => {
    const config: CLIConfig = {
      provider: options.provider,
      model: options.model,
      apiKey: options.apiKey,
      temperature: options.temperature,
      headless: options.headless,
    };
    
    await runInteractiveSession(config);
  });

program
  .command('exec <task>')
  .description('Execute a single browser automation task')
  .option('-p, --provider <provider>', 'LLM provider (openai, anthropic, google, aws, azure, deepseek)', 'openai')
  .option('-m, --model <model>', 'Model name', 'gpt-4o')
  .option('-k, --api-key <key>', 'API key (can also use environment variables)')
  .option('-t, --temperature <temp>', 'Temperature for LLM', parseFloat, 0.2)
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser with GUI')
  .action(async (task, options) => {
    const config: CLIConfig = {
      provider: options.provider,
      model: options.model,
      apiKey: options.apiKey,
      temperature: options.temperature,
      headless: options.headless,
    };
    
    await runSingleCommand(task, config);
  });

program
  .command('version')
  .description('Show version information')
  .action(() => {
    displayLogo();
    console.log(chalk.gray(`Browser-Use TypeScript v${getBrowserUseVersion()}`));
    console.log(chalk.gray('AI-powered browser automation framework'));
  });

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled promise rejection:', reason));
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught exception:', error.message));
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nReceived SIGINT. Gracefully shutting down...'));
  process.exit(0);
});

if (require.main === module) {
  program.parse();
}