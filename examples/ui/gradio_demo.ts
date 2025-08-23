/**
 * Gradio Demo for Browser Use
 * 
 * This creates an interactive web interface using Gradio for browser automation tasks.
 * 
 * Note: Since Gradio is primarily a Python library, this TypeScript example shows
 * the equivalent structure and functionality. For actual web UI in TypeScript,
 * consider using frameworks like Next.js, Express with a frontend, or Electron.
 * 
 * Usage:
 * npx tsx gradio_demo.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { BrowserSession } from '../../src/browser/session';
import { Controller } from '../../src/controller';
import express from 'express';
import path from 'path';

interface ActionResult {
    isDone: boolean;
    extractedContent: string | null;
    error: string | null;
    includeInMemory: boolean;
}

interface AgentHistoryList {
    allResults: ActionResult[];
    allModelOutputs: any[];
}

function parseAgentHistory(historyStr: string): void {
    console.log('🔍 Parsing agent history...');
    
    // Split the content into sections based on ActionResult entries
    const sections = historyStr.split('ActionResult(');
    
    sections.slice(1).forEach((section, i) => {
        // Extract relevant information
        let content = '';
        if (section.includes('extractedContent=')) {
            content = section.split('extractedContent=')[1].split(',')[0].trim().replace(/'/g, '');
        }
        
        if (content) {
            console.log(`📝 Step ${i + 1}:`);
            console.log('=' + '='.repeat(50));
            console.log(content);
            console.log('=' + '='.repeat(50));
            console.log();
        }
    });
}

async function runBrowserTask(
    task: string,
    apiKey: string,
    model: string = 'gpt-4.1',
    headless: boolean = true
): Promise<string> {
    if (!apiKey.trim()) {
        return 'Please provide an API key';
    }

    try {
        const llm = new ChatOpenAI({
            model: 'gpt-4.1-mini',
            apiKey,
            temperature: 0
        });

        const controller = new Controller();
        const browserSession = new BrowserSession({
            headless
        });

        const agent = new Agent({
            task,
            llm,
            controller,
            browserSession,
            useVision: true
        });

        console.log(`🚀 Starting task: ${task}`);
        console.log(`🤖 Using model: ${model}`);
        console.log(`🔍 Headless mode: ${headless}`);

        const result = await agent.run();
        
        await browserSession.close();
        
        // TODO: The result could be parsed better
        return JSON.stringify(result, null, 2);
    } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/**
 * Create a simple web interface using Express
 * This serves as a TypeScript equivalent to the Gradio interface
 */
function createWebInterface(): void {
    const app = express();
    const port = 3000;

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static('public'));

    // Serve the HTML interface
    app.get('/', (req, res) => {
        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browser Use Task Automation</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #333;
        }
        input, textarea, select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }
        textarea {
            height: 100px;
            resize: vertical;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .checkbox-group input {
            width: auto;
        }
        button {
            background: #007bff;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        button:hover {
            background: #0056b3;
        }
        button:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }
        .output {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border: 1px solid #e9ecef;
            white-space: pre-wrap;
            font-family: monospace;
            min-height: 200px;
            margin-top: 20px;
        }
        .loading {
            color: #007bff;
        }
        .error {
            color: #dc3545;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌐 Browser Use Task Automation</h1>
        
        <form id="taskForm">
            <div class="form-group">
                <label for="apiKey">OpenAI API Key:</label>
                <input type="password" id="apiKey" name="apiKey" placeholder="sk-..." required>
            </div>
            
            <div class="form-group">
                <label for="task">Task Description:</label>
                <textarea id="task" name="task" placeholder="E.g., Find flights from New York to London for next week" required></textarea>
            </div>
            
            <div class="form-group">
                <label for="model">Model:</label>
                <select id="model" name="model">
                    <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                    <option value="gpt-4.1">GPT-4.1</option>
                    <option value="gpt-4">GPT-4</option>
                </select>
            </div>
            
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="headless" name="headless" checked>
                    <label for="headless">Run Headless</label>
                </div>
            </div>
            
            <button type="submit" id="submitBtn">Run Task</button>
        </form>
        
        <div class="output" id="output">Results will appear here...</div>
    </div>

    <script>
        document.getElementById('taskForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitBtn');
            const output = document.getElementById('output');
            
            // Get form data
            const formData = new FormData(e.target);
            const data = {
                apiKey: formData.get('apiKey'),
                task: formData.get('task'),
                model: formData.get('model'),
                headless: formData.get('headless') === 'on'
            };
            
            // Update UI
            submitBtn.disabled = true;
            submitBtn.textContent = 'Running...';
            output.textContent = 'Starting browser automation task...';
            output.className = 'output loading';
            
            try {
                const response = await fetch('/run-task', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.text();
                output.textContent = result;
                output.className = 'output';
                
            } catch (error) {
                output.textContent = 'Error: ' + error.message;
                output.className = 'output error';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Run Task';
            }
        });
    </script>
</body>
</html>
        `);
    });

    // API endpoint to run tasks
    app.post('/run-task', async (req, res) => {
        const { task, apiKey, model, headless } = req.body;
        
        try {
            const result = await runBrowserTask(task, apiKey, model, headless);
            res.send(result);
        } catch (error) {
            res.status(500).send(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    app.listen(port, () => {
        console.log('🚀 Browser Use Web Interface');
        console.log('=' + '='.repeat(40));
        console.log(`🌐 Server running at: http://localhost:${port}`);
        console.log(`📝 Open your browser and navigate to the URL above`);
        console.log('');
        console.log('Features:');
        console.log('• Interactive web interface for browser automation');
        console.log('• OpenAI API integration');
        console.log('• Real-time task execution');
        console.log('• Headless/headed browser options');
        console.log('');
        console.log('Press Ctrl+C to stop the server');
    });
}

if (require.main === module) {
    createWebInterface();
}