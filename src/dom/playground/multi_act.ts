import { Agent } from '../../agent';
import { BrowserProfile, BrowserSession } from '../../browser';
import { ViewportSize } from '../../browser/views';
import { AzureOpenAIChat } from '../../llm/providers/azure';

// Initialize the Azure OpenAI client
const llm = new AzureOpenAIChat({
  model: 'gpt-4.1-mini',
  // Add your Azure OpenAI configuration here
  // apiKey: process.env.AZURE_OPENAI_API_KEY,
  // endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  // apiVersion: process.env.AZURE_OPENAI_API_VERSION,
});

const TASK = `
Go to https://browser-use.github.io/stress-tests/challenges/react-native-web-form.html and complete the React Native Web form by filling in all required fields and submitting.
`;

async function main() {
  const browser = new BrowserSession({
    profile: new BrowserProfile({
      viewport: { width: 1100, height: 1000 } as ViewportSize,
    }),
  });

  const agent = new Agent({
    task: TASK,
    llm,
    browser,
  });

  await agent.run();
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

export { main };