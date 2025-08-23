/**
 * To Use It:
 *
 * Example 1: Using OpenAI (default), with default task: 'go to reddit and search for posts about browser-use'
 * npx tsx command_line.ts
 *
 * Example 2: Using OpenAI with a Custom Query
 * npx tsx command_line.ts --query "go to google and search for browser-use"
 *
 * Example 3: Using Anthropic's Claude Model with a Custom Query
 * npx tsx command_line.ts --query "find latest Python tutorials on Medium" --provider anthropic
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { BrowserSession } from '../../src/browser/session';
import { Controller } from '../../src/controller';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { ChatAnthropic } from '../../src/llm/providers/anthropic';

interface LLMProvider {
    run(messages: any[]): Promise<any>;
}

function getLlm(provider: string): LLMProvider {
    if (provider === 'anthropic') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('Error: ANTHROPIC_API_KEY is not set. Please provide a valid API key.');
        }

        return new ChatAnthropic({
            model: 'claude-3-5-sonnet-20240620',
            temperature: 0.0,
            apiKey
        });
    } else if (provider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('Error: OPENAI_API_KEY is not set. Please provide a valid API key.');
        }

        return new ChatOpenAI({
            model: 'gpt-4.1',
            temperature: 0.0,
            apiKey
        });
    } else {
        throw new Error(`Unsupported provider: ${provider}`);
    }
}

function parseArguments(): { query: string; provider: string } {
    /**
     * Parse command-line arguments.
     */
    const args = process.argv.slice(2);
    const query = getArgValue(args, '--query') || 'go to reddit and search for posts about browser-use';
    const provider = getArgValue(args, '--provider') || 'openai';
    
    if (provider !== 'openai' && provider !== 'anthropic') {
        throw new Error(`Unsupported provider: ${provider}. Choose from: openai, anthropic`);
    }
    
    return { query, provider };
}

function getArgValue(args: string[], flag: string): string | null {
    const index = args.indexOf(flag);
    return index >= 0 && index < args.length - 1 ? args[index + 1] : null;
}

function initializeAgent(query: string, provider: string): [Agent, BrowserSession] {
    /**
     * Initialize the browser agent with the given query and provider.
     */
    const llm = getLlm(provider);
    const controller = new Controller();
    const browserSession = new BrowserSession();

    const agent = new Agent({
        task: query,
        llm,
        controller,
        browserSession,
        useVision: true,
        maxActionsPerStep: 1,
    });

    return [agent, browserSession];
}

async function main(): Promise<void> {
    /**
     * Main async function to run the agent.
     */
    try {
        const args = parseArguments();
        const [agent, browserSession] = initializeAgent(args.query, args.provider);

        console.log(`🚀 Starting browser automation with ${args.provider} provider`);
        console.log(`📝 Task: ${args.query}`);
        console.log('-'.repeat(50));

        await agent.run({ maxSteps: 25 });

        console.log('\n✅ Task completed!');
        console.log('Press Enter to close the browser...');
        
        // Wait for user input
        await new Promise<void>((resolve) => {
            process.stdin.once('data', () => {
                resolve();
            });
        });

        await browserSession.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}