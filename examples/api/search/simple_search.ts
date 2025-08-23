/**
 * Simple Search API Example
 * 
 * This example shows how to use the Browser Use API to search and extract
 * content from multiple websites based on a query.
 * 
 * Usage:
 *     // Copy this function and customize the parameters
 *     const result = await simpleSearch("your search query", 5, 2);
 */

import axios, { AxiosError } from 'axios';

interface SearchResult {
  url: string;
  content: string;
}

interface SimpleSearchResponse {
  results: SearchResult[];
}

export async function simpleSearch(
  query: string, 
  maxWebsites: number = 5, 
  depth: number = 2
): Promise<SimpleSearchResponse | null> {
  // Validate API key exists
  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) {
    console.log('❌ Error: BROWSER_USE_API_KEY environment variable is not set.');
    console.log('Please set your API key: export BROWSER_USE_API_KEY="your_api_key_here"');
    return null;
  }

  const payload = { 
    query, 
    max_websites: maxWebsites, 
    depth 
  };

  const headers = { 
    Authorization: `Bearer ${apiKey}`, 
    'Content-Type': 'application/json' 
  };

  console.log('Testing Simple Search API...');
  console.log(`Query: ${query}`);
  console.log(`Max websites: ${maxWebsites}`);
  console.log(`Depth: ${depth}`);
  console.log('-'.repeat(50));

  try {
    const response = await axios.post<SimpleSearchResponse>(
      'https://api.browser-use.com/api/v1/simple-search',
      payload,
      {
        headers,
        timeout: 300000, // 5 minutes
      }
    );

    if (response.status === 200) {
      const result = response.data;
      console.log('✅ Success!');
      console.log(`Results: ${result.results?.length || 0} websites processed`);
      
      result.results?.slice(0, 2).forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.url || 'N/A'}`);
        console.log(`   Content: ${item.content || ''}`);
      });
      
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
  // Example 1: Basic search
  await simpleSearch('latest AI news');

  // Example 2: Custom parameters
  // await simpleSearch("python web scraping", 3, 3);

  // Example 3: Research query
  // await simpleSearch("climate change solutions 2024", 7, 2);
}

if (require.main === module) {
  main().catch(console.error);
}