/**
 * Advanced example: Using multiple MCP servers together.
 * 
 * This example demonstrates how to:
 * 1. Connect multiple MCP servers (Gmail + Filesystem) to browser-use
 * 2. Sign up for a new account on a website
 * 3. Save registration details to a file
 * 4. Retrieve the verification link from Gmail
 * 5. Complete the verification process
 */

import { Agent } from '../../src/agent';
import { Controller } from '../../src/controller';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { MCPClient } from '../../src/mcp/client';
import path from 'path';
import os from 'os';

async function main() {
  console.log('Advanced MCP Client Example: Multiple Server Integration');

  // Initialize controller
  const controller = new Controller();

  // Connect to Gmail MCP Server
  // Requires Gmail API credentials - see: https://github.com/GongRzhe/Gmail-MCP-Server#setup
  const gmailEnv: Record<string, string> = {};
  if (process.env.GMAIL_CLIENT_ID) {
    gmailEnv['GMAIL_CLIENT_ID'] = process.env.GMAIL_CLIENT_ID;
  }
  if (process.env.GMAIL_CLIENT_SECRET) {
    gmailEnv['GMAIL_CLIENT_SECRET'] = process.env.GMAIL_CLIENT_SECRET;
  }
  if (process.env.GMAIL_REFRESH_TOKEN) {
    gmailEnv['GMAIL_REFRESH_TOKEN'] = process.env.GMAIL_REFRESH_TOKEN;
  }

  const gmailClient = new MCPClient({
    serverName: 'gmail',
    command: 'npx',
    args: ['gmail-mcp-server'],
    env: gmailEnv
  });

  // Connect to Filesystem MCP Server for saving registration details
  const filesystemClient = new MCPClient({
    serverName: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', path.join(os.homedir(), 'Desktop')]
  });

  try {
    // Connect and register tools from both servers
    console.log('Connecting to Gmail MCP server...');
    await gmailClient.connect();
    await gmailClient.registerToController(controller);

    console.log('Connecting to Filesystem MCP server...');
    await filesystemClient.connect();
    await filesystemClient.registerToController(controller);

    // Create agent with extended system prompt for using multiple MCP servers
    const agent = new Agent({
      task: 'Sign up for a new Anthropic account using the email example@gmail.com, save the registration details to a file',
      llm: new ChatOpenAI({
        model: 'gpt-4.1-mini',
        apiKey: process.env.OPENAI_API_KEY!
      }),
      controller,
      systemMessage: `
You have access to both Gmail and Filesystem tools through MCP servers. When signing up for accounts:

1. Fill out registration forms with the provided email address
2. Use the filesystem tools to create a file called 'anthropic_registration.txt' on the Desktop containing:
   - Email used for registration
   - Timestamp of registration
   - Any username or account details
3. After submitting the registration, use the Gmail MCP tools to check for verification emails
4. Search for recent emails (within the last 5 minutes) from the service you're signing up for
5. Look for verification links or codes in those emails
6. Append the verification details to the registration file
7. Use any verification links or codes found to complete the account setup
8. Update the file with the final account status

Available tools include:
Gmail tools:
- search_emails: Search for emails by query (e.g., "from:noreply@anthropic.com")
- get_email: Get full email content by ID
- list_emails: List recent emails

Filesystem tools:
- read_file: Read content from a file
- write_file: Write content to a file
- list_directory: List files in a directory

Always wait a few seconds after submitting a form before checking Gmail to allow the email to arrive.
      `
    });

    // Run the agent
    console.log('\nRunning agent with multiple MCP servers...');
    const result = await agent.run();

    console.log('\nTask completed!');
    console.log(`Result:`, result.extractedContent);

    if (result.history.usage) {
      console.log('\nUsage Statistics:');
      console.log(`Total tokens: ${result.history.usage.total_tokens}`);
      console.log(`Total cost: $${result.history.usage.total_cost?.toFixed(4) || '0.0000'}`);
    }

  } catch (error) {
    console.error('Error running advanced MCP client:', error);
  } finally {
    // Disconnect both MCP clients
    console.log('\nDisconnecting MCP clients...');
    await gmailClient.disconnect();
    await filesystemClient.disconnect();
  }
}

if (require.main === module) {
  // Prerequisites:
  // 1. Install both MCP servers:
  //    npm install -g gmail-mcp-server
  //    npm install -g @modelcontextprotocol/server-filesystem
  // 2. Set up Gmail API credentials following: https://github.com/GongRzhe/Gmail-MCP-Server#setup
  // 3. Set these environment variables:
  //    export GMAIL_CLIENT_ID="your-client-id"
  //    export GMAIL_CLIENT_SECRET="your-client-secret" 
  //    export GMAIL_REFRESH_TOKEN="your-refresh-token"
  //    export OPENAI_API_KEY="your-openai-api-key"

  main().catch(error => {
    console.error('Failed to run advanced MCP client example:', error);
    process.exit(1);
  });
}