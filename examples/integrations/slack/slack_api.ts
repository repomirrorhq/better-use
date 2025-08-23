import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { Agent } from '../../../src/agent';
import { BrowserProfile, BrowserSession } from '../../../src/browser';
import { BaseChatModel } from '../../../src/llm/base';

export interface SlackEventRequest extends Request {
    body: {
        type?: string;
        challenge?: string;
        event?: {
            type: string;
            text?: string;
            user?: string;
            channel?: string;
            ts?: string;
            subtype?: string;
        };
        event_id?: string;
    };
}

export class SlackBot {
    private llm: BaseChatModel;
    private ack: boolean;
    private browserProfile: BrowserProfile;
    private client: WebClient;
    private signingSecret: string;
    private processedEvents: Set<string>;

    constructor(
        llm: BaseChatModel,
        botToken: string,
        signingSecret: string,
        options: {
            ack?: boolean;
            browserProfile?: BrowserProfile;
        } = {}
    ) {
        if (!botToken || !signingSecret) {
            throw new Error('Bot token and signing secret must be provided');
        }

        this.llm = llm;
        this.ack = options.ack ?? false;
        this.browserProfile = options.browserProfile ?? new BrowserProfile({ headless: true });
        this.client = new WebClient(botToken);
        this.signingSecret = signingSecret;
        this.processedEvents = new Set<string>();
        console.log('SlackBot initialized');
    }

    private verifySlackSignature(body: string, signature: string, timestamp: string): boolean {
        const time = Math.floor(new Date().getTime() / 1000);
        if (Math.abs(time - parseInt(timestamp)) > 300) {
            return false;
        }

        const sigBasestring = 'v0:' + timestamp + ':' + body;
        const mySignature = 'v0=' + crypto.createHmac('sha256', this.signingSecret).update(sigBasestring, 'utf8').digest('hex');

        return crypto.timingSafeEqual(Buffer.from(mySignature, 'utf8'), Buffer.from(signature, 'utf8'));
    }

    async handleEvent(event: any, eventId?: string): Promise<void> {
        try {
            console.log(`Received event id: ${eventId}`);
            if (!eventId) {
                console.warn('Event ID missing in event data');
                return;
            }

            if (this.processedEvents.has(eventId)) {
                console.log(`Event ${eventId} already processed`);
                return;
            }
            this.processedEvents.add(eventId);

            if (event.subtype === 'bot_message') {
                return;
            }

            const text = event.text;
            const userId = event.user;
            
            if (text && text.startsWith('$bu ')) {
                const task = text.slice(4).trim();
                
                if (this.ack) {
                    try {
                        await this.sendMessage(
                            event.channel, 
                            `<@${userId}> Starting browser use task...`, 
                            event.ts
                        );
                    } catch (error) {
                        console.error('Error sending start message:', error);
                    }
                }

                try {
                    const agentMessage = await this.runAgent(task);
                    await this.sendMessage(
                        event.channel, 
                        `<@${userId}> ${agentMessage}`, 
                        event.ts
                    );
                } catch (error) {
                    await this.sendMessage(
                        event.channel, 
                        `Error during task execution: ${error}`, 
                        event.ts
                    );
                }
            }
        } catch (error) {
            console.error('Error in handle_event:', error);
        }
    }

    private async runAgent(task: string): Promise<string> {
        try {
            const browserSession = new BrowserSession({ browserProfile: this.browserProfile });
            const agent = new Agent(task, this.llm, { browserSession });
            const result = await agent.run();

            let agentMessage: string | null = null;
            if (result.isDone()) {
                const lastResult = result.history[result.history.length - 1];
                if (lastResult?.result?.[0]?.extractedContent) {
                    agentMessage = lastResult.result[0].extractedContent;
                }
            }

            if (agentMessage === null) {
                agentMessage = 'Oops! Something went wrong while running Browser-Use.';
            }

            return agentMessage;
        } catch (error) {
            console.error('Error during task execution:', error);
            return `Error during task execution: ${error}`;
        }
    }

    private async sendMessage(channel: string, text: string, threadTs?: string): Promise<void> {
        try {
            await this.client.chat.postMessage({
                channel: channel,
                text: text,
                thread_ts: threadTs,
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    createExpressHandler(): express.Router {
        const router = express.Router();

        router.post('/slack/events', async (req: SlackEventRequest, res: Response) => {
            try {
                const signature = req.headers['x-slack-signature'] as string;
                const timestamp = req.headers['x-slack-request-timestamp'] as string;
                const body = JSON.stringify(req.body);

                if (!this.verifySlackSignature(body, signature, timestamp)) {
                    console.warn('Request verification failed');
                    return res.status(400).json({ error: 'Request verification failed' });
                }

                console.log('Received event data:', req.body);

                if (req.body.challenge) {
                    return res.json({ challenge: req.body.challenge });
                }

                if (req.body.event) {
                    try {
                        await this.handleEvent(req.body.event, req.body.event_id);
                    } catch (error) {
                        console.error('Error handling event:', error);
                    }
                }

                return res.json({});
            } catch (error) {
                console.error('Error in slack_events:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        return router;
    }
}