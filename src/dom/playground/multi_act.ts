import { Agent } from '../../agent';
import { BrowserProfile, BrowserSession } from '../../browser';
// ViewportSize not needed - use inline type
import { ChatAzureOpenAI } from '../../llm/providers/azure';

const TASK = `
Go to https://browser-use.github.io/stress-tests/challenges/react-native-web-form.html and complete the React Native Web form by filling in all required fields and submitting.
`;

async function main() {
  // Initialize the Azure OpenAI client inside the function
  // to avoid initialization errors when the module is imported
  const llm = new ChatAzureOpenAI({
    model: 'gpt-4.1-mini',
    // Add your Azure OpenAI configuration here
    // apiKey: process.env.AZURE_OPENAI_API_KEY,
    // endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    // apiVersion: process.env.AZURE_OPENAI_API_VERSION,
  });
  const browser = new BrowserSession({
    profile: new BrowserProfile({
      viewport_width: 1100,
      viewport_height: 1000,
    }),
  });

  const agent = new Agent({
    task: TASK,
    llm,
    browserSession: browser,
  });

  await agent.run();
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

export { main };