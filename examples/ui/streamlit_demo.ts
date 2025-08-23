/**
 * Streamlit-like Demo for Browser Use (TypeScript/Node.js)
 * 
 * Since Streamlit is a Python-specific framework, this TypeScript example
 * creates a similar interactive web interface using Express and Server-Sent Events
 * for real-time updates.
 * 
 * To use it:
 * npx tsx streamlit_demo.ts
 * 
 * Then open http://localhost:3001 in your browser
 */

import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { ChatAnthropic } from '../../src/llm/providers/anthropic';
import { BrowserSession } from '../../src/browser/session';
import { Controller } from '../../src/controller';
import express from 'express';
import { EventEmitter } from 'events';

interface LLMProvider {
    run(messages: any[]): Promise<any>;
}

// Event emitter for real-time updates
const statusEmitter = new EventEmitter();

function getLlm(provider: string, apiKey: string): LLMProvider {
    if (provider === 'anthropic') {
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not set. Please provide a valid API key.');
        }
        return new ChatAnthropic({
            model: 'claude-3-5-sonnet-20240620',
            temperature: 0.0,
            apiKey
        });
    } else if (provider === 'openai') {
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set. Please provide a valid API key.');
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

function initializeAgent(query: string, provider: string, apiKey: string): [Agent, BrowserSession] {
    const llm = getLlm(provider, apiKey);
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

function createStreamlitInterface(): void {
    const app = express();
    const port = 3001;

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Store active sessions
    const activeSessions = new Map<string, BrowserSession>();

    // Serve the main interface
    app.get('/', (req, res) => {
        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Automated Browser Agent with LLMs 🤖</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 {
            text-align: center;
            color: #4a5568;
            margin-bottom: 30px;
            font-size: 2.5em;
        }
        .form-group {
            margin-bottom: 25px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #2d3748;
            font-size: 1.1em;
        }
        input[type="text"], input[type="password"], textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus, input[type="password"]:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        .radio-group {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        .radio-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .radio-item input[type="radio"] {
            width: auto;
            margin: 0;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 14px 28px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
            margin-right: 10px;
        }
        button:hover {
            transform: translateY(-2px);
        }
        button:disabled {
            background: #a0aec0;
            cursor: not-allowed;
            transform: none;
        }
        .status {
            margin-top: 30px;
            padding: 20px;
            border-radius: 8px;
            border-left: 5px solid #667eea;
            background: #f7fafc;
            display: none;
        }
        .status.show {
            display: block;
        }
        .status.success {
            border-left-color: #48bb78;
            background: #f0fff4;
            color: #22543d;
        }
        .status.error {
            border-left-color: #f56565;
            background: #fffafa;
            color: #742a2a;
        }
        .status.info {
            border-left-color: #4299e1;
            background: #f0f8f0;
            color: #2a4365;
        }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: #667eea;
            animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .log-output {
            background: #1a202c;
            color: #e2e8f0;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            max-height: 400px;
            overflow-y: auto;
            margin-top: 20px;
            white-space: pre-wrap;
            display: none;
        }
        .log-output.show {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Automated Browser Agent with LLMs</h1>
        
        <form id="agentForm">
            <div class="form-group">
                <label for="apiKey">API Key:</label>
                <input type="password" id="apiKey" name="apiKey" 
                       placeholder="Enter your OpenAI or Anthropic API key..." required>
            </div>
            
            <div class="form-group">
                <label for="query">Enter your query:</label>
                <textarea id="query" name="query" rows="3" 
                         placeholder="go to reddit and search for posts about browser-use" required></textarea>
            </div>
            
            <div class="form-group">
                <label>Select LLM Provider:</label>
                <div class="radio-group">
                    <div class="radio-item">
                        <input type="radio" id="openai" name="provider" value="openai" checked>
                        <label for="openai">OpenAI</label>
                    </div>
                    <div class="radio-item">
                        <input type="radio" id="anthropic" name="provider" value="anthropic">
                        <label for="anthropic">Anthropic</label>
                    </div>
                </div>
            </div>
            
            <button type="submit" id="runBtn">🚀 Run Agent</button>
            <button type="button" id="stopBtn" disabled>🛑 Stop Agent</button>
        </form>
        
        <div class="status" id="status"></div>
        <div class="log-output" id="logOutput"></div>
    </div>

    <script>
        let eventSource = null;
        let currentSessionId = null;

        document.getElementById('agentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const runBtn = document.getElementById('runBtn');
            const stopBtn = document.getElementById('stopBtn');
            const status = document.getElementById('status');
            const logOutput = document.getElementById('logOutput');
            
            // Get form data
            const formData = new FormData(e.target);
            const data = {
                apiKey: formData.get('apiKey'),
                query: formData.get('query'),
                provider: formData.get('provider')
            };
            
            // Update UI
            runBtn.disabled = true;
            stopBtn.disabled = false;
            status.className = 'status show info';
            status.innerHTML = '<div class="spinner"></div> Initializing agent...';
            logOutput.className = 'log-output show';
            logOutput.textContent = '';
            
            try {
                // Start the agent
                const response = await fetch('/run-agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    currentSessionId = result.sessionId;
                    
                    // Set up Server-Sent Events for real-time updates
                    eventSource = new EventSource(\`/events/\${currentSessionId}\`);
                    
                    eventSource.onmessage = function(event) {
                        const data = JSON.parse(event.data);
                        
                        if (data.type === 'log') {
                            logOutput.textContent += data.message + '\\n';
                            logOutput.scrollTop = logOutput.scrollHeight;
                        } else if (data.type === 'status') {
                            status.innerHTML = data.message;
                        } else if (data.type === 'complete') {
                            status.className = 'status show success';
                            status.innerHTML = '🎉 Task completed successfully!';
                            runBtn.disabled = false;
                            stopBtn.disabled = true;
                            eventSource.close();
                        } else if (data.type === 'error') {
                            status.className = 'status show error';
                            status.innerHTML = '❌ Error: ' + data.message;
                            runBtn.disabled = false;
                            stopBtn.disabled = true;
                            eventSource.close();
                        }
                    };
                    
                } else {
                    throw new Error(result.error);
                }
                
            } catch (error) {
                status.className = 'status show error';
                status.innerHTML = '❌ Error: ' + error.message;
                runBtn.disabled = false;
                stopBtn.disabled = true;
            }
        });
        
        document.getElementById('stopBtn').addEventListener('click', async () => {
            if (currentSessionId) {
                await fetch(\`/stop-agent/\${currentSessionId}\`, { method: 'POST' });
                if (eventSource) {
                    eventSource.close();
                }
                document.getElementById('runBtn').disabled = false;
                document.getElementById('stopBtn').disabled = true;
            }
        });
    </script>
</body>
</html>
        `);
    });

    // Server-Sent Events endpoint
    app.get('/events/:sessionId', (req, res) => {
        const sessionId = req.params.sessionId;
        
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        const listener = (data: any) => {
            res.write(\`data: \${JSON.stringify(data)}\\n\\n\`);
        };

        statusEmitter.on(sessionId, listener);

        req.on('close', () => {
            statusEmitter.removeListener(sessionId, listener);
        });
    });

    // Run agent endpoint
    app.post('/run-agent', async (req, res) => {
        const { query, provider, apiKey } = req.body;
        const sessionId = Date.now().toString();
        
        try {
            statusEmitter.emit(sessionId, { type: 'log', message: 'Initializing browser agent...' });
            
            const [agent, browserSession] = initializeAgent(query, provider, apiKey);
            activeSessions.set(sessionId, browserSession);
            
            // Run agent in background
            setImmediate(async () => {
                try {
                    statusEmitter.emit(sessionId, { type: 'status', message: '<div class="spinner"></div> Running automation...' });
                    statusEmitter.emit(sessionId, { type: 'log', message: \`Task: \${query}\` });
                    statusEmitter.emit(sessionId, { type: 'log', message: \`Provider: \${provider}\` });
                    statusEmitter.emit(sessionId, { type: 'log', message: 'Starting agent execution...' });
                    
                    await agent.run({ maxSteps: 25 });
                    
                    statusEmitter.emit(sessionId, { type: 'complete', message: 'Task completed successfully!' });
                    statusEmitter.emit(sessionId, { type: 'log', message: 'Agent execution completed.' });
                    
                    // Clean up
                    activeSessions.delete(sessionId);
                    
                } catch (error) {
                    statusEmitter.emit(sessionId, { 
                        type: 'error', 
                        message: error instanceof Error ? error.message : String(error)
                    });
                    activeSessions.delete(sessionId);
                }
            });
            
            res.json({ success: true, sessionId });
            
        } catch (error) {
            res.json({ 
                success: false, 
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Stop agent endpoint
    app.post('/stop-agent/:sessionId', async (req, res) => {
        const sessionId = req.params.sessionId;
        const browserSession = activeSessions.get(sessionId);
        
        if (browserSession) {
            try {
                await browserSession.close();
                activeSessions.delete(sessionId);
                statusEmitter.emit(sessionId, { type: 'log', message: 'Agent stopped by user.' });
            } catch (error) {
                console.error('Error stopping browser session:', error);
            }
        }
        
        res.json({ success: true });
    });

    app.listen(port, () => {
        console.log('🚀 Browser Use Streamlit-like Interface');
        console.log('=' + '='.repeat(50));
        console.log(\`🌐 Server running at: http://localhost:\${port}\`);
        console.log(\`📱 Interactive web interface with real-time updates\`);
        console.log('');
        console.log('Features:');
        console.log('• Real-time task execution monitoring');
        console.log('• Support for OpenAI and Anthropic models');
        console.log('• Server-Sent Events for live updates');
        console.log('• Beautiful responsive UI');
        console.log('• Session management and cleanup');
        console.log('');
        console.log('Press Ctrl+C to stop the server');
    });
}

if (require.main === module) {
    createStreamlitInterface();
}