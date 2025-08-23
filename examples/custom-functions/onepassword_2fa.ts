/**
 * 1Password 2FA Integration Example
 * 
 * This example demonstrates how to integrate 1Password's SDK to automatically
 * retrieve 2FA/MFA codes during authentication flows. This is particularly
 * useful for automated testing or secure workflows that require 2FA.
 * 
 * Setup:
 * 1. Install 1Password CLI and SDK
 * 2. Create a 1Password Service Account
 * 3. Set OP_SERVICE_ACCOUNT_TOKEN environment variable
 * 4. Set OP_ITEM_ID environment variable (item ID from 1Password)
 * 5. Set OPENAI_API_KEY environment variable
 * 
 * Installation:
 * npm install @1password/op-sdk
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import { ActionResult } from '../../src/agent/views';

// Note: The 1Password TypeScript SDK may have different imports
// This is a conceptual implementation showing the integration pattern
interface OnePasswordClient {
    secrets: {
        resolve(reference: string): Promise<string>;
    };
}

// Mock 1Password client for demonstration purposes
// Replace with actual @1password/op-sdk import when available
class MockOnePasswordClient implements OnePasswordClient {
    secrets = {
        async resolve(reference: string): Promise<string> {
            // This would be the actual 1Password SDK call
            console.log(`Resolving 1Password secret: ${reference}`);
            
            // Mock implementation - in reality this would call 1Password API
            return Math.floor(Math.random() * 999999).toString().padStart(6, '0');
        }
    };

    static async authenticate(config: any): Promise<MockOnePasswordClient> {
        console.log('Authenticating with 1Password...');
        return new MockOnePasswordClient();
    }
}

const OP_SERVICE_ACCOUNT_TOKEN = process.env.OP_SERVICE_ACCOUNT_TOKEN;
const OP_ITEM_ID = process.env.OP_ITEM_ID; // Go to 1Password, right click on the item, click "Copy Secret Reference"

/**
 * Custom action to retrieve 2FA/MFA code from 1Password
 */
async function get1password2FA(): Promise<ActionResult> {
    try {
        console.log('🔐 Retrieving 2FA code from 1Password...');
        
        if (!OP_SERVICE_ACCOUNT_TOKEN) {
            throw new Error('OP_SERVICE_ACCOUNT_TOKEN environment variable is not set');
        }
        
        if (!OP_ITEM_ID) {
            throw new Error('OP_ITEM_ID environment variable is not set');
        }

        // Authenticate with 1Password using service account token
        const client = await MockOnePasswordClient.authenticate({
            auth: OP_SERVICE_ACCOUNT_TOKEN,
            integrationName: 'Browser-Use',
            integrationVersion: 'v1.0.0',
        });

        // Retrieve the 2FA code from the specified item
        const mfaCode = await client.secrets.resolve(`op://Private/${OP_ITEM_ID}/One-time passcode`);
        
        console.log(`✅ Successfully retrieved 2FA code: ${mfaCode}`);

        return new ActionResult({
            extractedContent: mfaCode,
            isDone: false,
            error: null,
            includeInMemory: true
        });

    } catch (error) {
        const errorMsg = `Failed to retrieve 2FA code from 1Password: ${error}`;
        console.error(`❌ ${errorMsg}`);
        
        return new ActionResult({
            error: errorMsg,
            extractedContent: null,
            isDone: false,
            includeInMemory: false
        });
    }
}

async function main(): Promise<void> {
    console.log('🔐 1Password 2FA Integration Example');
    console.log('=' + '='.repeat(50));
    
    // Verify required environment variables
    if (!OP_SERVICE_ACCOUNT_TOKEN) {
        console.log('❌ Error: OP_SERVICE_ACCOUNT_TOKEN environment variable not set');
        console.log('');
        console.log('Setup instructions:');
        console.log('1. Create a 1Password Service Account at https://1password.com/');
        console.log('2. Generate a service account token');
        console.log('3. Set OP_SERVICE_ACCOUNT_TOKEN environment variable');
        process.exit(1);
    }
    
    if (!OP_ITEM_ID) {
        console.log('❌ Error: OP_ITEM_ID environment variable not set');
        console.log('');
        console.log('Setup instructions:');
        console.log('1. Go to 1Password app');
        console.log('2. Find your Google account item with 2FA enabled');
        console.log('3. Right-click on the item');
        console.log('4. Click "Copy Secret Reference"');
        console.log('5. Set OP_ITEM_ID to the copied reference');
        process.exit(1);
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
        console.log('❌ Error: OPENAI_API_KEY environment variable not set');
        process.exit(1);
    }

    try {
        console.log('✅ All required environment variables found');
        console.log(`🔑 Using 1Password item: ${OP_ITEM_ID}`);
        console.log('');

        // Create controller and register the 1Password 2FA action
        const controller = new Controller();
        
        // Register custom action with domain restriction for security
        controller.registry.action(
            'get_1password_2fa',
            'Get 2FA code from 1Password for Google Account',
            get1password2FA,
            { domains: ['*.google.com', 'google.com'] }
        );

        // Create OpenAI language model
        const llm = new ChatOpenAI({
            model: 'gpt-4.1-mini',
            apiKey: openaiApiKey,
            temperature: 0
        });

        // Example task using the 1Password 2FA action
        const task = `
        Go to account.google.com, enter username and password, 
        then if prompted for 2FA code, get 2FA code from 1Password and enter it
        `;

        // Create and run agent
        const agent = new Agent({
            task,
            llm,
            controller,
            useVision: true
        });

        console.log('🚀 Starting automated login with 1Password 2FA...');
        console.log(`📝 Task: ${task.trim()}`);
        console.log('');
        console.log('The agent will:');
        console.log('1. Navigate to Google account login');
        console.log('2. Enter credentials');
        console.log('3. Automatically retrieve 2FA code from 1Password when prompted');
        console.log('4. Complete the authentication flow');
        console.log('');

        const result = await agent.run();
        
        console.log('✅ Task completed successfully!');
        console.log(`📊 Result: ${result}`);

    } catch (error) {
        console.error('❌ Error during execution:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('1Password')) {
                console.log('');
                console.log('💡 1Password Integration Setup:');
                console.log('1. Install 1Password CLI: https://developer.1password.com/docs/cli/get-started');
                console.log('2. Install SDK: npm install @1password/op-sdk');
                console.log('3. Create service account: https://developer.1password.com/docs/service-accounts');
                console.log('4. Configure authentication token and item ID');
            }
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}