/**
 * Advanced Search Example with SERP API Integration
 * 
 * This example demonstrates how to create custom actions that integrate with external APIs.
 * It replaces the default Google search with a more powerful SERP API search and uses
 * structured output to extract specific information.
 * 
 * Features:
 * - Custom search action using Serper API
 * - Structured output with Zod schema validation
 * - Batch processing of search queries
 * - Email extraction from search results
 * 
 * Setup:
 * 1. Get a SERPER_API_KEY from https://serper.dev/
 * 2. Set SERPER_API_KEY environment variable
 * 3. Set OPENAI_API_KEY environment variable
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import { BrowserProfile } from '../../src/browser/profile';
import { ActionResult } from '../../src/agent/views';
import { z } from 'zod';
import https from 'https';

// Zod schemas for structured output
const PersonSchema = z.object({
    name: z.string(),
    email: z.string().email().optional(),
});

const PersonListSchema = z.object({
    people: z.array(PersonSchema),
});

type Person = z.infer<typeof PersonSchema>;
type PersonList = z.infer<typeof PersonListSchema>;

const SERP_API_KEY = process.env.SERPER_API_KEY;
if (!SERP_API_KEY) {
    throw new Error('SERPER_API_KEY is not set. Get one from https://serper.dev/');
}

/**
 * Search the web using Serper API
 */
async function searchWeb(query: string): Promise<ActionResult> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ q: query });
        const options = {
            hostname: 'google.serper.dev',
            path: '/search',
            method: 'POST',
            headers: {
                'X-API-KEY': SERP_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const serpData = JSON.parse(data);
                    
                    // Exclude searchParameters and credits
                    const cleanedData = Object.fromEntries(
                        Object.entries(serpData).filter(([key]) => 
                            !['searchParameters', 'credits'].includes(key)
                        )
                    );
                    
                    // Keep the value of the key "organic"
                    const organic = cleanedData.organic || [];
                    
                    // Remove the key "position" from each organic result
                    const cleanedOrganic = organic.map((item: any) => {
                        const { position, ...rest } = item;
                        return rest;
                    });
                    
                    console.log('SERP API Response:', JSON.stringify(cleanedOrganic, null, 2));
                    
                    const organicStr = JSON.stringify(cleanedOrganic);
                    
                    resolve(new ActionResult({
                        extractedContent: organicStr,
                        includeInMemory: false,
                        includeExtractedContentOnlyOnce: true,
                        isDone: false,
                        error: null
                    }));
                } catch (error) {
                    reject(new Error(`Failed to parse SERP API response: ${error}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`SERP API request failed: ${error.message}`));
        });
        
        req.write(payload);
        req.end();
    });
}

// List of ETH professors to search for
const names = [
    'Ruedi Aebersold',
    'Bernd Bodenmiller',
    'Eugene Demler',
    'Erich Fischer',
    'Pietro Gambardella',
    'Matthias Huss',
    'Reto Knutti',
    'Maksym Kovalenko',
    'Antonio Lanzavecchia',
    'Maria Lukatskaya',
    'Jochen Markard',
    'Javier Pérez-Ramírez',
    'Federica Sallusto',
    'Gisbert Schneider',
    'Sonia I. Seneviratne',
    'Michael Siegrist',
    'Johan Six',
    'Tanja Stadler',
    'Shinichi Sunagawa',
    'Michael Bruce Zimmermann',
];

async function main(): Promise<void> {
    try {
        console.log('🔍 Advanced Search Example with SERP API');
        console.log('=' + '='.repeat(50));
        
        // Verify API keys
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }
        
        console.log('✅ SERPER_API_KEY found');
        console.log('✅ OPENAI_API_KEY found');
        console.log(`📋 Processing ${names.length} professors`);
        console.log('');
        
        // Create controller with custom search action
        const controller = new Controller({
            excludeActions: ['search_google'],
            // Note: TypeScript equivalent of output_model would be handled differently
            // This is a simplified version for demonstration
        });
        
        // Register custom search action
        controller.registry.action(
            'search_web',
            'Search the web for a specific query. Returns a short description and links of the results.',
            searchWeb
        );
        
        const task = `use search_web with "find email address of the following ETH professor:" for each of the following persons in a list of actions. Finally return the list with name and email if provided - do always 5 at once\n\n` +
            names.join('\n');
        
        const model = new ChatOpenAI({
            model: 'gpt-4.1-mini',
            apiKey: openaiApiKey,
            temperature: 0
        });
        
        const browserProfile = new BrowserProfile();
        
        const agent = new Agent({
            task,
            llm: model,
            controller,
            browserProfile,
            useVision: true
        });
        
        console.log('🚀 Starting email search for ETH professors...');
        console.log('📝 Task: Find email addresses using custom SERP search');
        console.log('');
        
        const history = await agent.run();
        
        const result = history.finalResult();
        if (result) {
            try {
                const parsed: PersonList = PersonListSchema.parse(JSON.parse(result));
                
                console.log('📊 Results:');
                console.log('=' + '='.repeat(30));
                
                for (const person of parsed.people) {
                    console.log(`${person.name} - ${person.email || 'No email found'}`);
                }
                
                const foundEmails = parsed.people.filter(p => p.email).length;
                console.log('');
                console.log(`📈 Summary: Found ${foundEmails}/${parsed.people.length} email addresses`);
                
            } catch (error) {
                console.log('❌ Failed to parse structured result:', error);
                console.log('Raw result:', result);
            }
        } else {
            console.log('❌ No result returned from agent');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('SERPER_API_KEY')) {
                console.log('');
                console.log('🔑 SERPER API Setup:');
                console.log('1. Visit https://serper.dev/');
                console.log('2. Sign up for a free account');
                console.log('3. Get your API key');
                console.log('4. Set SERPER_API_KEY environment variable');
            } else if (error.message.includes('OPENAI_API_KEY')) {
                console.log('');
                console.log('🔑 OpenAI API Setup:');
                console.log('1. Visit https://platform.openai.com/api-keys');
                console.log('2. Create a new API key');
                console.log('3. Set OPENAI_API_KEY environment variable');
            }
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}