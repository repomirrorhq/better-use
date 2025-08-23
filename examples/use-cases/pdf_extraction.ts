import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';

async function main() {
    const agent = new Agent(
        `
        Objective: Navigate to the following URL, what is on page 3?

        URL: https://docs.house.gov/meetings/GO/GO00/20220929/115171/HHRG-117-GO00-20220929-SD010.pdf
        `,
        new ChatOpenAI({ model: 'gpt-4o-mini' })
    );
    
    const result = await agent.run();
    console.log('Agent result:', result);
}

if (require.main === module) {
    main().catch(console.error);
}