/**
 * Simple example of using MCP client with browser-use.
 * 
 * This example shows how to connect to an MCP server and use its tools with an agent.
 */

import { Agent } from '../../src/agent';
import { Controller } from '../../src/controller';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { MCPClient } from '../../src/mcp/client';
import path from 'path';
import os from 'os';

async function main() {
  // Initialize controller
  const controller = new Controller();

  // Connect to a filesystem MCP server
  // This server provides tools to read/write files in a directory
  const mcpClient = new MCPClient({
    serverName: 'filesystem',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem', path.join(os.homedir(), 'Desktop')]
  });

  // Connect and register MCP tools
  await mcpClient.connect();
  await mcpClient.registerToController(controller);

  // Create agent with MCP-enabled controller
  const agent = new Agent({
    task: 'List all files on the Desktop and read the content of any .txt files you find',
    llm: new ChatOpenAI({
      model: 'gpt-4-turbo',
      apiKey: process.env.OPENAI_API_KEY!
    }),
    controller,
  });

  // Run the agent - it now has access to filesystem tools
  await agent.run();

  // Disconnect when done
  await mcpClient.disconnect();
}

if (require.main === module) {
  main().catch(console.error);
}