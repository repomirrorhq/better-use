/**
 * Simple example of connecting to browser-use MCP server as a client.
 * 
 * This example demonstrates how to use the MCP client library to connect to
 * a running browser-use MCP server and call its browser automation tools.
 * 
 * Prerequisites:
 * 1. Install required packages:
 *    npm install
 * 
 * 2. Start the browser-use MCP server in a separate terminal:
 *    npm run mcp
 * 
 * 3. Run this client example:
 *    npm run example:mcp-simple-server
 * 
 * This shows the actual MCP protocol flow between a client and the browser-use server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';

async function runSimpleBrowserAutomation(): Promise<void> {
  console.log('✅ Starting browser automation via MCP...');

  // Create stdio transport for the browser-use MCP server
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/mcp/server.js'],
    env: process.env
  });

  // Create client
  const client = new Client(
    {
      name: 'browser-use-ts-simple-client',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  try {
    // Connect to the MCP server
    await client.connect(transport);
    console.log('✅ Connected to browser-use MCP server');

    // List available tools
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];
    console.log(`\n📋 Available tools: ${tools.length}`);
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description}`);
    }

    // Example 1: Navigate to a website
    console.log('\n🌐 Navigating to example.com...');
    const navResult = await client.callTool({
      name: 'browser_navigate',
      arguments: { url: 'https://example.com' }
    });

    // Handle different content types
    const navContent = navResult.content[0];
    if (navContent && 'text' in navContent) {
      console.log(`Result: ${navContent.text}`);
    } else {
      console.log(`Result:`, navContent);
    }

    // Example 2: Get the current browser state
    console.log('\n🔍 Getting browser state...');
    const stateResult = await client.callTool({
      name: 'browser_get_state',
      arguments: { include_screenshot: false }
    });

    // Handle different content types
    const stateContent = stateResult.content[0];
    let state: any;
    if (stateContent && 'text' in stateContent) {
      state = JSON.parse(stateContent.text);
    } else {
      state = JSON.parse(String(stateContent));
    }

    console.log(`Page title: ${state.title}`);
    console.log(`URL: ${state.url}`);
    console.log(`Interactive elements found: ${(state.interactive_elements || []).length}`);

    // Example 3: Open a new tab
    console.log('\n📑 Opening Python.org in a new tab...');
    const newTabResult = await client.callTool({
      name: 'browser_navigate',
      arguments: { url: 'https://python.org', new_tab: true }
    });

    // Handle different content types
    const newTabContent = newTabResult.content[0];
    if (newTabContent && 'text' in newTabContent) {
      console.log(`Result: ${newTabContent.text}`);
    } else {
      console.log(`Result:`, newTabContent);
    }

    // Example 4: List all open tabs
    console.log('\n📋 Listing all tabs...');
    const tabsResult = await client.callTool({
      name: 'browser_list_tabs',
      arguments: {}
    });

    // Handle different content types
    const tabsContent = tabsResult.content[0];
    let tabs: any[];
    if (tabsContent && 'text' in tabsContent) {
      tabs = JSON.parse(tabsContent.text);
    } else {
      tabs = JSON.parse(String(tabsContent));
    }

    for (const tab of tabs) {
      console.log(`  Tab ${tab.index}: ${tab.title} - ${tab.url}`);
    }

    // Example 5: Click on an element
    console.log('\n👆 Looking for clickable elements...');
    const clickStateResult = await client.callTool({
      name: 'browser_get_state',
      arguments: { include_screenshot: false }
    });

    // Handle different content types
    const clickStateContent = clickStateResult.content[0];
    let clickState: any;
    if (clickStateContent && 'text' in clickStateContent) {
      clickState = JSON.parse(clickStateContent.text);
    } else {
      clickState = JSON.parse(String(clickStateContent));
    }

    // Find a link to click
    let linkElement: any = null;
    const elements = clickState.interactive_elements || [];
    for (const elem of elements) {
      if (elem.tag === 'a' && elem.href) {
        linkElement = elem;
        break;
      }
    }

    if (linkElement) {
      const linkText = (linkElement.text || 'unnamed').substring(0, 50);
      console.log(`Clicking on link: ${linkText}...`);
      
      const clickResult = await client.callTool({
        name: 'browser_click',
        arguments: { index: linkElement.index }
      });

      // Handle different content types
      const clickContent = clickResult.content[0];
      if (clickContent && 'text' in clickContent) {
        console.log(`Result: ${clickContent.text}`);
      } else {
        console.log(`Result:`, clickContent);
      }
    } else {
      console.log('No clickable links found on the current page');
    }

    console.log('\n✨ Simple browser automation demo complete!');

  } catch (error) {
    console.error('\n❌ Error during automation:', error);
    console.log('\nMake sure the browser-use MCP server is running:');
    console.log('  npm run mcp');
  } finally {
    // Clean up connection
    try {
      await client.close();
    } catch (error) {
      console.warn('Warning: Failed to close client connection:', error);
    }
  }
}

async function main(): Promise<void> {
  console.log('Browser-Use MCP Client - Simple Example');
  console.log('='.repeat(50));
  console.log('\nConnecting to browser-use MCP server...\n');

  try {
    await runSimpleBrowserAutomation();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure the browser-use MCP server is running: npm run mcp');
    console.log('2. Check that all dependencies are installed: npm install');
    console.log('3. Verify the server is built: npm run build');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to run simple MCP server example:', error);
    process.exit(1);
  });
}