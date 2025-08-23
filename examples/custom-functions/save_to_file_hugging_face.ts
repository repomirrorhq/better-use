/**
 * Save to File - Hugging Face Models Example
 * 
 * This example demonstrates how to create custom actions for saving structured data
 * to files. The agent will browse Hugging Face, extract model information with
 * specific licenses, and save the top results to a file using a custom action.
 * 
 * Features:
 * - Custom file saving action with structured data
 * - Zod schema validation for extracted model data
 * - Automated Hugging Face model research and filtering
 * - File I/O operations integrated with browser automation
 * 
 * Setup:
 * 1. Set OPENAI_API_KEY environment variable
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import { ActionResult } from '../../src/agent/views';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Zod schemas for structured model data
const ModelSchema = z.object({
    title: z.string(),
    url: z.string().url(),
    likes: z.number().int().min(0),
    license: z.string(),
});

const ModelsSchema = z.object({
    models: z.array(ModelSchema),
});

type Model = z.infer<typeof ModelSchema>;
type Models = z.infer<typeof ModelsSchema>;

/**
 * Custom action to save models data to a file
 */
async function saveModels(params: Models): Promise<ActionResult> {
    try {
        console.log(`💾 Saving ${params.models.length} models to file...`);
        
        const filePath = path.join(process.cwd(), 'models.txt');
        
        // Prepare content to append
        let content = '';
        for (const model of params.models) {
            content += `${model.title} (${model.url}): ${model.likes} likes, ${model.license}\n`;
        }
        
        // Append to file
        await fs.appendFile(filePath, content, 'utf8');
        
        console.log(`✅ Successfully saved ${params.models.length} models to ${filePath}`);
        console.log('📄 Saved models:');
        for (const model of params.models) {
            console.log(`  • ${model.title}: ${model.likes} likes (${model.license})`);
        }

        return new ActionResult({
            extractedContent: `Saved ${params.models.length} models to ${filePath}`,
            isDone: false,
            error: null,
            includeInMemory: true
        });

    } catch (error) {
        const errorMsg = `Failed to save models to file: ${error}`;
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
    console.log('💾 Save to File - Hugging Face Models Example');
    console.log('=' + '='.repeat(50));
    
    // Verify OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
        console.log('❌ Error: OPENAI_API_KEY environment variable not set');
        console.log('Please set your OpenAI API key to run this example');
        process.exit(1);
    }

    try {
        console.log('✅ OpenAI API key found');
        console.log('🔍 This example will:');
        console.log('  1. Browse Hugging Face models');
        console.log('  2. Filter models by license (cc-by-sa-4.0)');
        console.log('  3. Sort by most likes');
        console.log('  4. Save top 5 models to models.txt file');
        console.log('');

        // Initialize controller and register custom save action
        const controller = new Controller();
        
        // Register the save models action
        controller.registry.action(
            'save_models',
            'Save models data to file with title, URL, likes count, and license information',
            saveModels
            // Note: In TypeScript, parameter model validation would be handled differently
            // This is a simplified version for demonstration
        );

        // Create OpenAI language model
        const llm = new ChatOpenAI({
            model: 'gpt-4.1-mini',
            apiKey: openaiApiKey,
            temperature: 0
        });

        // Task that combines web browsing with custom file operations
        const task = `
        Look up models with a license of cc-by-sa-4.0 and sort by most likes on Hugging Face.
        Extract the title, URL, likes count, and license for each model.
        Save the top 5 models to a file using the save_models action.
        `;

        // Create and run agent
        const agent = new Agent({
            task,
            llm,
            controller,
            useVision: true
        });

        console.log('🚀 Starting Hugging Face model research...');
        console.log('📝 Task: Research and save CC-BY-SA-4.0 licensed models');
        console.log('');

        // Clear any existing models file for this demo
        const filePath = path.join(process.cwd(), 'models.txt');
        try {
            await fs.unlink(filePath);
            console.log('🧹 Cleared existing models.txt file');
        } catch {
            // File doesn't exist, which is fine
        }

        const result = await agent.run();
        
        console.log('✅ Task completed successfully!');
        console.log('');
        
        // Show the contents of the saved file
        try {
            const savedContent = await fs.readFile(filePath, 'utf8');
            console.log('📄 Contents of models.txt:');
            console.log('-'.repeat(50));
            console.log(savedContent);
            console.log('-'.repeat(50));
        } catch (error) {
            console.log('⚠️  Could not read saved file:', error);
        }
        
        console.log(`📊 Final result: ${result}`);

        // Video reference from original Python version
        console.log('');
        console.log('🎥 Reference video: https://preview.screen.studio/share/EtOhIk0P');

    } catch (error) {
        console.error('❌ Error during execution:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('OPENAI')) {
                console.log('');
                console.log('🔑 OpenAI Setup:');
                console.log('1. Visit https://platform.openai.com/api-keys');
                console.log('2. Create a new API key');
                console.log('3. Set OPENAI_API_KEY environment variable');
            } else if (error.message.includes('file') || error.message.includes('ENOENT')) {
                console.log('');
                console.log('📁 File System Issue:');
                console.log('Make sure you have write permissions in the current directory');
                console.log(`Current directory: ${process.cwd()}`);
            }
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}