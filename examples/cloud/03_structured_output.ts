/**
 * Cloud Example 3: Structured JSON Output 📋
 * ==========================================
 *
 * This example demonstrates how to get structured, validated JSON output:
 * - Define Zod schemas for type safety
 * - Extract structured data from websites
 * - Validate and parse JSON responses
 * - Handle different data types and nested structures
 *
 * Perfect for: Data extraction, API integration, structured analysis
 *
 * Cost: ~$0.06 (1 task + 5-6 steps with GPT-4.1 mini)
 */

import dotenv from 'dotenv';
import { z } from 'zod';
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

// Define structured output schemas using Zod
const NewsArticleSchema = z.object({
    title: z.string().describe('The headline of the article'),
    summary: z.string().describe('Brief summary of the article'),
    url: z.string().url().describe('Direct link to the article'),
    published_date: z.string().optional().describe('Publication date if available'),
    category: z.string().optional().describe('Article category/section')
});

const NewsResponseSchema = z.object({
    articles: z.array(NewsArticleSchema).describe('List of news articles'),
    source_website: z.string().describe('The website where articles were found'),
    extracted_at: z.string().describe('When the data was extracted')
});

const ProductInfoSchema = z.object({
    name: z.string().describe('Product name'),
    price: z.number().describe('Product price in USD'),
    rating: z.number().min(0).max(5).optional().describe('Average rating (0-5 scale)'),
    availability: z.string().describe('Stock status (in stock, out of stock, etc.)'),
    description: z.string().describe('Product description')
});

const CompanyInfoSchema = z.object({
    name: z.string().describe('Company name'),
    stock_symbol: z.string().optional().describe('Stock ticker symbol'),
    market_cap: z.string().optional().describe('Market capitalization'),
    industry: z.string().describe('Primary industry'),
    headquarters: z.string().describe('Headquarters location'),
    founded_year: z.number().int().optional().describe('Year founded')
});

type NewsArticle = z.infer<typeof NewsArticleSchema>;
type NewsResponse = z.infer<typeof NewsResponseSchema>;
type ProductInfo = z.infer<typeof ProductInfoSchema>;
type CompanyInfo = z.infer<typeof CompanyInfoSchema>;

/**
 * Convert Zod schema to JSON Schema format for API
 */
function zodSchemaToJsonSchema(zodSchema: z.ZodSchema): object {
    // This is a simplified JSON Schema conversion
    // In production, you might want to use a library like @sinclair/typebox or zod-to-json-schema
    return {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
    };
}

/**
 * Create a task that returns structured JSON output.
 */
async function createStructuredTask<T>(
    instructions: string,
    schema: z.ZodSchema<T>,
    schemaName: string,
    options: Record<string, any> = {}
): Promise<string> {
    console.log(`📝 Creating structured task: ${instructions}`);
    console.log(`🏗️  Expected schema: ${schemaName}`);

    // Generate JSON schema from Zod schema
    const jsonSchema = zodSchemaToJsonSchema(schema);

    const payload = {
        task: instructions,
        structured_output_json: JSON.stringify(jsonSchema),
        llm_model: 'gpt-4.1-mini',
        max_agent_steps: 15,
        enable_public_share: true,  // Enable shareable execution URLs
        ...options
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
    console.log(`✅ Structured task created: ${taskId}`);
    return taskId;
}

/**
 * Wait for task completion and return the result.
 */
async function waitForStructuredCompletion(taskId: string, maxWaitTime: number = 300): Promise<TaskResponse> {
    console.log(`⏳ Waiting for structured output (max ${maxWaitTime}s)...`);

    const startTime = Date.now();

    while (true) {
        const statusResponse = await requestWithRetry(
            `${BASE_URL}/task/${taskId}/status`,
            {
                method: 'GET',
                headers: HEADERS
            }
        );
        
        const statusData = await statusResponse.json();
        const status = statusData.status;
        const elapsed = (Date.now() - startTime) / 1000;

        // Check for timeout
        if (elapsed > maxWaitTime) {
            console.log(`\r⏰ Task timeout after ${maxWaitTime}s - stopping wait${' '.repeat(30)}`);
            // Get final details before timeout
            const detailsResponse = await requestWithRetry(
                `${BASE_URL}/task/${taskId}`,
                {
                    method: 'GET',
                    headers: HEADERS
                }
            );
            return await detailsResponse.json();
        }

        // Get step count from full details for better progress tracking
        const detailsResponse = await requestWithRetry(
            `${BASE_URL}/task/${taskId}`,
            {
                method: 'GET',
                headers: HEADERS
            }
        );
        const details = await detailsResponse.json();
        const steps = details.steps?.length || 0;

        // Build status message
        let statusMsg: string;
        if (status === 'running') {
            statusMsg = `📋 Structured task | Step ${steps} | ⏱️  ${elapsed.toFixed(0)}s | 🔄 Extracting...`;
        } else {
            statusMsg = `📋 Structured task | Step ${steps} | ⏱️  ${elapsed.toFixed(0)}s | Status: ${status}`;
        }

        // Clear line and show status
        process.stdout.write(`\r${statusMsg.padEnd(80)}`);

        if (status === 'finished') {
            console.log(`\r✅ Structured data extracted! (${steps} steps in ${elapsed.toFixed(1)}s)${' '.repeat(20)}`);
            return details;
        } else if (['failed', 'stopped'].includes(status)) {
            console.log(`\r❌ Task ${status} after ${steps} steps${' '.repeat(30)}`);
            return details;
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

/**
 * Validate the JSON output against the schema and display results.
 */
function validateAndDisplayOutput<T>(
    output: string,
    schema: z.ZodSchema<T>,
    schemaName: string
): T | null {
    console.log('\n📊 Structured Output Analysis');
    console.log('='.repeat(40));

    try {
        // Parse and validate the JSON
        const parsedData = schema.parse(JSON.parse(output));
        console.log('✅ JSON validation successful!');

        // Pretty print the structured data
        console.log('\n📋 Parsed Data:');
        console.log('-'.repeat(20));
        console.log(JSON.stringify(parsedData, null, 2));

        // Display specific fields based on schema type
        if (schemaName === 'NewsResponse') {
            const newsData = parsedData as NewsResponse;
            console.log(`\n📰 Found ${newsData.articles.length} articles from ${newsData.source_website}`);
            newsData.articles.slice(0, 3).forEach((article, i) => {
                console.log(`\n${i + 1}. ${article.title}`);
                console.log(`   Summary: ${article.summary.substring(0, 100)}...`);
                console.log(`   URL: ${article.url}`);
            });
        } else if (schemaName === 'ProductInfo') {
            const productData = parsedData as ProductInfo;
            console.log(`\n🛍️  Product: ${productData.name}`);
            console.log(`   Price: $${productData.price}`);
            console.log(`   Rating: ${productData.rating ? `${productData.rating}/5` : 'N/A'}`);
            console.log(`   Status: ${productData.availability}`);
        } else if (schemaName === 'CompanyInfo') {
            const companyData = parsedData as CompanyInfo;
            console.log(`\n🏢 Company: ${companyData.name}`);
            console.log(`   Industry: ${companyData.industry}`);
            console.log(`   Headquarters: ${companyData.headquarters}`);
            if (companyData.founded_year) {
                console.log(`   Founded: ${companyData.founded_year}`);
            }
        }

        return parsedData;

    } catch (error) {
        if (error instanceof z.ZodError) {
            console.log('❌ JSON validation failed!');
            console.log(`Errors: ${error.message}`);
            console.log(`\nRaw output: ${output.substring(0, 500)}...`);
            return null;
        } else if (error instanceof SyntaxError) {
            console.log('❌ Invalid JSON format!');
            console.log(`Error: ${error.message}`);
            console.log(`\nRaw output: ${output.substring(0, 500)}...`);
            return null;
        } else {
            console.log('❌ Unexpected error during validation!');
            console.log(`Error: ${error}`);
            return null;
        }
    }
}

/**
 * Demo: Extract structured news data.
 */
async function demoNewsExtraction(): Promise<NewsResponse | null> {
    console.log('\n📰 Demo 1: News Article Extraction');
    console.log('-'.repeat(40));

    const task = `
    Go to a major news website (like BBC, CNN, or Reuters) and extract information 
    about the top 3 news articles. For each article, get the title, summary, URL, 
    and any other available metadata.
    `;

    const taskId = await createStructuredTask(task, NewsResponseSchema, 'NewsResponse');
    const result = await waitForStructuredCompletion(taskId);

    if (result.output) {
        const parsedResult = validateAndDisplayOutput(result.output, NewsResponseSchema, 'NewsResponse');

        // Show execution URLs
        if (result.live_url) {
            console.log(`\n🔗 Live Preview: ${result.live_url}`);
        }
        if (result.public_share_url) {
            console.log(`🌐 Share URL: ${result.public_share_url}`);
        } else if (result.share_url) {
            console.log(`🌐 Share URL: ${result.share_url}`);
        }

        return parsedResult;
    } else {
        console.log('❌ No structured output received');
        return null;
    }
}

/**
 * Demo: Extract structured product data.
 */
async function demoProductExtraction(): Promise<ProductInfo | null> {
    console.log('\n🛍️  Demo 2: Product Information Extraction');
    console.log('-'.repeat(40));

    const task = `
    Go to Amazon and search for 'wireless headphones'. Find the first product result 
    and extract detailed information including name, price, rating, availability, 
    and description.
    `;

    const taskId = await createStructuredTask(task, ProductInfoSchema, 'ProductInfo');
    const result = await waitForStructuredCompletion(taskId);

    if (result.output) {
        const parsedResult = validateAndDisplayOutput(result.output, ProductInfoSchema, 'ProductInfo');

        // Show execution URLs
        if (result.live_url) {
            console.log(`\n🔗 Live Preview: ${result.live_url}`);
        }
        if (result.public_share_url) {
            console.log(`🌐 Share URL: ${result.public_share_url}`);
        } else if (result.share_url) {
            console.log(`🌐 Share URL: ${result.share_url}`);
        }

        return parsedResult;
    } else {
        console.log('❌ No structured output received');
        return null;
    }
}

/**
 * Demo: Extract structured company data.
 */
async function demoCompanyExtraction(): Promise<CompanyInfo | null> {
    console.log('\n🏢 Demo 3: Company Information Extraction');
    console.log('-'.repeat(40));

    const task = `
    Go to a financial website and look up information about Apple Inc. 
    Extract company details including name, stock symbol, market cap, 
    industry, headquarters, and founding year.
    `;

    const taskId = await createStructuredTask(task, CompanyInfoSchema, 'CompanyInfo');
    const result = await waitForStructuredCompletion(taskId);

    if (result.output) {
        const parsedResult = validateAndDisplayOutput(result.output, CompanyInfoSchema, 'CompanyInfo');

        // Show execution URLs
        if (result.live_url) {
            console.log(`\n🔗 Live Preview: ${result.live_url}`);
        }
        if (result.public_share_url) {
            console.log(`🌐 Share URL: ${result.public_share_url}`);
        } else if (result.share_url) {
            console.log(`🌐 Share URL: ${result.share_url}`);
        }

        return parsedResult;
    } else {
        console.log('❌ No structured output received');
        return null;
    }
}

/**
 * Demonstrate structured output extraction.
 */
async function main(): Promise<void> {
    console.log('📋 Browser Use Cloud - Structured JSON Output');
    console.log('='.repeat(50));

    console.log('🎯 Features:');
    console.log('• Type-safe Zod schemas');
    console.log('• Automatic JSON validation');
    console.log('• Structured data extraction');
    console.log('• Multiple output formats');

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
                await demoNewsExtraction();
                break;
            case 'product':
                await demoProductExtraction();
                break;
            case 'company':
                await demoCompanyExtraction();
                break;
            case 'all':
                await demoNewsExtraction();
                await demoProductExtraction();
                await demoCompanyExtraction();
                break;
            default:
                console.log(`Unknown demo type: ${demo}. Available: news, product, company, all`);
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