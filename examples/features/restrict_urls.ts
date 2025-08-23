import { Agent, BrowserProfile, BrowserSession, ChatOpenAI } from '../../src';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';

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

const task = "go to google.com and search for openai.com and click on the first link then extract content and scroll down - what's there?";

// Define allowed domains - this will prevent the agent from navigating to restricted sites
const allowedDomains = ['google.com', '*.google.com'];

async function main() {
  // Configure browser session with URL restrictions
  const browserSession = new BrowserSession({
    browserProfile: new BrowserProfile({
      allowed_domains: allowedDomains,
      user_data_dir: join(homedir(), '.config', 'browseruse', 'profiles', 'default'),
      headless: false, // Show browser to see the URL restriction in action
      viewport_width: 1280,
      viewport_height: 800
    })
  });

  const agent = new Agent({
    task,
    llm,
    browserSession,
    maxStepsPerRun: 25
  });

  try {
    console.log(`🔒 URL Restrictions Active: ${allowedDomains.join(', ')}`);
    console.log('📋 Task: ' + task);
    console.log('\nNote: The agent will be restricted to Google.com and subdomains.');
    console.log('It will not be able to navigate to openai.com when clicking the search result.\n');

    const history = await agent.run();

    console.log('\n=== EXECUTION RESULTS ===\n');
    console.log(`📊 Total steps: ${history.length}`);
    console.log(`✅ Task completed: ${history.some(h => h.result.some(r => r.is_done))}`);
    
    if (history.usage) {
      console.log(`💰 Token usage: ${history.usage.total_tokens} total tokens`);
    }

    // Analyze URLs that were attempted vs actually visited
    console.log('\n🌐 URL Navigation Analysis:');
    history.forEach((step, index) => {
      if (step.state.url) {
        console.log(`  Step ${index + 1}: ${step.state.url}`);
      }
    });

    // Check for any errors related to URL restrictions
    console.log('\n❌ Errors (including URL restriction attempts):');
    let hasErrors = false;
    history.forEach((step, index) => {
      step.result.forEach(result => {
        if (result.error) {
          console.log(`  Step ${index + 1}: ${result.error}`);
          hasErrors = true;
        }
      });
    });
    
    if (!hasErrors) {
      console.log('  No errors detected');
    }

  } finally {
    console.log('\nPress Enter to close the browser...');
    // In a real interactive scenario, you might want to wait for user input
    // For automation, we'll just close immediately
    await browserSession.close();
  }
}

// Example with different restriction levels
async function testDifferentRestrictions() {
  const restrictionTests = [
    {
      name: 'Google Only',
      domains: ['google.com', '*.google.com'],
      task: 'Go to google.com and search for "GitHub"'
    },
    {
      name: 'Multiple Allowed Sites',
      domains: ['google.com', '*.google.com', 'github.com', '*.github.com'],
      task: 'Go to google.com, search for "GitHub", then click on github.com result'
    },
    {
      name: 'Very Restrictive',
      domains: ['google.com'], // Only exact domain, no subdomains
      task: 'Navigate to www.google.com (should be blocked due to subdomain restriction)'
    }
  ];

  for (const test of restrictionTests) {
    console.log(`\n=== Testing: ${test.name} ===`);
    console.log(`Allowed domains: ${test.domains.join(', ')}`);
    console.log(`Task: ${test.task}`);

    const browserSession = new BrowserSession({
      browserProfile: new BrowserProfile({
        allowed_domains: test.domains,
        headless: true, // Run headless for batch testing
        viewport_width: 1280,
        viewport_height: 800
      })
    });

    const agent = new Agent({
      task: test.task,
      llm,
      browserSession,
      maxStepsPerRun: 10
    });

    try {
      const history = await agent.run();
      
      const finalUrl = history.length > 0 ? history[history.length - 1].state.url : 'No URL';
      const hasErrors = history.some(h => h.result.some(r => r.error));
      
      console.log(`✅ Result: ${history.length} steps, final URL: ${finalUrl}`);
      console.log(`❌ Has errors: ${hasErrors}`);
      
    } catch (error) {
      console.log(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await browserSession.close();
    }
  }
}

// Example showing security benefits
async function demonstrateSecurity() {
  console.log('\n=== SECURITY DEMONSTRATION ===\n');
  console.log('This example shows how URL restrictions can prevent:');
  console.log('1. Accidental navigation to malicious sites');
  console.log('2. Data exfiltration attempts');
  console.log('3. Unintended external API calls');
  console.log('4. Social engineering attacks via browser automation\n');

  const dangerousTask = 'Search for "phishing example" and click on suspicious links';
  const safeDomains = ['google.com', '*.google.com', 'wikipedia.org', '*.wikipedia.org'];

  const browserSession = new BrowserSession({
    browserProfile: new BrowserProfile({
      allowed_domains: safeDomains,
      headless: false,
      viewport_width: 1280,
      viewport_height: 800
    })
  });

  const agent = new Agent({
    task: dangerousTask,
    llm,
    browserSession,
    maxStepsPerRun: 15
  });

  try {
    console.log(`🛡️  Protected domains: ${safeDomains.join(', ')}`);
    console.log(`⚠️  Dangerous task: ${dangerousTask}`);
    console.log('\nThe agent will be prevented from navigating to any suspicious sites...\n');

    const history = await agent.run();
    
    console.log('🔒 Security Report:');
    console.log(`  Steps executed: ${history.length}`);
    console.log(`  URLs visited: ${history.map(h => h.state.url).filter(Boolean).join(', ')}`);
    console.log(`  Blocked attempts: ${history.filter(h => h.result.some(r => r.error?.includes('domain'))).length}`);
    
  } finally {
    await browserSession.close();
  }
}

if (require.main === module) {
  console.log('🚀 Starting URL Restriction Example...\n');
  
  main()
    .then(() => {
      console.log('\n✅ Main URL restriction example completed!');
      // Uncomment to test different restriction levels
      // return testDifferentRestrictions();
    })
    .then(() => {
      // Uncomment to run security demonstration
      // return demonstrateSecurity();
    })
    .then(() => {
      console.log('\n🎉 All URL restriction examples completed!');
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}