/**
 * Search URL API Example
 * 
 * This example shows how to use the Browser Use API to extract specific
 * content from a given URL based on your query.
 * 
 * Usage:
 *     // Copy this function and customize the parameters
 *     const result = await searchUrl("https://example.com", "what to find", 2);
 */

import axios, { AxiosError } from 'axios';

interface SearchUrlResponse {
  url: string;
  content: string;
}

export async function searchUrl(
  url: string, 
  query: string, 
  depth: number = 2
): Promise<SearchUrlResponse | null> {
  // Validate API key exists
  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) {
    console.log('❌ Error: BROWSER_USE_API_KEY environment variable is not set.');
    console.log('Please set your API key: export BROWSER_USE_API_KEY="your_api_key_here"');
    return null;
  }

  const payload = { url, query, depth };

  const headers = { 
    Authorization: `Bearer ${apiKey}`, 
    'Content-Type': 'application/json' 
  };

  console.log('Testing Search URL API...');
  console.log(`URL: ${url}`);
  console.log(`Query: ${query}`);
  console.log(`Depth: ${depth}`);
  console.log('-'.repeat(50));

  try {
    const response = await axios.post<SearchUrlResponse>(
      'https://api.browser-use.com/api/v1/search-url',
      payload,
      {
        headers,
        timeout: 300000, // 5 minutes
      }
    );

    if (response.status === 200) {
      const result = response.data;
      console.log('✅ Success!');
      console.log(`URL processed: ${result.url || 'N/A'}`);
      console.log(`Content: ${result.content || ''}`);
      return result;
    }
  } catch (error) {
    if (error instanceof AxiosError) {
      console.log(`❌ Error ${error.response?.status}: ${error.response?.data || error.message}`);
    } else {
      console.log(`❌ Exception: ${String(error)}`);
    }
    return null;
  }
}

async function main() {
  // Example 1: Extract pricing info
  await searchUrl('https://browser-use.com/#pricing', 'Find pricing information for Browser Use');

  // Example 2: News article analysis
  // await searchUrl("https://techcrunch.com", "latest startup funding news", 3);

  // Example 3: Product research
  // await searchUrl("https://github.com/browser-use/browser-use", "installation instructions", 2);
}

if (require.main === module) {
  main().catch(console.error);
}