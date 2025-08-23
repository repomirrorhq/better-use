import { Agent, ChatOpenAI } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

// Get API key from environment
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not set');
}

// This example demonstrates using two different models:
// - A bigger model (GPT-4) for planning and decision-making
// - A smaller model (GPT-4 Mini) for page content extraction
// Think of the smaller model as a subagent whose only task is to extract content from the current page

// Main LLM for planning and decision-making
const llm = new ChatOpenAI({
  model: 'gpt-4o',
  api_key: apiKey,
  temperature: 0.1
});

// Smaller, faster LLM for page content extraction
const smallLLM = new ChatOpenAI({
  model: 'gpt-4o-mini',
  api_key: apiKey,
  temperature: 0.1
});

const task = 'Find the founders of browser-use in ycombinator, extract all links and open the links one by one';

async function main() {
  console.log('🤖 Starting Dual-Model Agent Example\n');
  console.log('Configuration:');
  console.log(`  Main LLM: ${llm.name} (for planning and decisions)`);
  console.log(`  Page Extraction LLM: ${smallLLM.name} (for content extraction)`);
  console.log(`  Task: ${task}\n`);

  const agent = new Agent({
    task,
    llm,
    settings: {
      page_extraction_llm: smallLLM,
      maxStepsPerRun: 20,
      use_vision: true,
      generate_gif: false,
    }
  });

  try {
    const history = await agent.run();

    console.log('\n=== EXECUTION RESULTS ===\n');
    console.log(`📊 Total steps: ${history.length}`);
    console.log(`✅ Task completed: ${history.some(h => h.result.some(r => r.is_done))}`);
    
    if (history.usage) {
      console.log(`💰 Token usage: ${history.usage.total_tokens} total tokens`);
      console.log(`💸 Total cost: $${history.usage.total_cost}`);
    }

    // Analyze the performance benefits of using dual models
    console.log('\n🎯 Dual-Model Benefits:');
    console.log('  ✅ Cost Optimization: Page extraction uses cheaper model');
    console.log('  ✅ Speed Optimization: Content extraction is faster');
    console.log('  ✅ Quality Optimization: Main decisions use premium model');
    console.log('  ✅ Token Efficiency: Dedicated models for specific tasks');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Example comparing single model vs dual model performance
async function performanceComparison() {
  const simpleTask = 'Go to example.com and extract the page title and main content';

  console.log('\n=== PERFORMANCE COMPARISON ===\n');

  // Test 1: Single model approach
  console.log('🔄 Testing Single Model Approach...');
  const singleModelAgent = new Agent({
    task: simpleTask,
    llm,
    settings: {
      maxStepsPerRun: 10
    }
  });

  const startTime1 = Date.now();
  const history1 = await singleModelAgent.run();
  const duration1 = Date.now() - startTime1;

  console.log(`  ⏱️  Duration: ${duration1}ms`);
  console.log(`  📊 Steps: ${history1.length}`);
  console.log(`  💰 Tokens: ${history1.usage?.total_tokens || 0}`);
  console.log(`  💸 Cost: $${history1.usage?.total_cost || 0}`);

  // Test 2: Dual model approach
  console.log('\n🔄 Testing Dual Model Approach...');
  const dualModelAgent = new Agent({
    task: simpleTask,
    llm,
    settings: {
      page_extraction_llm: smallLLM,
      maxStepsPerRun: 10
    }
  });

  const startTime2 = Date.now();
  const history2 = await dualModelAgent.run();
  const duration2 = Date.now() - startTime2;

  console.log(`  ⏱️  Duration: ${duration2}ms`);
  console.log(`  📊 Steps: ${history2.length}`);
  console.log(`  💰 Tokens: ${history2.usage?.total_tokens || 0}`);
  console.log(`  💸 Cost: $${history2.usage?.total_cost || 0}`);

  // Analysis
  console.log('\n📈 Performance Analysis:');
  const speedImprovement = ((duration1 - duration2) / duration1 * 100);
  const costSaving = history1.usage && history2.usage 
    ? ((history1.usage.total_cost - history2.usage.total_cost) / history1.usage.total_cost * 100)
    : 0;

  if (speedImprovement > 0) {
    console.log(`  🚀 Speed improvement: ${speedImprovement.toFixed(1)}%`);
  }
  if (costSaving > 0) {
    console.log(`  💵 Cost savings: ${costSaving.toFixed(1)}%`);
  }
}

// Example with different model combinations
async function testModelCombinations() {
  const testTask = 'Go to wikipedia.org, search for "artificial intelligence", and extract the first paragraph';

  const combinations = [
    {
      name: 'GPT-4o + GPT-4o-mini',
      main: new ChatOpenAI({ model: 'gpt-4o', api_key: apiKey }),
      extraction: new ChatOpenAI({ model: 'gpt-4o-mini', api_key: apiKey })
    },
    {
      name: 'GPT-4o-mini + GPT-3.5-turbo',
      main: new ChatOpenAI({ model: 'gpt-4o-mini', api_key: apiKey }),
      extraction: new ChatOpenAI({ model: 'gpt-3.5-turbo', api_key: apiKey })
    },
    {
      name: 'GPT-4o only (baseline)',
      main: new ChatOpenAI({ model: 'gpt-4o', api_key: apiKey }),
      extraction: null
    }
  ];

  console.log('\n=== MODEL COMBINATION TESTING ===\n');

  for (const combo of combinations) {
    console.log(`🧪 Testing: ${combo.name}`);
    
    const agent = new Agent({
      task: testTask,
      llm: combo.main,
      settings: {
        page_extraction_llm: combo.extraction,
        maxStepsPerRun: 8
      }
    });

    try {
      const startTime = Date.now();
      const history = await agent.run();
      const duration = Date.now() - startTime;

      console.log(`  ✅ Success: ${duration}ms, ${history.length} steps`);
      if (history.usage) {
        console.log(`     💰 ${history.usage.total_tokens} tokens, $${history.usage.total_cost}`);
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Main dual-model example completed!');
      // Uncomment to run performance comparison
      // return performanceComparison();
    })
    .then(() => {
      // Uncomment to test different model combinations
      // return testModelCombinations();
    })
    .then(() => {
      console.log('\n🎉 All dual-model examples completed successfully!');
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}