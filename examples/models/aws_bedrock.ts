/**
 * AWS Bedrock Examples
 *
 * This file demonstrates how to use AWS Bedrock models with browser-use.
 * We provide examples for both Anthropic Claude and general AWS Bedrock models.
 *
 * Requirements:
 * - AWS credentials configured via environment variables
 * - AWS SDK installed: npm install @aws-sdk/client-bedrock-runtime
 * - Access to AWS Bedrock models in your region
 */

import { Agent } from '../../src/agent';
import { ChatAWSBedrock } from '../../src/llm/providers/aws';
import { BrowserSession } from '../../src/browser/session';

async function exampleAnthropicBedrock(): Promise<void> {
  console.log('🔹 AWS Bedrock with Anthropic Claude Example');

  // Initialize with Anthropic Claude via AWS Bedrock
  const llm = new ChatAWSBedrock({
    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    region: 'us-east-1',
    temperature: 0.7,
  });

  console.log(`Model: ${llm.modelId}`);
  console.log(`Provider: AWS Bedrock (Anthropic)`);

  // Create browser session
  const browserSession = new BrowserSession();
  await browserSession.start();

  try {
    // Create agent
    const agent = new Agent({
      task: "Navigate to google.com and search for 'AWS Bedrock pricing'",
      llm,
      browserSession,
    });

    console.log("Task: Navigate to google.com and search for 'AWS Bedrock pricing'");

    // Run the agent
    const result = await agent.run(2);
    console.log(`Result: ${result.history.length} steps completed`);
    
    if (result.usage) {
      console.log(`Token Usage: ${result.usage.input_tokens} input, ${result.usage.output_tokens} output`);
      if (result.usage.total_cost) {
        console.log(`Total Cost: $${result.usage.total_cost.toFixed(4)}`);
      }
    }
  } finally {
    await browserSession.stop();
  }
}

async function exampleGeneralBedrock(): Promise<void> {
  console.log('\n🔹 AWS Bedrock with Meta Llama Example');

  // Initialize with any AWS Bedrock model (using Meta Llama as example)
  const llm = new ChatAWSBedrock({
    modelId: 'us.meta.llama4-maverick-17b-instruct-v1:0',
    region: 'us-east-1',
    temperature: 0.5,
  });

  console.log(`Model: ${llm.modelId}`);
  console.log(`Provider: AWS Bedrock (Meta)`);

  // Create browser session
  const browserSession = new BrowserSession();
  await browserSession.start();

  try {
    // Create agent
    const agent = new Agent({
      task: 'Go to github.com and find the most popular Python repository',
      llm,
      browserSession,
    });

    console.log('Task: Go to github.com and find the most popular Python repository');

    // Run the agent
    const result = await agent.run(2);
    console.log(`Result: ${result.history.length} steps completed`);
    
    if (result.usage) {
      console.log(`Token Usage: ${result.usage.input_tokens} input, ${result.usage.output_tokens} output`);
      if (result.usage.total_cost) {
        console.log(`Total Cost: $${result.usage.total_cost.toFixed(4)}`);
      }
    }
  } finally {
    await browserSession.stop();
  }
}

async function main(): Promise<void> {
  console.log('🚀 AWS Bedrock Examples');
  console.log('='.repeat(40));

  console.log('Make sure you have AWS credentials configured:');
  console.log('export AWS_ACCESS_KEY_ID=your_key');
  console.log('export AWS_SECRET_ACCESS_KEY=your_secret');
  console.log('export AWS_DEFAULT_REGION=us-east-1');
  console.log('='.repeat(40));

  try {
    // Run both examples
    await exampleAnthropicBedrock();
    await exampleGeneralBedrock();

  } catch (error) {
    console.error(`❌ Error: ${error}`);
    console.log('Make sure you have:');
    console.log('- Valid AWS credentials configured');
    console.log('- Access to AWS Bedrock in your region');
    console.log('- AWS SDK installed: npm install @aws-sdk/client-bedrock-runtime');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { exampleAnthropicBedrock, exampleGeneralBedrock };