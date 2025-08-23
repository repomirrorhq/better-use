import { Agent } from '../../agent';
import { BrowserProfile, BrowserSession } from '../../browser';
import { ViewportSize } from '../../browser/views';
import { ChatAzureOpenAI } from '../../llm/providers/azure';

// Initialize the Azure OpenAI client
const llm = new ChatAzureOpenAI({
  model: 'gpt-4.1-mini',
});

const TASK = `
Go to https://browser-use.github.io/stress-tests/challenges/react-native-web-form.html and complete the React Native Web form by filling in all required fields and submitting.
`;

async function main(): Promise<void> {
  const browser = new BrowserSession({
    browserProfile: new BrowserProfile({
      windowSize: new ViewportSize({ width: 1100, height: 1000 }),
    }),
  });

  const agent = new Agent({
    task: TASK,
    llm,
  });

  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}