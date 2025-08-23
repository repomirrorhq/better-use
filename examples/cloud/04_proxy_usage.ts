/**
 * Cloud Example 4: Proxy Usage 🌍
 * ===============================
 *
 * This example demonstrates reliable proxy usage scenarios:
 * - Different country proxies for geo-restrictions
 * - IP address and location verification
 * - Region-specific content access (streaming, news)
 * - Search result localization by country
 * - Mobile/residential proxy benefits
 *
 * Perfect for: Geo-restricted content, location testing, regional analysis
 *
 * Cost: ~$0.08 (1 task + 6-8 steps with proxy enabled)
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
 * Create a task with proxy enabled from a specific country.
 */
async function createTaskWithProxy(
    instructions: string, 
    countryCode: string = 'us'
): Promise<string> {
    console.log(`🌍 Creating task with ${countryCode.toUpperCase()} proxy`);
    console.log(`📝 Task: ${instructions}`);

    const payload = {
        task: instructions,
        llm_model: 'gpt-4.1-mini',
        // Proxy configuration
        use_proxy: true,  // Required for captcha solving
        proxy_country_code: countryCode,  // Choose proxy location
        // Standard settings
        use_adblock: true,  // Block ads for faster loading
        highlight_elements: true,  // Keep highlighting for visibility
        max_agent_steps: 15,
        // Enable sharing for viewing execution
        enable_public_share: true,  // Get shareable URLs
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
    console.log(`✅ Task created with ${countryCode.toUpperCase()} proxy: ${taskId}`);
    return taskId;
}

/**
 * Test IP address and location detection with proxy.
 */
async function testIpLocation(countryCode: string): Promise<TaskResponse> {
    const task = `
    Go to whatismyipaddress.com and tell me:
    1. The detected IP address
    2. The detected country/location
    3. The ISP/organization
    4. Any other location details shown
    
    Please be specific about what you see on the page.
    `;

    const taskId = await createTaskWithProxy(task, countryCode);
    return await waitForCompletion(taskId);
}

/**
 * Test access to geo-restricted content.
 */
async function testGeoRestrictedContent(countryCode: string): Promise<TaskResponse> {
    const task = `
    Go to a major news website (like BBC, CNN, or local news) and check:
    1. What content is available 
    2. Any geo-restriction messages
    3. Local/regional content differences
    4. Language or currency preferences shown
    
    Note any differences from what you might expect.
    `;

    const taskId = await createTaskWithProxy(task, countryCode);
    return await waitForCompletion(taskId);
}

/**
 * Test access to region-specific streaming content.
 */
async function testStreamingServiceAccess(countryCode: string): Promise<TaskResponse> {
    const task = `
    Go to a major streaming service website (like Netflix, YouTube, or BBC iPlayer) 
    and check what content or messaging appears.
    
    Report:
    1. What homepage content is shown
    2. Any geo-restriction messages or content differences
    3. Available content regions or language options
    4. Any pricing or availability differences
    
    Note: Don't try to log in, just observe the publicly available content.
    `;

    const taskId = await createTaskWithProxy(task, countryCode);
    return await waitForCompletion(taskId);
}

/**
 * Test how search results vary by location.
 */
async function testSearchResultsByLocation(countryCode: string): Promise<TaskResponse> {
    const task = `
    Go to Google and search for "best restaurants near me" or "local news".
    
    Report:
    1. What local results appear
    2. The detected location in search results
    3. Any location-specific content or ads
    4. Language preferences
    
    This will show how search results change based on proxy location.
    `;

    const taskId = await createTaskWithProxy(task, countryCode);
    return await waitForCompletion(taskId);
}

/**
 * Wait for task completion and return results.
 */
async function waitForCompletion(taskId: string): Promise<TaskResponse> {
    console.log(`⏳ Waiting for task ${taskId} to complete...`);

    const startTime = Date.now();

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
        const steps = details.steps?.length || 0;
        const elapsed = (Date.now() - startTime) / 1000;

        // Build status message
        let statusMsg: string;
        if (status === 'running') {
            statusMsg = `🌍 Proxy task | Step ${steps} | ⏱️  ${elapsed.toFixed(0)}s | 🤖 Processing...`;
        } else {
            statusMsg = `🌍 Proxy task | Step ${steps} | ⏱️  ${elapsed.toFixed(0)}s | Status: ${status}`;
        }

        // Clear line and show status
        process.stdout.write(`\r${statusMsg.padEnd(80)}`);

        if (status === 'finished') {
            console.log(`\r✅ Task completed in ${steps} steps! (${elapsed.toFixed(1)}s total)${' '.repeat(20)}`);
            return details;
        } else if (['failed', 'stopped'].includes(status)) {
            console.log(`\r❌ Task ${status} after ${steps} steps${' '.repeat(30)}`);
            return details;
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

/**
 * Demonstrate proxy usage across different countries.
 */
async function demoProxyCountries(): Promise<void> {
    console.log('\n🌍 Demo 1: Proxy Countries Comparison');
    console.log('-'.repeat(45));

    const countries: [string, string][] = [
        ['us', 'United States'], 
        ['de', 'Germany'], 
        ['jp', 'Japan'], 
        ['au', 'Australia']
    ];

    const results: Record<string, TaskResponse> = {};

    for (const [code, name] of countries) {
        console.log(`\n🌍 Testing ${name} (${code.toUpperCase()}) proxy:`);
        console.log('='.repeat(40));

        const result = await testIpLocation(code);
        results[code] = result;

        if (result.output) {
            console.log(`📍 Location Result: ${result.output.substring(0, 200)}...`);
        }

        // Show execution URLs
        if (result.live_url) {
            console.log(`🔗 Live Preview: ${result.live_url}`);
        }
        if (result.public_share_url) {
            console.log(`🌐 Share URL: ${result.public_share_url}`);
        } else if (result.share_url) {
            console.log(`🌐 Share URL: ${result.share_url}`);
        }

        console.log('-'.repeat(40));
        await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause between tests
    }

    // Summary comparison
    console.log('\n📊 Proxy Location Summary:');
    console.log('='.repeat(30));
    Object.entries(results).forEach(([code, result]) => {
        const status = result.status || 'unknown';
        console.log(`${code.toUpperCase()}: ${status}`);
    });
}

/**
 * Demonstrate geo-restriction bypass.
 */
async function demoGeoRestrictions(): Promise<void> {
    console.log('\n🚫 Demo 2: Geo-Restriction Testing');
    console.log('-'.repeat(40));

    // Test from different locations
    const locations: [string, string][] = [['us', 'US content'], ['de', 'European content']];

    for (const [code, description] of locations) {
        console.log(`\n🌍 Testing ${description} with ${code.toUpperCase()} proxy:`);
        const result = await testGeoRestrictedContent(code);

        if (result.output) {
            console.log(`📰 Content Access: ${result.output.substring(0, 200)}...`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

/**
 * Demonstrate streaming service access with different proxies.
 */
async function demoStreamingAccess(): Promise<void> {
    console.log('\n📺 Demo 3: Streaming Service Access');
    console.log('-'.repeat(40));

    const locations: [string, string][] = [['us', 'US'], ['de', 'Germany']];

    for (const [code, name] of locations) {
        console.log(`\n🌍 Testing streaming access from ${name}:`);
        const result = await testStreamingServiceAccess(code);

        if (result.output) {
            console.log(`📺 Access Result: ${result.output.substring(0, 200)}...`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

/**
 * Demonstrate search result localization.
 */
async function demoSearchLocalization(): Promise<void> {
    console.log('\n🔍 Demo 4: Search Localization');
    console.log('-'.repeat(35));

    const locations: [string, string][] = [['us', 'US'], ['de', 'Germany']];

    for (const [code, name] of locations) {
        console.log(`\n🌍 Testing search results from ${name}:`);
        const result = await testSearchResultsByLocation(code);

        if (result.output) {
            console.log(`🔍 Search Results: ${result.output.substring(0, 200)}...`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

/**
 * Demonstrate comprehensive proxy usage.
 */
async function main(): Promise<void> {
    console.log('🌍 Browser Use Cloud - Proxy Usage Examples');
    console.log('='.repeat(50));

    console.log('🎯 Proxy Benefits:');
    console.log('• Bypass geo-restrictions');
    console.log('• Test location-specific content');
    console.log('• Access region-locked websites');
    console.log('• Mobile/residential IP addresses');
    console.log('• Verify IP geolocation');

    console.log('\n🌐 Available Countries:');
    const countries = ['🇺🇸 US', '🇫🇷 France', '🇮🇹 Italy', '🇯🇵 Japan', '🇦🇺 Australia', '🇩🇪 Germany', '🇫🇮 Finland', '🇨🇦 Canada'];
    console.log(' • ' + countries.join(' • '));

    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        let demo = 'countries';
        
        if (args.includes('--demo')) {
            const demoIndex = args.indexOf('--demo');
            if (demoIndex + 1 < args.length) {
                demo = args[demoIndex + 1];
            }
        }

        console.log(`\n🔍 Running ${demo} demo(s)...`);

        switch (demo) {
            case 'countries':
                await demoProxyCountries();
                break;
            case 'geo':
                await demoGeoRestrictions();
                break;
            case 'streaming':
                await demoStreamingAccess();
                break;
            case 'search':
                await demoSearchLocalization();
                break;
            case 'all':
                await demoProxyCountries();
                await demoGeoRestrictions();
                await demoStreamingAccess();
                await demoSearchLocalization();
                break;
            default:
                console.log(`Unknown demo type: ${demo}. Available: countries, geo, streaming, search, all`);
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