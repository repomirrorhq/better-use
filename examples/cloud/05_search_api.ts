/**
 * Cloud Example 5: Search API (Beta) 🔍
 * =====================================
 *
 * This example demonstrates the Browser Use Search API (BETA):
 * - Simple search: Search Google and extract from multiple results
 * - URL search: Extract specific content from a target URL
 * - Deep navigation through websites (depth parameter)
 * - Real-time content extraction vs cached results
 *
 * Perfect for: Content extraction, research, competitive analysis
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

interface SearchResult {
    url?: string;
    content?: string;
    live_url?: string;
    public_share_url?: string;
    share_url?: string;
    error?: string;
    details?: string;
}

interface SimpleSearchResult extends SearchResult {
    results?: SearchResult[];
}

/**
 * Search Google and extract content from multiple top results.
 */
async function simpleSearch(
    query: string, 
    maxWebsites: number = 5, 
    depth: number = 2
): Promise<SimpleSearchResult> {
    // Validate input parameters
    maxWebsites = Math.max(1, Math.min(maxWebsites, 10));  // Clamp to 1-10
    depth = Math.max(2, Math.min(depth, 5));  // Clamp to 2-5

    const startTime = Date.now();

    console.log(`🔍 Simple Search: '${query}'`);
    console.log(`📊 Processing ${maxWebsites} websites at depth ${depth}`);
    console.log(`💰 Estimated cost: ${depth * maxWebsites}¢`);

    const payload = { 
        query, 
        max_websites: maxWebsites, 
        depth 
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    try {
        const response = await fetch(`${BASE_URL}/simple-search`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const elapsed = (Date.now() - startTime) / 1000;

        if (response.ok) {
            try {
                const result: SimpleSearchResult = await response.json();
                console.log(`✅ Found results from ${result.results?.length || 0} websites in ${elapsed.toFixed(1)}s`);
                return result;
            } catch (error) {
                const errorText = await response.text();
                console.log(`❌ Invalid JSON response: ${error} (after ${elapsed.toFixed(1)}s)`);
                return { error: 'Invalid JSON', details: errorText };
            }
        } else {
            const errorText = await response.text();
            console.log(`❌ Search failed: ${response.status} - ${errorText} (after ${elapsed.toFixed(1)}s)`);
            return { error: `HTTP ${response.status}`, details: errorText };
        }
    } catch (error) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`❌ Request failed: ${error} (after ${elapsed.toFixed(1)}s)`);
        return { error: 'Request failed', details: String(error) };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Extract specific content from a target URL.
 */
async function searchUrl(
    url: string, 
    query: string, 
    depth: number = 2
): Promise<SearchResult> {
    // Validate input parameters
    depth = Math.max(2, Math.min(depth, 5));  // Clamp to 2-5

    const startTime = Date.now();

    console.log(`🎯 URL Search: ${url}`);
    console.log(`🔍 Looking for: '${query}'`);
    console.log(`📊 Navigation depth: ${depth}`);
    console.log(`💰 Estimated cost: ${depth}¢`);

    const payload = { url, query, depth };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    try {
        const response = await fetch(`${BASE_URL}/search-url`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const elapsed = (Date.now() - startTime) / 1000;

        if (response.ok) {
            try {
                const result: SearchResult = await response.json();
                console.log(`✅ Extracted content from ${result.url || 'website'} in ${elapsed.toFixed(1)}s`);
                return result;
            } catch (error) {
                const errorText = await response.text();
                console.log(`❌ Invalid JSON response: ${error} (after ${elapsed.toFixed(1)}s)`);
                return { error: 'Invalid JSON', details: errorText };
            }
        } else {
            const errorText = await response.text();
            console.log(`❌ URL search failed: ${response.status} - ${errorText} (after ${elapsed.toFixed(1)}s)`);
            return { error: `HTTP ${response.status}`, details: errorText };
        }
    } catch (error) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`❌ Request failed: ${error} (after ${elapsed.toFixed(1)}s)`);
        return { error: 'Request failed', details: String(error) };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Display simple search results in a readable format.
 */
function displaySimpleSearchResults(results: SimpleSearchResult): void {
    if (results.error) {
        console.log(`❌ Error: ${results.error}`);
        return;
    }

    const websites = results.results || [];

    console.log(`\n📋 Search Results (${websites.length} websites)`);
    console.log('='.repeat(50));

    websites.forEach((site, i) => {
        const url = site.url || 'Unknown URL';
        const content = site.content || 'No content';

        console.log(`\n${i + 1}. 🌐 ${url}`);
        console.log('-'.repeat(40));

        // Show first 300 chars of content
        if (content.length > 300) {
            console.log(`${content.substring(0, 300)}...`);
            console.log(`[Content truncated - ${content.length} total characters]`);
        } else {
            console.log(content);
        }
    });

    // Show execution URLs if available
    if (results.live_url) {
        console.log(`\n🔗 Live Preview: ${results.live_url}`);
    }
    if (results.public_share_url) {
        console.log(`🌐 Share URL: ${results.public_share_url}`);
    } else if (results.share_url) {
        console.log(`🌐 Share URL: ${results.share_url}`);
    }
}

/**
 * Display URL search results in a readable format.
 */
function displayUrlSearchResults(results: SearchResult): void {
    if (results.error) {
        console.log(`❌ Error: ${results.error}`);
        return;
    }

    const url = results.url || 'Unknown URL';
    const content = results.content || 'No content';

    console.log(`\n📄 Extracted Content from: ${url}`);
    console.log('='.repeat(60));
    console.log(content);

    // Show execution URLs if available
    if (results.live_url) {
        console.log(`\n🔗 Live Preview: ${results.live_url}`);
    }
    if (results.public_share_url) {
        console.log(`🌐 Share URL: ${results.public_share_url}`);
    } else if (results.share_url) {
        console.log(`🌐 Share URL: ${results.share_url}`);
    }
}

/**
 * Demo: Search for latest news across multiple sources.
 */
async function demoNewsSearch(): Promise<SimpleSearchResult> {
    console.log('\n📰 Demo 1: Latest News Search');
    console.log('-'.repeat(35));

    const demoStart = Date.now();
    const query = 'latest developments in artificial intelligence 2024';
    const results = await simpleSearch(query, 4, 2);
    const demoElapsed = (Date.now() - demoStart) / 1000;

    displaySimpleSearchResults(results);
    console.log(`\n⏱️  Total demo time: ${demoElapsed.toFixed(1)}s`);

    return results;
}

/**
 * Demo: Analyze competitor websites.
 */
async function demoCompetitiveAnalysis(): Promise<SimpleSearchResult> {
    console.log('\n🏢 Demo 2: Competitive Analysis');
    console.log('-'.repeat(35));

    const query = 'browser automation tools comparison features pricing';
    const results = await simpleSearch(query, 3, 3);
    displaySimpleSearchResults(results);

    return results;
}

/**
 * Demo: Deep analysis of a specific website.
 */
async function demoDeepWebsiteAnalysis(): Promise<SearchResult> {
    console.log('\n🎯 Demo 3: Deep Website Analysis');
    console.log('-'.repeat(35));

    const demoStart = Date.now();
    const url = 'https://docs.browser-use.com';
    const query = 'Browser Use features, pricing, and API capabilities';
    const results = await searchUrl(url, query, 3);
    const demoElapsed = (Date.now() - demoStart) / 1000;

    displayUrlSearchResults(results);
    console.log(`\n⏱️  Total demo time: ${demoElapsed.toFixed(1)}s`);

    return results;
}

/**
 * Demo: Product research and comparison.
 */
async function demoProductResearch(): Promise<SimpleSearchResult> {
    console.log('\n🛍️  Demo 4: Product Research');
    console.log('-'.repeat(30));

    const query = 'best wireless headphones 2024 reviews comparison';
    const results = await simpleSearch(query, 5, 2);
    displaySimpleSearchResults(results);

    return results;
}

/**
 * Demo: Show difference between real-time and cached results.
 */
async function demoRealTimeVsCached(): Promise<SimpleSearchResult> {
    console.log('\n⚡ Demo 5: Real-time vs Cached Data');
    console.log('-'.repeat(40));

    console.log('🔄 Browser Use Search API benefits:');
    console.log('• Actually browses websites like a human');
    console.log('• Gets live, current data (not cached)');
    console.log('• Navigates deep into sites via clicks');
    console.log('• Handles JavaScript and dynamic content');
    console.log('• Accesses pages requiring navigation');

    // Example with live data
    const query = 'current Bitcoin price USD live';
    const results = await simpleSearch(query, 3, 2);

    console.log('\n💰 Live Bitcoin Price Search Results:');
    displaySimpleSearchResults(results);

    return results;
}

/**
 * Demo: Compare different search depths.
 */
async function demoSearchDepthComparison(): Promise<Record<number, SearchResult>> {
    console.log('\n📊 Demo 6: Search Depth Comparison');
    console.log('-'.repeat(40));

    const url = 'https://news.ycombinator.com';
    const query = 'trending technology discussions';

    const depths = [2, 3, 4];
    const results: Record<number, SearchResult> = {};

    for (const depth of depths) {
        console.log(`\n🔍 Testing depth ${depth}:`);
        const result = await searchUrl(url, query, depth);
        results[depth] = result;

        if (result.content) {
            const contentLength = result.content.length;
            console.log(`📏 Content length: ${contentLength} characters`);
        }

        // Brief pause between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    console.log('\n📊 Depth Comparison Summary:');
    console.log('-'.repeat(30));
    Object.entries(results).forEach(([depth, result]) => {
        if (result.content) {
            const length = result.content.length;
            console.log(`Depth ${depth}: ${length} characters`);
        } else {
            console.log(`Depth ${depth}: Error or no content`);
        }
    });

    return results;
}

/**
 * Demonstrate comprehensive Search API usage.
 */
async function main(): Promise<void> {
    console.log('🔍 Browser Use Cloud - Search API (BETA)');
    console.log('='.repeat(45));

    console.log('⚠️  Note: This API is in BETA and may change');
    console.log();
    console.log('🎯 Search API Features:');
    console.log('• Real-time website browsing (not cached)');
    console.log('• Deep navigation through multiple pages');
    console.log('• Dynamic content and JavaScript handling');
    console.log('• Multiple result aggregation');
    console.log('• Cost-effective content extraction');

    console.log('\n💰 Pricing:');
    console.log('• Simple Search: 1¢ × depth × websites');
    console.log('• URL Search: 1¢ × depth');
    console.log('• Example: depth=2, 5 websites = 10¢');

    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        let demo = 'news';
        
        if (args.includes('--demo')) {
            const demoIndex = args.indexOf('--demo');
            if (demoIndex + 1 < args.length) {
                demo = args[demoIndex + 1];
            }
        }

        console.log(`\n🔍 Running ${demo} demo(s)...`);

        switch (demo) {
            case 'news':
                await demoNewsSearch();
                break;
            case 'competitive':
                await demoCompetitiveAnalysis();
                break;
            case 'deep':
                await demoDeepWebsiteAnalysis();
                break;
            case 'product':
                await demoProductResearch();
                break;
            case 'realtime':
                await demoRealTimeVsCached();
                break;
            case 'depth':
                await demoSearchDepthComparison();
                break;
            case 'all':
                await demoNewsSearch();
                await demoCompetitiveAnalysis();
                await demoDeepWebsiteAnalysis();
                await demoProductResearch();
                await demoRealTimeVsCached();
                await demoSearchDepthComparison();
                break;
            default:
                console.log(`Unknown demo type: ${demo}. Available: news, competitive, deep, product, realtime, depth, all`);
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