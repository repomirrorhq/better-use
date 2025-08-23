/**
 * Cloud Example 2: Ultra-Fast Mode with Gemini Flash ⚡
 * ====================================================
 *
 * This example demonstrates the fastest and most cost-effective configuration:
 * - Gemini 2.5 Flash model ($0.01 per step)
 * - No proxy (faster execution, but no captcha solving)
 * - No element highlighting (better performance)
 * - Optimized viewport size
 * - Maximum speed configuration
 *
 * Perfect for: Quick content generation, humor tasks, fast web scraping
 *
 * Cost: ~$0.03 (1 task + 2-3 steps with Gemini Flash)
 * Speed: 2-3x faster than default configuration
 * Fun Factor: 💯 (Creates hilarious tech commentary)
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

interface SpeedResult {
    task: string;
    duration: number;
    steps: number;
    status: string;
    output: string;
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
 * Create a browser automation task optimized for speed and cost.
 */
async function createFastTask(instructions: string): Promise<string> {
    console.log(`⚡ Creating FAST task: ${instructions}`);

    // Ultra-fast configuration
    const payload = {
        task: instructions,
        // Model: Fastest and cheapest
        llm_model: 'gemini-2.5-flash',
        // Performance optimizations
        use_proxy: false,  // No proxy = faster execution
        highlight_elements: false,  // No highlighting = better performance
        use_adblock: true,  // Block ads for faster loading
        // Viewport optimization (smaller = faster)
        browser_viewport_width: 1024,
        browser_viewport_height: 768,
        // Cost control
        max_agent_steps: 25,  // Reasonable limit for fast tasks
        // Enable sharing for viewing execution
        enable_public_share: true,  // Get shareable URLs
        // Optional: Speed up with domain restrictions
        // "allowed_domains": ["google.com", "*.google.com"]
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
    console.log(`✅ Fast task created with ID: ${taskId}`);
    console.log('⚡ Configuration: Gemini Flash + No Proxy + No Highlighting');
    return taskId;
}

/**
 * Monitor task with optimized polling for fast execution.
 */
async function monitorFastTask(taskId: string): Promise<TaskResponse> {
    console.log(`🚀 Fast monitoring task ${taskId}...`);

    const startTime = Date.now();
    let stepCount = 0;
    let lastStepTime = startTime;

    // Faster polling for quick tasks
    const pollInterval = 1000; // Check every second for fast tasks

    while (true) {
        const response = await requestWithRetry(
            `${BASE_URL}/task/${taskId}`,
            {
                method: 'GET',
                headers: HEADERS
            }
        );
        
        const details = await response.json();
        const status = details.status;

        // Show progress with timing
        const currentSteps = details.steps?.length || 0;
        const elapsed = (Date.now() - startTime) / 1000;

        // Build status message
        let stepMsg: string;
        if (currentSteps > stepCount) {
            const stepTime = (Date.now() - lastStepTime) / 1000;
            lastStepTime = Date.now();
            stepCount = currentSteps;
            stepMsg = `🔥 Step ${currentSteps} | ⚡ ${stepTime.toFixed(1)}s | Total: ${elapsed.toFixed(1)}s`;
        } else {
            if (status === 'running') {
                stepMsg = `🚀 Step ${currentSteps} | ⏱️  ${elapsed.toFixed(1)}s | Fast processing...`;
            } else {
                stepMsg = `🚀 Step ${currentSteps} | ⏱️  ${elapsed.toFixed(1)}s | Status: ${status}`;
            }
        }

        // Clear line and show progress
        process.stdout.write(`\r${stepMsg.padEnd(80)}`);

        // Check completion
        if (status === 'finished') {
            const totalTime = (Date.now() - startTime) / 1000;
            let avgMsg: string;
            if (currentSteps > 0) {
                avgMsg = `⚡ Average: ${(totalTime / currentSteps).toFixed(1)}s per step`;
            } else {
                avgMsg = '⚡ No steps recorded';
            }
            console.log(`\r🏁 Task completed in ${totalTime.toFixed(1)}s! ${avgMsg}${' '.repeat(20)}`);
            return details;
        } else if (['failed', 'stopped'].includes(status)) {
            console.log(`\r❌ Task ${status} after ${elapsed.toFixed(1)}s${' '.repeat(30)}`);
            return details;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
}

/**
 * Run multiple tasks to compare speed vs accuracy.
 */
async function runSpeedComparison(): Promise<void> {
    console.log('\n🏃‍♂️ Speed Comparison Demo');
    console.log('='.repeat(40));

    const tasks = [
        'Go to ProductHunt and roast the top product like a sarcastic tech reviewer',
        'Visit Reddit r/ProgrammerHumor and summarize the top post as a dramatic news story',
        "Check GitHub trending and write a conspiracy theory about why everyone's switching to Rust",
    ];

    const results: SpeedResult[] = [];

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        console.log(`\n📝 Fast Task ${i + 1}/${tasks.length}`);
        console.log(`Task: ${task}`);

        const start = Date.now();
        const taskId = await createFastTask(task);
        const result = await monitorFastTask(taskId);
        const end = Date.now();

        results.push({
            task,
            duration: (end - start) / 1000,
            steps: result.steps?.length || 0,
            status: result.status,
            output: result.output ? (result.output.substring(0, 100) + '...') : 'No output'
        });
    }

    // Summary
    console.log('\n📊 Speed Summary');
    console.log('='.repeat(50));
    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
    const totalSteps = results.reduce((sum, r) => sum + r.steps, 0);

    results.forEach((result, i) => {
        console.log(`Task ${i + 1}: ${result.duration.toFixed(1)}s (${result.steps} steps) - ${result.status}`);
    });

    console.log(`\n⚡ Total time: ${totalTime.toFixed(1)}s`);
    console.log(`🔥 Average per task: ${(totalTime / results.length).toFixed(1)}s`);
    if (totalSteps > 0) {
        console.log(`💨 Average per step: ${(totalTime / totalSteps).toFixed(1)}s`);
    } else {
        console.log('💨 Average per step: N/A (no steps recorded)');
    }
}

/**
 * Demonstrate ultra-fast cloud automation.
 */
async function main(): Promise<void> {
    console.log('⚡ Browser Use Cloud - Ultra-Fast Mode with Gemini Flash');
    console.log('='.repeat(60));

    console.log('🎯 Configuration Benefits:');
    console.log('• Gemini Flash: $0.01 per step (cheapest)');
    console.log('• No proxy: 30% faster execution');
    console.log('• No highlighting: Better performance');
    console.log('• Optimized viewport: Faster rendering');

    try {
        // Single fast task
        console.log('\n🚀 Single Fast Task Demo');
        console.log('-'.repeat(30));

        const task = `
        Go to Hacker News (news.ycombinator.com) and get the top 3 articles from the front page.
        
        Then, write a funny tech news segment in the style of Fireship YouTube channel:
        - Be sarcastic and witty about tech trends
        - Use developer humor and memes  
        - Make fun of common programming struggles
        - Include phrases like "And yes, it runs on JavaScript" or "Plot twist: it's written in Rust"
        - Keep it under 250 words but make it entertaining
        - Structure it like a news anchor delivering breaking tech news
        
        Make each story sound dramatic but also hilarious, like you're reporting on the most important events in human history.
        `;
        
        const taskId = await createFastTask(task);
        const result = await monitorFastTask(taskId);

        console.log(`\n📊 Result: ${result.output || 'No output'}`);

        // Show execution URLs
        if (result.live_url) {
            console.log(`\n🔗 Live Preview: ${result.live_url}`);
        }
        if (result.public_share_url) {
            console.log(`🌐 Share URL: ${result.public_share_url}`);
        } else if (result.share_url) {
            console.log(`🌐 Share URL: ${result.share_url}`);
        }

        // Check for --compare flag in command line arguments
        const args = process.argv.slice(2);
        if (args.includes('--compare')) {
            console.log('\n🏃‍♂️ Running speed comparison...');
            await runSpeedComparison();
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