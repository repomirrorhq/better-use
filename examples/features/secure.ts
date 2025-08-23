/**
 * Security and Privacy Example
 *
 * This file demonstrates how to use browser-use with enhanced privacy and security
 * settings, particularly useful for enterprise deployments with Azure OpenAI.
 *
 * Environment Variables Required:
 * - AZURE_OPENAI_KEY (or AZURE_OPENAI_API_KEY)
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_DEPLOYMENT (optional)
 *
 * DATA PRIVACY WITH AZURE OPENAI:
 * ✅ Good News: No Training on Your Data by Default
 *
 * Azure OpenAI Service already protects your data:
 * ✅ NOT used to train OpenAI models
 * ✅ NOT shared with other customers
 * ✅ NOT accessible to OpenAI directly
 * ✅ NOT used to improve Microsoft/third-party products
 * ✅ Hosted entirely within Azure (not OpenAI's servers)
 *
 * ⚠️ Default Data Retention (30 Days)
 * - Prompts and completions stored for up to 30 days
 * - Purpose: Abuse monitoring and compliance
 * - Access: Microsoft authorized personnel (only if abuse detected)
 *
 * 🔒 How to Disable Data Logging Completely
 * Apply for Microsoft's "Limited Access Program":
 * 1. Contact Microsoft Azure support
 * 2. Submit Limited Access Program request
 * 3. Demonstrate legitimate business need
 * 4. After approval: Zero data logging, immediate deletion, no human review
 *
 * For high-scale deployments (500+ agents), consider:
 * - Multiple deployments across regions
 *
 * How to Verify This Yourself, that there is no data logging:
 * - Network monitoring: Run with network monitoring tools
 * - Firewall rules: Block all domains except Azure OpenAI and your target sites
 *
 * Contact us if you need help with this: support@browser-use.com
 */

import { Agent } from '../../src/agent';
import { ChatAzureOpenAI } from '../../src/llm/providers/azure';
import { BrowserSession } from '../../src/browser/session';
import { BrowserProfile } from '../../src/browser/profile';
import * as dotenv from 'dotenv';

dotenv.config();

// Disable all telemetry for maximum privacy
process.env.BROWSER_USE_CLOUD_SYNC = 'false';
process.env.ANONYMIZED_TELEMETRY = 'false';

async function main(): Promise<void> {
  console.log('🔒 Secure Azure OpenAI Example');
  console.log('='.repeat(50));
  console.log('Privacy Mode: ✅ Cloud sync disabled, telemetry disabled');

  // Check for required credentials
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!apiKey || !azureEndpoint) {
    console.error('❌ Error: Missing required environment variables');
    console.log('Please set:');
    console.log('- AZURE_OPENAI_KEY=your_azure_openai_key');
    console.log('- AZURE_OPENAI_ENDPOINT=your_azure_endpoint');
    return;
  }

  // Configuration LLM with Azure OpenAI for data privacy
  const llm = new ChatAzureOpenAI({
    model: 'gpt-4.1-mini',
    apiKey,
    azureEndpoint,
    temperature: 0.5,
  });

  console.log(`Model: ${llm.model} (Azure OpenAI - No training on your data)`);

  // Configuration Task - using sensitive data placeholder
  const task = 'Find the founders of the sensitive company_name';

  // Configuration Browser with restricted domains for security
  const browserProfile = new BrowserProfile({
    allowedDomains: ['*google.com', 'browser-use.com'],
    enableDefaultExtensions: false,
    headless: true, // More secure for production
  });

  console.log('Browser Security:');
  console.log('- ✅ Restricted to allowed domains only');
  console.log('- ✅ Default extensions disabled');
  console.log('- ✅ Headless mode enabled');

  // Sensitive data filtering - {key: sensitive_information}
  // The sensitive_information will be filtered out from any input to the LLM
  // Only placeholders will be passed to the model
  const sensitiveData: Record<string, string | Record<string, string>> = {
    'company_name': 'browser-use'
  };

  console.log('Sensitive Data Protection:');
  console.log('- ✅ Sensitive data will be replaced with placeholders');
  console.log('- ✅ Real values filtered from LLM inputs');

  // Create browser session with secure profile
  const browserSession = new BrowserSession({
    profile: browserProfile,
  });
  
  await browserSession.start();

  try {
    // Create Agent with security settings
    const agent = new Agent({
      task,
      llm,
      browserSession,
      sensitiveData,
      settings: {
        use_vision: false, // Disable vision to prevent screenshot data leakage
        save_conversation_path: null, // Don't save conversations
        generate_gif: false, // Don't generate GIFs that might contain sensitive data
        max_failures: 3,
        retry_delay: 1,
      },
    });

    console.log('\nSecurity Settings:');
    console.log('- ✅ Vision disabled (no screenshots to LLM)');
    console.log('- ✅ Conversation saving disabled');
    console.log('- ✅ GIF generation disabled');
    console.log('='.repeat(50));

    console.log(`Task: ${task}`);
    console.log('Running with maximum security settings...\n');

    // Run the agent
    const result = await agent.run(10);
    
    console.log(`\n✅ Completed ${result.history.length} steps securely`);
    
    if (result.usage) {
      console.log(`Token Usage: ${result.usage.input_tokens} input, ${result.usage.output_tokens} output`);
      if (result.usage.total_cost) {
        console.log(`Total Cost: $${result.usage.total_cost.toFixed(4)}`);
      }
    }

    // Show final results (sensitive data should be filtered)
    const lastStep = result.history[result.history.length - 1];
    if (lastStep?.model_output?.next_goal) {
      console.log(`Final Goal: ${lastStep.model_output.next_goal}`);
    }

    console.log('\n🔒 Security Summary:');
    console.log('- Data processed through Azure OpenAI (no training)');
    console.log('- Sensitive information filtered from LLM inputs');
    console.log('- Browser restricted to allowed domains');
    console.log('- No telemetry or data logging enabled');

  } catch (error) {
    console.error(`❌ Error: ${error}`);
    console.log('\nSecurity troubleshooting:');
    console.log('- Verify Azure OpenAI credentials are correct');
    console.log('- Check network connectivity to Azure endpoint');
    console.log('- Ensure allowed domains are accessible');
  } finally {
    await browserSession.stop();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as secureExample };