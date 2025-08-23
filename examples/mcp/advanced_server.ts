/**
 * Advanced example of building an AI assistant that uses browser-use MCP server.
 * 
 * This example shows how to build a more sophisticated MCP client that:
 * - Connects to multiple MCP servers (browser-use + filesystem)
 * - Orchestrates complex multi-step workflows
 * - Handles errors and retries
 * - Provides a conversational interface
 * 
 * Prerequisites:
 * 1. Install required packages:
 *    npm install -g @modelcontextprotocol/server-filesystem
 * 
 * 2. Start the browser-use MCP server:
 *    npm run mcp
 * 
 * 3. Run this example:
 *    npm run example:mcp-advanced-server
 * 
 * This demonstrates real-world usage patterns for the MCP protocol.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Tool, TextContent, CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';

interface TaskResult {
  success: boolean;
  data: any;
  error?: string;
  timestamp: Date;
}

class AIAssistant {
  private servers: Map<string, Client> = new Map();
  private tools: Map<string, Tool> = new Map();
  private history: TaskResult[] = [];

  async connectServer(name: string, command: string, args: string[], env?: Record<string, string>): Promise<void> {
    console.log(`\n🔌 Connecting to ${name} server...`);

    try {
      // Create stdio transport
      const transport = new StdioClientTransport({
        command,
        args,
        env: { ...process.env, ...env }
      });

      // Create client
      const client = new Client(
        {
          name: `browser-use-ts-${name}-client`,
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Connect
      await client.connect(transport);
      this.servers.set(name, client);

      // Discover tools
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools || [];
      
      for (const tool of tools) {
        // Prefix tool names with server name to avoid conflicts
        const prefixedName = `${name}.${tool.name}`;
        this.tools.set(prefixedName, tool);
        console.log(`  ✓ Discovered: ${prefixedName}`);
      }

      console.log(`✅ Connected to ${name} with ${tools.length} tools`);

    } catch (error) {
      console.error(`❌ Failed to connect to ${name}:`, error);
      throw error;
    }
  }

  async disconnectAll(): Promise<void> {
    console.log('\n📴 Disconnecting from all servers...');
    for (const [name, client] of this.servers.entries()) {
      try {
        await client.close();
        console.log(`📴 Disconnected from ${name}`);
      } catch (error) {
        console.warn(`⚠️ Error disconnecting from ${name}:`, error);
      }
    }
    this.servers.clear();
    this.tools.clear();
  }

  async callTool(toolName: string, arguments_: Record<string, any>): Promise<TaskResult> {
    const timestamp = new Date();

    // Parse server and tool name
    if (!toolName.includes('.')) {
      const result: TaskResult = {
        success: false,
        data: null,
        error: "Invalid tool name format. Use 'server.tool'",
        timestamp
      };
      this.history.push(result);
      return result;
    }

    const [serverName, actualToolName] = toolName.split('.', 2);

    // Check if server is connected
    const client = this.servers.get(serverName);
    if (!client) {
      const result: TaskResult = {
        success: false,
        data: null,
        error: `Server '${serverName}' not connected`,
        timestamp
      };
      this.history.push(result);
      return result;
    }

    // Call the tool
    try {
      const result = await client.callTool({
        name: actualToolName,
        arguments: arguments_
      });

      // Extract text content
      const textContent = result.content
        .filter((c): c is TextContent => c.type === 'text')
        .map(c => c.text);
      
      const data = textContent.length > 0 ? textContent[0] : JSON.stringify(result.content);

      const taskResult: TaskResult = {
        success: true,
        data,
        timestamp
      };
      
      this.history.push(taskResult);
      return taskResult;

    } catch (error) {
      const errorResult: TaskResult = {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : String(error),
        timestamp
      };
      
      this.history.push(errorResult);
      return errorResult;
    }
  }

  async searchAndSave(query: string, outputFile: string): Promise<TaskResult> {
    console.log(`\n🔍 Searching for: ${query}`);

    // Step 1: Navigate to search engine
    console.log('  1️⃣ Opening DuckDuckGo...');
    const navResult = await this.callTool('browser.browser_navigate', { 
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` 
    });
    
    if (!navResult.success) {
      return navResult;
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page load

    // Step 2: Get search results
    console.log('  2️⃣ Extracting search results...');
    const extractResult = await this.callTool('browser.browser_extract_content', {
      query: 'Extract the top 5 search results with titles and descriptions',
      extract_links: true
    });

    if (!extractResult.success) {
      return extractResult;
    }

    // Step 3: Save to file (if filesystem server is connected)
    if (this.servers.has('filesystem')) {
      console.log(`  3️⃣ Saving results to ${outputFile}...`);
      const saveResult = await this.callTool('filesystem.write_file', {
        path: outputFile,
        content: `Search Query: ${query}\n\nResults:\n${extractResult.data}`
      });
      
      if (saveResult.success) {
        console.log(`  ✅ Results saved to ${outputFile}`);
      }
    } else {
      console.log('  ⚠️ Filesystem server not connected, skipping save');
    }

    return extractResult;
  }

  async monitorPageChanges(url: string, duration: number = 10, interval: number = 2): Promise<TaskResult> {
    console.log(`\n📊 Monitoring ${url} for ${duration} seconds...`);

    // Navigate to page
    await this.callTool('browser.browser_navigate', { url });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const changes: Array<{
      timestamp: string;
      title: string;
      elementCount: number;
    }> = [];
    
    const startTime = Date.now();

    while ((Date.now() - startTime) / 1000 < duration) {
      // Get current state
      const stateResult = await this.callTool('browser.browser_get_state', { 
        include_screenshot: false 
      });

      if (stateResult.success) {
        try {
          const state = JSON.parse(stateResult.data);
          changes.push({
            timestamp: new Date().toISOString(),
            title: state.title || '',
            elementCount: (state.interactive_elements || []).length
          });
          console.log(`  📸 Captured state at ${changes[changes.length - 1].timestamp}`);
        } catch (e) {
          console.warn('  ⚠️ Failed to parse state JSON');
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }

    return {
      success: true,
      data: changes,
      timestamp: new Date()
    };
  }

  async fillFormWorkflow(formUrl: string, formData: Record<string, string>): Promise<TaskResult> {
    console.log(`\n📝 Form filling workflow for ${formUrl}`);

    // Step 1: Navigate to form
    console.log('  1️⃣ Navigating to form...');
    const navResult = await this.callTool('browser.browser_navigate', { url: formUrl });
    if (!navResult.success) {
      return navResult;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Get form elements
    console.log('  2️⃣ Analyzing form elements...');
    const stateResult = await this.callTool('browser.browser_get_state', { 
      include_screenshot: false 
    });

    if (!stateResult.success) {
      return stateResult;
    }

    let state: any;
    try {
      state = JSON.parse(stateResult.data);
    } catch (e) {
      return {
        success: false,
        data: null,
        error: 'Failed to parse browser state',
        timestamp: new Date()
      };
    }

    // Step 3: Fill form fields
    console.log('  3️⃣ Filling form fields...');
    const filledFields: string[] = [];

    for (const element of state.interactive_elements || []) {
      // Look for input fields
      if (['input', 'textarea'].includes(element.tag)) {
        // Try to match field by placeholder or nearby text
        for (const [fieldName, fieldValue] of Object.entries(formData)) {
          const elementText = JSON.stringify(element).toLowerCase();
          if (elementText.includes(fieldName.toLowerCase())) {
            console.log(`    ✏️ Filling ${fieldName}...`);
            const typeResult = await this.callTool('browser.browser_type', {
              index: element.index,
              text: fieldValue
            });
            
            if (typeResult.success) {
              filledFields.push(fieldName);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            break;
          }
        }
      }
    }

    return {
      success: true,
      data: { filledFields, formData, url: formUrl },
      timestamp: new Date()
    };
  }
}

async function main(): Promise<void> {
  console.log('Browser-Use MCP Client - Advanced Example');
  console.log('='.repeat(50));

  const assistant = new AIAssistant();

  try {
    // Connect to browser-use MCP server
    await assistant.connectServer('browser', 'node', ['dist/mcp/server.js']);

    // Optionally connect to filesystem server
    // Note: Uncomment to enable file operations
    // await assistant.connectServer(
    //     'filesystem',
    //     'npx',
    //     ['@modelcontextprotocol/server-filesystem', '.']
    // );

    console.log('\n' + '='.repeat(50));
    console.log('Starting demonstration workflows...');
    console.log('='.repeat(50));

    // Demo 1: Search and extract
    console.log('\n📌 Demo 1: Web Search and Extraction');
    const searchResult = await assistant.searchAndSave(
      'MCP protocol browser automation',
      'search_results.txt'
    );
    console.log(`Search completed: ${searchResult.success ? '✅' : '❌'}`);

    // Demo 2: Multi-tab comparison
    console.log('\n📌 Demo 2: Multi-tab News Comparison');
    const newsSites: Array<[string, string]> = [
      ['BBC News', 'https://bbc.com/news'],
      ['CNN', 'https://cnn.com'],
      ['Reuters', 'https://reuters.com']
    ];

    for (const [i, [name, url]] of newsSites.entries()) {
      console.log(`\n  📰 Opening ${name}...`);
      await assistant.callTool('browser.browser_navigate', { 
        url, 
        new_tab: i > 0 
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // List all tabs
    const tabsResult = await assistant.callTool('browser.browser_list_tabs', {});
    if (tabsResult.success) {
      try {
        const tabs = JSON.parse(tabsResult.data);
        console.log(`\n  📑 Opened ${tabs.length} news sites:`);
        for (const tab of tabs) {
          console.log(`    - Tab ${tab.index}: ${tab.title}`);
        }
      } catch (e) {
        console.warn('  ⚠️ Failed to parse tabs data');
      }
    }

    // Demo 3: Form filling
    console.log('\n📌 Demo 3: Automated Form Filling');
    const formResult = await assistant.fillFormWorkflow(
      'https://httpbin.org/forms/post',
      {
        custname: 'AI Assistant',
        custtel: '555-0123',
        custemail: 'ai@example.com',
        comments: 'Testing MCP browser automation'
      }
    );
    
    if (formResult.success) {
      console.log(`  ✅ Filled ${formResult.data.filledFields.length} fields`);
    }

    // Demo 4: Page monitoring
    console.log('\n📌 Demo 4: Dynamic Page Monitoring');
    const monitorResult = await assistant.monitorPageChanges('https://time.is/', 10, 3);
    if (monitorResult.success) {
      console.log(`  📊 Collected ${monitorResult.data.length} snapshots`);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Session Summary');
    console.log('='.repeat(50));

    const successCount = assistant.history.filter(r => r.success).length;
    const totalCount = assistant.history.length;

    console.log(`Total operations: ${totalCount}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${totalCount - successCount}`);
    console.log(`Success rate: ${totalCount > 0 ? (successCount / totalCount * 100).toFixed(1) : 0}%`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    // Always disconnect
    console.log('\n🧹 Cleaning up...');
    await assistant.disconnectAll();
    console.log('✨ Demo complete!');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to run advanced MCP server example:', error);
    process.exit(1);
  });
}