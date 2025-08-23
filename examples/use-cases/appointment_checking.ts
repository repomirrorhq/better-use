// Goal: Checks for available visa appointment slots on the Greece MFA website.

import { Agent } from '../../src/agent';
import { ChatOpenAI } from '../../src/llm/providers/openai';
import { Controller } from '../../src/controller';
import { z } from 'zod';

// Check if OPENAI_API_KEY is set
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Please add it to your environment variables.');
}

const controller = new Controller();

// Define webpage info schema
const WebpageInfoSchema = z.object({
    link: z.string().default('https://appointment.mfa.gr/en/reservations/aero/ireland-grcon-dub/')
});

type WebpageInfo = z.infer<typeof WebpageInfoSchema>;

// Register action to go to webpage
controller.registry.registerAction({
    name: 'go_to_webpage',
    description: 'Go to the webpage',
    parameterSchema: WebpageInfoSchema,
    handler: (webpageInfo: WebpageInfo) => {
        return webpageInfo.link;
    }
});

async function main() {
    const task = 
        'Go to the Greece MFA webpage via the link I provided you. ' +
        'Check the visa appointment dates. If there is no available date in this month, check the next month. ' +
        'If there is no available date in both months, tell me there is no available date.';

    const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
    const agent = new Agent(task, model, { controller, useVision: true });

    await agent.run();
}

if (require.main === module) {
    main().catch(console.error);
}