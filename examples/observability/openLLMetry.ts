/**
 * Example of integrating OpenLLMetry/Traceloop for observability.
 * 
 * This shows how to add monitoring and tracing to browser-use agents.
 */

import { Agent } from '../../src/agent';

// Test if @traceloop/node-server-sdk is installed
let Traceloop: any;
try {
  const traceloop = await import('@traceloop/node-server-sdk');
  Traceloop = traceloop.default || traceloop;
} catch (error) {
  console.log('Traceloop is not installed. Install with: npm install @traceloop/node-server-sdk');
  process.exit(1);
}

const apiKey = process.env.TRACELOOP_API_KEY;
if (!apiKey) {
  console.log('TRACELOOP_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize Traceloop for observability
Traceloop.init({
  apiKey,
  disableBatch: true,
});

async function main() {
  const agent = new Agent({
    task: 'Find the founders of browser-use'
  });
  
  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}