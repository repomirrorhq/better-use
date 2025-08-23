/**
 * Goal: Searches for job listings, evaluates relevance based on a CV, and applies
 * 
 * @dev You need to add OPENAI_API_KEY to your environment variables.
 * Also you may need to install pdf-parse to read pdf files: npm install pdf-parse
 */

import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import { BrowserProfile, BrowserSession } from '../../src/browser';
import { ActionResult } from '../../src/controller/views';
import { z } from 'zod';

// Note: In a real implementation, you'd use a PDF parsing library like pdf-parse
// For this example, we'll use a dummy CV
const CV_PATH = path.join(process.cwd(), 'dummy_cv.txt');

// Create a dummy CV if it doesn't exist
if (!fs.existsSync(CV_PATH)) {
    fs.writeFileSync(CV_PATH, 'Hi I am a machine learning engineer with 3 years of experience in the field');
}

console.log(`Using dummy cv at ${CV_PATH}`);

// Job model schema
const JobSchema = z.object({
    title: z.string(),
    link: z.string(),
    company: z.string(),
    fit_score: z.number(),
    location: z.string().optional(),
    salary: z.string().optional(),
});

type Job = z.infer<typeof JobSchema>;

const controller = new Controller();

// Register custom actions
controller.registry.registerAction({
    name: 'save_jobs',
    description: 'Save jobs to file - with a score how well it fits to my profile',
    parameterSchema: JobSchema,
    handler: (job: Job) => {
        const csvRow = [job.title, job.company, job.link, job.salary || '', job.location || ''].join(',') + '\n';
        fs.appendFileSync('jobs.csv', csvRow);
        return new ActionResult({ extractedContent: 'Saved job to file' });
    },
});

controller.registry.registerAction({
    name: 'read_jobs',
    description: 'Read jobs from file',
    parameterSchema: z.object({}),
    handler: () => {
        try {
            const content = fs.readFileSync('jobs.csv', 'utf-8');
            return new ActionResult({ extractedContent: content });
        } catch (error) {
            return new ActionResult({ extractedContent: 'No jobs file found or empty file' });
        }
    },
});

controller.registry.registerAction({
    name: 'read_cv',
    description: 'Read my cv for context to fill forms',
    parameterSchema: z.object({}),
    handler: () => {
        try {
            const content = fs.readFileSync(CV_PATH, 'utf-8');
            console.log(`Read cv with ${content.length} characters`);
            return new ActionResult({ 
                extractedContent: content, 
                includeInMemory: true 
            });
        } catch (error) {
            return new ActionResult({ 
                error: `Failed to read CV: ${error}` 
            });
        }
    },
});

controller.registry.registerAction({
    name: 'upload_cv',
    description: 'Upload cv to element - call this function to upload if element is not found, try with different index of the same upload element',
    parameterSchema: z.object({
        index: z.number().describe('Index of the file upload element'),
    }),
    handler: async (params: { index: number }, browserSession: BrowserSession) => {
        try {
            const filePath = path.resolve(CV_PATH);
            
            // Get the element by index
            const domElement = await browserSession.getElementByIndex(params.index);
            
            if (!domElement) {
                console.log(`No element found at index ${params.index}`);
                return new ActionResult({ error: `No element found at index ${params.index}` });
            }
            
            // Check if it's a file input element (basic check for input type="file")
            if (domElement.nodeName.toLowerCase() !== 'input' || domElement.attributes.type !== 'file') {
                console.log(`Element at index ${params.index} is not a file upload element`);
                return new ActionResult({ error: `Element at index ${params.index} is not a file upload element` });
            }
            
            // Upload the file using browser session
            await browserSession.uploadFile(domElement, filePath);
            
            const msg = `Successfully uploaded file "${filePath}" to index ${params.index}`;
            console.log(msg);
            return new ActionResult({ extractedContent: msg });
            
        } catch (error) {
            console.error(`Error in upload: ${error}`);
            return new ActionResult({ error: `Failed to upload file to index ${params.index}: ${error}` });
        }
    },
});

async function main() {
    const browserSession = new BrowserSession({
        browserProfile: new BrowserProfile({
            disableSecurity: true,
            userDataDir: '~/.config/browseruse/profiles/default',
        }),
    });
    
    // Ground task definition
    const groundTask = 
        'You are a professional job finder. ' +
        '1. Read my cv with read_cv ' +
        'find ml internships and save them to a file ' +
        'search at company:';
    
    const tasks = [
        groundTask + '\n' + 'Google',
        // groundTask + '\n' + 'Amazon',
        // groundTask + '\n' + 'Apple',
        // groundTask + '\n' + 'Microsoft',
        // groundTask + '\n' + 'Meta',
    ];
    
    const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
    
    const agents = tasks.map(task => 
        new Agent(task, model, { controller, browserSession })
    );
    
    await Promise.all(agents.map(agent => agent.run()));
}

if (require.main === module) {
    main().catch(console.error);
}