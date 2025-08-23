const { Agent } = require('../dist/agent');
const { BrowserProfile } = require('../dist/browser');
const { createMockLLM } = require('../dist/tests/test-utils/mockLLM');

const taskDescription = process.argv[2];

(async () => {
  try {
    const mockLLM = createMockLLM();
    const agent = new Agent({
      task: taskDescription,
      llm: mockLLM,
      enableMemory: false,
      browserProfile: new BrowserProfile({ headless: true, userDataDir: undefined })
    });
    
    const result = await agent.run();
    
    const lastHistory = result.history[result.history.length - 1];
    const hasDone = lastHistory.model_output?.action?.some(action => 'done' in action) || false;
    
    process.send({ success: hasDone, error: null });
    process.exit(0);
  } catch (error) {
    process.send({ success: false, error: error.message });
    process.exit(1);
  }
})();