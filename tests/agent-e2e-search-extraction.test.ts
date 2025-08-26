/**
 * End-to-end test for agent search and extraction capabilities
 * Tests the agent's ability to:
 * - Perform web searches
 * - Navigate to search results
 * - Extract structured information from pages
 * - Handle pagination and multiple results
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Agent } from '../src/agent';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { BaseLLM } from '../src/llm/base';
import { HTTPServer } from './test-utils/http-server';

// Mock LLM for controlled testing
class MockSearchLLM extends BaseLLM {
  private stepCount = 0;
  private searchQuery: string;
  private extractionTarget: string;

  constructor(searchQuery: string, extractionTarget: string) {
    super();
    this.searchQuery = searchQuery;
    this.extractionTarget = extractionTarget;
  }

  async chat(messages: any[], options?: any): Promise<any> {
    this.stepCount++;

    // Simulate different steps of search and extraction workflow
    switch (this.stepCount) {
      case 1:
        // Step 1: Navigate to search page
        return {
          content: null,
          action: {
            id: 1,
            type: 'go_to_url',
            param: 'http://localhost:8080/search'
          },
          tool_calls: [{
            id: 'tool_1',
            type: 'function',
            function: {
              name: 'go_to_url',
              arguments: JSON.stringify({ url: 'http://localhost:8080/search' })
            }
          }]
        };

      case 2:
        // Step 2: Enter search query
        return {
          content: null,
          action: {
            id: 2,
            type: 'input_text',
            param: this.searchQuery,
            element_id: 1  // Search input field
          },
          tool_calls: [{
            id: 'tool_2',
            type: 'function',
            function: {
              name: 'input_text',
              arguments: JSON.stringify({ 
                text: this.searchQuery,
                element_id: 1 
              })
            }
          }]
        };

      case 3:
        // Step 3: Click search button
        return {
          content: null,
          action: {
            id: 3,
            type: 'click_element',
            element_id: 2  // Search button
          },
          tool_calls: [{
            id: 'tool_3',
            type: 'function',
            function: {
              name: 'click_element',
              arguments: JSON.stringify({ element_id: 2 })
            }
          }]
        };

      case 4:
        // Step 4: Click on first result
        return {
          content: null,
          action: {
            id: 4,
            type: 'click_element',
            element_id: 3  // First search result link
          },
          tool_calls: [{
            id: 'tool_4',
            type: 'function',
            function: {
              name: 'click_element',
              arguments: JSON.stringify({ element_id: 3 })
            }
          }]
        };

      case 5:
        // Step 5: Extract information
        return {
          content: `Extracted information: ${this.extractionTarget}`,
          action: {
            id: 5,
            type: 'extract_page_content'
          },
          tool_calls: [{
            id: 'tool_5',
            type: 'function',
            function: {
              name: 'extract_page_content',
              arguments: JSON.stringify({})
            }
          }]
        };

      default:
        // Task complete
        return {
          content: 'Task completed successfully',
          action: {
            id: 6,
            type: 'done'
          },
          tool_calls: [{
            id: 'tool_6',
            type: 'function',
            function: {
              name: 'done',
              arguments: JSON.stringify({})
            }
          }]
        };
    }
  }

  supportsImages(): boolean {
    return false;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }
}

describe('Agent E2E Search and Extraction', () => {
  let server: HTTPServer;
  let browserSession: BrowserSession;
  let searchLLM: MockSearchLLM;
  let agent: Agent;

  beforeEach(async () => {
    // Set up HTTP test server
    server = new HTTPServer();
    await server.start();

    // Set up test pages
    server.addRoute('/search', `
      <!DOCTYPE html>
      <html>
      <head><title>Search Engine</title></head>
      <body>
        <h1>Test Search Engine</h1>
        <form action="/results" method="get">
          <input type="text" name="q" id="search-input" placeholder="Enter search query">
          <button type="submit" id="search-button">Search</button>
        </form>
      </body>
      </html>
    `);

    server.addRoute('/results', (req) => {
      const query = new URL(req.url, 'http://localhost').searchParams.get('q');
      return `
        <!DOCTYPE html>
        <html>
        <head><title>Search Results for: ${query}</title></head>
        <body>
          <h1>Search Results</h1>
          <p>Results for: ${query}</p>
          <div class="results">
            <div class="result">
              <a href="/page1" class="result-link">First Result - Best Match</a>
              <p>This is the most relevant result for your query.</p>
            </div>
            <div class="result">
              <a href="/page2" class="result-link">Second Result</a>
              <p>Another relevant result.</p>
            </div>
            <div class="result">
              <a href="/page3" class="result-link">Third Result</a>
              <p>Additional information available here.</p>
            </div>
          </div>
          <div class="pagination">
            <a href="/results?q=${query}&page=2">Next Page</a>
          </div>
        </body>
        </html>
      `;
    });

    server.addRoute('/page1', `
      <!DOCTYPE html>
      <html>
      <head><title>Product Information</title></head>
      <body>
        <h1>Product Details</h1>
        <div class="product-info">
          <h2>Premium Widget X</h2>
          <p class="price">Price: $99.99</p>
          <p class="description">High-quality widget with advanced features.</p>
          <ul class="features">
            <li>Feature 1: Durable construction</li>
            <li>Feature 2: Energy efficient</li>
            <li>Feature 3: 2-year warranty</li>
          </ul>
          <div class="availability">In Stock</div>
        </div>
      </body>
      </html>
    `);

    // Set up browser session
    const profile = new BrowserProfile({
      headless: true,
      browserType: 'chromium'
    });
    browserSession = new BrowserSession(profile);

    // Set up mock LLM
    searchLLM = new MockSearchLLM('Premium Widget X', 'Price: $99.99');

    // Set up agent
    agent = new Agent({
      llm: searchLLM,
      browserSession,
      maxSteps: 10,
      enableRecording: false
    });
  });

  afterEach(async () => {
    if (browserSession) {
      await browserSession.close();
    }
    if (server) {
      await server.stop();
    }
  });

  it('should perform search and extract product information', async () => {
    const task = 'Search for "Premium Widget X" and extract the price information';
    
    const result = await agent.run(task);

    // Verify the agent completed the task
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.extractedInfo).toContain('$99.99');
    
    // Verify the agent navigated through the expected pages
    const history = await agent.getHistory();
    expect(history.steps).toBeGreaterThan(3);
    expect(history.urls).toContain('http://localhost:8080/search');
    expect(history.urls).toContain('http://localhost:8080/results');
    expect(history.urls).toContain('http://localhost:8080/page1');
  });

  it('should handle search with no results gracefully', async () => {
    // Set up no results page
    server.addRoute('/no-results', `
      <!DOCTYPE html>
      <html>
      <head><title>No Results Found</title></head>
      <body>
        <h1>No Results Found</h1>
        <p>Sorry, no results match your search query.</p>
        <a href="/search">Try another search</a>
      </body>
      </html>
    `);

    const noResultsLLM = new MockSearchLLM('NonexistentProduct', 'No results found');
    const noResultsAgent = new Agent({
      llm: noResultsLLM,
      browserSession,
      maxSteps: 10,
      enableRecording: false
    });

    const task = 'Search for "NonexistentProduct" and report if found';
    const result = await noResultsAgent.run(task);

    expect(result).toBeDefined();
    expect(result.message).toContain('No results');
  });

  it('should extract structured data from search results', async () => {
    // Set up a page with structured data
    server.addRoute('/structured', `
      <!DOCTYPE html>
      <html>
      <head><title>Product Catalog</title></head>
      <body>
        <h1>Product Catalog</h1>
        <table class="products">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Widget A</td>
              <td>$49.99</td>
              <td>In Stock</td>
            </tr>
            <tr>
              <td>Widget B</td>
              <td>$79.99</td>
              <td>Low Stock</td>
            </tr>
            <tr>
              <td>Widget C</td>
              <td>$99.99</td>
              <td>Out of Stock</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `);

    const structuredLLM = new MockSearchLLM('product catalog', 'table data extracted');
    const structuredAgent = new Agent({
      llm: structuredLLM,
      browserSession,
      maxSteps: 10,
      enableRecording: false,
      outputSchema: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'string' },
                availability: { type: 'string' }
              }
            }
          }
        }
      }
    });

    const task = 'Navigate to product catalog and extract all product information';
    const result = await structuredAgent.run(task);

    expect(result).toBeDefined();
    expect(result.structuredOutput).toBeDefined();
    expect(result.structuredOutput.products).toBeInstanceOf(Array);
  });

  it('should handle pagination in search results', async () => {
    let pageRequests = 0;
    
    server.addRoute('/paginated-results', (req) => {
      const url = new URL(req.url, 'http://localhost');
      const page = parseInt(url.searchParams.get('page') || '1');
      pageRequests++;
      
      return `
        <!DOCTYPE html>
        <html>
        <head><title>Results - Page ${page}</title></head>
        <body>
          <h1>Search Results - Page ${page}</h1>
          <div class="results">
            ${Array.from({ length: 10 }, (_, i) => `
              <div class="result">
                <a href="/item${(page - 1) * 10 + i + 1}">
                  Item ${(page - 1) * 10 + i + 1}
                </a>
              </div>
            `).join('')}
          </div>
          <div class="pagination">
            ${page > 1 ? `<a href="/paginated-results?page=${page - 1}">Previous</a>` : ''}
            <span>Page ${page} of 5</span>
            ${page < 5 ? `<a href="/paginated-results?page=${page + 1}">Next</a>` : ''}
          </div>
        </body>
        </html>
      `;
    });

    const paginationLLM = new MockSearchLLM('items', 'multiple pages processed');
    const paginationAgent = new Agent({
      llm: paginationLLM,
      browserSession,
      maxSteps: 20,
      enableRecording: false
    });

    const task = 'Navigate through all pages of search results and count total items';
    const result = await paginationAgent.run(task);

    expect(result).toBeDefined();
    expect(pageRequests).toBeGreaterThan(1); // Should have navigated multiple pages
  });

  it('should handle dynamic content loading', async () => {
    server.addRoute('/dynamic', `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dynamic Content</title>
        <script>
          // Simulate dynamic content loading
          setTimeout(() => {
            document.getElementById('content').innerHTML = 
              '<div class="loaded">Dynamic content loaded!</div>';
          }, 1000);
        </script>
      </head>
      <body>
        <h1>Dynamic Page</h1>
        <div id="content">
          <div class="loading">Loading...</div>
        </div>
      </body>
      </html>
    `);

    const dynamicLLM = new MockSearchLLM('dynamic content', 'content loaded');
    const dynamicAgent = new Agent({
      llm: dynamicLLM,
      browserSession,
      maxSteps: 10,
      enableRecording: false,
      waitForStableDOM: true
    });

    const task = 'Navigate to dynamic page and wait for content to load';
    const result = await dynamicAgent.run(task);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});