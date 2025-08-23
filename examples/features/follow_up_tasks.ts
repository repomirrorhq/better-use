/**
 * Follow-up Tasks Example
 * 
 * This example demonstrates how to use the same agent instance to perform
 * multiple sequential tasks while maintaining context and browser state.
 * This is useful for:
 * - Multi-step workflows that build on previous results
 * - Maintaining browser sessions across related tasks
 * - Interactive task flows where each step depends on the previous
 * - Preserving context and state between task phases
 * 
 * The agent maintains the browser session and memory between tasks,
 * allowing for efficient continuation of work without starting over.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import { BrowserProfile } from '../../src/browser/profile';
import { BrowserSession } from '../../src/browser/session';
import * as readline from 'readline';
import os from 'os';
import path from 'path';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

// Get the appropriate Chrome executable path based on the operating system
function getChromeExecutablePath(): string {
    const platform = os.platform();
    
    switch (platform) {
        case 'darwin': // macOS
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        case 'win32': // Windows
            return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        case 'linux': // Linux
            return '/usr/bin/google-chrome';
        default:
            return '/usr/bin/google-chrome'; // Default to Linux path
    }
}

async function main(): Promise<void> {
    console.log('🔄 Follow-up Tasks Example');
    console.log('=' + '='.repeat(40));
    
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.log('❌ Error: OPENAI_API_KEY environment variable not set');
        console.log('Please set your OpenAI API key to run this example');
        rl.close();
        process.exit(1);
    }

    console.log('✅ OpenAI API key found');
    console.log('');
    console.log('This example demonstrates follow-up tasks:');
    console.log('• Sequential task execution with shared context');
    console.log('• Maintaining browser session between tasks');
    console.log('• Building on previous task results');
    console.log('• Interactive task flow continuation');
    console.log('');

    try {
        // Initialize the language model
        const llm = new ChatOpenAI({
            model: 'gpt-4.1',
            temperature: 0.0,
            apiKey: process.env.OPENAI_API_KEY
        });

        // Configure browser profile with persistence
        const browserProfile = new BrowserProfile({
            executablePath: getChromeExecutablePath(),
            keepAlive: true,
            userDataDir: path.join(os.homedir(), '.config', 'browseruse', 'profiles', 'default'),
            headless: false // Keep visible to see the workflow
        });

        const browserSession = new BrowserSession({
            browserProfile
        });

        const controller = new Controller();

        // Initial task
        const initialTask = 'Find the founders of browser-use and draft them a short personalized message';

        console.log('🚀 Creating agent with persistent browser session...');
        console.log(`📝 Initial task: ${initialTask}`);
        console.log('');

        const agent = new Agent({
            task: initialTask,
            llm,
            controller,
            browserSession,
            useVision: true
        });

        console.log('⏳ Executing initial task...');
        console.log('The agent will:');
        console.log('1. Research browser-use founders');
        console.log('2. Learn about their work and background');
        console.log('3. Draft personalized messages');
        console.log('');

        const startTime = Date.now();
        
        // Run the initial task
        await agent.run();
        
        const firstTaskTime = Date.now();
        const firstDuration = (firstTaskTime - startTime) / 1000;

        console.log('');
        console.log('✅ Initial task completed successfully!');
        console.log(`⏱️  Initial task time: ${firstDuration.toFixed(2)} seconds`);
        console.log('');

        // Follow-up task options
        const followUpOptions = [
            'Find an image of the founders',
            'Search for recent news about browser-use',
            'Look up the GitHub repository and recent commits',
            'Find contact information for the founders',
            'Research competitors to browser-use'
        ];

        console.log('🔄 Ready for follow-up task!');
        console.log('');
        console.log('Suggested follow-up tasks:');
        followUpOptions.forEach((option, index) => {
            console.log(`${index + 1}. ${option}`);
        });
        console.log('');

        let followUpTask: string;
        const userChoice = await askQuestion('Enter a number (1-5) or type your own follow-up task: ');
        
        const choiceNumber = parseInt(userChoice.trim());
        if (choiceNumber >= 1 && choiceNumber <= followUpOptions.length) {
            followUpTask = followUpOptions[choiceNumber - 1];
            console.log(`Selected: ${followUpTask}`);
        } else {
            followUpTask = userChoice.trim();
            if (!followUpTask) {
                followUpTask = 'Find an image of the founders'; // Default
                console.log('Using default follow-up task');
            }
        }

        console.log('');
        console.log(`📝 Follow-up task: ${followUpTask}`);
        console.log('');
        console.log('🔄 Adding follow-up task to the same agent...');
        console.log('Benefits of using the same agent:');
        console.log('• Maintains browser state and open tabs');
        console.log('• Preserves context from the previous task');
        console.log('• No need to re-navigate or re-authenticate');
        console.log('• Faster execution due to existing knowledge');
        console.log('');

        // Add the follow-up task
        agent.addNewTask(followUpTask);

        console.log('⏳ Executing follow-up task...');
        
        // Run the follow-up task
        await agent.run();
        
        const endTime = Date.now();
        const followUpDuration = (endTime - firstTaskTime) / 1000;
        const totalDuration = (endTime - startTime) / 1000;

        console.log('');
        console.log('✅ Follow-up task completed successfully!');
        console.log(`⏱️  Follow-up task time: ${followUpDuration.toFixed(2)} seconds`);
        console.log(`⏱️  Total execution time: ${totalDuration.toFixed(2)} seconds`);
        console.log('');
        console.log('🎯 Workflow Summary:');
        console.log('1. ✅ Researched browser-use founders and drafted messages');
        console.log(`2. ✅ Completed follow-up task: ${followUpTask}`);
        console.log('3. ✅ Maintained context and browser state throughout');
        console.log('');
        console.log('💡 Key Benefits Demonstrated:');
        console.log('• Context continuity between related tasks');
        console.log('• Browser session persistence for efficiency');
        console.log('• Building on previous task results');
        console.log('• Interactive workflow capabilities');
        console.log('• Reduced setup time for subsequent tasks');

        // Ask if user wants to continue with more tasks
        console.log('');
        const continueChoice = await askQuestion('Would you like to add another follow-up task? (y/n): ');
        
        if (continueChoice.toLowerCase().startsWith('y')) {
            const anotherTask = await askQuestion('Enter your next task: ');
            if (anotherTask.trim()) {
                console.log(`📝 Adding task: ${anotherTask}`);
                agent.addNewTask(anotherTask.trim());
                
                console.log('⏳ Executing additional task...');
                await agent.run();
                console.log('✅ Additional task completed!');
            }
        }

        console.log('');
        console.log('Press Enter to close the browser and exit...');
        await askQuestion('');

        await browserSession.close();

    } catch (error) {
        console.error('❌ Error during execution:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('OPENAI')) {
                console.log('');
                console.log('🔑 OpenAI Setup:');
                console.log('1. Visit https://platform.openai.com/api-keys');
                console.log('2. Create a new API key');
                console.log('3. Set OPENAI_API_KEY environment variable');
            } else if (error.message.includes('Chrome')) {
                console.log('');
                console.log('🔧 Chrome Setup:');
                console.log('Make sure Google Chrome is installed and accessible');
                console.log(`Expected path: ${getChromeExecutablePath()}`);
            }
        }
        
        process.exit(1);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}