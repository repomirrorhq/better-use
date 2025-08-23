/**
 * Cloud Example 1: Your First Browser Use Cloud Task
 * ==================================================
 *
 * This example demonstrates the most basic Browser Use Cloud functionality:
 * - Create a simple automation task
 * - Get the task ID
 * - Monitor completion
 * - Retrieve results
 *
 * Perfect for first-time cloud users to understand the API basics.
 *
 * Cost: ~$0.04 (1 task + 3 steps with GPT-4.1 mini)
 */

import dotenv from 'dotenv';
dotenv.config();

// Configuration
const API_KEY = process.env.BROWSER_USE_API_KEY;
if (!API_KEY) {
    throw new Error('Please set BROWSER_USE_API_KEY environment variable');
}

const BASE_URL = process.env.BROWSER_USE_BASE_URL || 'https://api.browser-use.com/api/v1';
const TIMEOUT = parseInt(process.env.BROWSER_USE_TIMEOUT || '30') * 1000;
const HEADERS = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
};

interface TaskResponse {
    id: string;
    status: string;
    steps?: any[];
    output?: string;
    live_url?: string;
    public_share_url?: string;
    share_url?: string;
}

/**
 * Make HTTP request with timeout and retry logic.
 */
async function requestWithRetry(
    url: string,
    options: RequestInit,
    retries: number = 3
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    try {
        const optionsWithSignal = {
            ...options,
            signal: controller.signal
        };

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await fetch(url, optionsWithSignal);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
            } catch (error) {
                if (attempt === retries - 1) {
                    throw error;
                }
                
                const sleepTime = Math.pow(2, attempt) * 1000;
                console.log(`⚠️  Request failed (attempt ${attempt + 1}/${retries}), retrying in ${sleepTime/1000}s: ${error}`);
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            }
        }
        
        throw new Error('Unexpected error in retry logic');
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Create a new browser automation task.
 */
async function createTask(instructions: string): Promise<string> {
    console.log(`📝 Creating task: ${instructions}`);

    const payload = {
        task: instructions,
        llm_model: 'gpt-4.1-mini',  // Cost-effective model
        max_agent_steps: 10,  // Prevent runaway costs
        enable_public_share: true,  // Enable shareable execution URLs
    };

    const response = await requestWithRetry(
        `${BASE_URL}/run-task`,
        {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload)
        }
    );

    const result = await response.json();
    const taskId = result.id;
    console.log(`✅ Task created with ID: ${taskId}`);
    return taskId;
}

/**
 * Get the current status of a task.
 */
async function getTaskStatus(taskId: string): Promise<any> {
    const response = await requestWithRetry(
        `${BASE_URL}/task/${taskId}/status`,
        {
            method: 'GET',
            headers: HEADERS
        }
    );
    return response.json();
}

/**
 * Get full task details including steps and output.
 */
async function getTaskDetails(taskId: string): Promise<TaskResponse> {
    const response = await requestWithRetry(
        `${BASE_URL}/task/${taskId}`,
        {
            method: 'GET',
            headers: HEADERS
        }
    );
    return response.json();
}

/**
 * Wait for task completion and show progress.
 */
async function waitForCompletion(taskId: string, pollInterval: number = 3000): Promise<TaskResponse> {
    console.log(`⏳ Monitoring task ${taskId}...`);

    let stepCount = 0;
    const startTime = Date.now();

    while (true) {
        const details = await getTaskDetails(taskId);
        const status = details.status;
        const currentSteps = details.steps?.length || 0;
        const elapsed = (Date.now() - startTime) / 1000;

        // Update step count
        if (currentSteps > stepCount) {
            stepCount = currentSteps;
        }

        // Build status message
        let statusMsg: string;
        if (status === 'running') {
            if (currentSteps > 0) {
                statusMsg = `🔄 Step ${currentSteps} | ⏱️  ${elapsed.toFixed(0)}s | 🤖 Agent working...`;
            } else {
                statusMsg = `🤖 Agent starting... | ⏱️  ${elapsed.toFixed(0)}s`;
            }
        } else {
            statusMsg = `🔄 Step ${currentSteps} | ⏱️  ${elapsed.toFixed(0)}s | Status: ${status}`;
        }

        // Clear line and print status
        process.stdout.write(`\r${statusMsg.padEnd(80)}`);

        // Check if finished
        if (status === 'finished') {
            console.log(`\r✅ Task completed successfully! (${currentSteps} steps in ${elapsed.toFixed(1)}s)${' '.repeat(20)}`);
            return details;
        } else if (['failed', 'stopped'].includes(status)) {
            console.log(`\r❌ Task ${status} after ${currentSteps} steps${' '.repeat(30)}`);
            return details;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
}

/**
 * Run a basic cloud automation task.
 */
async function main(): Promise<void> {
    console.log('🚀 Browser Use Cloud - Basic Task Example');
    console.log('='.repeat(50));

    // Define a simple search task (using DuckDuckGo to avoid captchas)
    const taskDescription = (
        "Go to DuckDuckGo and search for 'browser automation tools'. Tell me the top 3 results with their titles and URLs."
    );

    try {
        // Step 1: Create the task
        const taskId = await createTask(taskDescription);

        // Step 2: Wait for completion
        const result = await waitForCompletion(taskId);

        // Step 3: Display results
        console.log('\n📊 Results:');
        console.log('-'.repeat(30));
        console.log(`Status: ${result.status}`);
        console.log(`Steps taken: ${result.steps?.length || 0}`);

        if (result.output) {
            console.log(`Output: ${result.output}`);
        } else {
            console.log('No output available');
        }

        // Show share URLs for viewing execution
        if (result.live_url) {
            console.log(`\n🔗 Live Preview: ${result.live_url}`);
        }
        if (result.public_share_url) {
            console.log(`🌐 Share URL: ${result.public_share_url}`);
        } else if (result.share_url) {
            console.log(`🌐 Share URL: ${result.share_url}`);
        }

        if (!result.live_url && !result.public_share_url && !result.share_url) {
            console.log("\n💡 Tip: Add 'enable_public_share': true to task payload to get shareable URLs");
        }

    } catch (error) {
        if (error instanceof Error) {
            console.log(`❌ Error: ${error.message}`);
        } else {
            console.log(`❌ Unexpected error: ${error}`);
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}