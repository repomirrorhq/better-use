/**
 * Enhanced Page Scrolling Example
 * 
 * Goal: Automates webpage scrolling with various scrolling actions, including element-specific scrolling.
 * 
 * This example demonstrates enhanced scrolling capabilities:
 * 
 * 1. PAGE-LEVEL SCROLLING:
 *    - Scrolling by specific page amounts using 'num_pages' parameter (0.5, 1.0, 2.0, etc.)
 *    - Scrolling up or down using the 'down' parameter
 *    - Uses JavaScript window.scrollBy() or smart container detection
 * 
 * 2. ELEMENT-SPECIFIC SCROLLING:
 *    - NEW: Optional 'index' parameter to scroll within specific elements
 *    - Perfect for dropdowns, sidebars, and custom UI components
 *    - Uses direct scrollTop manipulation (no mouse events that might close dropdowns)
 *    - Automatically finds scroll containers in the element hierarchy
 *    - Falls back to page scrolling if no container found
 * 
 * 3. IMPLEMENTATION DETAILS:
 *    - Does NOT use mouse movement or wheel events
 *    - Direct DOM manipulation for precision and reliability
 *    - Container-aware scrolling prevents unwanted side effects
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { BrowserProfile } from '../../src/browser/profile';
import { BrowserSession } from '../../src/browser/session';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function main(): Promise<void> {
    console.log('🖱️  Enhanced Page Scrolling Example');
    console.log('=' + '='.repeat(50));
    
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.log('❌ Error: OPENAI_API_KEY environment variable not set');
        console.log('Please set your OpenAI API key to run this example');
        process.exit(1);
    }

    console.log('✅ OpenAI API key found');
    console.log('');
    console.log('This example demonstrates advanced scrolling capabilities:');
    console.log('• Page-level scrolling with custom amounts');
    console.log('• Element-specific scrolling (dropdowns, containers)');
    console.log('• Text-based scrolling to specific content');
    console.log('• Direct DOM manipulation for precision');
    console.log('');

    try {
        const llm = new ChatOpenAI({
            model: 'gpt-4.1-mini',
            apiKey: process.env.OPENAI_API_KEY,
            temperature: 0
        });

        const browserProfile = new BrowserProfile({
            headless: false  // Keep browser visible to see scrolling
        });

        const browserSession = new BrowserSession({
            browserProfile
        });

        // Define different scrolling examples
        const examples = [
            {
                name: 'Basic page scrolling with custom amounts (Wikipedia)',
                description: 'Demonstrates page-level scrolling with different page amounts',
                agent: new Agent({
                    task: `Navigate to 'https://en.wikipedia.org/wiki/Internet' and scroll down by one page - then scroll up by 0.5 pages - then scroll down by 0.25 pages - then scroll down by 2 pages.`,
                    llm,
                    browserSession,
                    useVision: true
                })
            },
            {
                name: 'Element-specific scrolling (Semantic UI dropdowns)',
                description: 'Shows how to scroll within specific elements like dropdowns',
                agent: new Agent({
                    task: `Go to https://semantic-ui.com/modules/dropdown.html#/definition and:
                    1. Scroll down in the left sidebar by 2 pages
                    2. Then scroll down 1 page in the main content area
                    3. Click on the State dropdown and scroll down 1 page INSIDE the dropdown to see more states
                    4. The dropdown should stay open while scrolling inside it`,
                    llm,
                    browserSession,
                    useVision: true
                })
            },
            {
                name: 'Text-based scrolling (Wikipedia)',
                description: 'Scrolls to specific text content on the page',
                agent: new Agent({
                    task: `Navigate to 'https://en.wikipedia.org/wiki/Internet' and scroll to the text 'The vast majority of computer'`,
                    llm,
                    browserSession,
                    useVision: true
                })
            }
        ];

        console.log('Choose which scrolling example to run:');
        examples.forEach((example, index) => {
            console.log(`${index + 1}. ${example.name}`);
            console.log(`   ${example.description}`);
            console.log('');
        });

        const choice = await askQuestion('Enter choice (1-3): ');
        const selectedIndex = parseInt(choice.trim()) - 1;

        let selectedExample;
        if (selectedIndex >= 0 && selectedIndex < examples.length) {
            selectedExample = examples[selectedIndex];
        } else {
            console.log('❌ Invalid choice. Running Example 1 by default...');
            selectedExample = examples[0];
        }

        console.log(`🚀 Running: ${selectedExample.name}`);
        console.log(`📝 Task: ${selectedExample.agent.task}`);
        console.log('');
        console.log('Watch the browser to see the enhanced scrolling in action!');
        console.log('The agent will:');
        
        if (selectedIndex === 0) {
            console.log('• Navigate to Wikipedia');
            console.log('• Perform various page scroll amounts');
            console.log('• Demonstrate up/down scrolling');
            console.log('• Show precise scroll control');
        } else if (selectedIndex === 1) {
            console.log('• Navigate to Semantic UI demo page');
            console.log('• Scroll within sidebar elements');
            console.log('• Scroll within main content area');
            console.log('• Open dropdown and scroll inside it');
            console.log('• Keep dropdown open during scrolling');
        } else {
            console.log('• Navigate to Wikipedia');
            console.log('• Search for specific text content');
            console.log('• Scroll directly to the target text');
        }
        
        console.log('');

        const startTime = Date.now();
        
        await selectedExample.agent.run();
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log('');
        console.log('✅ Scrolling demonstration completed successfully!');
        console.log(`⏱️  Total time: ${duration.toFixed(2)} seconds`);
        console.log('');
        console.log('🎯 Key Features Demonstrated:');
        console.log('• Enhanced scroll actions with page amounts');
        console.log('• Element-specific scrolling capabilities');
        console.log('• Direct DOM manipulation for precision');
        console.log('• Container-aware scrolling logic');
        console.log('• No unwanted mouse events or side effects');
        
        // Keep browser open for a moment to see final state
        console.log('');
        console.log('Press Enter to close the browser and exit...');
        await askQuestion('');
        
        await browserSession.close();

    } catch (error) {
        console.error('❌ Error during scrolling demonstration:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('OPENAI')) {
                console.log('');
                console.log('🔑 OpenAI Setup:');
                console.log('1. Visit https://platform.openai.com/api-keys');
                console.log('2. Create a new API key');
                console.log('3. Set OPENAI_API_KEY environment variable');
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