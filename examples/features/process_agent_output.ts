import { Agent, BrowserProfile, BrowserSession, ChatOpenAI, AgentHistoryListHelper } from '../../src';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';
import * as util from 'util';

dotenv.config();

// Get API key from environment
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not set');
}

// Initialize OpenAI LLM
const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  api_key: apiKey,
  temperature: 0.1
});

async function main() {
  // Configure browser session with custom settings
  const browserSession = new BrowserSession({
    browserProfile: new BrowserProfile({
      headless: false, // Show browser for visual debugging
      viewport_width: 1280,
      viewport_height: 1000,
      user_data_dir: join(homedir(), '.config', 'browseruse', 'profiles', 'default'),
      // TODO: Add traces_dir equivalent if available in TypeScript version
    })
  });

  await browserSession.start();
  
  try {
    const agent = new Agent({
      task: "go to google.com and type 'OpenAI' click search and give me the first url",
      llm,
      browserSession,
      maxStepsPerRun: 5
    });

    const history = await agent.run();
    
    // Convert to helper class to access analysis methods
    const historyHelper = new AgentHistoryListHelper(history);

    console.log('\n=== AGENT OUTPUT ANALYSIS ===\n');

    // Final Result Analysis
    console.log('📋 Final Result:');
    const finalResult = historyHelper.finalResult();
    if (finalResult) {
      console.log(util.inspect(finalResult, { depth: null, colors: true }));
    } else {
      console.log('  No final result extracted');
    }

    // Error Analysis
    console.log('\n❌ Errors:');
    const errors = historyHelper.errors();
    if (errors.length > 0) {
      errors.forEach((error, index) => {
        if (error) {
          console.log(`  Step ${index + 1}: ${error}`);
        } else {
          console.log(`  Step ${index + 1}: No errors`);
        }
      });
    } else {
      console.log('  No errors detected');
    }

    // Model Actions Analysis (e.g. xPaths the model clicked on)
    console.log('\n🎯 Model Actions:');
    const modelActions = historyHelper.modelActions();
    if (modelActions.length > 0) {
      modelActions.forEach((action, index) => {
        console.log(`  Action ${index + 1}:`);
        console.log(util.inspect(action, { depth: null, colors: true, compact: false }));
        console.log('');
      });
    } else {
      console.log('  No model actions recorded');
    }

    // Model Thoughts Analysis
    console.log('\n💭 Model Thoughts:');
    const thoughts = historyHelper.modelThoughts();
    if (thoughts.length > 0) {
      thoughts.forEach((thought, index) => {
        console.log(`  Step ${index + 1}:`);
        if (thought.thinking) {
          console.log(`    Thinking: ${thought.thinking}`);
        }
        if (thought.evaluation_previous_goal) {
          console.log(`    Evaluation: ${thought.evaluation_previous_goal}`);
        }
        if (thought.memory) {
          console.log(`    Memory: ${thought.memory}`);
        }
        if (thought.next_goal) {
          console.log(`    Next Goal: ${thought.next_goal}`);
        }
        console.log('');
      });
    } else {
      console.log('  No model thoughts recorded');
    }

    // Additional Analysis
    console.log('\n📊 Session Statistics:');
    console.log(`  Total Steps: ${historyHelper.numberOfSteps()}`);
    console.log(`  Total Duration: ${historyHelper.totalDurationSeconds().toFixed(2)}s`);
    console.log(`  Success: ${historyHelper.isSuccessful()}`);
    console.log(`  Completed: ${historyHelper.isDone()}`);
    console.log(`  Has Errors: ${historyHelper.hasErrors()}`);

    if (history.usage) {
      console.log(`  Token Usage: ${history.usage.total_tokens} total`);
      console.log(`  Total Cost: $${history.usage.total_cost}`);
    }

    // URLs visited
    console.log('\n🌐 URLs Visited:');
    const urls = historyHelper.urls();
    urls.forEach((url, index) => {
      console.log(`  Step ${index + 1}: ${url || 'No URL recorded'}`);
    });

    // Action names (types of actions performed)
    console.log('\n⚡ Action Types:');
    const actionNames = historyHelper.actionNames();
    if (actionNames.length > 0) {
      const actionCounts = actionNames.reduce((acc, name) => {
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      Object.entries(actionCounts).forEach(([name, count]) => {
        console.log(`  ${name}: ${count} times`);
      });
    } else {
      console.log('  No actions recorded');
    }

    // Extracted content from all steps
    console.log('\n📝 All Extracted Content:');
    const extractedContent = historyHelper.extractedContent();
    if (extractedContent.length > 0) {
      extractedContent.forEach((content, index) => {
        console.log(`  Content ${index + 1}:`);
        console.log(`    ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
      });
    } else {
      console.log('  No extracted content');
    }

  } finally {
    // Clean up browser session
    await browserSession.stop();
  }
}

// Example with structured output processing
async function processStructuredOutput() {
  const { z } = await import('zod');
  
  const SearchResultSchema = z.object({
    query: z.string().describe('Search query used'),
    firstResult: z.object({
      title: z.string().describe('Title of the first search result'),
      url: z.string().describe('URL of the first search result'),
      snippet: z.string().optional().describe('Search result snippet')
    }).describe('First search result details')
  });

  const browserSession = new BrowserSession({
    browserProfile: new BrowserProfile({ headless: false })
  });

  await browserSession.start();
  
  try {
    const agent = new Agent({
      task: "Go to google.com, search for 'TypeScript browser automation', and extract details of the first result",
      llm,
      browserSession,
      maxStepsPerRun: 8,
      outputSchema: SearchResultSchema
    });

    const result = await agent.run();
    
    console.log('\n=== STRUCTURED OUTPUT PROCESSING ===\n');
    console.log('🎯 Extracted Data:');
    console.log(util.inspect(result.data, { depth: null, colors: true }));
    
    if (result.usage) {
      console.log(`\n💰 Token Usage: ${result.usage.total_tokens} total tokens`);
    }

    // Process the history for additional insights
    const historyHelper = new AgentHistoryListHelper(result);
    console.log('\n📊 Process Analysis:');
    console.log(`  Steps taken: ${historyHelper.numberOfSteps()}`);
    console.log(`  Actions performed: ${historyHelper.actionNames().join(', ')}`);
    console.log(`  URLs visited: ${historyHelper.urls().filter(url => url).length}`);
    
  } finally {
    await browserSession.stop();
  }
}

if (require.main === module) {
  console.log('🚀 Starting Agent Output Processing Example...\n');
  
  main()
    .then(() => {
      console.log('\n✅ Main example completed!');
      // Uncomment to run structured output example
      // return processStructuredOutput();
    })
    .then(() => {
      console.log('\n🎉 All examples completed successfully!');
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}