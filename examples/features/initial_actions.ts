/**
 * Initial Actions Example
 * 
 * This example demonstrates how to configure initial actions that run before
 * the main task begins. This is useful for:
 * - Pre-loading multiple tabs or pages
 * - Setting up the browser state
 * - Navigating to starting points before task execution
 * - Performing setup actions that don't require LLM decision-making
 * 
 * The initial actions are executed sequentially before the LLM starts
 * processing the main task, providing a clean and predictable starting state.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';

async function main(): Promise<void> {
    console.log('⚡ Initial Actions Example');
    console.log('=' + '='.repeat(40));
    
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.log('❌ Error: OPENAI_API_KEY environment variable not set');
        console.log('Please set your OpenAI API key to run this example');
        process.exit(1);
    }

    console.log('✅ OpenAI API key found');
    console.log('');
    console.log('This example demonstrates initial actions:');
    console.log('• Actions that run before the main task');
    console.log('• Multi-tab setup and navigation');
    console.log('• Deterministic browser state preparation');
    console.log('• Setup actions without LLM decision-making');
    console.log('');

    try {
        const llm = new ChatOpenAI({
            model: 'gpt-4.1-mini',
            apiKey: process.env.OPENAI_API_KEY,
            temperature: 0
        });

        // Define initial actions to perform before the main task
        const initialActions = [
            {
                'go_to_url': {
                    'url': 'https://www.google.com',
                    'new_tab': true
                }
            },
            {
                'go_to_url': {
                    'url': 'https://en.wikipedia.org/wiki/Randomness',
                    'new_tab': true
                }
            }
        ];

        console.log('🚀 Setting up agent with initial actions...');
        console.log('');
        console.log('📋 Initial actions to perform:');
        initialActions.forEach((action, index) => {
            const actionType = Object.keys(action)[0];
            const actionParams = action[actionType as keyof typeof action];
            console.log(`  ${index + 1}. ${actionType}: ${JSON.stringify(actionParams, null, 2)}`);
        });
        console.log('');

        const agent = new Agent({
            task: 'What theories are displayed on the page?',
            initialActions,
            llm,
            useVision: true
        });

        console.log('📝 Main task: What theories are displayed on the page?');
        console.log('');
        console.log('🔄 Execution flow:');
        console.log('1. Execute initial actions (open tabs, navigate)');
        console.log('2. Agent analyzes the current page state');
        console.log('3. Agent answers the question about theories');
        console.log('');

        console.log('⏳ Starting agent execution...');
        
        const startTime = Date.now();
        
        await agent.run({ maxSteps: 10 });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log('');
        console.log('✅ Task completed successfully!');
        console.log(`⏱️  Total execution time: ${duration.toFixed(2)} seconds`);
        console.log('');
        console.log('🎯 What happened:');
        console.log('1. ✅ Opened Google in a new tab');
        console.log('2. ✅ Opened Wikipedia Randomness page in another tab');
        console.log('3. ✅ Agent analyzed the Wikipedia page content');
        console.log('4. ✅ Agent identified and reported theories from the page');
        console.log('');
        console.log('💡 Benefits of initial actions:');
        console.log('• Deterministic setup without LLM overhead');
        console.log('• Faster execution for known navigation steps');
        console.log('• Consistent starting state for tasks');
        console.log('• Multi-tab preparation for complex workflows');
        console.log('• Separation of setup vs. decision-making phases');

    } catch (error) {
        console.error('❌ Error during execution:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('OPENAI')) {
                console.log('');
                console.log('🔑 OpenAI Setup:');
                console.log('1. Visit https://platform.openai.com/api-keys');
                console.log('2. Create a new API key');
                console.log('3. Set OPENAI_API_KEY environment variable');
            } else if (error.message.includes('initial')) {
                console.log('');
                console.log('⚙️  Initial Actions Configuration:');
                console.log('Make sure initial actions are properly formatted:');
                console.log('- Each action should be an object with action type as key');
                console.log('- Action parameters should be nested under the action type');
                console.log('- URLs should be valid and accessible');
            }
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}