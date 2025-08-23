/**
 * OpenAI Computer Use Assistant (CUA) Integration
 * 
 * This example demonstrates how to integrate OpenAI's Computer Use Assistant as a fallback
 * action when standard browser actions are insufficient to achieve the desired goal.
 * The CUA can perform complex computer interactions that might be difficult to achieve
 * through regular browser-use actions.
 * 
 * CUA is particularly useful for:
 * • Complex mouse interactions (drag & drop, precise clicking)
 * • Keyboard shortcuts and key combinations  
 * • Actions that require pixel-perfect precision
 * • Custom UI elements that don't respond to standard actions
 * 
 * Setup:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Ensure you have access to OpenAI's Computer Use Assistant model
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import { BrowserSession } from '../../src/browser/session';
import { ActionResult } from '../../src/agent/views';
import { z } from 'zod';
import OpenAI from 'openai';
import sharp from 'sharp';

// Zod schema for OpenAI CUA Action parameters
const OpenAICUAActionSchema = z.object({
    description: z.string().describe('Description of your next goal'),
});

type OpenAICUAAction = z.infer<typeof OpenAICUAActionSchema>;

/**
 * Handle a computer action from OpenAI CUA using CDP
 */
async function handleModelAction(browserSession: BrowserSession, action: any): Promise<ActionResult> {
    const actionType = action.type;
    const ERROR_MSG = 'Could not execute the CUA action.';

    if (!browserSession.currentTarget) {
        return new ActionResult({
            error: 'No active browser session',
            isDone: false,
            extractedContent: null,
            includeInMemory: false
        });
    }

    try {
        switch (actionType) {
            case 'click': {
                const { x, y } = action;
                let button = action.button || 'left';
                console.log(`Action: click at (${x}, ${y}) with button '${button}'`);

                // Not handling things like middle click, etc.
                if (button !== 'left' && button !== 'right') {
                    button = 'left';
                }

                // Use CDP to click
                await browserSession.cdpSession?.send('Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x,
                    y,
                    button,
                    clickCount: 1,
                });

                await browserSession.cdpSession?.send('Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x,
                    y,
                    button,
                });

                const msg = `Clicked at (${x}, ${y}) with button ${button}`;
                return new ActionResult({
                    extractedContent: msg,
                    includeInMemory: true,
                    isDone: false,
                    error: null
                });
            }

            case 'scroll': {
                const { x, y, scroll_x, scroll_y } = action;
                console.log(`Action: scroll at (${x}, ${y}) with offsets (scroll_x=${scroll_x}, scroll_y=${scroll_y})`);

                // Move mouse to position first
                await browserSession.cdpSession?.send('Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x,
                    y,
                });

                // Execute scroll using JavaScript
                await browserSession.cdpSession?.send('Runtime.evaluate', {
                    expression: `window.scrollBy(${scroll_x}, ${scroll_y})`,
                });

                const msg = `Scrolled at (${x}, ${y}) with offsets (scroll_x=${scroll_x}, scroll_y=${scroll_y})`;
                return new ActionResult({
                    extractedContent: msg,
                    includeInMemory: true,
                    isDone: false,
                    error: null
                });
            }

            case 'keypress': {
                const keys = action.keys;
                for (const k of keys) {
                    console.log(`Action: keypress '${k}'`);
                    // A simple mapping for common keys; expand as needed.
                    let keyCode = k;
                    if (k.toLowerCase() === 'enter') {
                        keyCode = 'Enter';
                    } else if (k.toLowerCase() === 'space') {
                        keyCode = 'Space';
                    }

                    // Use CDP to send key
                    await browserSession.cdpSession?.send('Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        key: keyCode,
                    });

                    await browserSession.cdpSession?.send('Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        key: keyCode,
                    });
                }

                const msg = `Pressed keys: ${keys}`;
                return new ActionResult({
                    extractedContent: msg,
                    includeInMemory: true,
                    isDone: false,
                    error: null
                });
            }

            case 'type': {
                const text = action.text;
                console.log(`Action: type text: ${text}`);

                // Type text character by character
                for (const char of text) {
                    await browserSession.cdpSession?.send('Input.dispatchKeyEvent', {
                        type: 'char',
                        text: char,
                    });
                }

                const msg = `Typed text: ${text}`;
                return new ActionResult({
                    extractedContent: msg,
                    includeInMemory: true,
                    isDone: false,
                    error: null
                });
            }

            case 'wait':
                console.log('Action: wait');
                await new Promise(resolve => setTimeout(resolve, 2000));
                const msg = 'Waited for 2 seconds';
                return new ActionResult({
                    extractedContent: msg,
                    includeInMemory: true,
                    isDone: false,
                    error: null
                });

            case 'screenshot':
                // Nothing to do as screenshot is taken at each turn
                console.log('Action: screenshot');
                return new ActionResult({
                    error: ERROR_MSG,
                    isDone: false,
                    extractedContent: null,
                    includeInMemory: false
                });

            default:
                console.log(`Unrecognized action: ${action}`);
                return new ActionResult({
                    error: ERROR_MSG,
                    isDone: false,
                    extractedContent: null,
                    includeInMemory: false
                });
        }
    } catch (error) {
        console.log(`Error handling action ${action}: ${error}`);
        return new ActionResult({
            error: ERROR_MSG,
            isDone: false,
            extractedContent: null,
            includeInMemory: false
        });
    }
}

/**
 * OpenAI CUA fallback action
 */
async function openaiCuaFallback(
    params: OpenAICUAAction, 
    browserSession: BrowserSession
): Promise<ActionResult> {
    console.log(`🎯 CUA Action Starting - Goal: ${params.description}`);

    try {
        // Get browser state summary
        const state = await browserSession.getBrowserStateSummary();
        const pageInfo = state.pageInfo;
        if (!pageInfo) {
            throw new Error('Page info not found - cannot execute CUA action');
        }

        console.log(`📐 Viewport size: ${pageInfo.viewportWidth}x${pageInfo.viewportHeight}`);

        const screenshotB64 = state.screenshot;
        if (!screenshotB64) {
            throw new Error('Screenshot not found - cannot execute CUA action');
        }

        console.log(`📸 Screenshot captured (base64 length: ${screenshotB64.length} chars)`);

        // Resize screenshot to viewport size using Sharp
        const imageBuffer = Buffer.from(screenshotB64, 'base64');
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        
        console.log(`📏 Screenshot actual dimensions: ${metadata.width}x${metadata.height}`);

        // Rescale the screenshot to the viewport size
        const resizedBuffer = await image
            .resize(pageInfo.viewportWidth, pageInfo.viewportHeight)
            .png()
            .toBuffer();
        
        const resizedScreenshotB64 = resizedBuffer.toString('base64');
        console.log(`📸 Rescaled screenshot to viewport size: ${pageInfo.viewportWidth}x${pageInfo.viewportHeight}`);

        const client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        console.log('🔄 Sending request to OpenAI CUA...');

        const prompt = `
        You will be given an action to execute and screenshot of the current screen. 
        Output one computer_call object that will achieve this goal.
        Goal: ${params.description}
        `;

        // Note: This uses a simplified API call structure
        // The actual OpenAI Computer Use Assistant API may have different endpoints/parameters
        const response = await client.chat.completions.create({
            model: 'computer-use-preview', // This model may not be publicly available yet
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${resizedScreenshotB64}`,
                                detail: 'auto'
                            }
                        }
                    ]
                }
            ],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'computer_use_preview',
                        description: 'Use computer to interact with screen',
                        parameters: {
                            type: 'object',
                            properties: {
                                display_width: { type: 'number', default: pageInfo.viewportWidth },
                                display_height: { type: 'number', default: pageInfo.viewportHeight },
                                environment: { type: 'string', default: 'browser' }
                            }
                        }
                    }
                }
            ],
            temperature: 0.1,
        });

        console.log(`📥 CUA response received:`, response);

        // Parse the response to extract computer actions
        // This is a simplified implementation - actual parsing would depend on OpenAI's response format
        const toolCalls = response.choices[0]?.message?.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
            throw new Error('No computer calls found in CUA response');
        }

        const computerCall = toolCalls[0];
        const action = JSON.parse(computerCall.function.arguments);
        
        console.log(`🎬 Executing CUA action: ${action.type} - ${JSON.stringify(action)}`);

        const actionResult = await handleModelAction(browserSession, action);
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('✅ CUA action completed successfully');
        return actionResult;

    } catch (error) {
        const msg = `Error executing CUA action: ${error}`;
        console.log(`❌ ${msg}`);
        return new ActionResult({
            error: msg,
            isDone: false,
            extractedContent: null,
            includeInMemory: false
        });
    }
}

async function main(): Promise<void> {
    console.log('🔧 OpenAI Computer Use Assistant (CUA) Integration Example');
    console.log('='.repeat(60));
    console.log();
    console.log("This example shows how to integrate OpenAI's CUA as a fallback action");
    console.log('when standard browser-use actions cannot achieve the desired goal.');
    console.log();
    console.log('CUA is particularly useful for:');
    console.log('• Complex mouse interactions (drag & drop, precise clicking)');
    console.log('• Keyboard shortcuts and key combinations');
    console.log('• Actions that require pixel-perfect precision');
    console.log("• Custom UI elements that don't respond to standard actions");
    console.log();

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
        console.log('❌ Error: OPENAI_API_KEY environment variable not set');
        console.log('Please set your OpenAI API key to use CUA integration');
        process.exit(1);
    }

    console.log('Make sure you have OPENAI_API_KEY set in your environment!');
    console.log();

    try {
        // Initialize the language model
        const llm = new ChatOpenAI({
            model: 'gpt-4o-mini', // Updated model name
            temperature: 1.0,
            apiKey: process.env.OPENAI_API_KEY
        });

        // Create controller with custom CUA action
        const controller = new Controller();
        
        // Register the CUA fallback action
        controller.registry.action(
            'openai_cua_fallback',
            'Use OpenAI Computer Use Assistant (CUA) as a fallback when standard browser actions cannot achieve the desired goal. This action sends a screenshot and description to OpenAI CUA and executes the returned computer use actions.',
            openaiCuaFallback
        );

        // Create browser session
        const browserSession = new BrowserSession();

        // Example task that might require CUA fallback
        // This could be a complex interaction that's difficult with standard actions
        const task = `
        Go to https://csreis.github.io/tests/cross-site-iframe.html
        Click on "Go cross-site, complex page" using index
        Use the OpenAI CUA fallback to click on "Tree is open..." link.
        `;

        // Create agent with our custom controller that includes CUA fallback
        const agent = new Agent({
            task,
            llm,
            controller,
            browserSession,
        });

        console.log('🚀 Starting agent with CUA fallback support...');
        console.log(`Task: ${task}`);
        console.log('-'.repeat(50));

        // Run the agent
        const result = await agent.run();
        console.log(`\n✅ Task completed! Result: ${result}`);

    } catch (error) {
        console.log(`\n❌ Error running agent: ${error}`);
        
        if (error instanceof Error) {
            if (error.message.includes('computer-use-preview')) {
                console.log('\n💡 Note: The Computer Use Assistant model may not be publicly available yet.');
                console.log('This example demonstrates the integration pattern for when it becomes available.');
            }
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}