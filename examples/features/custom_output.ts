/**
 * Custom Output Example
 *
 * This file demonstrates how to use structured custom outputs with browser-use.
 * Shows how to extract data in a specific format using Zod schemas.
 *
 * Requirements:
 * - OPENAI_API_KEY in environment variables
 * - OpenAI SDK: npm install openai
 * - Zod for schema validation: npm install zod
 */

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { BrowserSession } from '../../src/browser/session';
import { Controller } from '../../src/controller/service';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

// Define structured output schema using Zod (TypeScript equivalent of Pydantic)
const PostSchema = z.object({
  post_title: z.string().describe('Title of the post'),
  post_url: z.string().describe('URL of the post'),
  num_comments: z.number().describe('Number of comments on the post'),
  hours_since_post: z.number().describe('Hours since the post was created'),
});

const PostsSchema = z.object({
  posts: z.array(PostSchema).describe('Array of posts from the page'),
});

type Post = z.infer<typeof PostSchema>;
type Posts = z.infer<typeof PostsSchema>;

async function main(): Promise<void> {
  console.log('🚀 Custom Output Example - Structured Data Extraction');
  console.log('='.repeat(60));

  // Check for API key
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    console.error('❌ Error: OPENAI_API_KEY not found');
    console.log('Please set: export OPENAI_API_KEY=your_key');
    return;
  }

  // Initialize OpenAI model
  const model = new ChatOpenAI({
    model: 'gpt-4.1-mini',
    apiKey: openaiApiKey,
    temperature: 0.1, // Low temperature for more consistent structured output
  });

  console.log(`Model: ${model.model}`);
  console.log(`Provider: OpenAI`);
  
  // Create controller with structured output model
  const controller = new Controller({
    outputModel: PostsSchema,
  });

  console.log('Output Schema: Structured extraction of HackerNews posts');
  console.log('- post_title: string');
  console.log('- post_url: string');
  console.log('- num_comments: number');
  console.log('- hours_since_post: number');

  // Create browser session
  const browserSession = new BrowserSession();
  await browserSession.start();

  try {
    const task = 'Go to hackernews show hn and give me the first 5 posts';
    
    // Create agent with custom controller
    const agent = new Agent({
      task,
      llm: model,
      browserSession,
      // Note: Controller integration would need to be implemented in the TypeScript version
      // This is a placeholder showing the intended API
      settings: {
        use_vision: true,
        max_actions_per_step: 10,
      },
    });

    console.log(`\nTask: ${task}`);
    console.log('Running structured data extraction...\n');

    // Run the agent
    const history = await agent.run();

    console.log(`✅ Completed ${history.history.length} steps`);
    
    if (history.usage) {
      console.log(`Token Usage: ${history.usage.input_tokens} input, ${history.usage.output_tokens} output`);
      if (history.usage.total_cost) {
        console.log(`Total Cost: $${history.usage.total_cost.toFixed(4)}`);
      }
    }

    // Extract final result (this would be implemented with proper structured output)
    const finalResult = getFinalResult(history);
    
    if (finalResult) {
      try {
        // Validate and parse the structured output
        const parsed: Posts = PostsSchema.parse(JSON.parse(finalResult));
        
        console.log('\n📊 Extracted Structured Data:');
        console.log('='.repeat(50));

        parsed.posts.forEach((post: Post, index: number) => {
          console.log(`\n${index + 1}. ${post.post_title}`);
          console.log(`   URL: ${post.post_url}`);
          console.log(`   Comments: ${post.num_comments}`);
          console.log(`   Hours ago: ${post.hours_since_post}`);
        });

        console.log(`\n✅ Successfully extracted ${parsed.posts.length} posts with structured data`);
        
      } catch (parseError) {
        console.error('❌ Error parsing structured output:', parseError);
        console.log('Raw output:', finalResult);
      }
    } else {
      console.log('❌ No structured result found');
      
      // Show the last step output for debugging
      const lastStep = history.history[history.history.length - 1];
      if (lastStep?.model_output) {
        console.log('\nLast model output:');
        console.log('Goal:', lastStep.model_output.next_goal);
        if (lastStep.model_output.memory) {
          console.log('Memory:', lastStep.model_output.memory);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Error: ${error}`);
    console.log('Make sure you have:');
    console.log('- Valid OpenAI API key');
    console.log('- Internet connection to OpenAI API');
    console.log('- Access to Hacker News website');
  } finally {
    await browserSession.stop();
  }
}

/**
 * Helper function to extract final structured result from agent history
 * Note: This is a placeholder implementation - in the full version,
 * this would integrate with the Controller's structured output system
 */
function getFinalResult(history: any): string | null {
  // Look for structured output in the final steps
  const lastSteps = history.history.slice(-3); // Check last 3 steps
  
  for (const step of lastSteps.reverse()) {
    if (step.result && Array.isArray(step.result)) {
      for (const result of step.result) {
        if (result.extracted_content || result.data) {
          return result.extracted_content || result.data;
        }
      }
    }
  }
  
  return null;
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as customOutputExample, PostSchema, PostsSchema };